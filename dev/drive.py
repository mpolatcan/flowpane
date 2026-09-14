#!/usr/bin/env python3
"""Drives an interactive Claude Code session inside a pty and captures the screen.

The pane only draws on a terminal surface, so a headless `-p` run never reaches
it. This gives Claude Code a real pty of a chosen size, types a prompt, captures
everything it writes, and leaves the raw bytes on disk for inspection. Run it
with `--debug` in the args to get the engine's own log of what it refused.

  python3 dev/drive.py --cols 150 --rows 45 --seconds 90 --out /tmp/cap.raw \
      --prompt 'Run the workflow named wfpane-probe ...' -- --debug

Keys can be typed later in the run, at offsets from the prompt:

  python3 dev/drive.py --prompt 'say ok' --after '10:/wf\r' --after '14:\r' ...
"""

import argparse
import errno
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios
import time

parser = argparse.ArgumentParser()
parser.add_argument("--cols", type=int, default=150)
parser.add_argument("--rows", type=int, default=45)
parser.add_argument("--seconds", type=float, default=90.0)
parser.add_argument("--out", default="capture.raw")
parser.add_argument("--cwd", default=os.path.expanduser("~"))
parser.add_argument("--prompt", required=True)
parser.add_argument("--plugin-dir", default=None)
parser.add_argument(
    "--after",
    action="append",
    default=[],
    metavar="SECONDS:TEXT",
    help="type TEXT that many seconds after the prompt; repeatable, in order. "
    r"Escapes: \r Enter, \e Escape, \t Tab, \x18 ctrl+x. Example: --after 20:/wf\r",
)
parser.add_argument("extra", nargs="*", help="extra claude args after --")
args = parser.parse_args()


def unescape(text):
    return (
        text.replace("\\r", "\r")
        .replace("\\n", "\r")
        .replace("\\e", "\x1b")
        .replace("\\t", "\t")
        .replace("\\x18", "\x18")
    )


steps = []

for spec in args.after:
    at, _, text = spec.partition(":")
    steps.append((float(at), unescape(text)))

steps.sort(key=lambda s: s[0])

CLAUDE = os.path.expanduser("~/.local/bin/claude")

argv = [CLAUDE, "--permission-mode", "bypassPermissions", *args.extra]

if args.plugin_dir:
    argv += ["--plugin-dir", args.plugin_dir]

pid, fd = pty.fork()

if pid == 0:
    os.chdir(args.cwd)
    env = dict(os.environ)
    env["CLAUDE_CODE_ENABLE_FUNCTION_HOOKS"] = "1"
    # Run from inside a Claude Code session the child would inherit its marker
    # and stop saving transcripts, which the pane's run recovery reads.
    env.pop("CLAUDE_CODE_CHILD_SESSION", None)
    env["CLAUDE_CODE_FORCE_SESSION_PERSISTENCE"] = "1"
    env["TERM"] = "xterm-256color"
    env["COLORTERM"] = "truecolor"
    env["COLUMNS"] = str(args.cols)
    env["LINES"] = str(args.rows)
    os.execve(CLAUDE, argv, env)
    os._exit(127)

fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", args.rows, args.cols, 0, 0))

captured = bytearray()


def pump(until):
    """Reads the child until a deadline; False once it has gone."""
    while time.time() < until:
        ready, _, _ = select.select([fd], [], [], 0.2)

        if not ready:
            continue

        try:
            chunk = os.read(fd, 65536)
        except OSError as error:
            if error.errno in (errno.EIO, errno.EBADF):
                return False
            raise

        if not chunk:
            return False

        captured.extend(chunk)

    return True


def send(data):
    try:
        os.write(fd, data)
    except OSError:
        pass


# Let the TUI settle before typing into it.
pump(time.time() + 8)

# A folder Claude Code has not been trusted in blocks on a confirmation whose
# default answer is "No, exit"; move to "Yes, I trust this folder" and take it.
if b"trust" in bytes(captured):
    send(b"\x1b[B")
    pump(time.time() + 1)
    send(b"\r")
    pump(time.time() + 4)

send(args.prompt.encode() + b"\r")

started = time.time()
alive = True

# Typed steps land at their offsets; the capture keeps running between them.
for at, text in steps:
    alive = pump(started + at)

    if not alive:
        break

    send(text.encode())
    print(f"sent at {at:.0f}s: {text!r}", file=sys.stderr)

if alive:
    alive = pump(started + args.seconds)

if alive:
    send(b"\x1b")
    pump(time.time() + 1)
    send(b"/exit\r")
    pump(time.time() + 4)

try:
    os.kill(pid, signal.SIGTERM)
except ProcessLookupError:
    pass

with open(args.out, "wb") as f:
    f.write(bytes(captured))

print(f"captured {len(captured)} bytes to {args.out}", file=sys.stderr)
