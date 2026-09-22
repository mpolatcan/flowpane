# What is inferred, and how it is drawn

How the run becomes a graph: what the files state, what the pane derives, and what it draws for each.

No dependency field exists anywhere the engine writes — not in `journal.jsonl`,
not in the per-agent `.meta.json`, not in the run summary. The graph is derived,
and the three kinds are drawn differently on purpose:

- **Barrier** — a spine in the gutter between two phases, every agent of the
  earlier phase feeding it and every agent of the later one fed from it. This is
  a fact: a later phase runs after what the script awaited in the earlier one.
  It also keeps the line count at `n + m` instead of `n × m`. It is drawn only
  where the clocks agree with it — see below.
- **Flow** — a solid edge, drawn where one agent's answer appears verbatim in
  another's prompt. That is how a workflow passes a result along, so finding it
  is a record of what actually flowed rather than a guess about it. Both sides
  come from `promptPreview` and `resultPreview` in the run summary the pane
  already reads, so this costs no extra file. They are capped near four hundred
  characters, so a prompt that quotes its source late can hide the overlap and
  go unfound — which is the safe way to be wrong, since the carry below still
  says the same thing more weakly.
- **Carry** — a dashed edge, read off the labels. Dashed, because a label
  convention is a hint, not a record — and dashed is now the only thing on the
  pane that is, which is why the border between two phases stopped being. When every agent of the later lane
  has a named source and every agent of the earlier one feeds something, the
  barrier steps back and the carries draw alone.
- **Pass** — an edge inside one lane, from one attempt at a piece of work to the
  next attempt at the same piece. A loop that keeps digging at one file until a
  pass turns up nothing new spawns every attempt into the same phase, so the lane
  holds a row of agents that look like siblings and are not. Drawn in whichever
  register earned it, solid or dashed, but as a short hop between neighbours —
  both ends are in the same band, so there is no gutter to route through and none
  is wanted.

The carry search walks back a lane at a time from each agent and stops at the
first lane that has anything to say about it. One agent there holds a token from
its label and that is the source (`survey:paint` → `review:paint:correctness`).
Several hold it and nothing is drawn — the source is in that lane and the labels
cannot say which — leaving the barrier to say the weaker thing that is still
true. None hold it and the search keeps walking, because a `pipeline()` that
branches sends one file to `Review` and another to `Check`, so the lane an agent
follows is not always the lane in front of it.

Only the source side has to be unique. One agent feeding several is the ordinary
shape of a run: a stage that opens three lenses on one file writes
`review:paint:correctness`, `review:paint:edges` and `review:paint:drift`, and
all three do come from `survey:paint`. Asking the target side to be unique too
refused every one of them, which left the lane where the work fans out — the
lane a reader most wants explained — with no edges at all.

A pass is told from a fan by the clocks, not by the label. Three lenses opened on
one file and three attempts at one file are the same shape in the graph: one
source in the lane before, several targets in this one. What separates them is
time — a fan-out runs its branches at once, and a loop cannot start a pass until
the one before it has landed. So agents that share a source become a chain only
where every one of them started at or after the previous one finished, with the
same quarter second of slack a barrier gets. Otherwise they stay a fan and
nothing is drawn between them.

Chaining them is also what keeps the picture flat. Left as a fan, four attempts
each take their own edge from the same source, the lane orders them by arrival,
and the fourth ends up at the far end of the row with an edge running most of the
width of the pane to reach it. Chained, reduction drops the three bare edges —
the source already reaches the fourth pass through the second and the third — the
lane sorts by depth in the chain instead of by arrival, and each pass sits beside
the one it came from with a cell of gap between them.

