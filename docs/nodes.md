# What a node says

A card's name, figures, model and state, and how each gives way as the pane narrows.

Every agent carries the same four facts wherever it is drawn: its name, how long
it took, what it spent, and which model it ran on. Models are written out and
capitalised — `Haiku 4.5`, `Sonnet 5`, `Opus 5`, `Fable 5.1` — on the node, down
a timeline row, in the run line's legend (`25×Haiku 4.5  1×Opus 5`) and in the
detail dialog. They were initials once, `H4.5` and `O5`, which saved five cells
and cost the reader the fact; and they were lower case after that, which made
`haiku` under an agent that had just written one read as a word the drawing had
chosen rather than as the name of the model.

A node is a card three rows tall, framed on all four sides in its own agent's
state — green for done, yellow for running, red for failed — with its name set
into the top edge, its figures on the middle row, and the model it ran on set
into the bottom edge:

```
╭─────── ✔ paint ───────╮
│   ⧖ 10.3s  ∑ 17.4k    │
╰───── Haiku 4.5 ────↻2─╯
```

Everything on a card is centred: the name, the figures, and the model. A card
is a box and what is set on it is set to its middle — left-aligned, the clock
drifts away from the name above it as the card widens, and the middle row reads
as text that a frame happens to enclose rather than as the card's own content.

The state mark stands directly left of the name, a cell of frame either side of
it, and the two are centred together. It used to sit against the left corner,
as far from the name as the card is wide — a reader following a column of cards
read the mark at the left edge and the name in the middle, which on a card
thirty cells across is two columns to keep track of. The mark is that agent's
state, so it belongs where the reader lands to read which agent it is. The cell
of frame either side is what keeps it a mark rather than the first letter of the
name. The pass count `↻2` stays against the right corner of the bottom edge,
where the first pass goes unmarked.

Both figures carry a mark, a cell clear of the number: `⧖ 10.3s` and
`∑ 17.4k`. Set against it — `∑17.4k` — the mark reads as part of the number,
and the eye has to find where the symbol stops before the figure can be read.
Where a card is too narrow for the spaces it gives them up before it gives up a
figure, and every card in a phase gives them up together. A bare pair of
numbers is a pair a reader has to tell apart by shape — `1m` is a minute against
an hourglass and `1.1m` a million tokens without one — and the marks are what
settle it without the reader having to know that. They stand in the run line, in
the detail dialog's foot, against every tool call it lists and down every list
and timeline row, so each is learnt once and never has to be guessed at.

What a card chooses is the precision, not the mark. A decimal costs two cells
that a card of thirty-two columns has and a card of fourteen has not, and when
one card in a phase cannot afford it none of them take it: two cards side by
side, one reading `∑17.2k` and the next `∑38k`, read as two figures measured
different ways.

The model goes in the bottom edge rather than queueing behind the clock and the
tokens for the middle row and losing. That is how a card twenty cells wide came
to say nothing about its model while half its bottom edge was strokes.

A card whose edge is spoken for says nothing about its model at all, and the
phase decides that together the way it decides everything else it writes. The
pass count takes the right-hand end of the edge from the second pass on, and a
card on its third pass has three fewer cells there than the card beside it on
its first — so a card that could not write the word used to move it in with the
figures, and give up the clock to fit it. One band came out with three cards
reading `⧖ 2m45s  ∑91k` and three reading `∑42k  Sonnet 5`, which is the row a
reader compares the cards of a phase by, saying two different things across one
phase because half of them happened to have run twice. Where any card in the
phase can write its own edge, none of them moves the model inward, and the
cards whose edges are taken leave it to the run line and the dialog.

While the agent is running, that edge says what it is doing instead — `⚙ Bash`,
`⚙ Read ×3`, `◌ thinking`, `quiet 40s` — and the model takes it back when the
agent lands. The mark in the corner says an agent is running; it does not say
running *at what*, and that is the fact that changes minute to minute and the
one a reader is watching. A model does not change at all, so a card can afford
to wait until the work is over to name it. The two marks are the ones the run
line and the detail dialog already use for the same two things. Going quiet has
no mark, because nothing in the drawing means quiet; it has a duration instead,
which is the whole of what is worrying about it.

