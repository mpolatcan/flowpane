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

The spend slot is always drawn, whatever the pane knows. An agent no file has
yet put a figure on reads `∑ —`, and one that really spent nothing reads
`∑ 0` — they are different facts and a blank says neither. Left out where
there was no figure, a card came out one field narrower than the card beside
it, which reads as a different kind of node rather than as the same node with
one thing missing: in one band `⏱ 2m41s  ∑ 114.6k tkns  ⟳ thinking` stood
next to `⏱ 31.4s  Haiku`, and nothing said whether the second had been free or
uncounted.

`—` is the rarer of the two now, because the count is also read out of the
agent's own transcript: the newest request's context, the same figure the live
reader keeps. Before that, an agent that finished before the pane started
watching carried nothing until the whole run ended and the engine's summary
landed — so every helper of a run adopted mid-flight looked like a step that
cost nothing. See [data.md](data.md).

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

A card that stands for a whole nested run names a count in place of a model,
where the agents behind it did not all run on one. It used to take the model of
the agent that decided the block — the one that failed, or the last to land —
along with that agent's clock and its spend, which is right for a state and
wrong for a model: a sixteen-agent review panel whose seats ran on Opus and
whose closing step was a one-command persist came out labelled with the persist
step's model, and a reader comparing two runs by what they were drawn on was
reading whichever agent happened to finish last. Naming the commonest instead is
the same fault with better odds. So the edge reads `3 models`, and the agents
behind it are one press away. A block that ran on one model is named by it, as
before.

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
is green, running is yellow, failed is red, and an agent the run cut off is a
grey carried toward the text tone. It is a tint rather than the state's full
colour: four fifths of the way there from the tone every other border is drawn
in, which is enough to be read as green or red or yellow across a pane of twenty
cards and not enough to make the frame louder than the name it frames. Just over
half was the first setting and it was too little — a border is one cell of ink
where a word of the same colour is several, so a hue that reads in a label came
out as grey in a line glyph.

The frame was drawn this way once before and taken out, for three reasons that
have since been answered. It was the full state colour and it breathed while the
agent ran, so the border was the first thing read on a card whose contents were
the point. The stopped state was a grey, so a cut-off card's frame came out the
same grey as the phase boundary behind it — `stopped` is still a grey, because
an agent the run never let finish did nothing wrong and a red says it did, but
it is the grey carried toward the text tone: the boundaries sit near the ground,
this sits near the words, and the two are never read as each other. And the wires were free to be drawn in a
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
  edge sat empty, which is what `/flowpane layout fits` used to show.
- **the gap between the figures**, so a one-character-longer clock in one lane
  does not close the spacing in that lane alone.