Which pass a node is, is a record rather than an inference now: the phase
entries are read off the journal's own announcement order, and the passes are
the trips through a phase the run actually made — see
[nodes.md](nodes.md#a-phase-entered-more-than-once-is-one-row-marked-per-attempt),
where the attempts are folded on to one row and marked. The chaining above is
what draws the *edges* between them; the fold is what draws the *nodes*.

Flattened to a list, the rewind itself is drawn too, as a rail down the left
gutter tying the phases that went round together — see
[nodes.md](nodes.md#the-rail-down-the-gutter-says-which-phases-went-round-together).
Nothing is inferred for it: it spans the phases the journal recorded more than
one entry for, first to last.

The count rides on the node: `↻2` on the second pass, `↻3` on the third, dim,
set into the bottom edge against the right corner. Only from the second pass on. A `↻1` on the first
attempt is a mark that says nothing, and it takes the cells the label needs —
`layout:correctness` became `layout:c…` to make room for it. The phase name
carries the deepest count in its lane — in the graph and on the timeline both,
where the rows are one per pass and three passes at one file otherwise draw the
same picture as three agents on three files — so `3/6 ↻3` reads as three of six
landed, and something in here went round three times. A run where every agent did its
piece once has no mark anywhere, which is the common case and should look like
it. `bun dev/edges.ts` says `passes  none: no phase did the same piece of work
twice` for those runs.

A barrier is checked against the clocks before it is drawn. Phases are laid out
in the order the script declared them, but `pipeline()` runs each item through
every stage on its own, so two declared phases routinely overlap: in the audit
workflow the prose branch starts while the code branch is still on its first
pass. A spine between those two says the second waited for the first, which a
reader can disprove from the two clocks on screen. So the spine is drawn only
when every agent of the later phase started after the last agent of the earlier
one landed — otherwise they ran side by side, which the gutter says instead. A
quarter second of slack, because a journal line is stamped when the pane reads
it and not when the engine wrote it, and two events that close a phase and open
the next are often in the same batch.
The proven edges across it are still drawn; only the claim that everything
waited is dropped.

That mark is recent. The gutter used to be left blank, and an absence is only a
statement to a reader who was counting arrowheads: a pipeline run of twenty
phases joined left to right, with one gutter carrying nothing, was read off the
pane as a chain — the review and the security scan a driver dispatched in one
batch reported as having run one after the other, when the two clocks two cards
apart say they overlapped by two minutes. So the gutter carries a mark of its
own: `═` across the pane, `║` down it. The double stroke lies *along* the run
where a barrier's spine always cuts across it, which is what tells the two apart
before either is read — one says the work passed through here, the other says
these two are tracks side by side with nothing passing between them. It is grey,
like every other thing that divides the drawing rather than carries work, and it
is one of the two marks no line may be drawn over: a wire routed through it
would take the statement away and leave a cell of wire that is drawn again a
cell along.

A phase is entered at whatever started first and left from whatever finished
last. The clocks say what that is: the agents of a phase group into waves — each
wave the ones that overlapped, the waves in the order they went — and the
barrier above the phase lands on the first wave while the phase below is fed
from the last. A phase that really did open everything at once has one wave and
keeps a wire into every node, which is the truth about it. A phase whose agents
ran one at a time has a wave each, so the barrier lands on the first of them
alone. Drawn the other way — every agent of the phase above feeding every agent
of this one — three passes at one file get three arrowheads that say the phase
started them together, which the clocks on their own cards disprove, and the
line each pass gave the next is lost among them.

Waves rather than chains, because real phases are rarely either. A nested run
opened out into the phase that called it is a dozen agents that planned, then
fanned out, then gathered: three waves, not one fan and not a chain of twelve.
Read as a fan it took a wire from the calling phase into all twelve and a wire
out of all twelve into the phase after — twenty-four wires through two gutters,
saying that the calling phase started twelve agents at once and that the phase
after waited on each of them, neither of which happened. That is the drawing
the reader was looking at when they asked why the lines were connected the way
they were.

Where every wave holds one agent the phase is a chain, and the hops from each
pass to the next are drawn as carries, dashed, because what says the phase was a
sequence is the clocks rather than anything either end of a hop wrote. They are
drawn and not inferred from: three agents handed one piece of work along are not
three goes at it, and counting them as passes would put `↻3` on a phase that
went round once. Between waves of several there is no such pairing to draw — six
reviewers did not hand work to six others — so the waves in the middle of a
phase are joined by nothing, and the two at its ends carry the wires.

Two carries are not drawn at all. One is a carry to a band further back: the
bands stand in the order they ran, so a source named on a later one — a fix
agent whose answer the phase that asked for it quotes back — is a line from the
foot of the drawing to its head, across every band between and every name on
them. What it drew instead was the head on its own, since the run from the
source stopped before it started: a lone arrowhead under a phase rule, pointing
at nothing. The loop mark on the card says the phase was entered again, which is
what the backward line was there to say.

The other is a hop between two passes of one band with something standing
between them. The hop is the whole gap between two neighbours and wants no
gutter, but a band packed with cards a row apart has the next node in that gap,
and a line run through it goes under that node's own name — the names are
written after the wires, so what came back was a letter with a port or an
arrowhead lost beneath it. The stack already says which pass went first. A wire
no reader can see does not say it again.

A gutter with no barrier can still get a bundle. Where a phase's edges cross it
at an angle — each leaving a node in one row and arriving at a node in a
different row of the next — they can be drawn as one line each or as a single
dashed spine with a feeder at either end. What decides it is whether two of
those lines would be drawn over each other: each runs along the gutter from the
cell it leaves to the cell it arrives at, and two such runs that share a cell
are two lines a reader sees as one long line. Colour does not separate them —
the eye follows the run, not the hue — so where that happens they are drawn as
the one bus they already look like, which says the same thing and says it once.
Runs that only meet at a port do not count: that is a join, and a join is what a
bus would draw there anyway. Edges that run flat across the gutter, node to node
in the same row, never overlap at all, so a gutter of parallel chains is left
alone. The spine is dashed like the edges it stands for: a bundle is a way of
drawing them, not a stronger claim about them.

A bundle needs a line of its own in the gutter, clear of the line the arrowheads
land on, or its junctions fall on its own heads and rub them out. So the spine
stands on the first line of the gutter and the heads have the last. Standing in
the middle of a two-line gutter it shared their line, no bundle could be drawn
there at all, and every crossing fell back to a line of its own — which in a
gutter that narrow meant every one of them turning on the same line and running
over the others, the worst drawing of the three.

**A card has one point per side, and every line leaves by it.** The middle of
the left edge and the middle of the right laid out across; the middle of the top
and the bottom laid out down. The point is drawn as a dot in the cell the line
starts from, and the run begins past it. A line that simply begins against a
frame reads as part of the frame — `│┄┄` is a border with a dash stuck to it —
and a card with lines coming off three different rows reads as three cards
stacked. `│•┄┄` is a card with a wire out of it. One point to a side also means
the drawing has one answer to where a line starts rather than one per line:
carries, the feeders into a barrier and the wires out of one all leave a card
the same way, and the side the dot is on says which way the line went.

Nothing is drawn over a point. A bus running the length of a gutter passes the
point of every card that feeds it; drawn through, the dot would be gone and the
wire under it would start nowhere. The tap goes behind
instead, and a tap with a dot in it reads as a line passing a card, which is what
it is.

The point is marked even where the bus stands hard against the card and there is
no run to start. The cell used to be given to the feeder on the grounds that a
point with no line after it says nothing — but a node drawn as a row has no edge
for a line to leave from, so what that drew was a stroke with one end against
the bus and the other against the blank between a card's name and its figures:
ninety-odd wires, in the corpus, beginning in mid-air. The point is what says
*this card*; the bus in the next cell is what it says it about.

One cell can hold the point or the turn, not both. A line that has to change row
the moment it leaves — because the row it leaves on is taken for the width of the
gutter — turns in the cell the dot would have gone in, and the turn is what gets
drawn: a corner says which way the line went, and a dot does not. A corner hard
against a card's frame is still unambiguous about the card it belongs to, which
is the work the dot was doing. So a card with a wire and no dot beside it is a
card the gutter had one column to spare for.

Unless the card has no frame to be hard against. A short pane draws its cards as
rows, and a corner in the cell beside a name turns off a line that is not there:
one of its two arms runs into the blank between the name and the gutter, which
reads as a wire that starts in mid-air a few cells clear of the row it belongs
to. There the point is drawn instead. It says a line leaves this card, which is
the work the missing arm was there to do, and the rest of the turn is still
drawn in the cells above and below it.

The point used to move. A wire that had to change row left from the row of its
card's border rather than from the row its name is on, which kept departures on
the border rows and arrivals on the name rows and so kept two wires off one line.
It bought that at the price of giving a card two or three places a line could
come out of, none of them marked — and it could not be applied to a card one row
tall, which is the shape a band takes when the pane is short. The rule it bought
is bought by the router now, in the staircase below.

**An edge that changes row turns where the other edges turn.** The gutter is
several columns wide and a wire could turn on any of them. Sharing is what the
router wants, not what it falls back to: a wire moves off the shared column for
one reason — the column would put it in a cell another wire is already in, which
is the case where two runs genuinely read as one line. The question is asked
cell by cell rather than span against span. A wire makes three runs crossing a
gutter — out of its card to its column, along that column, and in to the card it
feeds — and the run out crosses the column of every wire it passes on the way,
which a comparison of two vertical spans never sees. Two wires out of one card,
or two into one, are exempt: they share a run already, and the cell they part on
says so with a fork. Two dashed runs on one line do not read as two even where a
gap divides them, because the gap looks like more of the dashes. The column the
arrowheads land on is never turned on at all, since a run along it turns every
head in the gutter into part of the same long line.

**Where departures and arrivals fall on the same rows, the columns make a
staircase.** Every line leaves by its card's point, the cards of two phases
stand on the same rhythm, and so the row a wire leaves on in one band is a row
some card is fed on in the next — the drawing has one set of rows and both ends
of every wire land on it. A wire leaving on a row another wire arrives on has to
turn before that one does, or the two run along each other from the card out to
the first of their two columns. So the columns are handed out in that order: the
wire that leaves where another arrives is placed first and takes the nearer
column. Three wires each shifting by one card then come out as a staircase,
three turns and none of them touching, where handing the columns out in the
order the wires were found gave the first wire the nearest column and left the
other two crossing it.

Neither is the column touching a card. A corner drawn there stands against the
frame of whichever card is level with it, and the wire reads as leaving that
card rather than as passing it — which is what a reader saw at the head of every
wire in the gutter, where the corner sat against the card in the band it was
leaving. One clear cell either side, and the gutter is sized to give it; where
it is not, those columns come back.

Two more lines are kept: the border between two phases, and the line every agent
of a phase feeds — the bus, which is the barrier's own line and the line every
feeder comes in on. A wire crossing either reads as a wire; a wire lying along one for
twenty cells reads as that line having come apart. Where the gutter is two lines
deep and both are spoken for, the bus is the one to give up. A border is drawn
whatever else happens, where a bus is only drawn where a barrier joins the two
phases — and where none does, the line is empty and the wires have it to
themselves.

Where two wires do share a cell, what goes in it depends on what they are doing
there. A cell where one line becomes two is a fork, and it is drawn as the arms
that actually meet in it: `┬` downward, `┴` upward. A turn written over a column
another wire is already running down, drawn as a plain corner, rubbed that run
out — `╮` with the line carrying on below it, which reads as one line stopping
and another starting. The merge reads the cell *before* the wire draws anything:
a wire paints its own run through both of its corners on the way past, so a
corner that asked the canvas what was underneath it found the arm it was about
to remove and drew `┼` everywhere.

**A cell where two lines merely cross is a hop.** `◠`: the run steps over what
it passes and comes back down. It used to be either a `┼` or a gap. A `┼` says
the four arms belong together, and a reader following one of them has no way to
tell which of the other three continues it; a gap says the run stops. The arc
says the third thing, which is the true one, and it is what wiring diagrams have
used for it since long before there were terminals to draw them on. So a `┼`
never appears where two wires merely pass, and where one does appear it is a
junction that means it — a bus with a feeder either side of it.

The horizontal is the one that hops, so which of two wires steps over the other
is settled by the drawing rather than worked out cell by cell, and the line that
is stepped over is whole on both sides of the arc.

**Only a wire is hopped.** A phase's border and the rule a band is named on are
boundaries, not lines anything travels along, so a wire meeting one is not two
lines in a cell — it is one line and the edge of a region. They were drawn as
crossings anyway, and the arcs a reader saw most were all sitting on a border
with nothing underneath them: the mark that means *there is a second line here,
go and find it* sent them looking four times out of five, and what it looked
like was a wire jumping out of the side of a phase. The boundary gives way now
and the wire stays whole, which is the settlement the stack layout already made
for its rules — the eye completes a border across a one-cell gap without being
asked, and will not complete a wire. Before either, a border had a hole punched
in it wherever a wire went by and nothing said which; a reader counting borders
across a busy gutter could not tell a hole from the end of one.

Nothing is drawn over an arrowhead. A head rubbed out is an edge that stops at a
card rather than one that arrives at it, so a run that meets one passes behind
it instead of hopping it.

Both ends of the turn are corners rather than more run: a straight piece at the
start reads as a line passing under the card it in fact leaves, and one at the
end as a line passing over the arrowhead it in fact turns into — which is what
tells an edge from a line merely crossing the same row.

**The head grows out of a stem.** A dashed run ends on a gap as often as on a
dash, and a filled triangle hung off a gap reads as a mark dropped beside the
card rather than as a line arriving at it — `┄▸│`, a lollipop against the card's
own border. The cell before the point is drawn whole whatever the rest of the
run is, so the head comes out of a line: `┄─▸│`. Only that cell, and only where
the run itself put a dash there — a corner in it is a corner, and squaring it
off would give the turn an arm it does not have.

Every edge is drawn in one colour, whatever it joins. An edge used to take the
colours of the two agents at its ends, which put it in the same hue as the
frames it ran between, and a dim green line beside a green frame reads as part
of the frame rather than as a line leaving it. What an edge has to say is that
it is an edge; how the agents at its ends ended is said by the cards. Proven and
inferred still stay apart by stroke — solid and full against dashed — which is a
difference between two edges, not between an edge and a card.

`bun dev/edges.ts <transcript dir>` prints all of this for a finished run: the
lanes, what the text proved, what the labels suggested, what survived reduction,
and which barriers the carries account for.

A flow may skip a phase — a revision takes the draft as well as the critique of
it, and a join takes the revisions rather than the word-counts beside them. Two
passes keep those from wrecking the picture:

- **Reduction.** An edge is dropped when the same two nodes are already joined
  by a path through the lanes between them: if `draft:X → revise:X` is only
  saying what `draft:X → critique:X → revise:X` already says, drawing it adds a
  line and no information. Only a path whose every step is itself proven can
  retire a proven edge, so a chain of guesses never deletes a record.
- **Sources.** What survives is not drawn as a line at all. The card the edge
  arrives at says which phase it came from, in words, on the row above it:
  `▾ from Develop`. A card fed from two phases back and from four names both, in
  the order the run entered them, and a card with more names than its width can
  carry ends with a count of the rest — `▾ from Setup +2`. The mark is the
  arrowhead every drawn input ends in, pointing at the card from the row the name
  landed on. The label is centred on the card, the way the card centres its own
  name, and down the pane it stands on a row the band keeps for it, with the
  wire giving way for it and running whole above and below. Where the row is too
  short for the word and the name together the word goes first. See [nodes.md](nodes.md). The dialog says the same thing in
  the same word — `from Develop`, in the row of facts under the reading — which
  is the one place the name is certain to be whole.

A line was the first answer and then the second, and both were worse than the
word. One line per edge, routed through the gutters, put five lines through the
same two gutters where five topics each skipped a phase, and the junction glyphs
where they met said nothing about which line went where. Bundling them into one
rail a lane-pair, with the phase it left written along it, fixed the count and
not the reading: a rail spans at least two whole phases, so on a drawing wide
enough to scroll a reader in the middle of one sees a line running off both
edges of the pane and cannot reach either end. Eighteen of them in a
twenty-one-phase run drew nested rectangles around the middle of the picture,
and the reader looking at that said they could not tell what was connected to
what.

The word is the same fact where the reader already is. Nothing crosses the
drawing, nothing has to be routed past a card or hopped over a carry, and the
provenance is legible at any scroll position, because it is written on the card
it is about. What is given up is the direction of the eye — a reader cannot
follow the edge — and for an edge that spans phases off the pane there was
nothing to follow anyway.

The row it is written on is one of the two beside the card, and which of them
comes first is the layout's to say. Across the pane it is the row under the card,
which the layout leaves blank between one card and the next. Down the pane it is
the row above, where the wires arriving would be if any arrived — and a card fed
from further back is a card nothing in the band above fed. The row under a card
down the pane is the row every wire leaves it by, so a source written there reads
as something coming out of the card rather than something that went into it.

That order used to be decided by whichever row was free, which was the same
answer for a different reason: a band stopped at its card, so the row under one
was the next band's rule and nothing could be written there. A band leaves that
row free now, and left to the cells the painter would quietly have started
writing inputs on the row a card's outputs leave by.

Neither row is ever wholly empty in a busy drawing, so what is looked for is the
longest run of untouched cells within the card's own columns, and the name is
written into that. It is drawn after everything else the body holds — the rules, the cards,
the wires — because asking a row whether it is clear before the rules are down
puts the name in the row a band is named on.

A source names its phase by that phase's place in the run, and the drawing holds
only the phases it could fit, so the two are looked up by the index each lane
carries rather than by where it stands in the picture. Taken as a place, every
skip in a run with one phase left out named the wrong phase: an edge from
`Verify` to `Lint ∥ Build ∥ Unit Test` said `Pre-commit`, one phase along. Every
one in a twenty-one-phase run with four phases it never entered was wrong this
way, which no test caught while the device was a rail with a count on it and no
name.

One line per edge, routed through the gutters between lanes, was the first
attempt and read worse still: five topics skipping a phase each put five lines
through the same two gutters, and the junction glyphs where they met said
nothing about which line went where.

Matching every answer against every prompt is cheap once and wasteful eight
times a second, so the result is memoised against a stamp of each agent's id and
text lengths — which changes exactly when an edge could have.

A running node has no honest progress bar and does not pretend to one. Its mark
spins and its name slides, both of which say *alive* without
claiming a fraction of anything. Its frame used to breathe as well, which said
the same thing a third time — in the layer that is not allowed to say it.

The **timeline** (`orientation: timeline`, or the layout button) is the same run
seen from the side: one row per agent, its bar from start to landing, rows grouped by
phase in the graph's order, a dashed marker down the column where now is. The
graph says what fed what; the timeline says what waited on what, and the longest
chain of bars is the critical path — which is why the cards no longer carry a
bar of their own.

A bar starts at the column its agent started in and runs for as long as the
agent ran, both to the same scale, so a row's offset says when and its length
says how long.

Three weights, and the weight says what the bar is. Solid is a measurement: this
is how long the agent took. Hollow is an agent the run never finished with —
killed, or stopped — where the bar still reaches the instant the run ended but
says *was up this long* rather than *worked this long*. Shaded, with an arrow at
its right end, is an agent still going: the end of the bar is where the clock is
now, not where the agent will stop. That last one used to be drawn solid, which
made a running agent's bar look like a finished measurement that grew every
second — a length that means nothing until the agent lands should not be drawn
in the weight reserved for lengths that do.

A weight is not enough on its own, so the first of the figures is a word:
`done`, `stopped`, `failed`. A bar is a measurement, and a measurement cannot
say whether the thing it measures finished — three weights of block and a mark
one cell wide were carrying that between them, and a stopped agent's hollow grey
bar read as a row that had not been drawn yet rather than as work the run cut
off. A running agent has no word: it says what it is doing instead, after its
bar, which is the fact that changes while it is watched. An agent that has
stopped says nothing there. What it answered used to stand in that space, and a
row read `done  12.9s  ∑17k  Haiku 4.5   Good, type-checks clean. Let's ru…` —
another program's sentence, cut wherever the row ran out, set in the pane's own
drawing as if the pane were saying it. The phrase it cut to was as likely to be
the last thing the agent happened to type as the finding the run was for. What
an agent said is in its dialog, whole and wrapped, which is where a reader who
wants it is going.

```
 ✔ survey:paint          ███████             done    12.9s  ∑17k  Haiku 4.5
 ⊘ review:paint:corr…      ░░░░░░░░░░░░░░░   stopped 1m15s  ∑69k  Sonnet 5
 ⊘ check:README            ░░░░░░░░░░░░░░░   stopped 1m15s  ∑22k  Haiku 4.5
```

The word takes a column like every other figure, not the space after the bar.
After the bar it sat wherever that agent's bar happened to end, which is the one
place on the row that moves — and the agents that most needed the word were the
ones whose bars ran furthest and left no room for it.

Every row's figures take a fixed column against the right edge rather than riding
after its bar, so a bar can never shoulder them off the row and thirty agents'
costs can be compared down the page instead of hunted for. The row is divided in
the order a trace view cares about: the names take what they need up to a share
of the row, the axis is given its share next, and the figures are offered what
is left. Offered everything past the names instead, the figures took forty-six
cells of a hundred and ten and left the bars twenty-eight — the narrowest column
on a drawing whose whole subject is the bars. Held to the rest, the figures'
own ladder gives way in the order it already had, which begins with the clock,
the one fact on the row the bar beside it already draws.

### The axis is ruled, and the ticks carry down the rows

There used to be no axis. The argument was that every bar is scaled to the one
span the run line already states, so a row of `0  15s  30s  45s` repeats that
fact a dozen times to say what one figure said once, and it costs a row the bars
wanted.

What that missed is that a reader of a timeline is not asking how long the run
took — the run line says that — but *when* a given bar started and how two bars
that never touch line up. Without a tick to measure against, a bar sixty cells
along is a bar somewhere in the middle, and the two questions a trace view
exists to answer cannot be asked of it.

So one row under the header is given to a ruler: a rule the width of the axis, a
tee at every tick, and the elapsed time written one cell to the tick's right —
`0s`, `30s`, `1m`. The interval is picked off a fixed ladder of round numbers
(one second, two, five, ten, fifteen, thirty, a minute, two, five, ten, fifteen,
half an hour, an hour) — the smallest that leaves at least twelve cells between
ticks, so the labels never touch at any width and the number a reader sees is
always one they would have chosen themselves.

A ruler at the top alone is a ruler that only measures the top. The ticks carry
down the drawing as dashed columns, drawn after the bars into whatever cells the
bars left blank, so a bar is read against the tick immediately above and below
it rather than against a rule eleven rows away. They go in dashed and in a tone
mixed most of the way to the track colour for the same reason the borders are
grey: the grid is furniture, and the run is what has colour.

### Sub-minute agents need a scale wider than the pane

Squeezed into the pane's width, a run that took an hour gave every agent under a
minute the same two cells. Forty rows of two-cell bars say the run had forty
agents and nothing else — no order, no overlap, no waiting.

So the axis has a scale of its own, and the pane is a window on it. The scale is
as many cells as it takes to give the shortest bar in the run a cell, capped at
four panes' width, and the axis scrolls sideways under a rail along the foot.
A run whose agents are all about as long as each other asks for no more than the
pane has and gets no second rail; the run that made this necessary asks for
about three panes.

Everything positioned against time is positioned through one function of a
millisecond, which subtracts the sideways scroll, so the bars, the ruler's ticks,
the grid and the now-marker cannot drift apart. Everything is clipped to the axis
columns rather than to the pane, which is what keeps a bar scrolled off the left
from painting over the labels.

The label column is the run's own: as wide as its longest agent name, up to a
share of the pane. An agent inside a nested run the reader has opened stands in
by a gutter, with a dashed line down the cell it left, so the rows of a nested
run read as belonging to it rather than as more rows of the run that launched
it — the same inset the graph gives an opened node.

There is no marker for the moment a killed run died, either. `run.endedMs` is
when the run's status flipped, which is not when its agents stopped reporting: a
line drawn there sat a third of the way along bars that visibly continue past
it, and claimed a moment the drawing itself contradicts. The dashed marker is
for a run that is still going, where the column is the clock and a bar reaching
it is a bar still growing.

A phase nothing has entered gets no band. A band is a rule with its agents under
it, so a phase with no agents is a rule with an empty row under it — which reads
as a band that failed to draw. They are gathered into the one Ahead band the
other down-layouts use, under the last bar the run drew. The rows it takes are
taken off the foot of the drawing before any bar is placed: reserved after the
fact, the band would have been drawn over the bars it was meant to follow.

### A timeline longer than the pane scrolls, and so does its axis

It used to end at `… 48 more` on the last row: a number the reader could read
and not act on, on the layout that needs the room most — the graph folds a
phase's repeats onto one node, and a timeline cannot, because every trip through
a phase is a different stretch of clock. Seventy-eight agents wanted seventy-
eight rows and a docked pane has about thirty.

So it gives up a column for a rail and lets the reader move, which is what the
other layouts have always done. The bar at the top, the ruler under it and
the Ahead band at the foot stay where they are; the bands scroll between them.
Where the axis is wider than the pane there is a second rail along the foot, and
the two move the drawing in the two directions independently.

The side rail is settled in one pass rather than the graph's three. A rail costs
the graph a column and the foot rail a row; either one changes how far the
drawing reaches past the pane, and that is what decides whether either was
wanted at all. So the graph latches the two and lays out again until they stop
moving — they only ever turn on, so three passes settle them. A timeline's rows
are its agents, and its agents do not change when the pane narrows. The foot rail does cost a row, and a row changes how many bands
are shown, so that one is measured twice: once to ask whether the axis overflows
at full height, then again with the row taken.

While the run is live the window opens on the band it is working in, and a
reader who scrolls away is left there until the run enters a different phase.
Same contract, same reason: see the window in [pane.md](pane.md).