The middle row stays figures, and so does the space after a list row's label.
Both carried the agent's own words for a while — what it was thinking on a card,
what it answered on a row — and prose cut to a card's width is a sentence broken
wherever cell twenty-eight falls: `“nction with c…` reads as a phrase the
drawing chose rather than as a fragment of somebody's paragraph. The words are
in the detail dialog, whole and wrapped, which is where a reader who wants them
is going. Before that the row repeated the bottom edge — `▸Read` beside
`⚙ Read` — which is a card spending a third of itself saying one thing twice.

It was a fill a step up from the pane's ground for a while, which said "this is
a node" in no rows at all. But a node's name row is drawn as elements rather
than into the canvas, a Button carries no background of its own, and so the fill
broke across every label on the pane and read as a row of ghost strips. A frame
is drawn in code points, and a code point survives that cut.

The card had a bar of this agent's share of the slowest agent in the run. That
is the timeline's own job, and the timeline does it against a common origin,
which is what makes its bars comparable to each other. Eight cells on a card
cannot, so the bar went.

Edges attach to the middle row, where the figures are — the row a three-row card
actually has a middle of.

A name too long for its card slides, a few cells at a time, until the whole of
it has been read, and then travels back the way it came. It does not run round:
a label that wraps shows its tail and its head in the same cells for as many
frames as the label is long, and `edge:down paint:correctness` caught mid-wrap
reads as `.: tness  paint:`, which is not a label at all. Going back, every
frame is a piece of the real name. Both ends are held for about a second,
because a name that never stops moving has to be caught rather than read.

Only the agent that is working and the one whose detail is open slide, and only
while the run is live. Thirty labels sliding at once would be the busiest thing
on screen and none of it would mean anything, and a run that has ended draws no
more frames, so a label left halfway through its travel would stay there. Those
hold at the start and show the ellipsis instead.

The ellipsis is part of the budget, not something added to it. A name cut to one
cell used to come back two cells wide — the first letter and the mark — and the
cell it ran into is the one the wire leaves the card by, so a name too long for
its row rubbed out the point that says which card the line belongs to. Cut to
one cell a name is now the first letter and nothing else: at that width a reader
can see for themselves that the name was cut, and `G` against `D` against `C` is
the difference between a row of phases and a row of marks.

**Two tones, and two is the whole of it.** Everything that *bounds* — the phase
borders, the phase rules at both ends, the card frames, the dialog's edge, the
seams inside it, the empty tracks, the separators in the top bar — is mixed from
the pane's own background toward the palette's grey, and never toward a hue.
Everything that *joins* — carries, skip rails, barrier spines, and the
arrowheads they end in — is drawn in the one wire colour, which is the only line
on the pane with a hue of its own.

The bounds used to be mixed toward the accent, which is the wires' own colour,
so a phase border and the line crossing it were the same blue and the pane gave
no reason why. The joins had the opposite problem, and it lasted longer: a
barrier spine took the idle grey, a proven carry took the wire, an inferred one
was dimmed a quarter toward the ground, and a skip rail was dimmed by a
different fraction again depending on whether it was proven. Four near-greys on
one screen, all of them in the layer whose whole job is to be followed, and a
reader counting them asked what each one meant — the answer being nothing that
the stroke was not already saying.

So the stroke says it. A proven edge is solid and full; an inferred one is
dashed. Both are the same colour, because both are edges.

**No wire on this pane changes colour for a state.** A barrier turned green once
its phase had landed; each feeder into a barrier was tinted by the agent feeding
it and each arrowhead by the agent it pointed at. A phase's progress was then
said twice, once by the rule that fills as its agents land and once by a barrier
changing colour underneath it, and four near-states went into the layer whose
whole job is to be followed. What a line is — structure, or a wire — is the only
thing its colour says.

**A card's frame is the exception, and it is drawn in its agent's state.** Done
is green, running is yellow, failed is red, and an agent the run cut off takes
the same red pulled back toward the grey. It is a tint rather than the state's
full colour: a little over half the way there from the tone every other border
is drawn in, which is enough to be read as green or red or yellow across a pane
of twenty cards and not enough to make the frame louder than the name it frames.