Where a list row is too narrow for all three figures, the clock is the one that
goes: the timeline draws every duration to scale and the dialog writes it out, so
it is the fact that losing a place here does not lose outright. The model goes
next — the run line's legend names every model the run used — and the token
count is the last to go, since nothing else says what this agent spent.
Narrower still and the bands become a list, one agent per row, where the pane's
full width is there to say all four in. A drawing too tall or too wide for the
pane is not cut down to fit: it keeps its own size and the body scrolls to the
rest of it. See [controls.md](controls.md#the-body-scrolls-to-the-rest-of-the-run).

## A card fed from further back says so in words

Most of what feeds a card is in the band beside it, and the wire between them is
drawn. An edge that reaches over a whole phase is not: it is written on the card
it arrives at, as the name of the phase it came from, on the row above the card.

```
         ▾ from Gather
       ╭──── ✔ draft ─────╮
       │  ⧖ 21.4s  ∑ 31k  │
       ╰──── Sonnet 5 ────╯
```

Two sources are both named, in the order the run entered them, and a card with
more names than its width can carry ends with a count of the rest —
`▾ from Setup +2`.

**Centred on the card**, the way a card centres its own name and its own model.
Set against the left edge it hung off a card wider than it by the whole of the
difference, and read as a label belonging to whatever was further left rather
than to the card it points at. It is centred on the *card* and then clamped into
the cells that are free, not centred in the free cells: those are whatever the
rest of the drawing left, and centring in them put the label wherever the wires
happened to fall.

**The word, not the mark alone.** `▴ Gather` was the arrowhead and the name and
nothing else, which is right and is learned rather than read — the first reader
to meet one asked what the text beside the card was for. `from` is the word the
detail dialog's own foot already uses for the same fact, so the pane and the
dialog say it the same way, and a reader who opens the node finds the sentence
they were shown the short form of.

**The word gives way before the name does.** Five cells is what it costs, and
down the pane the arriving wire's arrowhead stands in the middle of the row the
label shares with it, so a label there has half a card's width and no more. Where
both will not fit, the word goes and the name comes through whole: `from Gather
t…` names nothing, while `Gather the evidence` on a narrow card and `from Gather
the evidence` on a wide one in the same drawing teach each other. It is the
ladder a token count runs down, for the same reason.

The phase is named the way a reader would say it, not the way the run keys it: a
nested run's phase name arrives with the engine's `▸` on the front, and `▸` is
this pane's *press to unfold* mark everywhere else. Left on, a card fed by one
read `▾ from ▸ code-review:ai-review` — two marks, the second a control that is
not there to press, since the press is on the band's own caption. The dialog's
title strips it for the same reason.

**The mark points at the card.** Every input this pane *draws* ends in an
arrowhead pointing into the card it feeds, so an input it writes instead says the
same thing the same way, and the arrowhead is the one for the row the name
landed on: `▾` from above, `▴` from below. It was `↰` in both places for a
while — the return arrow, everywhere else a developer meets it — and a reader
took it for the run rewinding to this step. The arrowhead is written rather than
drawn, which is the standing the strip's `Verify ▸ Escalate` has: a mark in a
sentence, not the end of a line. A line the pane draws has to reach something at
both ends, and this one points at a card out of the space where the wire would
have been.

The mark takes a wire's colour and the name stays grey, since between them that
is what they are. Both in one tone, the pair read as a caption and the written
arrowhead sat in a different register from the drawn one beside it.

**The row above the card, in every layout.** The row under a card is the row its
wires leave by down the pane, so a name written there reads as something coming
out of the card rather than into it — and a label that stood under a card across
the pane and over one down it was the same fact in two shapes, which a reader has
to learn twice. The row below is still the fallback, for a card standing hard
under its band's rule with nothing above it. Neither row is ever wholly free on a
busy drawing, so what the painter looks for is the longest untouched run of cells
within the card's own columns, and it asks after everything else in the body is
down — the rules, the cards and the wires. Asked before the rules are drawn, it
put the name into the row a band is named on.

**Where a wire is already arriving on that row, its arrowhead serves both.** The
name is written up against it rather than given a second one two cells along:

```
                     │
       from Preflight ▾
       ╭── ✔  This pipeline sess… ──╮
       │   ⧖ 8m33s  ∑ 166.8k tkns   │
       ╰────────  Opus 4.8 ─────────╯
```

Two marks of the same shape on one row, both pointing into the same card, are
one fact drawn twice — and down the pane, where the written source and the drawn
wire share the row above the card, the second mark cost the name the cells it
needed: `↰ Preflig…▾`, which is a source and an arrowhead with nothing between
them to say they are two things. A cell of air is kept wherever the run of clear
cells ends at something rather than at the card's own edge, for the same reason.

That is the fallback now rather than the rule. Down the pane the label stands one
row further up, on a row the band keeps for it, and brings its own mark:

```
───────────────── Develop 1/1 ──────────────────
                    │
           ▾ from Preflight
                    ▾
       ╭─ ✔  This pipeline ses… ─╮
       │ ⧖ 8m33s  ∑ 166.8k tkns  │
       ╰─────── Opus 4.8 ────────╯
```

**The wire gives way for it**, and runs whole above and below — the bundle on the
row over it, the arrowhead on the row under. That is what a band's own caption
does to the wire it covers, and it is the same bargain for the same reason: every
row beside a card down the pane has a wire down the middle of it, so a label that
waits for a wholly clear row waits for one that never comes. Only a plain upright
gives way. A tee, an elbow, an arrowhead or a card's frame is a shape a reader
follows rather than a line passing through, and rubbing one out loses a fact
rather than a cell of a line that is drawn again on the next row.

The band is one row deeper for this — see
[header.md](header.md#sections-of-one-size). Without it the only row above a
card was the one the arrowheads land in, the label had half a card's width, and
the same run drawn down the pane said less than it said across: the word went
first, then letters off the name, and on a narrow pane the label went altogether.

**The floor is eight cells** — a mark, a cell of air and six letters of a phase
name. It was ten. A card narrower than that says nothing beside it, and the
reader opens the node, where the name is whole whatever the pane's width.

Why a word and not a line is in [graph.md](graph.md): a
rail spans two whole phases at the least, so on a drawing wide enough to scroll
it runs off both edges of the pane and a reader in the middle can reach neither
end.

## A phase entered more than once is one row, marked per attempt

A workflow that loops enters the same phase again and again. Drawn as a bag of
agents, `Develop` came out as four rows all reading `Develop`, one under
another, with nothing to say which was which — and a run of seventy-eight
agents wanted seventy-eight rows in a pane that has thirty.

The attempts fold into one row, with a state mark and a number for each:

```
▌✔ Develop  ✔ 1  ✔ 2  ✖ 3                          2m23s  ∑48k  Opus 4.8
```

The row is one piece of work; the marks are the goes at it. Each number is a
press of its own, so a reader asking about the third attempt gets the third
attempt's detail rather than the row's. Where the row has no cells for them all,
the *last* passes are kept and the rest become `+2`: the recent attempts are the
ones being read.

What a card cannot show, the dialog does. A card drawn as a card rather than a
row usually has cells for none of the marks — its width has gone to its name —
so the node carries `↻10` alone, and the trips are reached from inside the
detail, where a strip of its own carries every one of them. See
[detail.md](detail.md).

The row's own figures are the pass that decided the phase — the one that failed,
else the one still running, else the last to land. An average of three attempts
is a number about none of them.

Two agents of one name that ran *at once* keep a row each. The test is the
clock: a pass begins after the pass before it ended, and a fan-out that reuses a
name is two pieces of work rather than one done twice.

A nested workflow — a phase whose agents are a whole run of their own — folds
the same way, to one row named after the run with a count of what is inside it:

```
▌✔ code-review:ai-review-agentic  ✔ 1  ✔ 2  ✔ 3  5m54s  ∑198k  Opus 4.8
```

**The way in is on the band's caption, and nowhere else.** The run's own rule
reads `▸ code-review:ai-review-agentic 23/23 ╍╍ ▸ 23 agents`, and pressing the
handle after the caption unfolds the run into its twenty-three agents, each on a
row or a card of its own with its own press. The mark the caption opens with says
so by turning ▾.

One place, because there is only one row of the drawing that is about the run
rather than about the agents in it, and that is the rule naming it. The count
used to be on the node as well — on a row in the slot that says what the agent is
saying, and on a card in the bottom edge, in place of the model. Both slots were
already spoken for. A card still working says what it is doing on that edge, so a
running nested run showed no count at all; a card that had finished showed the
count and no model. One edge cannot carry a measurement, a state and a control,
and a reader asked why the control overlapped the other two.

Named after the run, not after whichever of its agents the row's figures came
from: `plan` on a band called `code-review` reads as the nested run having done
one thing.

The exception is a wave folded back *inside* an opened run. That is a row or a
card in the middle of a band rather than a band of its own — the rule above it
names the phase and says nothing about the wave — so it keeps `▸ 3 agents` on the
node, which is the only place its own way back out can go.

On the run this was built for, the fold takes 78 rows to 19, and the whole run
fits a pane 44 rows deep with nothing hidden.

### Opened, it is drawn as the other run it is

Opened, a nested run used to be the phase every other phase is: same rule down
the left of each row, same gutter, same indent. Thirteen rows of another
workflow sat in the middle of this one with nothing but the band above them to
say so — and that band scrolls away, so a reader who arrived at the rows by
scrolling had no way to know whose they were.

So the run is drawn one step in, behind a gutter of its own:

```
╍╍╍┬╍╍╍╍ ▾ code-review:ai-review-agentic 23/23 ↻3 ╍╍ ▾ 23 agents ╍╍╍╍╍
  ╎├▌✔ inflight claim  ✔ 1  ✔ 2  ✔ 3       15.1s  ∑15k  Haiku 4.5
  ╎├▌✔ context  ✔ 1  ✔ 2  ✔ 3              3m21s  ∑55k   Opus 4.8
  ╎╰▌✔ lead  ✔ 1  ✔ 2                       4.5s  ∑11k   Opus 4.8
  ╰╌ ⚙ 23 agents  21m01s  ∑582k
───────────────────────── Publish PR 3/3 ↻3 ──────────────────────────
```

The gutter is the dashed register — the same double dash the strip of phases
still ahead is drawn in, which on this pane already means *not part of the run
proper*. It closes at the foot on what the whole of the nested run came to, so
folding it away again loses no figure that was on the pane while it was open.

The clock on that foot is the passes added up, not the first start to the last
end. A run entered three times is three separate stretches with the calling
run's own work in the gaps: spanning them counted those gaps as time inside the
nested run and read as 48m46s for a run that took 21m.

Its own phases are not recorded anywhere. Every agent of a nested run carries
the calling run's phase name — `▸ code-review:ai-review-agentic`, and `#2`, `#3`
after it for the second and third trip — so the pane has the run's passes and
its agents and no phase structure beneath them, and has to read the shape off
the clocks the way it reads everything else.

The gutter is a device of the flat list, which is where it is needed: a band
drawn as cards is one row high, so its name is never more than a row away from
the agents it named.

### Opened, it stands every agent, and a step of several can be folded back

One press opens the whole of a nested run. It used to open the run's *steps*
instead: a reader who pressed `▸ 23 agents` on the review panel got six rows
reading `6 at once` and six more presses between them and the panel, so the
press that said *show me this run* produced an answer that had to be finished by
hand. Opening is one press now, and it is the whole run.

An opened nested run is a column of its own work, and the review panel is twelve
rows of it: a claim, a context pass, six reviewers, a synthesis and two writes.
Drawn flat that is twelve things in a row with nothing saying six of them
happened at the same moment — the reader has to compare twelve clocks to find it
out, and the column is twice as tall as the run it draws. So a step that holds
more than one row can be folded back into one row that says how many:

```
╭──── ✔ inflight claim ────╮     ╭────── ✔ 6 at once ───────╮
│  ⧖ 15.1s  ∑ 15.4k tkns   │     │   ⧖ 26.0s  ∑ 51.1k tkns  │
╰─────── Haiku 4.5 ────────╯     ╰─────── ▸ 8 agents ───────╯
```

The count on the top edge is of the work — six reviewers run three times over
is six things that happened at once, not eighteen — and the count on the bottom
edge is of the agents behind it, which is what a press brings back into view.
Where they differ, the difference is the trips. It is the same word and the same
mark as the handle after a nested run's caption, and that is the point: a reader
who has already pressed `▸ 23 agents` to get here knows what `▸ 8 agents` does.

This is the one place the count is on the node rather than on a caption. A wave
is a card in the middle of a band rather than a band of its own, and the rule
above it names the phase — so there is no caption of its own for the handle to go
on, and the bottom edge is where it has to be.

Folding is the thing a reader does *after* looking — one wide step out of the
way while they read the rest — which is why it is the state that has to be
asked for. Folding the whole run back takes those folds with it, so reopening it
is opening it, rather than finding it carrying a fold made minutes ago with
nothing on the pane to say why.

The steps come off the clocks. A trip's agents group into waves — each wave the
ones that overlapped — and the fullest trip is the one read, because trips are
not alike: a second trip that found nothing to do is a claim, a context pass and
a write, and its waves would call some other trip's work a step it was never
part of. A row the fullest trip never ran belongs to no step and stands on its
own, which is the one thing true about it whatever the rest of the run did.

Only a step of more than one row can be folded, and only inside a nested run. A phase of
the calling run that opened six agents at once stays six cards, because six
cards is what the graph is *for* — folding them would leave a drawing of a
workflow with no work in it. And a nested run that ran one agent at a time —
the security review is a gate, a reviewer and two writes, every trip — has a
step per row and nothing to fold, which is the honest answer for a run with
nothing happening at once in it.

The timeline folds none of them. It is drawing *when*, and six agents that ran
at once over three separate trips are six bars in three places; one bar would
draw over the hours between. The overlap a step stands for is the one thing a
timeline already shows, by the bars lining up.

### Every layout dashes the rule, and every layout takes the press

The gutter cannot be drawn beside a band laid out across the pane, and it costs
two columns the narrow panes do not have. What every layout does have is the
phase's own rule with the phase's name in it, so that is where the register
goes: a nested phase's rule is drawn in the dashed stroke, and this run's own
phases keep the plain one.

```
──────────━━━┯──────────━━━┯╍╍╍╍╍╍╍╍╍╍╍╍╍┯──────────━━━
  Commit (code)      Lint (tests)    ▸ ai-review 23/23    Publish PR
```

It costs no cells, it reads at a glance down a column of seventeen rules, and it
is the same fact in every layout, because every layout draws a phase as a rule
with a name in it. It is also the third thing the dashed stroke says on this
pane, after the phases the run skipped and the strip naming the ones still
ahead, and all three mean the same: *not this run's own work*.

The ▸ goes with it, and so does the handle beside it. Laid out across, a
phase's caption is its column head; down the pane and on the timeline it is the
band's rule; in every one of them the caption carries the run's way in and its
way back out, and the mark turns ▾ while the run is open. Before this the press
existed only down the pane, so a reader in the across layout could see there was
a nested run and had no way into it — the same drawing, the same mark, and the
mark did nothing.

### One handle, the same shape open and shut

A nested run's caption carries a handle:

```
╌╌╌╌╌╌╌╌╌ ▸ code-review:ai-review 3/3 ╌╌ ▸ 3 agents ╌╌╌╌╌╌╌╌╌
╌╌╌╌╌╌╌╌╌ ▾ code-review:ai-review 3/3 ╌╌ ▾ 3 agents ╌╌╌╌╌╌╌╌╌
```

It went through two worse versions first. The mark on the name was the whole
control to begin with: one cell at the head of a name in the middle of a rule
running the width of the pane, which is a target a reader hits by luck — and a
coloured cell besides, so a Button drew it as plain text and stripped it of the
one thing it was saying. Then, once the run was open, the word `collapse`
appeared after the name. That fixed the finding and broke something else: the
control changed shape the moment it was used, and a verb arrived in a rule that
otherwise holds nothing but marks, names and counts.

One handle now, in both states, and only its mark differs. It says what the row
standing for the whole run says — `▸ 3 agents`, the same press in the same words
in the two places a reader would try it — and, opened, `▾ 3 agents`, which is
that sentence with its state changed rather than a different sentence. Shut, it
is the way in; open, it is the way back, which matters because opening the run
spends the other way in: the row that read `▸ 3 agents` becomes the three agents.

It stands clear of the caption with two strokes of the rule between them. Set
hard against the count it read as a fourth field of the caption — mark, name,
count, handle — and the run's own name lost the comparison. With the rule
showing between them it is a second thing set into the same line, which is what
it is.

The caption and the handle are placed as the one group they read as, so the
name keeps the middle of the rule that names it: a caption placed as though it
were alone would sit where it sat before the handle existed and push the handle
off its right.

It gives way down its own ladder — `▸ 3 agents`, `▸ 3`, then `▸` — and every
rung is drawn on cleared cells with a blank at each end, the whole cleared span
being the press. So even the last rung is three cells wide, and nothing coloured
is given up to make it pressable. A column with room for none of them falls back
to the mark on the name, which is the target of last resort rather than the
ordinary one.

### The timeline draws one bar a trip

A timeline is drawing *when*, so a nested run folds differently there. Shut, it
is one bar per trip through the run rather than one row for the whole of it: a
run entered three times is three separate stretches of clock with the calling
run's own work in the gaps, and a single bar from the first start to the last
end would draw over an hour the nested run spent not running.

```
╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍ ▸ code-review:ai-review-agentic 23/23 ↻3 ╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍
 ✔ code-review:ai-review-agent…   ███████            done  11m0…  ∑ 292.2k  Opus 4.8
 ✔ code-review:ai-review-agent…           ███        done  4m06s  ∑ 91.4k   Opus 4.8
 ✔ code-review:ai-review-agent…                ████   done  5m54s  ∑ 198k    Opus 4.8
```

Opened, it is twenty-three rows in the run's own order, each with its own bar
against the same clock and each taking its own press. Which is what a reader
opened it for: the gaps between the child's agents are the part a timeline can
show and the graph cannot.

## A nested run's name is two names, and gives way as two

`code-review:ai-review-agentic` is not one name. It is a plugin and a workflow,
and cutting it from the right — which is all an ellipsis can do — spends the half
that varies to keep the half that does not. Every nested run of one plugin
shares its plugin half, so `code-review:ai-review-age…` and
`code-review:ai-review-quick…` are two runs a reader cannot tell apart at any
width where either is cut at all.

So the name gives way in a fixed order, as the header's own fields do:

1. **A half that repeats the other goes first**, at every width. The pipeline
   runs `test-coverage:test-coverage` and `security-reviewer:security-review`;
   the second word of each is the first one again, and a name written twice is a
   name a reader reads twice and learns nothing by. The longer half is kept.
2. **Then the plugin half.** It is repeated down the run wherever that plugin
   appears, and it is the half a reader can infer from the one that is left.
3. **Only then is the workflow half cut**, from the right, as any other name is.

A name with no halves to it — `Base Branch Health`, most agent labels — skips
straight to step 3, which is the plain truncation it always had.

```
                  today                        now
56 cols   ▸ security-reviewer:security-rev…   ▸ security-reviewer
          ▌✔ code-review:ai-review-age…       ▌✔ ai-review-agentic
44 cols   ▌✔ test-coverage:test-cov…          ▌✔ test-coverage
```

Two of the three long names on the pipeline this was built for come out whole,
and the third keeps the half that tells it from its siblings.

The ladder is all of it. There is no reveal under the pointer, because there is
nowhere to draw one: a band's rule is a `Raster`, and a `Raster` is a leaf with
"no children, `hover` or `onPress`"; the `Client` region that *does* report a
pointer cannot hold a `Raster`; and `BoxHoverProps.display` is `"flex"` alone,
so a hover can reveal a box but never hide one. A reveal built inside those
limits pushes the row along instead of drawing over it, which moves the name
out from under the pointer that asked for it. So the name has to be right at
the width it was given, with no pointer and no second state — which is the
ladder, and is why step 1 and step 2 exist at all.

The other half of the same answer is width. The ladder makes the most of the
cells a node is given; what decides how many cells that is now asks whether the
node can carry a name at all before it divides the pane again — see
[Sections of one size](header.md#sections-of-one-size).

## The rail down the gutter says which phases went round together

The marks say a phase was entered again. They cannot say which phases were
entered again *together*, and that is what a reader wants when a pipeline
rewinds: where the loop began, where it closed, and what fell outside it.

So the phases that repeated are tied by a rail down the two cells the list
layout keeps free at the left, from the last of them back up to the first:

```
  ▌✔ Setup
─────────────────────── Develop 3/3 ↻3 ───────────────────────
╭▸▌✔ Develop  ✔ 1  ✔ 2  ✔ 3
├──────────────────────── Revise 1/1 ─────────────────────────
│ ▌✔ Revise
├────────────────────── Publish 3/3 ↻3 ───────────────────────
╰─▌✔ Publish  ✔ 1  ✔ 2  ✔ 3
───────────────────────── Report 1/1 ─────────────────────────
  ▌✔ Report
```

The head at the top points into the row control came back to. Every band between
the ends joins the rail with a tee, so a phase that ran once *inside* the loop is
shown to be inside it, and the phases at either end are shown to be outside. On
the run this was built for, that is eleven phases of seventeen.

The rail is the only wire this layout draws, and it is drawn in the wire's own
colour rather than the grey the bands and borders take: it is control flow, not
furniture.

A phase that repeated on its own draws no rail. One row that went round is a
retry, and its band already counts the attempts — a line with one end is a line
that says nothing the caption did not.

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
