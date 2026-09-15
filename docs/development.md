# Working on the drawing

The tools that draw a run without a session, and what the tests measure.

Iterate on the drawing without a session:

```bash
bun dev/preview.ts                    # a synthetic review/verify pipeline
bun dev/preview.ts --animate          # the same run playing out
bun dev/preview.ts --journal <dir>    # a real run's transcript directory
bun dev/preview.ts --settings         # with the settings dialog open over it
bun dev/preview.ts --menu theme       # with that setting's list unrolled
bun dev/preview.ts --about            # with the About dialog open over it
bun dev/preview.ts --plain            # glyphs only, no colour, for diffing frames
bun dev/shot.ts --journal <dir>       # the pane, working, in a browser at http://127.0.0.1:8731
bun dev/stress.ts                     # wide fan-outs and a narrow body
bun dev/recover.ts <sessionId> [home] # what the session's runs rebuild to
bun dev/checkpic.ts <dir>             # the bands cover the canvas, every node has a Button
bun dev/lines.ts                      # every line, checked: no wire through a word, no arm into a blank
bun dev/audit.ts                      # every run, every layout, at every size the pane is given
bun dev/contrast.ts                   # every theme's roles against its own ground, and its edges against its states
bun dev/edges.ts <dir>                # the graph derived for a run, and how it was derived
bun dev/dryrun.ts <workflow>          # a workflow's control flow, stubbed, no agents spent
bun dev/checkmeta.ts                  # the version the pane shows is the one the manifest ships
claude plugin test .                  # the test suite
bunx tsc --noEmit                     # typecheck against types/claude-code.d.ts
```

`audit.ts` and `lines.ts` sweep every run the project has on disk. They find
them by deriving the session directory from the working directory, the way
Claude Code files one; `FLOWPANE_RUNS` points them at a corpus copied from
somewhere else instead.

`dev/lines.ts` is the one that reads the drawing rather than the code. It paints
every journal this project has at every size in the audit's sweep, and after each
frame asks four questions of the cells: whether a wire was written through a
word, whether a word was written over one of the pieces only a wire is drawn
with, whether an arrowhead has a stem behind it, and whether every arm of every
line piece reaches something. Each cell remembers which function drew the line
in it, read off the stack, so a fault comes back with the painter to go and
look at. The three lines that are *meant* to be broken — a card's edge under its
name, the bar's top rule under the surface's close control, the borders and band
rules — are quiet by default and `--all` shows them.

`dev/shot.ts` is the one to reach for when the question is about a cell, or
about what happens on the third press. A terminal is a poor place to debug a
terminal drawing: the escape sequences and the picture share one stream, the
scrollback cuts the tall sizes in half, and two widths cannot be held side by
side. Worse, until this the only way to press anything was to start a real
workflow and wait for it — a layout that broke when a detail opened over a
barrier took a minute of somebody's run to see once.

So the page is the pane, working. It holds the same view object the plugin
holds, paints with the same `paint()`, and hands every press to the same
`hooks/press.ts`. Clicking a node opens its detail over the graph, the
arrows scroll a block, the run's name drops the menu and picking from it swaps
the run, and the button under the drawing opens the settings, where the layout,
the palette and the dialog's height are picked by name. Tab moves between the
same targets the pane makes pressable and Enter presses one; Escape shuts the dialog; the arrow keys
step the frame, and **play** runs the clock at the pane's own cadence so the
animations can be watched. **follow** re-reads the journal on every frame, which
is a live run in a browser. A column ruler sits over the drawing and row numbers
down the side, since nearly every question asked of it is about a cell.

What it does not hold is a session: `$.store` keeps nothing, and the transcripts
are read from disk rather than from the hook chain. Everything else is the code
that ships.

And with a session, without watching it: `dev/drive.py` gives Claude Code a pty,
types a prompt, then keys at offsets (`--after '30:/wf\r'`), and keeps the raw
screen and (with `--debug-file`) the engine's log. Loading the plugin with
`--plugin-dir` and disabling the skills-dir copy keeps the test's `$.store`
apart from the one the real session writes:

```bash
python3 dev/drive.py --cols 140 --rows 40 --seconds 45 --cwd "$PWD" \
  --out dev/cap.raw --plugin-dir "$PWD" \
  --prompt 'Call the Workflow tool now with name "audit".' \
  --after '34:/wf\r' -- --model haiku --debug-file dev/cap-debug.log \
  --settings '{"enabledPlugins":{"flowpane@skills-dir":false}}'
```

## What is tested