The frame was drawn this way once before and taken out, for three reasons that
have since been answered. It was the full state colour and it breathed while the
agent ran, so the border was the first thing read on a card whose contents were
the point. The stopped state was a grey, so a cut-off card's frame came out the
same grey as the phase boundary behind it — `stopped` is now a red mixed toward
the grey, and reads as the state it is. And the wires were free to be drawn in a
hue a state was also drawn in, so a frame and the line landing on it could agree
in colour while meaning different things — `edgeOf` now holds every theme's wire
at least 45 degrees off all three state hues.

What it buys is the reading a graph is for. A run of forty agents is a shape
before it is a list of names: where the green stops is where the run got to,
a red card is where to look first, and the yellow ones are what is happening
now. That is legible from across a desk, which is further away than a mark one
cell wide can be read.

State is said everywhere else it can be read as state, too: in the mark beside
the name, in the figures, in the timeline's bar and word, and in the card's own
name. A name takes its state's colour where the state is the exception —
`stopped`, `failed` — and stays in the text colour for an agent that is running
or has landed. Colouring every name would say nothing by colouring the ones that
matter.

Grey, not a fixed grey. The flat dark grey the structure used to be was chosen
against the pane's own ground, where it all but disappeared, and against any
other it read as a full-width smear left behind by another program rather than
as a line this drawing meant to put there. The open node's frame turns the
accent colour and goes heavy (`┏━┓`) — which card a reader has opened is not a
state the run is in, and a focus ring is the one thing a frame is entitled to
say about itself.

The clock, the token count and the model each keep one colour everywhere, so a
column of figures can be read by colour before it is read by position. The edges
keep one of their own, in a hue nothing else on the pane uses, so a line reads as
a line before it is traced.

Three of the node's choices are made once for the whole picture rather than node
by node, by the narrowest node that has to hold them:

- **the duration's unit.** Left to decide for itself each node picks the longest
  form it has room for, which puts `73s` in one lane beside `1m16s` in the next
  — the same quantity in two units, which cannot be compared without doing the
  arithmetic first.
- **the model's form.** The full name if most nodes can hold it, else the family
  alone (`Haiku`), else nothing. Nothing is cut: `Sonnet 5` shortened to `Son…`
  is a worse answer than no answer, since a reader who cannot read it goes and
  looks the model up anyway and has spent four cells to find that out. And each
  node choosing for itself put `Haiku 4.5` in one lane beside `Haiku` in the
  next, reading as two different models. Most, not every: the narrowest node in
  a run is often one whose label ran long, and letting that one node drop the
  model from all thirty is a worse trade than letting it be the one node that
  has no room to say it. The cells counted are the cells the model is written
  in, which is the bottom edge on a card and the facts on a list row — counting
  the facts in both said a card had no space for a name while half its bottom
  edge sat empty, which is what `/wf layout fits` used to show.
- **the gap between the figures**, so a one-character-longer clock in one lane
  does not close the spacing in that lane alone.

Where a list row is too narrow for all three figures, the clock is the one that
goes: the timeline draws every duration to scale and the dialog writes it out, so
it is the fact that losing a place here does not lose outright. The model goes
next — the run line's legend names every model the run used — and the token
count is the last to go, since nothing else says what this agent spent.
Narrower still and the bands become a list, one agent per row, where the pane's
full width is there to say all four in. A pane too small for the whole run says how many agents it
could not draw rather than quietly drawing fewer.

## The four states, and the marks that say them

A run has four states, and the pane says which: `running`, `completed`,
`failed`, and `stopped` — the last for a run that was killed part way. An agent
with no result of its own when its run ends is drawn `⊘` rather than left
spinning, and does not count toward a phase's landed total.

The four marks are `▸ ✔ ✖ ⊘`, and all four are drawn heavy. A state mark is
one cell against a name drawn in several, so a light glyph loses the comparison
it is there to win: `✘` and `⊝` are outlines, and a pane of twenty of them
reads as a pane of identical grey specks with nothing to tell one state from
another until each is looked at. `✖` and `⊘` fill the cell the way `✔`
already did. The spinner is seven braille dots of eight with the hole travelling
round, for the same reason: the four-dot spinner it replaced was a quarter of a
cell of ink beside a name drawn in a whole one, so the one mark on the card that
changes was the faintest thing on it.
