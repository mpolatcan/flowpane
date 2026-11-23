# The header block

The run line, the phase names, the rule under them, the borders between phases, and what moves.

```
 Stopped after 2m56s in Review. 9 of 13 agents finished.
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
▮ wf_65ed0255-65c │ stopped 9/13        ⧖ 2m56s │ ∑ 489.3k tkns │ ⚙ 33  13×Bash  11×Read │ ⧉ 13  7×Haiku 4.5  6×Sonnet 5
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Survey 5/5         Review 3/6 ↻3          Check 1/2              Verify              Escalate              Report
─━━━━━━━━━━━━━━━┯─────━━━━━━━────────┬─────━━━━━━━────────┬────────────────────┬────────────────────┬───────────────────
```

## The sentence row

The row above the bar says what the run is doing, in words. The run line is
figures with marks and the drawing is a diagram with no key: between them a
reader can work out what is happening, and on a narrow pane the phase doing the
work is often scrolled out past the edge. This row says it outright.

```
 In Verify, bugs is reading a file and perf is thinking. tests failed. Report comes next.
 Verify: bugs reading and perf thinking. tests failed. Next: Report.
 Verify: bugs reading and perf thinking. tests failed.
 Verify: bugs reading and perf thinking. 1 failed.
 Verify: 2 running, 1 failed
 2 running, 1 failed
```

A live run is told by the phase or phases with agents running, what each of
those agents is doing and to what, which agents have failed and why, the last
gate to report and what it said, and the phase that comes next:

```
 In Develop, Develop is running the linter (2 files changed). Preflight: plan located, tools ready. Verify comes next.
 In Develop, Develop is thinking, after type-checking the code (2 files changed). Verify comes next.
 In Develop, Develop is editing config.ts. Verify comes next.
```

A call is said with the thing it is working on, taken from its own argument:
`editing stores/config.ts`, `running the linter`, `searching for 'storyOf'`. A
command is said by what it does, as the strip says it (see
[activity.md](activity.md)), and shown as written where nothing in it is known. The verb alone said the agent was busy, which the spinner already
says; a reader watching a pipeline wants to know which file the develop step is
in and which command a gate is running. A path keeps its file and the folder it
is in, since a pipeline works in a worktree several folders deep. An agent
between calls is quoted where it has started saying something — `Develop is
thinking: “The pill test failures are a mounting artifact”` — since what it
makes of the last result is the reasoning a reader is watching for. Where it has
said nothing yet, it is thinking about the last thing it did, so that is what it
is said to be thinking after. The files an agent has changed — the distinct paths
its `Edit`, `Write` and `MultiEdit` calls named — are counted after its clause.
A tool the pane has no verb for is named, since a verb guessed for a tool the
pane does not know is a claim about what it does.

The last gate to report is the agent most recently landed with a summary in its
answer — see the verdicts in `docs/nodes.md` — and the clause is its name and
that summary. A failed agent is followed by its reason where it is the only one
that failed. The ladder gives these up first: the report, then the reasons, then
the tally, then the folder of the path. An agent nothing has been heard from for 45 seconds is said
to have said nothing, and for how long. More than three agents at work are
counted rather than listed.

A finished run is told by how it ended: `Done in 8.0s. All 6 agents finished.`,
`Stopped after 17m35s in Develop. 3 of 4 agents finished.`, or a failed run's
first line of error.

It is a list of spellings, from the most the row can say to the least, and the
row takes the first that fits. A sentence cut off at the edge says less than a
shorter sentence and reads as a fault in the pane. The spellings are built in
`storyOf`.

Agent names are set in their state's colour and nothing else in the row is
coloured, so the row keeps the rule that colour says state. The prose is drawn
quieter than the run line under it, so the figures stay the loudest thing at
the top. It is ragged left, a cell in from the edge, because it is a sentence to
read rather than a heading to find. Nothing in it moves: it changes when the run
does.

