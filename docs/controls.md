# Controls, the bottom row and the dialogs

Everything a reader presses, and why each control is where it is.

Everything sits under the drawing. Click a button, or Tab to it and press Enter.

| Control | What it does |
| --- | --- |
| A node's label | opens that agent's detail dialog; click again to close |
| ⚙ Settings | opens the settings dialog over the drawing |
| `flowpane 0.3.0` | the name at the right-hand end of the bottom row: opens what the pane is, what presses it, and where it reads from |
| A setting's value | unrolls that setting's list where it stands; press it again to roll the list up |
| The graph, with any dialog open | takes no presses — it is pushed back behind the dialog until the dialog shuts |
| Layout | across, down, timeline, or fits the shape — picked by name |
| Detail height `−` `+` | rows the detail dialog takes, 5 to 32; grey at either end of the range |
| Theme | twelve palettes, nine dark and three light — each listed beside three cells of its own |
| ✕ (in a dialog) | closes it, from the dialog's own top corner |
| ▴ / ▾ | scrolls one block of the detail dialog three lines. Each block has its own pair, at the ends of its own bar. Grey at either end |
| The run's name | opens the session's other runs as a menu under it, once there is more than one; grouped by state, most recent first, each with the second it started on. Picking one moves the drawing to it, live or finished |
| A run on the idle pane | draws it. With nothing running the pane lists the session's runs in place of the graph, grouped and timed the same way |

## The bottom row

The way in at one end, what the pane is at the other, and the state between
them.

```
────────────────────────────────────────────────────────────────────────────────────────
⚙ Settings │ Layout: fits │ Theme: tokyo-night │ Detail height: 24 rows   flowpane 0.3.0
```

A line divides it from the drawing. Everything above the line is one canvas and
the row below it is elements, and without the line the two ran together: the
last row of the graph and the first word of the state sat one row apart on the
same ground, so a node parked at the bottom of the pane read as though it
belonged to the settings. The line is drawn in the tone the drawing's own rules
take — mixed from the ground rather than fixed — so it reads as the last line of
the picture rather than as a border the surface put there, and it spans the
drawing rather than the seat: a rule wider than the graph above it would step
off the right edge of everything it divides. The canvas gives up the row for it,
the way it gives up the row the footer takes.

The settings used to *be* that row: four controls and three rules, on screen in
every session whether or not anyone was changing anything. Each was a cycle, and
a cycle can only be read by pressing it — `Theme: gruvbox` says where you are
and gives no way to ask for `nord` except five more presses past it. It spent
the row's whole width on the few seconds a reader spends setting the pane up,
and still could not show them what they were choosing.

What replaced it is the part worth having on screen the whole time: what the
pane is currently set to, in the same words the dialog offers and in the order
the dialog lists them. A footer reading `Layout: down` beside a dialog offering
`across down timeline fits` would be two names for one setting, and a footer
reading them back in a different order would be two lists.

Each fact is named, in the dialog's own word for it. `tokyo-night` on its own is
an answer to a question that is not on screen: a reader who has never opened the
dialog has no way to tell which of those words is a setting and which a value,
and `fits` beside it could be anything. `Theme: tokyo-night` costs seven cells
and says what it is.

The row is built like the bar at the top of the pane, which is the other row a
reader reads rather than looks at: the control in the left gutter, the quiet
facts in the middle, the identity at the far right. One rule stands before each
fact — the same rule the top bar divides with — so the boundaries a reader
needs are the ones that are drawn. Spaced instead, the row read as one sentence
with nothing to say where one setting ended and the next began.

**It never wraps.** A footer one cell wider than the pane costs the drawing a
row and puts half the state under the graph, so what will not fit is dropped
from the end — the detail height first, which matters while a node is open,
then the palette, which can be read off the pane itself, and last the layout,
which is the one a reader changes most.

The same pane at 88, 72, 44, 30 and 22 columns:

```
⚙ Settings │ Layout: fits │ Theme: tokyo-night │ Detail height: 24 rows   flowpane 0.3.0
⚙ Settings │ Layout: fits │ Theme: tokyo-night            flowpane 0.3.0
⚙ Settings │ Layout: fits     flowpane 0.3.0
⚙ Settings      flowpane 0.3.0
⚙ Settings            
```

The name has first call on that width. A pane that will not say what it is has
nowhere to send the reader who asks — and where even the name will not fit, the
cells go back to the state rather than being left empty.

