# The activity strip

The rows at the foot of the pane, under a rule: what the run has done, one line
per thing a reader of a pipeline waits to hear about, newest last.

```
── activity ─────────────────────────────────────────────────────────────────────────────
 17m31s    Develop  Lint clean. Now run the affected unit tests. → ran npx vitest run __tests…
 18m51s    Develop  The pill test failures are a mounting artifact: when the pill's root
                    `v-if` is false it renders as a comment node, so … → read AiStatusPill…
 19m24s    Develop  edited header/AiStatusPill.test.ts
 19m29s    Develop  Re-run the AiStatusPill test alone → ran npx vitest run __tests__/unit/…
 19m47s  ▸ Develop  All 87 pass. Let me run the full unit suite to confirm no regressions
                    from the shared-file edits (MiddleSlot, bridge). → ran npx vitest run 2…
```

## The agent's words first

A line used to be what the agent did — `ran npx vitest run`, `ran git diff` —
which a reader can see in the cards and the dialog already, and which says
nothing about why. What a pipeline's reader is asking is what the agent made of
the last result and what it means to do about it, and the agent says so: in the
text a model request writes ahead of the calls it issues. Thinking is recorded
redacted, so that narration is the only reasoning a transcript keeps.

So every call carries the words of the request that issued it (`why` on the
call — see `hooks/journal.ts`), read from the transcript or, live, from the
request's own stream as it arrives. Calls one request issued share its words
and get one line between them: the words, run together onto at most two lines,
and after an arrow, quieter, what the calls did — `read config.ts, ran the
tests for stores`. The words keep the line; what was done gives way first, to at most
a third of it, then to nothing.

An agent that says nothing between calls — a small model sent to commit, say —
still says what a command is for, in the `description` the shell tool asks for
beside it, and that stands in for the words. Calls with neither are listed as
below.

## A command in words

A command line says what ran to a reader who reads shell, and an agent that says
nothing about its calls leaves a strip of them: `ran sed -n '81,131p'
README.md; ls -a`. So a command is said by what it does — `read lines 81–131 of
README.md and listed the files` — from a table of the programs a pipeline runs
most (`hooks/shell.ts`). Each step of the line is said once and in order, and
what is not a step is left out: an `echo` marker, a redirect, a variable set in
front, the stage after a pipe that only filters what the first one printed. A
program the table does not know is named — `ran terraform` — rather than
guessed at. A line with no step worth saying is shown as written where it is
one line, and as `ran a shell script` where it is several, since twenty lines of
shell clipped to the width of a row is a row nobody can read.

Pipelines run scripts, not one-liners, and a script is read as shell only where
it is shell. A heredoc's body is the script handed to the command — read as
shell, a Python body said `ran import` — so it is skipped. Comments, continued
lines, arrays assigned, a `case` pattern, the keywords around a loop and a
function the script defines and then calls are grammar, not steps, and say
nothing. A path held in a variable is `a file`. Swept over twenty-one thousand
commands from real runs, what is left as `ran <name>` is the scripts a pipeline
calls by name.

A table rather than a small model. A model would describe more, and say what a
command was looking for as well as what it read, but it would bill every run
for a few dozen requests the reader did not ask for, and draw each line twice:
the command, then the words a second later. Where an agent writes why it runs a
command, the strip leads with that, and that is what no table or model could
supply; the table is for the agents that do not.

## Why it is there

The sentence above the bar says what is happening now, and the cards say where.
Neither says what happened a minute ago, which is what a reader who looked away
from a dev-pipeline run wants first: which files the develop step changed, which
command a gate ran and whether it failed, what the last gate said. The detail
dialog says all of that about one agent; the strip says it about the run, in the
order it happened, without a press.

## What gets a line where the agent said nothing

- A file changed: `edited` for `Edit`, `MultiEdit` and `NotebookEdit`, `wrote`
  for `Write`.
- A command run, in words (see above), without the `cd <worktree> &&` a
  pipeline puts in front of every one.
- A subagent started.
- A gate's verdict, as the agent lands: `passed` or `failed`, and the summary
  the gate gave. See the verdicts in [nodes.md](nodes.md).
- What the script threw, for a run that failed, as the last line, under the
  name `run`: `✖ run  gate tests failed: 3 tests failed in store.spec.ts`. A
  script can fail a run after every agent in it landed, on a check of its own,
  and then the reason is in no agent's line; the pane used to say `failed` over
  a drawing of nothing but `✔`. The engine writes the error into the run's
  summary, and the line is its first line, without the class name.

Reads and searches do not get a line each. A develop step reads forty files
between two edits, and a line apiece would push every edit off the strip before
anyone saw it. Each stretch of them between two lines that matter is gathered
into one — `read 6 files`, `searched 3 times` — which says the agent was looking,
and how hard, without saying it forty times.

A line is the time into the run, a mark where the line is news — `✔` a gate that
passed, `✖` a gate or a call that failed, `▸` a command still running — the
agent's name in its state's colour, and what it did in grey. Colour says state
here as it does everywhere else in the pane; the words are not coloured.

## How much room it takes

`feedRows` rows, four unless set otherwise, and a rule: see
[settings.md](settings.md). The setting is in the settings dialog as `Activity`,
and `/flowpane activity <n>` or `/flowpane activity off` sets it.

None at all while nothing has happened. The strip is a band of the pane's own,
and a band that opened empty on every run would spend four rows saying what the
drawing already says.

None on a pane that would keep fewer than sixteen rows for the drawing. The
strip is read beside the drawing, never instead of it.

The drawing is painted as a pane that many rows shorter and the strip drawn
under it, rather than every layout being taught to stop short of it. To the
layouts, the rails and the dialogs the pane is simply shorter, so a dialog open
over the drawing leaves the strip readable under it.
