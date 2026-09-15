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
one landed — otherwise they ran side by side and the gutter stays empty. A
quarter second of slack, because a journal line is stamped when the pane reads
it and not when the engine wrote it, and two events that close a phase and open
the next are often in the same batch.
The proven edges across it are still drawn; only the claim that everything
waited is dropped.

A phase whose own agents ran one at a time is entered at its head and left from
its tail. The clocks say which phases those are: where every agent of a phase
started only once the one before it had landed, the phase is a chain, so the
barrier above it lands on the first of them alone and the phase below is fed
from the last. Drawn the other way — every agent of the phase above feeding
every agent of this one — three passes at one file get three arrowheads that say
the phase started them together, which the clocks on their own cards disprove,
and the line each pass gave the next is lost among them. Those hops are drawn as
carries, dashed, because what says the phase was a sequence is the clocks rather
than anything either end of a hop wrote. They are drawn and not inferred from:
three agents handed one piece of work along are not three goes at it, and
counting them as passes would put `↻3` on a phase that went round once.

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
carries, the feeders into a barrier and the rails that pass a phase all leave a
card the same way, and the side the dot is on says which way the line went.

Nothing is drawn over a point. A rail crossing the gutter passes the point of
every card between the one it leaves and the line it runs on; drawn through, the
dot would be gone and the wire under it would start nowhere. The tap goes behind
instead, and a tap with a dot in it reads as a line passing a card, which is what
it is.

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
of a phase feeds — the bus, which is the barrier's own line and the line a rail
comes in on. A wire crossing either reads as a wire; a wire lying along one for
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

The horizontal is always the one that hops, so which of the two steps over is
settled by the drawing rather than worked out cell by cell. Laid out across, the
wires run flat and the phase borders stand up, so the wires hop the borders;
laid out down, the wires run down and each phase's rule runs across, so the rule
hops the wires. Either way the line that is stepped over is whole on both sides
of the arc. Before this, a border had a hole punched in it wherever a wire went
by, and a reader counting borders across a busy gutter could not tell a hole
from the end of one.

Nothing is drawn over an arrowhead. A head rubbed out is an edge that stops at a
card rather than one that arrives at it, so a run that meets one passes behind
it instead of hopping it.

Both ends of the turn are corners rather than more run: a straight piece at the
start reads as a line passing under the card it in fact leaves, and one at the
end as a line passing over the arrowhead it in fact turns into — which is what
tells an edge from a rail crossing the same line.

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
- **Rails.** What survives is bundled by the pair of lanes it spans and drawn
  once, carrying the count of edges it stands for on the rail itself. Each end
  joins the graph at a barrier's bus, the line every agent of a phase already
  feeds into, so the rail reads as part of the join rather than as a line that
  stops beside the nodes, and the arriving end carries a head into the node it
  feeds.

A rail leaves its first card by that card's point, the same point a carry out of
it would take: one place a line comes out of a card, whatever kind of line it is.
The far end is an arrival and lands on the row the card is fed on, which is the
row the head has to be on for the rail to read as an edge into that card rather
than into the gap above it.

Which line the rail then turns on is the question. A rail turns onto its run
where the bus stands, so that where the phase it leaves ends in a barrier the
turn lands on that barrier's spine and joins it; where the line out to the bus is
already carrying a wire, the turn comes back toward the card, line by line, until
it finds one clear of both the stretch out and the tap up. Failing that it keeps
the bus, since a rail drawn over a carry for four cells is still the shorter of
the two lies. Laid out across, the rail's run is the horizontal of every crossing
it makes, so it hops what it meets; laid out down it is the vertical, the rule
across is the one that steps over it, and the rail is the line that goes behind.

A rail runs along the clear line between two rows of nodes — the one nearest the
node it arrives at, so both of its ends are a cell or two long. Nearest first,
and of two lines the same distance off, the one no card stands on anywhere. The
clear ones used to come first however far off they were, and between two phases
whose cards are staggered there is no line some card is not level with: the rail
climbed to the margin above the whole drawing and came back down the far side,
three sides of a rectangle round everything between its two ends. Whether a card
stands on this line *along this rail's own run* is the question that matters;
the drawing-wide answer is the tiebreak. Rails are drawn before the nodes, so
which lines are clear is a question about the layout rather than about the
canvas. Laid out downward a rail wants a clear column on each
side: a card is framed on all four sides, so a vertical rail hard against one of
those frames reads as a second one. Which is what the gaps between the cards in
a band are for — where the run has a skipping edge at all and the width allows,
they take a third column so a rail has a cell of clearance either side, and a
column with both sides clear is taken before one with only a single side clear.
A rail against one frame is still a rail; no rail at all is an edge the reader
never learns about. Laid out across, one clear row is enough — a card's top and
bottom edges carry only its name and its model, and a rail between two rows of
cards touches neither.

A rail also keeps off the lines the arrowheads land on. Every head the graph
draws is remembered as it is drawn, and a line carrying one inside the rail's
reach is not a clear line: run a rail through it and the head becomes a junction
glyph, which turns the one cell that says *this edge ends here* into a cell that
says nothing. A line already carrying a run the rail's own way is out for the
same reason: laid end to end with an edge that was drawn first, the two read as
one line from that edge's source to the rail's target, which is a claim neither
of them makes. A line crossed the other way is fine — that is what a junction
glyph is for.

A rail is drawn as one of the edges it stands for: the one whose two ends lie
closest to the line it took, out of the card at its source and into the card at
its target, with the count beside it for the rest. Each end choosing its own
nearest node put the tail at one edge's source and the head at another edge's
target, and where five topics each skip a phase, that line was wrong about both
of them.

The count is the number of edges the rail stands for — `×5` is five carries
that skip the same pair of lanes, drawn as one line. It is written halfway along
the rail, in a lighter tint of the rail's own colour, and only where the rail is
long enough to keep a run of line on either side of it and only where there is
more than one edge to count. It was a single digit once, which was wrong the first time
a rail stood for ten edges and drew `1`. It reads along the rail — across the
page where the run is laid out in rows, down the page where it is laid out in
columns — since a label set crosswise to its own line is a label the eye has to
hunt for.

The margin outside the block is the fallback, and it is a poor one: a rail out
there leaves the block, crosses the whole of the phase it passes, and comes back
in — three sides of a rectangle round that phase, which reads as a box drawn
around it rather than as an edge going past it. A pane with no clear line and no
margin draws no rail at all. An omitted rail costs a hint; one drawn through the
nodes costs the graph.

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

The **timeline** (`orientation: time`, or the layout button) is the same run seen
from the side: one row per agent, its bar from start to landing, rows grouped by
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

There is no ruled axis under it. Every bar is scaled to the one span the run line
already states, so a row of `0  15s  30s  45s` would repeat that fact a dozen
times to say what one figure said once — and it cost two of the rows the bars
wanted. Every row's figures take a fixed column against the right edge rather
than riding after its bar, so a bar can never shoulder them off the row and
thirty agents' costs can be compared down the page instead of hunted for.

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