The row used to carry the pane's own name, `FlowPane - Dynamic Workflow
Visualizer`, centred, with a light sweeping through it. Once a run is on screen
the reader already knows what the pane is, and a row that says the same thing on
every frame is worth less than one that says what the run is doing. The idle
pane still carries the name, with its sweep, because a session with nothing
running is where somebody asks what this is; the foot names it in every view.

The row is taken only where the pane can spare it: sixteen rows and forty-six
columns, in `titledPane`. Below either it is not drawn and the row is not
reserved.

The header is a block, not a line. Each piece of the run line is divided from
the next by a stroke, and the block closes on a rule across the pane — so a
reader can tell one figure from its neighbour, and can tell the header from the
graph under it. Spaces alone did neither: a row of figures separated by spacing
reads as one long figure with gaps in it, and three lines at the top of a pane
read as three lines, not as a heading the rest of the drawing hangs off.

Under it the bar is three rows — a rule, the run line, a rule — with the line in the
middle, so what the bar says sits centred in it rather than against its top
edge. Under ten rows it drops to two, keeping the closing rule and losing the
opening one: a pane that short needs the row for the graph more than the
figures need to be centred in it.

The closing rule is also the border between the bar and the phase names under
it. The names used to begin on the row after the run line with nothing between
them, and two rows of text at the top of a pane read as two rows of text, not
as a heading and the thing it heads.

The opening rule earns its row twice over. The surface draws the pane's own
close control across the top right corner, and a figure under it is a figure
with its last character missing — `⧉ 10` lost its figure for a while
before anyone worked out why. With a rule on that row and the figures a row
below it the run line has the full width back; the rule is the thing that stops
two cells short.

The run line has two halves that behave differently on purpose. On the left,
what the run is called and what it is doing — how many agents have landed, how
many are running, how many of those are in a tool call, thinking, or have gone
quiet; text that grows and shrinks as the run goes on. Each of those counts
carries the mark the rest of the pane gives the same thing — `✔ 6/10` for what
landed, `▸ 2 running`, `⚙ 1 using tools`, `◌ 1 thinking`, `✖ 1 failed` — and the
word stays only where no mark already stands for it: nothing in the drawing
means quiet, and a finished run says `stopped 9/13` in words because `⊘` is a
glyph a reader would have to be taught. That count is of the agents that
finished, as the sentence above counts them; it used to count every agent that
ended, so a run with a failure read `completed 18/18` under a sentence saying
one had failed. `✖ 1 failed` comes straight after the count and is held with
it, so a narrow row gives up a figure before it stops saying that something
failed. On the right, what it has
cost, in a fixed order, pinned to the right edge. A figure that slides sideways
every time the status word changes length is a figure that has to be found again
on every frame; against the edge it stays in the cells the eye last left it.

What the run returned is not said here, and had a row of its own under the bar
before that. A workflow returns a value, not a sentence, and the first line of
one — `.claude-plugin/plugin.json: 0 finding(s) in 1 pass(es)` — is a fragment
of a data structure sitting in the row that says what the run is. Whoever wants
the answer opens the agent that wrote it, where the whole of it is set out and
scrolls.

Both figures are marked: `⧖ 2m56s`, `∑ 489.3k`. The
hourglass is `⧖`, not `⌛`: the pane's own format takes one printable
width-1 character per cell, and the hourglass everyone knows is two cells wide
and renders as a colour emoji besides. This is the widest row the pane has, so
this is where it teaches the two marks — with a clear cell between each mark and
its figure, which a card has not got. Squeezed, the space goes before the figure
does and the pair closes up the way a card writes it.

One printable width-1 character per cell is a rule the canvas now keeps rather
than one the drawing is trusted to follow. Every measurement on the pane counts
cells — a card's frame, a label's room, the column a wire turns in — so a
character the terminal gives two columns to breaks all of them at once: the
glyph is drawn, and everything after it on the row lands one column right of
where the drawing put it, which walks a card's right edge outside the card. One
wide glyph in one label is enough, and labels are whatever a workflow script
called its agents. So the grid holds and the glyph gives way: a character two
columns wide, or one outside the BMP, is written as `□`, and a combining mark or
a variation selector — which take no column of their own and would otherwise
each eat a cell — is dropped. A Japanese label comes out as boxes, which is what
a terminal with no font for it would show, and the drawing around it is still a
drawing.

The token mark was a diamond first, and a diamond is not a token: a reader who
has not been told cannot work it out, and nowhere in the pane told them. Then it
was the word `tkns`, which says it but costs five cells — enough that a card of
fourteen columns could not carry it, so no card could, since two cards side by
side reading `17k tkns` and `38k` read as two different figures. `∑` is neither
problem: a token count is a total, a sum sign is what a total is written under
everywhere else, and it costs one cell, so every figure on the pane carries it
and none stands without saying what it is a figure of.

The word is back on top of the mark wherever the room is there: `∑ 15.1k tkns`.
Each place that writes a count keeps a ladder of spellings and takes the widest
that fits — `∑ 15.1k tkns`, `∑ 15.1k`, `∑ 15k`, `∑15.1k`, `∑15k` — so the header
writes the unit out at almost any width, a card writes it from about twenty-two
columns up, and anything narrower falls back down the ladder rather than
dropping the figure. What made `tkns` unreadable before was two cards side by
side spelling the same fact two ways, and that cannot happen now: the cards of a
phase share a width, so they share a rung. Nothing is hidden to make room — the
count is the last thing any of them gives up. A card of eight columns has
dropped its clock and its model and still reads `∑12k`.

The count is written in the unit that keeps it to four figures: `812`, `38.4k`,
`1.1m`. A long run spends millions, and `2431.7k` is a number a reader counts
the digits of before they know what it is.

How many agents there are and what they ran on is one figure, not three. The
total and its breakdown are the same fact at two grains, and set apart —
`7×Haiku 4.5 │ 6×Sonnet 5 │ 13 agents` — a reader has to add the parts up to
see whether they account for the whole. They sit between one stroke and the
next, divided from each other by spacing alone, which is what says they belong
to one measurement. The total is marked `⧉ 13` rather than written `13 agents`:
two joined shapes for a count of the things the pane is full of, and the six
cells the word took were the six the model breakdown beside it wanted.

What the run called is the same fact about its tools, and sits beside it:
`⚙ 24  5×Read  3×Bash`, the total and the two most-used, divided by spacing the
same way. `⚙ 24` alone says the agents were busy; the breakdown says they were
reading the repository, which is the part a reader can act on. Two tools rather
than three, because the tail of that list is one call of each and the cells it
would take are the ones the models want.

The tally is what each agent knows, and the three sources it can come from are
not the same. The live chain counts a call the moment it is made, so a run being
watched has both the count and the names on every agent. A run read back from
disk has the names only for the agents whose transcripts have been read, and the
journal's own per-agent figure for the rest — so the total counts every agent
and the breakdown names what it can. A run with neither says nothing here rather
than saying zero.

The run's state is said here and nowhere else. It used to be on this line, in
the footer, and again in the closed label of the run picker — three wordings of
one fact, which a reader checks all three of. The picker now marks each run with
the same glyph its nodes use (`▸` running, `✔` completed, `✖` failed, `⊘`
stopped) and the row under the drawing says nothing about the run at all — only
what the pane is set to.

The name is also the run chooser. A `▾` after it says so, and pressing it drops
the session's other runs as a menu under the bar, over the drawing; picking one
moves the drawing to it.

```
──────────────────────────────────────────────
▮ wf_65ed0255-65c ▴ │ stopped 9/13
──────────────────────────────────────────────
  ╭────────────────────────────╮
  │   ▸ Running ────────────── │
  │ ▮ ▸ audit    4/6  13:44:02 │
  │   ✔ Done ───────────────── │
  │   ✔ demo   26/26  09:07:31 │
  │   ⊘ Stopped ────────────── │
  │   ⊘ audit   6/10  12:54:48 │
  │   ⊘ audit   9/13  12:54:05 │
  ╰────────────────────────────╯