Both buttons are dim at rest and light — full strength, in the pane's selection
colour — under the pointer. A dim word with nothing around it does not read as
pressable, and the readers who found out it was found out by clicking it. The
lighting is the surface's own `hover`, so nothing crosses back into this plugin
and the pane does not redraw to light a word. The state between them stays
quiet: the things to press are the things that light, and a third lit word
between them would be a third thing to try.

The gear is a single-width geometric glyph, not an emoji. The pane is a grid of
cells, and an emoji is two of them wide in some terminals and one in others; a
footer that lines up in one terminal and wraps in the next is worse than one
with no icon at all. That is also why About has no icon: an `i` in a circle has
the same problem, and the name is a better button than a symbol for it. What a
reader presses to find out what this is, is what it is called.

## What the pane is

```
╭─────────────────── flowpane 0.3.0 ───────────────────── ✕ ─╮
│                                                            │
│ A live picture of the agents a workflow runs: what each    │
│ one is doing, what it has spent, and what it answered.     │
│                                                            │
│ A node       opens its detail                              │
│ Tab, Enter   moves, presses                                │
│ ✕            closes what is open                           │
│                                                            │
│ /wf help     every command                                 │
│ /wf runs     this session’s runs                           │
│                                                            │
│ Reads the workflow journals under ~/.claude/projects.      │
│ Nothing leaves this machine.                               │
│                                                            │
╰────────────────────────────────────────────────────────────╯
```

A reader who has never seen this before is looking at a live diagram with no
key: a graph drawn in glyphs, a bar of counters, and a row of words under it.
Every one of those is legible once somebody has said what the thing is, and
none of them before. The name in the foot row opens this, which is where a
person looks for it.

It answers four questions, in the order they get asked. What the pane draws —
one sentence, since a reader who opened a dialog titled with the name already
knows roughly. What can be pressed, which is the question that brought them.
What the commands are, for the seat that draws no buttons at all. And where the
drawing is read from, since a graph with nothing in it is either a quiet session
or a path this plugin cannot see, and nothing else on screen tells those apart.

`/wf about` prints the same lines. They are written once, in `hooks/about.ts`,
because two copies drift: the dialog gains a line the command never learned, and
the reader with the fewest ways to find out is told the least. The version comes
from there too, and `bun dev/checkmeta.ts` fails if it has drifted from
`.claude-plugin/plugin.json` — a pane claiming 0.3.0 while the marketplace
serves 0.4.0 is worse than a pane that names no version at all.

Short of the room for all of it, the end goes first: what the pane is and what
presses it are what the dialog was opened for, and the path it reads from is the
line a reader comes back for later. It draws down to 26 columns.

## The settings dialog

```
╭─────────── ⚙ Settings ──────── ✕ ─╮
│                                   │
│ Layout            [across      ▾] │
│ Theme         ▮▮▮ [tokyo-night ▾] │
│ Detail height  −  [24 rows]  +    │
│                                   │
╰───────────────────────────────────╯
```

A dialog over the drawing, like a node's detail, and for the same reason: it
costs the graph nothing. It covers the middle while it is open and gives all of
it back when it shuts. The run menu and the settings are never open at once —
the menu drops from the bar and the dialog sits under it, so whichever opened
last would be read through the other.

**Everything behind a dialog is pushed back.** Every cell outside it has both
its colours mixed 72% toward the ground. A dialog painted straight onto the
graph is the same ink as the graph — same strokes, same palette, its frame the
only thing saying which is in front. Every dialog the pane draws does this: a
node's detail, the run menu, the settings, the list unrolled from a setting, and
About.
Nothing is hidden: the run is still running under there, which is the whole
reason these are drawn over the pane rather than in place of it.

Only the frontmost is lit. The settings over an open detail push that detail
back along with the graph, and the run menu pushes back everything under the
bar. A setting's unrolled list belongs to the dialog it came from, so those two
stay lit together. Two lit boxes are two answers to the one question the scrim
is there to settle: which of them is being worked on.

Nothing behind a dialog takes a press, and every dialog works this way: a node's
detail, the run menu, the settings, and About. This is not caution about where a
press lands. It is what the scrim is made of. A press target is drawn as a
`Button`, and a Button carries a label and no colour — the surface draws that
label at full strength whatever the cells beneath it were mixed to. So a node
left pressable behind a dialog is also a node left *lit* behind one: a row of
white labels across a drawing that has been pushed back, which reads as the
graph still being the thing on top. Behind a dialog means behind it in both
senses.