Loads and runs on Claude Code 2.1.272: hooks register, `/wf` lists, the launch
hook fires and reads the journal. `tests/pane.test.ts` drives the whole thing
over the engine with `claude plugin test` — a launch opens the pane, a journal
fills it, the drawing comes back as bands, pressing a node's Button opens its
detail, and every row of the tree measures the same width as the Rasters beside
it and sits on the same ground, to the value. `tests/scroll.test.ts` presses a block's own scroll arrows
the same way — including the case that reported the scroll as broken, where the
column pressed moves and the short column beside it stays where it was. It also
presses the dialog's close mark, and checks that opening a node leaves the
layout the reader chose where it was. `tests/run.test.ts`
rebuilds a run from the two files it is written to and checks the facts a node
must always carry survive the trip — and rebuilds one that has no summary yet,
where the script's name gives the run its own and the mtimes of each agent's two
files give it a clock, an agent still working taking a last-heard-from rather
than an end — and `tests/header.test.ts` measures the
header block on the canvas — three rows, a phase name centred over each column
and into each stacked band's rule, and the run menu opening below the bar
rather than through it. `tests/dialog.test.ts` opens a detail and measures the
box: inset on all four sides, the graph above and below it unchanged, the
agent's own words in it and not on its card, the calls block saying what
each call was rather than what it came back with — except the one that failed,
which keeps its error — and a rule between one call and the next, inside the
block and never above the first. It opens each dialog in turn — the detail, the
run menu, the settings, a setting's unrolled list and About — and checks that
every one of them pushes the drawing behind it toward the ground and carries
none of it forward, and that a detail already open goes back with the graph once
the settings are opened over it. It opens About over a run and over the idle
pane, reads the name, the version, what presses the pane and where it reads from
back off the canvas, and checks that the close mark is the only thing on screen
that takes a press. It asks the same of the rest: with any dialog open no node
answers a press, the detail holds its ✕ and its scroll arrows and nothing else,
and the run menu holds its rows and the name it dropped from — including with a
detail open underneath, where the menu is the frontmost of the two. `tests/menu.test.ts` opens the run
menu and reads it back: the states stacked in order, the most recent run of each
first, the clock to the second on every row — two runs a minute apart are told
apart by it — and the day as well on a run from another one, each heading
carrying its state's own mark and a rule, and the headings dropped before a run
is when the pane is short. It measures the idle pane the same way — the bar, the
runs under it headed as the menu heads them, every one of them pressable, and
the line a session with nothing to list gets instead. `tests/wires.test.ts`
counts the arrowheads into a phase — one where its agents ran one at a time, one
per agent where they ran at once — and checks that four carries out of two nodes
turn in one shared line, with no junction glyph anywhere along it and never two
turns on one row: a junction there is two carries in one cell and an arm a
reader cannot assign to either of them, and departures on the cards' own edges
are what keep the four of them off each other. It also measures the palettes:
no theme draws its edges in a hue one of its states is drawn in, and no theme
draws a card's frame in a tint a reader could take for a plain border.
`tests/layout.test.ts` measures the sections — each phase standing in the
middle of the one it owns, to a cell — and where the phases it could not fit are
named: a strip at the end of the drawing across, a dashed band of their own
under the last phase the run entered down the pane and along a timeline, never
an empty band each — and the row it gives up when the pane is too short for
two. `tests/press.test.ts` presses the controls
directly, where a press is one call over a plain object rather than a run driven
to the point the button appears; `tests/foot.test.ts` reads the row under the
drawing back off the tree — two buttons, keyed `@settings` and `@about`, each
carrying a hover scope that lifts the dim under the pointer, with a quiet line
between them naming each setting and its value in the dialog's own words and in
its order, a rule before each of them and no dots. It measures the row at six
widths: what it draws never runs past the pane, the way in is never dropped, the
detail height goes before the layout does, and the name outlasts every fact. And `tests/settings.test.ts` opens the
dialog and checks that shut it says what the pane is set to and offers nothing
else, that a press unrolls that setting's list where it stands and a second one
rolls it up, that only one list is open at a time, that a step past either end
of the detail range is drawn but not pressable, that a theme's swatch stands
outside its press target in the control and in the list, that neither the graph
under the dialog nor the settings under a list take presses aimed at them, that
every cell behind the dialog moves toward the ground and none away from it while
the dialog's own swatch keeps its palette's values to the byte, and that picking
twice gives the same answer twice — which a cycle would not. `tests/press.test.ts`
presses the two ends of the foot row against each other, since what the pane is
set to and what the pane is are two answers and only one of them can be open.
`dev/preview.ts`, `dev/stress.ts`, `dev/checkpic.ts`,
`dev/edges.ts`, `dev/shot.ts` and `dev/recover.ts` exercise the drawing, the
derived graph and the file reads without a session, `dev/checkmeta.ts` holds the
version the pane shows to the one the manifest ships, and `dev/dryrun.ts` runs a
workflow's control flow against stubbed agents, so a change to `audit`
can be checked for the shape it will draw before it is paid for.
