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
look at. The five lines that are *meant* to be broken are quiet by default and
`--all` shows them: a card's edge under its name, the bar's top rule under the
surface's close control, the borders and band rules, the timeline ruler's rule
under the tick labels written along it, and the timeline's grid, whose dashed
columns are dropped into blank cells wherever the bars left any and so reach
nothing at either end by design.

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
types a prompt, then keys at offsets (`--after '30:/flowpane\r'`), and keeps the raw
screen and (with `--debug-file`) the engine's log. Loading the plugin with
`--plugin-dir` and disabling the skills-dir copy keeps the test's `$.store`
apart from the one the real session writes:

```bash
python3 dev/drive.py --cols 140 --rows 40 --seconds 45 --cwd "$PWD" \
  --out dev/cap.raw --plugin-dir "$PWD" \
  --prompt 'Call the Workflow tool now with name "audit".' \
  --after '34:/flowpane\r' -- --model haiku --debug-file dev/cap-debug.log \
  --settings '{"enabledPlugins":{"flowpane@skills-dir":false}}'
```

## What is tested

Loads and runs on Claude Code 2.1.272: hooks register, `/flowpane` lists, the launch
hook fires and reads the journal. `tests/pane.test.ts` drives the whole thing
over the engine with `claude plugin test` — a launch opens the pane, a journal
fills it, the drawing comes back as bands, pressing a node's Button opens its
detail, and every row of the tree measures the same width as the Rasters beside
it and sits on the same ground, to the value. `tests/scroll.test.ts` presses the dialog's tabs and its
scroll arrows the same way — including the case that reported the scroll as
broken, where the pane pressed moves and the one behind the tab beside it keeps
the lines the reader left it on. It also presses the dialog's close mark, and
checks that opening a node leaves the layout the reader chose where it was.
`tests/fold.test.ts` checks the four things a looping run turned up: that a
phase entered three times is one row with three marks on it, that the phases
which went round together are tied by a rail down the gutter while the ones at
either end are not, that a drawing taller than the pane gets a scroll rail and
scrolls under a header that does not move, and that a live run opens on the
phase it is working in while a finished one opens at its start. `tests/run.test.ts`
rebuilds a run from the two files it is written to and checks the facts a node
must always carry survive the trip — and rebuilds one that has no summary yet,
where the script's name gives the run its own and the mtimes of each agent's two
files give it a clock, an agent still working taking a last-heard-from rather
than an end — and `tests/header.test.ts` measures the
header block on the canvas — three rows, a phase caption centred over each column
across the pane and in each stacked band's rule down it, with equal rule either
side and measured against the drawing rather than the pane, which are two
different widths once a scrolling run puts a rail down the right edge; and the
run menu opening below the bar rather than through it. `tests/dialog.test.ts` opens a detail and measures the
box: inset on all four sides, the graph above and below it unchanged, the
agent's own words in it and not on its card, the calls block saying what
each call was rather than what it came back with — except the one that failed,
which keeps its mark — every call on one row with the arguments starting at one
column and no rule between them, and a row pressed opening that call in a dialog
of its own: the argument whole with its own line breaks, what came back under a
rule of its own, the way back in the corner, and the list it came from not drawn
behind it. It reads a call row back to check that the argument shown is
the field that identifies the call and not whichever field the tool's schema
puts first. It checks the reading's two compartments — that each shelf ties
into the frame at both ends, that the first says `command` for a shell line and
`argument` for named fields and the second `output`, that moving one leaves the
other where it was, and that a box too short for two compartments rules the
sections off inside one block instead — and that a four-hundred-line answer keeps
both its ends with a count of what was left out between them, cut where the
answer already broke a line. It reads the weights back off the canvas rather than off the text: that
the word that ran, what it ran on and the punctuation between them come out in
three tones of one grey and no fourth colour. And it narrows the tab strip to
watch it go down its ladder — `Tool Calls (4)`, then `Tool Calls`, then
`Calls` — since the name is what a reader presses and the count is what they
would have found by pressing it. It opens a nested run's name to check that every agent it ran is
listed and not only the one that decided the trip, that a row of that list opens
that agent with the way back to the run in the corner, and that a long answer
still leaves every row one line high. It opens a card fed from further back and
checks that the dialog says `from` and the phase, which is the word the card
itself carries wherever the row beside it has the cells for it. It reads a markdown prompt back off the
canvas — the heading on its own line, the quote and the list items where they
were written, the writer's blank lines kept — and reads a four-hundred-line one
to its last line, since the wrapper it shares with a call's argument used to
stop at two hundred. It opens each dialog in turn — the detail, the
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
counts the arrowheads into a phase — one per agent where they all ran at once,
one where they ran one at a time, and one again where the phase ran in waves,
which is neither and is the shape a nested run opened out always has — checks that the arc is only ever drawn where
one wire steps over another, with a line above it and a line below it and never
a phase's own border under it, that every point a wire leaves a card by is
marked even where the bus stands hard against the card, and that a card fed from
further back says so in words — `from` and the phase, named by that phase's place
in the run, which is not where it stands in a picture that left a phase out, and
without the `▸` the engine writes in front of a nested run's name, which is a
control this pane puts on the band's caption and nowhere else. It checks that
the label stands above the card in either layout, never under it, that it stands
centred on that card with the same blank either side of it, and that where the
row is too short for the word and the name together the word is what goes: the
name comes through whole either way. It checks that a band's
caption stands where it is centred whatever crosses its rule, with equal rule
either side of it, and that the wire it covers gives way for that one row alone —
whole above the rule and whole below it, on the same column. It checks that four
carries out of two nodes
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
two. It measures how many sections the pane divides itself into: a run of
seventeen phases across a hundred and ten columns draws whole columns wide
enough to name, cut between two of them rather than through one, with the rest
to scroll to; a wider pane names more phases rather than drawing fatter ones; a
run whose slices were already legible keeps every phase on the pane; and down
the pane a band of eight agents stands as many of them as it can name, every
band opening at the left edge while it does. It measures the height's half of
the same bargain in both directions: a column of twelve agents keeps its cards
and scrolls down to the rest of them rather than flattening every node in the
drawing to a row, the phase names hold their row while it does, a pane too short
for two cards falls back to a row each, and a run too tall for cards down the
pane keeps its cards there too and scrolls. It measures what a band gives its
node room for: three rows above it — the one the wires gather on, the one a card
fed from further back names that phase on, and the one the arrowheads land in —
two below, and the node standing in the middle of them. It pins `scrolled()` itself, which
moves a band's spine the way the drawing runs — down the pane with the rows,
across the pane with the columns. Moved the one way in both, a band scrolled down
the pane kept its spine on the row it was laid out at while its cards went with
the scroll, and every wire into that band ran the depth of the drawing through
the cards in between. And it rules the timeline: that the axis carries a tick
row with elapsed times on it and dashed columns down the rows under them, and
that a run whose agents are all far shorter than the run asks for a scale wider
than the pane and gets a rail along the foot to move along it. `tests/press.test.ts` presses the controls
directly, where a press is one call over a plain object rather than a run driven
to the point the button appears — including the peek: a scroll stops the body
following, the same phase still at work leaves the reader where they went, and a
different phase takes the window back — and the wheel's axis, which the event
does not carry: over the rail along the foot it goes sideways, over a drawing
with no rows to give it goes sideways there too, and over anything else it goes
down. Over an open call it checks the wheel picks its compartment from the row
the pointer was on, since a scroll carries rows and nothing else. It presses a row of the Tool Calls list and checks that the call takes the
dialog's rectangle and not its state — the tab where it was, its scroll where it
was, the call keeping its own place in its own payload under its own number —
that `◂ Back` returns to both, and that moving to another agent shuts a call the
last one made. It reads a nested run's own dialog the same way: that the row
standing for the run answers to the run rather than to the agent its figures came
from, that opening it stands every agent the run ran with what each answered,
that the rows are four consecutive rows however long the answers are, that the
foot counts the agents, and that a row pressed opens that agent with `◂ Back` in
its corner and the list not drawn behind it. `tests/press.test.ts` keeps the
state that goes with it: that the run is selected by its phase, that an agent
opened from the list remembers it, that Back returns to the list rather than out
of the reading, and that an agent pressed in the drawing is offered no way back
to a list it did not come from. `tests/fold.test.ts` reads a nested run back off the canvas — that a run
a reader opened stands behind a dashed gutter its calling run's rows do not,
that the gutter closes on the run's own totals, that the mark says whether it is
open, and that folding it back takes the gutter with it. It measures the way in and the way back
out, which are one control on the band's caption in every layout: that the
handle reads `▸ 3 agents` shut and `▾ 3 agents` open, that the run's own card
carries neither — its bottom edge says its model, the way every card's does — that it is the same width either way, that the word
`collapse` appears in neither, that the rule shows between the caption and the
handle, that the name comes first with the handle trailing off its right, and
that the handle counts towards what gets centred — the rule comes out the same
length either side of the caption and its handle together. It measures what one press on a nested run stands:
every agent it ran, with no step left rolled up behind a count; a step folded
back standing as one row saying how many agents are behind it; and a phase of
the calling run that fanned out to the same shape keeping every card. It measures the nested
register across the three layouts: that a nested phase's rule is drawn in the
dashed stroke and the same run with the marker off its name draws none; that the
▸ takes a press laid out across, where there was none; that a shut nested run
stands one bar a trip on the timeline rather than one an agent, and opened
stands every agent on a row of its own with a press each. It measures the two
places the pane used to answer with a number instead of a place — a timeline
taller than the pane gets a rail, not a count — and the fork the flat list draws
out of a phase's rule, which a phase of one agent does not get. It also walks the
name ladder in both directions: a half that repeats the other goes at every width,
and the plugin half goes before the workflow half is cut. `tests/foot.test.ts` reads the row under the
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