```

The drawing goes back behind it while it is open, the same scrim the settings
and a node's detail draw, and nothing in it takes a press — not only the rows the
menu covers. A label beside the menu would answer a press aimed at a run, and,
being a `Button`, would be drawn at full strength over a drawing that has been
pushed back. The run's name is the exception: the menu has no ✕, and the name is
the control it dropped from.

The menu groups the runs by state and puts the most recent of each state first.
A session leaves a dozen behind and they are not alike: one may still be going,
which is the one the menu was opened to find, and the rest landed, were stopped,
or failed. Read in the order they happened to be loaded, the live one is
anywhere. Each state's glyph is drawn in that state's own colour, the same one
its nodes take, and `▮` in the left gutter marks the run the pane is already
drawing — the glyph the bar puts in front of the name it shows.

A heading carries its state's own mark and a rule out to the edge of the box.
The mark is the one the runs under it carry, so a group is told apart without
reading the word, and the rule is where the group starts: a bare word in the
same colour as the rows around it read as a run whose name happened to be
`Stopped`. Both are drawn in the state's colour, the rule dimmed — it is a
boundary, and a boundary at the strength of what it bounds competes with it.

Every run carries the clock it started on, right-aligned in a column of its own,
so a column of identically named runs can be told apart by the only thing that
differs. To the second: a session's runs are mostly one workflow restarted, and
two restarts inside a minute are common enough that `12:54` twice over left the
reader nothing to pick by. A run from another day carries the day as well, since
`13:44` on Sunday and `13:44` on Monday are otherwise the same three rows apart.

A list too tall for the box keeps every row it has and shows a window on to it,
with the same bar the detail dialog and the body carry down its right-hand
edge: `▴` and `▾` at the ends, a thumb between them saying how much of the
list is on screen and whereabouts in it, and the wheel over the menu moving it
three rows a press. The clocks stop a column short of the bar where one is
drawn, so the columns the list is read down stand still rather than shifting
under the pointer when it appears.

Before that the box gave way instead: the headings were dropped first, and
shorter still the last row read `… 8 more — /flowpane runs`, which named a
command that prints the same list somewhere else. A count of what the pane left
out is not a way to reach it, and a session that leaves forty-six runs behind
leaves most of them past that line. The headings stay now, because a list that
scrolls loses nothing to them — three rows out of forty-six, and the piles they
divide are what the list is for.

Opened without being scrolled, the list seats itself on the run the pane is
drawing rather than at the top. The list is opened to move off that run, and a
reader who cannot see where they are standing has to scroll to find out. Once
it is shut, where they scrolled to is forgotten: the next opening is about runs
that have moved since.

Only files named for a run are read. The engine keeps its own bookkeeping in
the same directory — `.skipped-runs.json` among it — and a file that is not a
run has no agents, no clock and no status, so it listed as a run that had just
started and never moved.

The menu is painted into the drawing rather than mounted as a chooser under it.
A chooser of its own is a second control: one press to open the area it sits
in, another to open its list, and the drawing a row shorter the whole time. A
menu under the name it drops from needs neither — the name is the control, and
what it covers it covers only while it is open. The list was a permanent row
under the footer before that, on screen whether or not anyone was choosing,
spent on a control most sessions press once.

It opens below the bar rather than inside it. Its top edge used to land on the
run line, which cut the bar's closing rule in half and took the name the menu
drops from with it.

`/flowpane` opens on the run that is going; with none going it opens on the last run
of the session, so the bar is there and the name on it opens the list of the
rest.

A row of bars between the spend and the fleet used to say what each phase of
the run had spent. It has gone. Six bars two cells wide, with no axis and no
labels, above the phase names written out in full, is a chart that has to be
decoded against the row under it before it says anything — and what it said
then was which phase spent the most, which the row of names and counts says in
words.

Where the row has room to spare, the counts say what they count: `∑ 489.3k
tokens`, `⚙ 33 tool calls`, `⧉ 13 agents`. The marks are the pane's own
shorthand, and a reader meeting it for the first time has no key to them. The
words are all said or none — one group in words beside another in marks is one
row in two vocabularies — and they are tried against the whole of the state on
the left, not its floor, so spelling a unit out never costs the row a count of
what the run is doing. In practice that is a finished run, whose state is short,
or a pane near two hundred columns wide.

Narrow, the figures give way by rank rather than by position, and in two steps:
first a figure says less where it has a shorter form — the fleet drops its
model breakdown and keeps `⧉ 13` — and only then does a whole figure go.
The tools go first, then the fleet, then the spend. The tools lead because a
run's tools are much the same handful whatever it was asked to do, where its
models are a choice someone made about this run. The clock is the last to go, and the name
and the first thing said about the run are never squeezed out for either: a
pane that has to choose between saying which run this is and saying what it
spent should say which run this is.

## The phase names

Laid out across, one heading per phase, set over the middle of the column it names:
the phase's state mark, its name, its landed count, — where a phase looped — the
number of passes it took, and how long it has taken. The heading may run on over
the gutter after its column, up to two cells short of the next heading. Under
the names a rule, and each phase fills its own length of that rule as its agents
land, which ties the measurement to the column it measures. The fill is a change
of stroke, not of colour: `━` where the phase has landed and `─` where it has
not, both in the one tone every border and rule on the pane is drawn in. It used
to fill in the phase's own state colour, and carry a travelling light while the
phase was running. That put green, yellow and blue into the layer whose whole
job is to be a boundary — so a rule changed colour for reasons a reader had to
work out, and read as something happening rather than as the edge of something.
Colour on this pane says one of two things now: what state a node is in, or that
a line is a wire. The one border it is allowed to say a state on is the card's
own frame, which encloses exactly one agent and so has exactly one state to
carry; a rule under six phases has six. The border between two phases hangs off
the rule at a `┯`, so the two say the same thing about where one phase ends.

Across, the header block is five rows in all — three for the bar, one for the
names, one for the rule — and four where the pane is under ten rows tall, where
the bar gives up its opening rule. Stacked it is four, because the first band's
own rule carries the first phase's name.

A phase nothing has entered yet leaves its length unfilled and its name grey.
The rule still runs, because it is the block's own border, and a border that
stops where the work stops is a border with a hole in it.

## Phases the run did not reach

A phase nothing entered is drawn as its heading and nothing else, in every
layout: its mark, its name, and — where a phase that ran gives its count — the
line the script wrote about it in `meta.phases`, set into a dashed rule. The
dashed stroke is the one the pane draws for work that is not this run's own.

```
 ✖ Gate  2/2  9.0s ──────────────────────────────────────────────────────────────

                ╭───────── ✔ lint ─────────╮  ╭──────── ✖ tests ─────────╮
                │     ⧖ 6.0s  ∑ 40.6k      │  │     ⧖ 9.0s  ∑ 35.6k      │
                ╰─────── Haiku 4.5 ────────╯  ╰─────── Haiku 4.5 ────────╯

 ⊘ Review  security-reviewer agent ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 ⊘ Verify  confirm each finding against the diff ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 ⊘ Persist  write the verdict for the pre-push hook ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
