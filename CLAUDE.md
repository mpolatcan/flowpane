# flowpane

A Claude Code plugin that replaces the default Workflow progress list with a
live drawing of the run: a phase-by-phase graph, a stack, or a timeline in the
pane beside the transcript, with each agent's state, timing, token spend, tool
calls and prompt.

It draws into a terminal grid. Everything it knows comes from files a running
workflow writes, and everything it says has to fit in cells.

## Commands

```bash
claude plugin test .          # the test suite — 99 tests across 11 files
bunx tsc --noEmit             # typecheck (hooks/ and types/ only; see tsconfig.json)
```

Use `claude plugin test .`, not `bun test`. The tests import
`claude-code/testing`, which the plugin test runner supplies and a bare `bun
test` does not; bare `bun test` fails to resolve it.

The developer tools under `dev/` all take a run and draw it without a session:

```bash
bun dev/preview.ts [--animate|--journal <dir>|--settings|--menu theme|--about|--plain]
bun dev/shot.ts [--journal <dir>] [--port 8731]   # the pane in a browser, live, at any size
bun dev/stress.ts                                  # wide fan-outs and a narrow body
bun dev/lines.ts                                   # every line of every run at every size
bun dev/audit.ts                                   # every run, layout and size: nothing throws, every cell legible
bun dev/checkpic.ts <dir>                          # the bands cover the canvas, every node has a Button
bun dev/contrast.ts                                # every theme's roles against its ground, its edges against its states
bun dev/edges.ts <dir>                             # the graph derived for a run, and how it was derived
bun dev/recover.ts <sessionId> [home]              # what a session's runs rebuild to
bun dev/dryrun.ts <workflow>                       # a workflow's control flow, stubbed, no agents spent
bun dev/checkmeta.ts                               # the version the pane shows is the one the manifest ships
```

`dev/audit.workflow.js` is the demo run: a workflow shaped to exercise every
case the pane draws. It lives under `dev/` because it is a development tool, not
part of the installed plugin. `bun dev/dryrun.ts` defaults to it.

`dev/load.ts` is not a command — it is the run-building library the others share.
`dev/drive.py` gives Claude Code a pty and captures a real session (`python3`,
not `python`).

Real runs to draw live under
`~/.claude/projects/<project-slug>/<sessionId>/subagents/workflows/wf_*`.

Before calling any of this done: `bunx tsc --noEmit`, `claude plugin test .`,
`bun dev/lines.ts`, `bun dev/audit.ts`.

## Layout of the repo

| Path | What it holds |
| --- | --- |
| `hooks/register.ts` | The plugin itself: every hook, the journal tail, the run state |
| `hooks/journal.ts` | Reading a run off disk — journal, run file, agent transcripts |
| `hooks/shape.ts` | The run's shape: phases, passes, what fed what |
| `hooks/tree.ts` | Rows and segments for the timeline |
| `hooks/layout.ts` | Where every band, card and column goes, at a given size |
| `hooks/paint.ts` | Everything drawn: cards, wires, header, dialogs, settings |
| `hooks/canvas.ts` | The grid: cells, colour mixing, line drawing, joints |
| `hooks/theme.ts` | Twelve themes, each ten colours, and the thirteen roles derived |
| `hooks/press.ts` | Keys and clicks |
| `hooks/about.ts` | What the pane says about itself: the dialog and `/flowpane about` |
| `tests/` | What the pane draws, read back off the canvas |
| `dev/` | The tools above |
| `docs/` | The design record: every decision, and what it replaced |
| `README.md` | What the plugin is, installing it, and the way in to `docs/` |

## Constraints the platform imposes

These are not preferences. Breaking one produces a pane that looks right in a
test and wrong in a terminal.

- **A `Button` carries no colour and no background.** `ButtonProps` has `key`,
  `label`, `hotkey`, `action`, `plain` and `hover` — no colour among them. A
  state mark, a rule or a fill drawn inside a Button's cells comes out in the
  label's own plain text. So every coloured cell stays outside every hotspot: the mark sits beside the
  name with a cell of air between them, and a card is framed in code points
  rather than filled.
- **Every dialog is modal.** There is no layering below one. Anything that has
  to be readable while a dialog is open is drawn into the pane, not under it.
- **A `Raster` is blitted, an element tree is re-rendered.** `ui.blit` repaints
  a mounted Raster at 120 ms a frame; a redraw through `ui.render` costs a
  render and runs at 320. Animation belongs in the Raster.
- **The pane's size is given, not asked for.** Every drawing decision takes the
  width it is handed. Nothing may assume a minimum beyond what `layout.ts`
  already guards.

## Rules the drawing keeps

- **Colour says one of two things: what state a node is in, or that a line is a
  wire.** Structure is grey. The one border allowed to carry a state is a
  card's own frame, which encloses exactly one agent — see `frameOf`.
- **No line crosses a word.** `canvas.line()` refuses to overwrite a port, and
  `dev/lines.ts` checks the whole corpus: every line lands on a blank cell,
  every arrowhead has a stem, every arm reaches something.
- **A measurement keeps its unit where the unit fits.** Token counts run down a
  ladder — `∑ 15.1k tkns`, `∑ 15.1k`, `15.1k` — and a lane picks one spelling
  for all of its cards, so two cards are never compared in two units.
- **The header gives way in a fixed order.** Each group has a `drop` rank and
  its own `short` ladder; the highest rank gives way first.
- **A finished run stops moving.** A run that is not `running` is painted at
  `tick = -1`, which freezes every animation: no spinner, no sliding label, no
  travelling light.

## Conventions

- **Comments say why, not what.** Most of what is hard here is a decision that
  replaced something worse, and the comment is where the replaced thing is
  recorded. `paint.ts` is long because of this and that is the intent.
- **Prose written to a file is normal English** — comments, `docs/`, commit
  messages. No abbreviations invented for the file, no notes to the reader
  about the session that produced it.
- **`docs/` is the design record, and it is kept current.** A change that
  alters what a reader sees changes the page under `docs/` that covers it, in
  the same pass — `docs/README.md` says which page that is. The root `README.md`
  is the introduction: what the plugin is, how to install it, and links in.
- **Tests read the canvas.** They paint a run and assert on the cells, so a
  test says what a person would see. Keep the fixture minimal and name the test
  as a sentence about the drawing.