Six files cover the parts of the plugin nothing drawn on the canvas reaches.
`tests/canvas.test.ts` reads cells back through the window — a glyph outside it
reads blank, the same glyph reads itself again once the window is cleared, and a
cell off the buffer reads blank rather than throwing — which is what stops a line
drawn to the edge of the body from joining something across a boundary it may
not cross. `tests/journal.test.ts` holds the two readers of a tool call to the
same cap: the one that fills a call in from a live `tool.call` and the one that
fills it in from a recording keep the same argument and the same answer, so a
run watched as it went and the same run opened afterwards draw the same call.
`tests/waves.test.ts` pins the tolerance that decides whether a phase is a fan or
a chain, from both sides, and `tests/wheel.test.ts` turns the wheel over a
rendered pane — sideways along the rail, down the drawing, down again on the last
row of a layout that has no rail there, and over a pane with no run on it, where
it moves nothing and costs no repaint. `tests/about.test.ts` reads what the pane
says about itself where there is no pane, and holds the release date to the day
the release before it went out, since a version bumped with the date left behind
is a row that reads as true.

`tests/shape.test.ts` is the sixth, and it exists because every other test
reaches these rules through a canvas: a run is painted and the cells are asked
what happened. That reads the drawing well and the reasoning badly. A fixture
written by hand declares its phases in the order its agents enter them, gives
every agent the same spend and finishes all of them — so the lane sort, the
failure-first mark on a folded trip, the unfinished guard, the sum of a folded
row and the dedupe on a doubled carry all agree with a simpler rule that is
wrong. It is the cases where the simpler rule parts company with the real one: a
phase declared before the phase that feeds it, a trip whose failure is not its
last agent, a trip still running, a nested run opened on its fullest pass rather
than its first, and one phase feeding one node twice.

The order the four layouts are walked in is pinned in two places on purpose —
`tests/press.test.ts` through `nextOrientation`, `tests/settings.test.ts`
through the layout list's press targets — and both write the order out rather
than reading `ORIENTATIONS`. The footer's control and the dialog's list both
take their order from that one array, so every check of their agreement was the
array agreeing with itself: swapped, the two moved together and nothing noticed.
The order is a decision — the two layouts a reader switches between most, then
the two they set once — so it is written down where a change to it has to be
made twice.

`dev/preview.ts`, `dev/stress.ts`, `dev/checkpic.ts`,
`dev/edges.ts`, `dev/shot.ts` and `dev/recover.ts` exercise the drawing, the
derived graph and the file reads without a session, `dev/checkmeta.ts` holds the
version the pane shows to the one the manifest ships, and `dev/dryrun.ts` runs a
workflow's control flow against stubbed agents, so a change to `audit`
can be checked for the shape it will draw before it is paid for.