```

**A phase nothing has entered is ahead of the run while the run is going and
skipped once it is over**, and the mark says which: `○` in the idle tone while
the run may still reach it, `⊘` in the stopped tone once it cannot. Grey on its
own is the colour of both, and a reader looking at a finished run wants to know
at a glance which of its phases did work.

The line about the phase stands where the count would, because a workflow
declares what its phases do and never how many agents they will open: `Verify`
spawns one per finding, and the findings are not known until `Review` returns. A
count there would be invented, and an invented number beside measured ones is
worse than none. The line is cut to the room the heading has rather than dropped
whole, so a narrow pane keeps the start of it.

**Where they go.** Phases at the end of the run that nothing has entered close
the drawing, a heading each in the order they would run, one row of air under
the last section — down the pane, along a timeline and in the list alike. A
phase in the middle of a run that later phases passed keeps its place, since
moving it to the foot would put it after work it came before; down the pane it
is its heading and one row of air, rather than a band of blank rows saying that
nothing happened at the depth of a band where something did. Across the pane it
keeps its column, with its heading over an empty one and its length of rule
dashed.

**What it replaced.** The phases at the foot used to be one band captioned
`Skipped` or `Ahead`, centred in a dashed rule, with a row under it for each
phase — a state rule, the name, the line and the model — centred on the pane.
It was the one centred title left on a pane of flush-left headings, its rows
said `not reached` under a caption that had said so already, and a phase that
kept its place mid-run drew its heading with `skipped` in it and then the same
row again, centred in a band seven rows deep. Before that a phase nothing
entered was a dashed card, and before that an empty rectangle the size of the
card its first agent would have taken.

A pane with fewer rows than phases ends with a heading counting the rest —
`⊘ 3 more`. A pane with one row to give puts them all in one heading, counted
and named in order:

```
 ○ 3 ahead  Verify ▸ Escalate ▸ Report ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
```

### Across the pane, a strip at the end

Across, the run reads left to right, so what it has not reached stands to the
right of what it has: a strip after the last column, behind the same boundary
that divides every other pair of phases.

```
                ✖ Gate  2/2  9.0s                            ⊘ 3 skipped
────────────────────────────────────────────────────────────┬──────────────────────────────
                                                            ╎
                ╭───────── ✔ lint ─────────╮                ╎ ⊘ Review
                │     ⧖ 6.0s  ∑ 40.6k      │                ╎   security-reviewer agent
                ╰─────── Haiku 4.5 ────────╯                ╎ ⊘ Verify
                                                            ╎   confirm each finding aga…
                ╭──────── ✖ tests ─────────╮                ╎ ⊘ Persist
                │     ⧖ 9.0s  ∑ 35.6k      │                ╎   write the verdict for th…
                ╰─────── Haiku 4.5 ────────╯                ╎
```

The strip's own heading stands with the column headings beside it and the way
they stand: flush left on a mark, saying how many it holds — `⊘ 3 skipped`,
`○ 2 ahead`. Each phase in it is a heading, with its line under the name. They
start on the row the cards beside them start on, and the boundary runs as far
as whichever is longer, the cards or the list.

The strip is as wide as the longest name needs, and wider — up to a third of
the pane — to hold the lines, but only where the drawing beside it still fits:
a drawing pushed past the left edge to make room for notes about phases that
never ran is a drawing about the wrong thing. Too narrow for a dozen letters of
a line, the strip carries the names alone, since a line cut to its first word
says there was a line and not what it was.

It used to be the word `Skipped` centred over a column of one-row nodes, which
were centred down the whole body; with the cards at the top of it the names
stood a dozen rows under the last card, beside a boundary twenty rows long.
Before that it was a dashed rule across the last row with the names set into
it, which cost the graph a row and put the end of the run under the middle of
it.

The columns stop at the strip's boundary. A column is allowed to run past the
*pane's* edge — a phase drawn at four cells is worse than a phase whose last
card loses its tail to the frame — but the strip's edge is not the pane's, and a
column allowed past it was drawn over the phases the strip is there to name, so
`∑48k` and `Report` ran together with no cell between them. Where the strip is
there the columns divide what it leaves and no more.

Never more than a third of the body: a drawing that spent two of its five rows
on what has not happened yet is a drawing about the wrong thing. What the run
has done keeps its rows through all of it — they come off the bottom of the
drawing before the bars are placed, not out from under the agents already in
it. A pane too narrow for a strip falls back to the same band.

They go together rather than one at a time: dropping only as many as the
arithmetic needed left a single empty section standing among the full ones.

Stacked, and down a timeline, a phase is a band of rows rather than a column,
so each band opens with a full-width rule carrying its own heading, set flush
left, and the rule filled to the same fraction:

```
 ✔ Survey  5/5  11.4s ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ▌✔ paint                                                                   10.3s  ∑17k  Haiku 4.5
  ▌✔ layout                                                                  11.9s  ∑17k  Haiku 4.5
 ⊘ Review  3/6  ↻3  2m45s ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━──────────────────────────────────
  ▌⊘ paint:correctness                                                        2m45s  ∑91k  Sonnet 5
