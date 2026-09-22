# flowpane

A Claude Code plugin that replaces the default Workflow progress list with a
live drawing of the run: a phase-by-phase graph, a stack, or a timeline in the
pane beside the transcript, with each agent's state, timing, token spend, tool
calls and prompt.

It draws into a terminal grid. Everything it knows comes from files a running
workflow writes, and everything it says has to fit in cells.

## Commands

```bash
claude plugin test .          # the test suite — 350 tests across 23 files
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
bun dev/checkmeta.ts                               # the version the pane falls back to is the one the manifest ships
bun dev/checktokens.ts [--all]                     # the live token figure lands on the one the summary reports
sh  dev/reload.sh                                 # install this tree as flowpane-dev, beside the released build
```

## Testing a change against real runs

The suite paints fixtures. The sweeps paint what this machine has actually run,
and that is where a drawing change is proved.

`audit.ts` and `lines.ts` find their runs by deriving the session directory from
the working directory, so left alone they see this repository's own runs and no
others. Every one of those is finished and none of them is wide, which makes a
clean sweep there say less than it looks like it says: a header counting the
agents still going never appears in it, and neither does a band of ninety-five
agents wrapping into five columns. Both of those held faults nothing in the
repository's own corpus could show.

`FLOWPANE_RUNS` points any of the tools at another session's runs:

```bash
FLOWPANE_RUNS=~/.claude/projects/<project>/<session>/subagents/workflows bun dev/lines.ts
```

So a change to what the pane draws is swept over a handful of other corpora
before it is handed over — a run with a phase entered ten times, a run with a
band too wide to draw as one row, a run still going — and
`bun dev/checktokens.ts --all` reads every agent transcript on the machine
against the figure the engine reported for it.

A live check is a different thing again, and the only way to get one is
`sh dev/reload.sh` followed by a session restart: hooks are read once, when the
session starts, so a reload inside a running session changes nothing a reader
can see.

`dev/reload.sh` installs this tree *beside* the released plugin rather than in
place of it: `~/claude-dev-marketplaces/flowpane-dev` holds a copy of the repo
with the names the engine keys off moved aside — the manifest's `name`,
`COMMAND`, `PANE_ID`, and the label the surface files the pane's tab under.
Renamed, both can be enabled at once: `/flowpane` stays the released build and
`/flowpane-dev` draws this tree. Unrenamed they collide on every one of them —
one command, one pane id, one `tool.call` hook opening one pane, and two tabs
both reading `workflow · <run>` with nothing to say which build drew which. They
are patched in the copy, never in the repo, so what ships is unchanged.

The title the pane *draws* is left alone. A build is told apart by the version it
already prints, and a product name bent out of shape to serve a dev install is a
dev install leaking into the picture. The tab label is not that title — it is a
name the surface keys off, like the other three.

A *copy*, not a symlink. A symlinked plugin source installs files that look
right — the engine's cache comes out byte-identical to the tree — and then never
loads, with no error printed anywhere: the command comes back `Unknown command`
while `claude plugin details` still reports the plugin as installed. So the
reload mirrors the tree in with `rsync`, then drops the engine's cached copy,
since an install over a version already installed is a no-op. Restart the session
afterwards: hooks are read once, when it starts.

Both builds watch the same journals and both open a pane on a Workflow launch,
so with the two enabled a live run draws twice. `/flowpane` toggles the released
one shut.

## The version is the cache key

The engine caches an installed plugin under
`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, so an install over a
version it already holds resolves to a directory it already has and copies
nothing. A change that ships under a version somebody is already on is a change
they never receive, and the pane they keep drawing is the old one.

So a change to what the pane draws or what it reads bumps the version in the
same pass, rather than at some later release. Five places carry it:

| Where | What it is |
| --- | --- |
| `.claude-plugin/plugin.json` | the version the engine installs and caches by — the one that matters |
| `hooks/about.ts` `VERSION` | what the pane falls back to when the manifest could not be read |
| `hooks/about.ts` `RELEASED` | the day it went out |
| `tests/about.test.ts` `LAST_RELEASE` | the release before this one, which the two above are read against |
| `README.md` and `docs/controls.md` | the bottom row, written out as `flowpane <version>` |

`bun dev/checkmeta.ts` holds the first two together, which is the pair that can
disagree in silence. Several versions can go out on one day — 0.6.0, 0.7.0 and
0.8.0 all did — so the date is held to *not earlier* than the release before it rather
than later.

`dev/reload.sh` is the one install that moves without a bump, and it moves by
deleting the cached tree and reinstalling. Nothing else can: a released install
is reached only through the version.

## Layout of the repo

| Path | What it holds |
| --- | --- |
| `hooks/register.ts` | The plugin itself: every hook, the journal tail, the run state |
| `hooks/journal.ts` | Reading a run off disk — journal, run file, agent transcripts |
| `hooks/shape.ts` | The run's shape: phases, passes, what fed what |
| `hooks/tree.ts` | The canvas as elements: coloured runs per row, and a Button over every hotspot |
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
- **The arc is for two wires, and nothing else.** `◠` says *there is a second
  line in this cell, go and find it*. A phase's border and a band's rule are
  boundaries rather than lines anything travels along, so a wire meeting one
  breaks the boundary and runs through whole. A card's exit point is marked
  whatever else wants the cell.
- **Only the outer row of a wrapped band faces anything outside it.** A wire
  into the second row is a line down through the cards on the first, which is a
  line through a word — so a barrier lands on the row that faces it, and what
  crosses between two bands where either wrapped is bundled onto those rows
  rather than drawn carry by carry. See `facing` and `reaches`.
- **A phase is entered where it started and left where it finished.** Its
  agents group into waves by their clocks — the ones that overlapped, in the
  order the waves went — and the barrier above it lands on the first wave, the
  phase below is fed from the last. One wave is a fan and keeps every wire;
  waves of one are a chain. Feeding every agent both ways draws two gutters of
  wire that say the phase started all of them at once; see `wavesOf`.
- **A stroke across the run is a handover; a stroke along it is not.** A
  barrier's spine always cuts the way the work flows. The double stroke — `═`
  across the pane, `║` down it — lies along it, in the gutter between two phases
  whose clocks overlap, where drawing a barrier would say one waited for the
  other and drawing nothing says nothing at all. It is grey, like every
  boundary, and it is kept from every wire: see `KEPT` in `canvas.ts`, which
  holds it and a card's own exit point.
- **The dashed stroke means *not this run's own work*.** The phases it skipped,
  the strip naming the ones still ahead, and a nested run's rule and gutter —
  three things, one register, in every layout.
- **Time is drawn to one scale, and everything on it reads that scale from one
  place.** The timeline's axis has a width of its own — as many cells as the
  shortest bar in the run needs, up to four panes' — and the pane is a window on
  it. Bars, ticks, grid columns and the now-marker all take their column from the
  single millisecond-to-cell function, which subtracts the sideways scroll, and
  all clip to the axis columns rather than to the pane.
- **A section is never narrower than a name, and a node never shorter than its
  frame.** The pane divides itself only among the phases — and, down the pane,
  the agents — it can give a column wide enough to name. Past that the columns
  take the width they need. Laid out across, the drawing runs past the pane's
  edge and the body scrolls to the rest; down the pane a band wraps instead,
  into as many rows as its nodes need at a width they can be named at, shared
  out evenly and centred, so the drawing stays inside the width it was handed.
  The height keeps the same bargain: a column with more nodes than the pane can
  stand as cards keeps the cards and scrolls, rather than flattening every node
  in the drawing to a row. See `docs/header.md`.

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