Each dialog carries its own way back, so nothing else has to stay live for it.
Three of them have a ✕ in the top corner. The run menu has none — it drops from
the run's name, and that name is the one control left pressable while the menu
is open, because it is the control that opened it rather than a piece of the
drawing behind it.

A cell with no colour set is left alone, because that is the terminal's own
ground showing through and this pane does not know what colour it is. A block
with a ground of its own — an open detail dialog behind this one — goes back
with everything else rather than staying lit under dimmed text.

Three lines, one to a setting, each answering the question a reader opens the
dialog with: what is this pane set to. Everything else is behind the control
carrying that answer. It used to be on screen all at once — fifteen words across
seven lines, which have to be sorted back into their settings before the one
being looked for can be found, and the values among them hunted for by their
brackets.

There was a fourth line, `Backdrop`, and it is gone. It chose between painting
the pane on the palette's own ground and letting the terminal's show through,
and the ground is what the rest of the palette is built against: every colour in
a theme is picked to read on it, the scrim behind a dialog mixes toward it, and
a dimmed label is dimmed toward it. Off, all three of those are aimed at a
colour the pane cannot see. It is always on now. A setting whose other value
makes the drawing worse is a way to break the pane, offered in the same list as
the palette.

Pressing a value unrolls that setting's list where the value stands, with the
names in the same column the value was in, so opening a list does not move the
thing being read. Pressing it again rolls the list up. One list is open at a
time. Every choice is named with the value it sets — `set:theme:nord`, not
`theme` — so a press says what it does rather than what it moves on from.

```
Theme         ▮▮▮ [tokyo-night ▴]
               ╭───────────────────╮
               │▮ ▮▮▮  tokyo-night │
               │  ▮▮▮  catppuccin  │
               │  ▮▮▮  gruvbox     │
               ╰───────────────────╯
```

**The value the pane is set to is marked with brackets, not with a colour, and
the mark on a list is a glyph.** A press target is emitted as a `Button`, and
`ButtonProps` has no `color` — the surface draws the label in its own plain
text, so every colour painted under a hotspot is thrown away. Anything a hotspot
has to say has to be said in glyphs. The brackets take exactly the air the value
carries either way, so nothing moves under the finger when the value changes,
and the ▾ turns to ▴ while the list is open.

For the same reason a theme's three swatch cells stand *outside* its press
target, in the shut control and in the list. Inside one they would arrive as
three grey rectangles, which is the one thing a swatch cannot be. The ▮ marking
the value a list is currently on stands outside too, so it keeps the selection
colour. `dev/checkpic.ts` checks the matching invariant for backgrounds — no
cell under a hotspot carries a background the surface would throw away — across
every journal in a session, with the dialog shut and with a list open.

A list drops below the control it belongs to, and above it where there is no
room below. What it covers is its own while it is open: the setting under a
palette list takes no press aimed at the palette. Where the pane cannot hold
every entry, the ones that did not fit are counted on the last line rather than
dropped in silence — `/wf theme` reaches the same palettes from the prompt.

A pane too short to hold the dialog under the bar draws it over the bar instead.
A button that opens nothing is worse than a bar covered for as long as it takes
to read. The dialog draws down to 7 rows and 28 columns; below that the button
does nothing and the commands are the way in.

Every control has a command too, which is what a surface with no Buttons falls
back to:

| Command | What it does |
| --- | --- |
| `/wf` | opens the pane, or closes it if it is already open |
| `/wf runs` | lists this session's runs, numbered |
| `/wf <n>` | shows run `<n>` from that list |
| `/wf across` \| `down` \| `timeline` \| `fits` | lays the graph out |
| `/wf detail <n>` | rows the detail dialog takes (5–32) |
| `/wf about` | what the pane is, and what presses it — the About dialog's own lines |
| `/wf theme` \| `/wf theme <name>` | lists the palettes, or paints in one |
| `/wf help` | prints the above |

A run the plugin never watched is picked back up: the mod walks the session's
own transcripts on `session.start` and on a `/wf` that finds nothing running, so
`/wf` works on a run that started before the module loaded, finished ones
included — those are what the run list is for. A run still going is picked back
up too, and `/wf` opens on it: reload the plugin mid-workflow and the pane joins
the run in progress, with every agent timed from when it actually started. With
nothing to show at all, `/wf` closes the pane rather than leaving an empty one
open.