```

The heavy stroke says *progress*, not *done*. A band with work still in it fills
to the share of it that has landed; a band that has all landed, and one nothing
has entered, draw the plain rule every other divider on the pane is drawn with.
It used to fill by the same share whatever the state, so a finished run of
seventeen phases was seventeen rules of heavy stroke across the whole pane —
seventeen hundred cells of the loudest ink the drawing has, saying of each band
that it was finished, which is the one thing the row of `✔` marks underneath
already said. The stroke is for the band a reader is watching.

**A heading, over the cards it heads.** The heading is the phase's state mark,
its name, how many of its agents have landed and how long it took, two cells
apart. Down the pane it is set into the band's rule over the middle of the
band's cards, with the rule running from it to both edges; across, it stands
over the middle of its column. The mark is the one a card carries — a spinner
while any agent is working, `✔` once all have landed, `✖` if any failed, `⊘`
where one was cut off or the run stopped before the phase began, `○` for a
phase still ahead. The time is first start to last landing, and to now for a
phase still working.

It was flush left, a cell in from the edge, for a long time, and before that a
name centred in the rule with its count trailing it. Centred, a stack of bands
put every name in the middle of a rule running off both sides, the state of a
phase was only the colour of its name, and the caption walked along the rule to
whichever stretch the spine left free, which put four bands of one drawing at
four different columns. Flush left answered both: the mark led the heading, and
every heading started in one column whatever crossed its rule.

It is centred again, over the cards rather than the rule, because the cards
spread now. A band with room to spare puts it between its cards and either side
of them, so its cards span the pane, and a heading against the left edge stood
over the margin of a drawing whose work was in the middle of it. The mark still
leads, so the state is the first thing in each heading, and the caption still
does not walk: it clears the cells it stands in and the one wire under it gives
way for that row, so every band's heading stands exactly over its cards.

The same heading stands over each column across the pane and in the gutter of a
timeline, so a reader who crosses layouts meets one device. The timeline and
the list have no cards to stand over, and centre it on its rule instead. They
used to set it flush left, over the marks of the rows under it, and a pane whose
headings stood in the middle in two layouts and at the edge in the other two
read as having two kinds of heading. A phase not yet entered is centred the same
way; the one heading still flush left is the strip naming the phases still
ahead, which is a heading followed by a list of names and has no middle to
stand in.

**The wire gives way, and the heading stands where it is.** A heading set into a
rule clears the cells it stands in, so a wire crossing there simply loses this
one row of itself and runs on above and below. That is the same break the rule
takes for the wire everywhere else on the pane, read the other way round, and a
one-cell gap in a line whose two halves are on the same column is a gap the eye
closes without being asked.

**What gives way first is the time, then the count.** The name is the one thing
on the row that says which phase this is, so it is the last to go. A nested
run's fold handle is asked for and given up rather than paid for out of the
name: a heading already short of room has nowhere to put a handle, and
shortening the name further to reserve room nothing can use loses letters twice
over.

**Drawn to the drawing's width, not the pane's.** A stack taller than the body
gets a scroll rail down the right edge, and the rules stop where the rail
begins rather than running under it.

What this costs is the cell itself. Where a wire falls under a heading it has no
mark on the rule row — including, where it falls there, a card's own exit point.
A wire whose halves line up is still one wire; four bands of one drawing with
their names on four different columns is a heading that has stopped being one.

## Sections of one size

Every phase fed from the one above gets a band the same depth as every other,
and its nodes sit in the middle of it. Downward that is a band of rows; across
it is a column. What a band does not spend on its cards it spends on the wires
arriving at them.

The bands are laid out at their own depth and the pane is a window on them, the
way it is sideways. An even share of the body used to be the floor as well, so a
run of three phases in a tall pane spread its bands to fill it and every card
stood in a well of blank rows. The first band is the one exception to the equal
depth: nothing feeds it, so the three rows above a card that the wires arriving
need are three rows of nothing there. It keeps one, between its heading and its
cards.

A band's rows, top to bottom: the rule carrying its name, the row the wires into
it gather on, the row a card fed from further back names that phase on, the row
their arrowheads land in, the three the card takes, the row the cards' own points
stand on, one of air, and whatever is left before the rule that opens the band
below. Nine rows at the floor, and the node centred in them.

The two rows under the node are what make the centring possible, and they were
not always there. A band used to stop at the node — rule, two rows of wire,
card — so all of its air was above and every card in the drawing lay on the line
under it rather than standing in its own band. The exit point had nowhere to go
either: it landed on the rule, where the caption clears the cells it stands in,
so the one mark saying which card a wire left was rubbed out whenever it fell
under the name. Two rows cost two rows a band, which is a band fewer on a short
pane; the body scrolls to the rest, the way it does for width.

The row between the bundle and the arrowheads is the third of them, and it is the
one a card fed from further back writes on — `▾ from Preflight`, centred on that
card. It was not there either, and without it the only row above a card was the
one the arrowheads land in. An arrowhead stands in the middle of that row, so the
label had half a card's width: it gave up its word for its name, a long phase
name came back cut, and on a narrow pane the label a card carried across the pane
went missing from the same card drawn down it. One more row, and the label stands
down the pane exactly as it stands across it. The wire running down the row gives
way for it and runs whole above and below — which is what the band's own caption
does to the wire it covers. See [nodes.md](nodes.md).

Where a wire does cross the rule anyway, the rule breaks and the wire runs
through whole. It used to arc over the wire instead, and an arc is the mark for
*two lines, and this is the one in front* — said about a boundary nothing
travels along, so a reader followed it looking for a second line to follow and
found the edge of a phase. The wire is the thing being followed; a border is a
gap the eye closes without being asked. The same holds for a card's own exit
point, which keeps its cell when the rule wants it: the point says which card
the wire came out of, and the rule either side of it says the rest. The caption
is the one thing on that row it does not outrank — see above.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Survey 5/5 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


           ╭─ ✔ pai… ─╮  ╭─ ✔ lay… ─╮  ╭─ ✔ jou… ─╮  ╭─ ✔ REA… ─╮  ╭─ ✔ plu… ─╮
           │⧖10s ∑17k │  │⧖12s ∑17k │  │⧖11s ∑17k │  │⧖10s ∑17k │  │⧖16s ∑17k │
           ╰─ Haiku ──╯  ╰─ Haiku ──╯  ╰─ Haiku ──╯  ╰─ Haiku ──╯  ╰─ Haiku ──╯
                 •             •             •             •
          ╭┄┄┄┄┄┄╯      ╭┄┄┄┄┄┄╯             ╰┄┄┄┄┄┄╮      ┆
          ┆             ┆                           ┆      ┆
━━━━━━━━━━┆━━━━━━━━━━━━━┆━━━━━━━━━━━ Review 3/6 ↻3 ─┆──────┆────────────────────────────
          │             │                   ╭┄┄┄┄┄┄┄│┄┄┄┄┄┄╯
          ▾             ▾                   ┆       ▾
    ╭─ ⊘ pai… ─╮  ╭─ ✔ lay… ─╮  ╭─ ⊘ lay… ─╮┆ ╭─ ✔ jou… ─╮  ╭─ ✔ jou… ─╮  ╭─ ⊘ jou… ─╮
    │⧖166s ∑91k│  │⧖103s ∑45k│─▸│⧖61s ∑45k │× │⧖105s ∑54k│┄▸│⧖35s ∑42k │┄▸│⧖24s ∑40k │
    ╰─ Sonnet ─╯  ╰─ Sonnet ─╯  ╰─ Sonnet ─╯2 ╰─ Sonnet ─╯  ╰─ Sonnet ─╯  ╰─ Sonnet ─╯
```

Before this each band took the height its own cards needed and the leftover
pooled under the last one. A phase of five agents and a phase of one were the
same three rows deep, and the first band opened and closed within four rows of
the bar — so every wire leaving its cards crossed the rule opening the phase
below in the row it left in, and the rules came out chewed into segments while
a third of the pane sat empty underneath. Equal sections put that room between
the bands, which is where the wires are.

Across, every column is the same width and the same height, and the block of
nodes starts one row under the headings — the row a card fed from further back
writes its source on. Each column centres against the tallest one inside the
block, so a fan reads as a fan, and a source never lands on the row of a card it
does not feed: pinned to the top as well, a phase of two beside a phase of four
ran a wire straight through the trunk into the wrong card. The block used to
centre in the body, which on a tall pane put a well of blank rows between the
headings and the first card of every column; before that it sat two rows under
the header whatever the height.

Where the body is taller than the drawing, the whole drawing stands in the
middle of it — headings, cards, wires, and the phases named under it — in every
layout, the timeline's ruler included. Every layout used to start at the top and
leave what the body did not need under the drawing, so a run of two phases on a
tall pane sat over thirty blank rows: a drawing that had run out rather than one
placed. Moving the headings with the cards keeps the two together, which
centring the cards alone did not. A live run is centred too, so the drawing
moves up as it grows; a drawing taller than the body is not moved at all, starts
at the top and scrolls, and the window still follows the phase at work.

The cards of a column stand one row apart, and two where the column hands work
down itself — between the last card of one wave and the first of the next —
because the hop there is a point under the one card and an arrowhead over the
next, and in one row the arrowhead stood on the point. The leftover depth used
to go between the cards, up to three rows, so a phase of five took a pane and a
half to say what fits in one.

Across, the pane is divided into one slice per phase and each card is centred
in its own slice, rather than the cards being packed at a fixed gutter and the
block of them centred as a whole. Packing put every card in the drawing the
same distance from the one beside it and the pane's spare width at the two
ends, so the first phase's section ran twenty cells to the left of a card
sitting at its right-hand edge and the last one did the mirror of it.

Down the pane a band does the same with its own width. What the band does not
need is shared between its cards and either side of them, up to a card's width
apiece. Packed two cells apart and centred, a band of three in a wide pane was a
clump in the middle with a third of the pane blank on either side; spread
without a cap, a band of two in a very wide one put its cards at opposite edges,
and a pair stopped reading as a pair. A band wider than the pane keeps two
cells between its cards, which is the narrowest gap a wire can run down.

The boundary between two phases is drawn halfway between the cards either side
of it, which is what makes the section symmetrical: as much room to the left of
its cards as to the right. Every other line in the gutter is placed off that —
the barrier's spine sits between the boundary and the cards it feeds, not at a
fixed offset from the card. A card and the length of rule that fills as its
agents land are then centred on the same middle, the heading stands over the
middle of the column, and a reader can tell which phase a card is in by looking at it
rather than by counting boundaries.

A card is twenty-eight columns. Past about thirty the frame grows and the words
do not — a five-character name in a forty-four-column card is four characters of
name to nineteen of stroke either side of it. It was thirty-two, which put a
band of three at a hundred and one columns, so on a pane docked beside a
transcript — ninety or so — the third card of every fan was cut by a few cells.
Twenty-eight still holds `⧖ 11.4s  ∑ 36.8k tkns` with air either side, and three
of them stand in ninety.

Below a band of six rows — a card, its two rows of wires, and the rule under it
— the card gives way to a single row, and the band keeps everything else: the
rule that opens it, the two rows the wires arriving need, and every wire, rail
and barrier the card version was drawn with.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Draft 5/5 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              │                    │                    │                    │                    │
              ▾                    ▾                    ▾                    ▾                    ▾
     ▌✔ rivers     ∑15k   ▌✔ mountains  ∑15k   ▌✔ deserts    ∑15k   ▌✔ reefs      ∑15k   ▌✔ forests    ∑15k
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Critique 5/5 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              │                    │                    ├─────────╮          │                    │
              ▾                    ▾                    ▾         │          ▾                    ▾
     ▌✔ rivers     ∑15k   ▌✔ mountains  ∑15k   ▌✔ deserts    ∑15k │ ▌✔ reefs      ∑15k   ▌✔ forests    ∑15k
```

On a row the name is claimed before the figures are. A row carries the same four
facts a card does on one line, and they do not all fit: something is cut, and
what used to be cut was the name, because the figures were measured against the
whole row and the name was handed what was left. That put `paint:correctness` on
the pane as `paint:c…` beside a clock, a token count and a model name with every
digit intact. Of the four, the name is the one a reader is scanning with — the
clock and the count are read once the right row has been found, and the model is
written again in the detail. So the name takes what it needs, up to a little
over half the row, and the figures take the rest.

Which figure goes first depends on which way the nodes are stacked. A card gives
up the clock, because the timeline draws every duration to scale and the detail
writes it out. A row gives up the model, because a lane's rows are almost always
one model's work — the column comes out as the same word repeated down the pane,
eight cells a row to say once what the run line's legend already says — and the
clock is the figure that differs from row to row, which is what a list is read
by.

This is the step the phases-across layout has always taken, and taking it down
the pane as well is what keeps one run looking like the next. Without it a run
of twenty-six agents fell from a graph straight to a list of rows with no edges
in it, while the same run under `horizontal` on the same seat kept every one — so
the lines on the pane changed colour with the setting rather than with the run:
a list is drawn in the one quiet tone the rules take, and a graph adds the
wires' own hue on top of it. A reader flipping between two runs read that as
the pane being inconsistent, which is exactly what it was.

The flat list — one agent per row, in the run's order, with no edges drawn
between them — is a layout the reader asks for rather than one a short seat is
handed. It is `list` in the settings dialog and `/flowpane list` on the command
line, and it sits beside the other three rather than under them. The pane's size
reaches it in one case only: a body with no room for a single card, where there
is no card to draw and a row each is the honest drawing.

### The list keeps one line: the fork out of the phase's rule

Order down the page is not enough on its own. Three agents that ran at once and
three passes that ran in turn are the same three rows in the same order, and the
list had no way to tell them apart — the one fact it kept was sequence, which is
the one fact its order already gave.

So it keeps the one line it has room for. A phase of more than one agent branches
out of its own rule, down a stem in the gutter, into each of its rows, and closes
under the last:

```
├┬────────── Lint ∥ Build ∥ Unit Test 9/9 ↻3 ───────────
│├▌✔ Lint       ✔ 1  ✔ 2  ✔ 3           19.0s  ∑16k  Haiku 4.5
│├▌✔ Unit Test  ✔ 1  ✔ 2  ✔ 3           14.5s  ∑17k  Haiku 4.5
│╰▌✔ Build      ✔ 1  ✔ 2  ✔ 3           21.8s  ∑17k  Haiku 4.5
├─────────────── CLAUDE.md Revise 1/1 ──────────────
│ ▌✔ CLAUDE.md Revise                     1m40s  ∑35k   Opus 4.8
```

A phase that ran a single agent gets no stem. A fork with one tine says nothing
a reader could not already see, and the absence is itself the reading: a phase
with a stem fanned out, a phase without one did not. That is the same fact the
stacked band draws as a barrier and a wire into every card, in the one column
the list can spare for it.

The stem stands in the gutter beside the rows rather than pushing them across,
so it costs the names nothing. It is drawn before the rules, because a rule
gives way to whatever is already in its cells — the branch off the rule has to
survive the rule being laid across the pane afterwards.

The same question is asked across. A card is a frame with its name set into the
top edge, and `╭─ ✔ n ─╮` is eight cells: two corners, a dash either side of the
name, a space either side of that, and one cell of name. Narrower than eight the
name was written over the corner it should have stopped before, so a column of
six came out as `╭ ✔ r` — a box with three sides and its name standing outside
it. A row that narrow still carries the state, the mark and the first letters of
the name, so a column too narrow to close a card is drawn as rows, whatever room
the pane has down the page.

### How many sections the pane divides itself into

Every phase gets a section the same size as every other, and its cards stand in
the middle of it. The sections divide the pane between them only while a section
can hold a whole node and the gutter its wires run down. Past that they are the
wrong device — they would set a twenty-eight-cell card in a thirteen-cell section
— so the columns stand at the gutter they need, the drawing runs past the pane's
edge, and the body scrolls to the rest of it.

What a section has to be worth is fixed, because a node is twenty-eight cells
wide in every layout at every size of pane. A column is twenty-eight cells and a
section is thirty-five. Seventeen phases divided into a hundred and ten columns is six
cells each, which is not a section but the gap between two wires, so that pane
draws three columns and scrolls to the other fourteen.

The pane used to answer the same question with the node's own width, and it had
a floor of twelve cells to answer it down to. Twelve is where a *row* stops
being legible. A card is a row inside a frame, and the frame costs four cells
more than the rule and mark a row is drawn with: `╭─ ✔ name ─╯` spends eight
cells before a letter of the name, where `▌✔ name` spends four. So a twelve-cell
floor left a card four cells of name, and a phase called `Base Branch Health`
came out `Bas…` on every card in it — the floor was being paid to the frame.

And the squeeze bought nothing, because the drawing overran the pane anyway:
seventeen columns of twelve cells and their gutters is three hundred and
twenty-three, on a pane of a hundred and ten. The reader got both — a drawing
squeezed to fit *and* a drawing to scroll. Now they get the second alone.

```
 60 columns   1 of the run's 17 phases     a card of 28 cells at every width,
 80              2                         and as many whole columns as the
110              3                         pane has room to stand
200              5
```

The same question is asked down the pane, where a section is a band and the
nodes stand side by side inside it. A band of eight is eight cards of
twenty-eight and the gaps between them, which is two hundred and thirty-eight
cells and wider than any pane here. The band stands whole anyway.

It used to wrap. A band took as many rows as its nodes needed at a width they
could be named at — eight agents on a hundred and ten columns was two rows of
four cards of twenty-six — and the width the cards got was then taken from the
widest row of the whole drawing, so the band that wrapped set the width of every
card in the run. A reader dragging one edge of the pane watched the drawing
re-form rather than move: the cards changed width, a band of eight became two
rows of four and then one row of eight again, and nothing was where it had been
a moment before.

```
110 columns, a band of eight

before                                    after
╭──── ✔ one ────╮ ╭──── ✔ two ────╮ …    ╭───────── ✔ one ──────────╮ ╭──────
│  ⧖ 5.0s ∑ 12k │ │ ⧖ 5.0s ∑ 12k │      │      ⧖ 5.0s   ∑ 12.1k     │ │   ⧖ 5.
╰───────────────╯ ╰───────────────╯      ╰───────── Haiku 4.5 ───────╯ ╰──────
╭──── ✔ five ───╮ ╭──── ✔ six ────╮ …
│  ⧖ 5.0s ∑ 12k │ │ ⧖ 5.0s ∑ 12k │       one row, at the width every
╰───────────────╯ ╰───────────────╯       other card in the run is
                                        drawn at, and the body scrolls
  every card in the run narrowed         to the six past the edge
  to the width this one band needed
```

A band narrower than the pane stands in the middle of it. Opened at the left
instead, a band of one sat under the first card of the band above it and the
drawing read as a left margin with a ragged edge down the rest of the pane. A
band wider than the pane has no middle to stand in, so it opens at the left the
way the run itself does and runs off the right edge.

A drawing wider than the pane — which, in either layout, is now most of them — is
what the wheel over the foot rail moves, see [controls.md](controls.md). A live
run's window is already centred on the phase at work, so a reader arrives where
the run is rather than at the start of one that finished an hour ago.

### The height keeps the same bargain

A card is three rows and the gap under it a fourth, so a column of thirteen
agents wants fifty-two. The pane used to answer that by giving up the card: if
the tallest column did not fit as cards, every node in the drawing became a row
— no frame, no model, no state on a border, the clock and the tokens squeezed
into the cells a name left over. One phase decided it for all seventeen, and the
phase that decided it was usually a nested run somebody had just opened. The
reader asked to see inside one column and paid for it with every other column on
the pane.

That is the trade the width refuses, and the height refuses it now too. The
nodes keep their height, the drawing runs past the pane's foot, and the body
scrolls down to the rest of it — the rail down the right edge, the same one a
stack of bands gets, and the same wheel.

```
110 × 30, one column opened to 13 agents

before                          after
▌✔ inflight…  ∑15k              ╭── ✔ inflight claim ──╮   ▴
▌✔ context    ∑55k              │   ⧖ 15.1s  ∑ 15.4k   │   ┃
▌✔ panel-t0   ∑14k              ╰───── Haiku 4.5 ──────╯   ┃
▌✔ reviewer   ∑37k                                         ┃
…  every card in the run        ╭───── ✔ context ──────╮   ┃
   flattened with it            │   ⧖ 3m21s  ∑ 55.2k   │   │
                                ╰────── Opus 4.8 ──────╯   ▾
```

The floor is one card. Three rows is what a card is, and a body with fewer than
three has no card to draw in it at all — there a row each says everything a
frame could, so the pane draws the list it would draw if the reader had asked
for one. Every body deeper than that keeps its cards and scrolls.

The phase names do not move. They are column heads, and a column head that
scrolled away would leave a reader looking at four columns of cards with nothing
to say which phase each belongs to. The strip naming what the run skipped is
captioned on the same row, so its caption is drawn with the header rather than
with the strip; drawn with the strip, it forced the body's window two rows
higher than the drawing, and a card carried far enough up landed on the names.

Down the pane the same bargain was struck the other way round, and lost for
longer. There a phase is a band of rows and the bands shared the body between
them, so the depth each got was the body divided by the number of phases — and a
run of seventeen phases in a body of twenty-five gave every band one row, which
is a row, not a card. The layout then fell to the flat list for the whole
drawing. It was not a rare case: any run with more phases than a third of the
pane's rows hit it, which is most of them, so the vertical layout was in
practice a list that could not scroll.

Every band asks the same of the body now, and asks it whatever the body is: the
nine rows set out above, or an even share of the pane where the pane has more
than nine rows a band to give. The bands keep that depth at every size, the
drawing runs past the foot, and the body scrolls down to the rest — the same
rail, the same wheel, the same floor of one card. Nothing about the pane's own
height chooses what a node is any more.

## The borders between phases

Laid out across, a continuous grey rule divides one phase from the next, down
the gutter between two columns.

```
╭─────── ✔ paint ───────╮   │
│   ⧖ 13.8s  ∑ 17.9k    │•┄┄◠╮
╰────── Haiku 4.5 ──────╯   │┆
                            │┆
                            │┆
╭────── ✔ layout ───────╮   │┆  ╭─ ⊘ paint:correctness ─╮
│   ⧖ 10.3s  ∑ 17.9k    │•┄╮│╰─▸│   ⧖ 19.8s  ∑ 46.9k    │
╰────── Haiku 4.5 ──────╯  ┆│   ╰────── Sonnet 5 ───────╯
                         ╭┄◠◠┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄×2┄┄┄┄┄┄┄┄┄┄┄┄┄◠┄┄┄
                         ┆ ┆│
╭────── ✔ journal ──────╮┆ ┆│   ╭─ ⊘ layout:correctne… ─╮
│   ⧖ 11.6s  ∑ 17.4k    │•╮╰◠┄─▸│   ⧖ 22.5s  ∑ 28.5k    │
╰────── Haiku 4.5 ──────╯┆┆ │   ╰────── Sonnet 5 ───────╯
```

The dot on each card's right edge is the point its wires leave by; `◠` is a
wire stepping over the phase border, or over the rail bundling the two edges
that skip this phase.

The rule used to be a double dash, on the reasoning that a dashed line could
never be read as an edge. On a terminal it was. A carry read off the labels is
drawn in the triple dash, and at the size a cell actually renders, two dash
patterns two columns apart are one grey shimmer; the gutter carried four
verticals — two wires, a barrier's spine and the border — and there was nothing
in the picture to say which of them bounded a phase and which joined two agents.
So the border runs whole and the wires keep the dash, which now means one thing
on this pane: an edge the labels suggest rather than one the text proves.

The gutter is seven columns because three things share it and each needs a clear
cell either side: the border, the barrier's spine, and the wires running between
the two phases. At five the border stood in the spine's own column, and every
tap on the spine — which is what says who fed what — read as a kink in the
border. Nobody could follow a line from the agent that produced a result to the
one that consumed it, which is the one question the drawing exists to answer.

A wire crosses a rule where it has to and nowhere else: a carry picks the row
it turns on from the rows between the card it leaves and the arrowhead it
lands at, and a row carrying a band's own rule is the last one it will take.
A wire crossing a border reads as a wire; a wire lying along one for twenty
cells reads as the border having come apart.

Work crosses the border — that is what a phase boundary is for — and where it
does, the crossing is drawn as a hop: `◠`, the arc that says one line steps over
another rather than joining it or stopping at it. Across the pane the wire is
the horizontal and the border stands up, so the wire hops. Down the pane the
wire runs down and the phase's rule runs across, so the rule hops. Either way
both lines keep their own shape on both sides of the arc.

Down the pane the rule also carries the band's name, and a name set into a rule
clears the cells it stands in — so a caption standing on an arc takes a carry's
only cell in that row. The caption is the one that keeps the cell. The wire loses
this row of itself and is whole above the rule and whole below it, on the same
column, which is what says the two halves are one line; the alternative was a
caption that walked away from the middle by a different amount on every band.

The name used to give way instead, stepping out a cell at a time until the window
it needed, its own blanks included, held nothing but rule. It went with two
guards that only that stepping needed: one reading a nested band's dashed stroke
as rule rather than as something in the way, and one refusing a window whose left
blank would leave an arm reaching for nothing — `├ Coverage` rather than
`├─ Coverage`, a loop rail that reads as stopping short of the band it is tying.
Nothing steps now, so nothing needs them, and across the corpus no rule down the
pane has an arm ending in air.

The border used to break instead. Two lines that cross have to be drawn as two,
and without an arc the way a drawing says so is to put one in front: the one in
front runs through unbroken, the one behind stops a cell short either side. The
wire went in front, because the wire is the thing being followed and a boundary
is something the eye completes across a one-cell gap without being asked. That
reads, and it costs the border a cell at every crossing — in a gutter with five
wires in it, five cells, and a reader counting boundaries across it is counting
holes as well. The arc says the same thing in one cell and takes nothing from
the line it crosses.

Before either, they met in a junction — `┼` where a line passed straight
through, `┤` or `├` where one turned on the column — drawn in the edge's own
colour, with the border continuous underneath. One stroke made of a border and
a wire is one stroke, whatever colour each half of it is: there is nothing in a
`┼` that says which arm belongs to which line, and stacked — where the border
is a heavy rule right across the pane — a wire arriving at it simply disappeared
into it. The same border is the reason the first version of all this gave way
too readily and looked broken: back then the border and the wires were the same
blue-grey, so a wire's corner sitting in a gap in the border read as the border
turning. Structure is grey now and a wire carries a hue, which is what makes the
arc read as the blue line passing in front of the grey one.

A phase is otherwise only a position: in the demo run the same five agents
appear under five phase names, and which column a card is in is the only thing
that says which phase it ran in.

## What moves

Two things move, and only while the run is running.

A lit cell travels along every wire whose target agent is running — one cell at
a time, one step every other frame, the colour changed and never the glyph — so
a line carrying work now can be told from a line that carried it a minute ago.
Nothing else on the graph says which of a finished agent's outputs is still
being worked on. It is the one thing that moves a line's colour, and it moves:
a cell that is lit this frame and dark the next reads as travel, where a whole
line held at a second colour reads as a second kind of line.

Every wire, the rails included. A rail is the one edge that does not run
straight — it leaves its card, crosses the margin past the phase in the way, and
comes back in — and it was the one edge that never lit, so a phase being fed
from two phases back was the one place a reader watched work arrive and saw
nothing move. The light is walked along the rail in the order the work goes,
out of the card and into the node it feeds, so it says which way as well as
that.

A phase that was still running used to carry a light along its own length of the
progress rule as well. It was the one thing that said a phase of ten agents was
moving, where ten spinners say nothing together — but it was also a hue on a
border, which is the one thing the pane's colours are not allowed to be, and it
went with the rest of the rule's colour.

A run that has ended draws no more frames, so what moves stops where it was, on
a frame that reads.
