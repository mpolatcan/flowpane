# A node's detail dialog

What opens over the graph when a node is pressed: the prompt, the calls and the answer.

A click on a node (or Tab to it and Enter) opens a dialog over the drawing,
inset on all four sides so the graph shows around it and says it is still there.
It shows around it pushed back, the same scrim every dialog draws — still
legible, no longer the thing being read. The header bar stays clear too: which run this is and what it has spent are the
two facts that hold whatever is open over them. A pane with no room to inset
opens no dialog rather than a box with no room for a sentence.

It was a strip across the bottom before, and a strip takes its rows from the
layout. Pressing one node redrew every other node smaller, and on a short pane
the graph fell to a list at the moment a reader asked it a question — so opening
a node had to put the graph into the timeline first, since half a diagram is
worse than a list. A dialog costs the graph nothing: it covers the middle while
it is open and gives all of it back when it shuts, and the layout the reader
chose is the one still behind the answer. Every node stops being pressable while
it is there — not only the ones underneath — or a press meant for a line of the
reading opens whichever node the dialog happens to cover, and the nodes beside
it are drawn at full strength over a drawing that has been pushed back.

The dialog is framed on all four sides, with the agent's name set into the top
edge the way a card sets its own name in, and at the far end of that edge the ✕
that shuts it.

**A dialog's title is centred on its own edge.** Every dialog the pane opens is
a box whose top edge is a rule with a name set into it and the ✕ at the corner,
and a card's name and a phase's — the pane's other two names set into a rule —
are both centred. Set flush left, the title sat against one corner with the rest
of the edge running away from it, which reads as a label stuck on the box rather
than as the box's own name: with a mark at the far corner as well, the edge had
weight at both ends and nothing in the middle. The title gives way to the ✕ and
never the other way about — a title pushed a cell or two off centre is still the
title, and a ✕ moved in off the corner is a second place to look for the way
out. Centred on the *rule*, which runs from the left corner to the ✕ — not on
the box. Centred on the box the title measured centre and looked off it, because
the mark eats the end of the right-hand stroke and left it three or four cells
shorter than the left.

The last row inside carries the facts —
phase, `⧖` elapsed, `∑` tokens, `⇄` model requests,
`⚙` tool calls with the two called most (`⚙ 4  2×Read  1×Bash`), `↻` the
attempt where there was more than one, the model in full — each in the same
colour the graph gives it, and each marked with the same mark it carries
everywhere else on the pane, and each divided from the next by the same upright
the dialog's own columns are divided by. A cell or three of air alone was read
as one run of figures: a clock, a count and a model name are three kinds of fact,
and at that spacing the eye groups them by whichever happens to be short. A rule
runs above the row for the same reason — set straight against the last line of an
answer, the figures read as the answer's last line.

The count and the tools it breaks down are one field, not three. Everything else
on that row is divided from its neighbour by an upright, and `⚙ 4 │ 2×Read │
1×Bash` reads as three measurements, the last two of which have lost the thing
they are counts of. Squeezed, the tool names go first — the list below names
every one of them — and then the word on the token count, which nothing else on
the row says.

Figures under the reading rather than over it: the
first thing wanted from a detail is what is in it, and the first line of that
should be the first line of the dialog's own reading order. Above them,
**❯ Prompt** and **⚙ Tool Calls** sit side by side divided by a rule, and
**❮ Response** takes a row of its own across the full width beneath them:

- **❯ Prompt**: what the agent was asked, from its own transcript.
- **⚙ Tool Calls**: every call the agent made, **newest first**. A reader opens
  a detail to see what an agent is doing or what it did last, and in a list long
  enough to scroll that call was at the bottom — so the block opened on the
  oldest call every time and the interesting end had to be hunted for. Each call
  is one row: its outcome mark, the tool, and what the tool was passed, with
  `⧖` how long it took and `∑` what the model wrote to issue it against the far
  edge — written `∑ 4.2k tkns` wherever the row still leaves eight cells for the
  argument, since a reader can be looking at one call rather than a column of
  them and the mark then has nothing beside it to be learnt from. The payload wraps rather than being elided, because what a call was
  *about* is usually why the detail was opened, and the rows after the first
  have the block's whole width — the figures only stand on the first.

  The tool and its argument share a row. They were two rows, the name and then
  the argument indented under it, which doubled the height of a list whose whole
  job is to be read as a sequence and gave the tool names a column of their own
  with nothing else in it.

  A thin rule divides one call
  from the next, never above the first: a call is a heading and however many
  lines its payload wrapped to, so without the rule the last line of one call's
  input sat directly above the next call's name, and the list read as one
  unbroken block of text. The rule takes the same tone every other structural
  line on the pane takes, and it is drawn inside the block rather than across
  the dialog, so the block's own ground still says where the quoted material
  starts and stops.

  What each call *returned* is not shown, a call that failed included: a list of
  answers is the agent's own material, one `read 200 lines` per row, and six of
  them pushed the calls themselves off the block. A failed call kept up to three
  lines of its reason for a while — three lines of an engine's own wording in a
  list of one-line rows, which pushed the calls either side of it, the ones that
  say whether it mattered, off the block. The ✖ says the call failed, which is
  the part that belongs in the sequence; the transcript has the rest.

  The figures are the call's duration and what the request that issued it wrote.
  Not what that request *cost*: a request's cost is mostly the context it read
  back, which is all but the same number on every request an agent makes, and a
  column of `∑ 28k` twenty-five deep says nothing about any one call. Tokens
  belong to a request, not a call, so two calls from one request show the same
  figure. The number of that request used to stand there too, as `req n`, and it
  is an index into a list the dialog does not draw — a figure a reader can do
  nothing with, in the row where the two they can are. Both ends of a call are
  stamped in the recording, so a call read back from a transcript states its own
  duration like one this plugin watched.
- **◌ Thinking** while a request runs, **❮ Response** once there is an answer.

`❯` and `❮` are the same mark turned around: what went in, what came back.

## Paths are cut to what tells them apart

Every call an agent makes in a repository names a file inside that repository,
so every line of the call list opened with the same forty cells of
`/Users/<name>/<somewhere>/<project>/` — and in a column wide enough for fifty,
the part saying *which file* was the part that fell off the end:

```
 ✖  Read  /Users/you/Desktop/projects/w…       ✖  Read  …/hooks/paint.ts
```

An absolute path over 28 cells with three or more segments is cut to `…/` and
its last two. The prefix is
the same for every call in the run and is already said by which repository the
pane is open in. The cut is only made where it saves at least eight cells — an
elision that buys four has spent a glyph of the reader's attention for nothing.
On a real run of this repository's own audit it saves about one line in ten of
the call list, and gives every call in it back its file name.

## A block that fits gives its width to one that does not

The blocks used to take an equal share of the dialog. That gave a nine-line
prompt half the width to say itself in and left a seventy-eight-line call list
to be read seventeen rows at a time, with the same eight rows of white space
beside it on every frame.

A block that already fits its rows gains nothing from another cell of width, so
it gives what it does not need to the last column — and only where that column
is actually overflowing. Where everything fits as it is, the even split stands:
narrowing the prompt would buy the block beside it nothing and cost the reader a
column of four-word lines beside one of white space. Nothing narrows below 30
cells, where a sentence breaks about every four words and costs more rows than
the narrowing saved.

Only a block whose lines cannot change while the run is going may give width
away (`Section.fixed`, true for the prompt alone — an agent is given its prompt
once and never again). A block still being written would give a few cells up,
grow past the rows it now fits in, take them back, and re-wrap every column in
the dialog on a frame the reader was in the middle of.

Each block's lines sit on a ground of their own, one step up from the pane's.
What an agent was asked, what it called and what it answered is quoted material
— another program's words inside this one — and quoted material set straight on
the pane reads as the pane talking. The heading and its rule stay outside the
block: that is this drawing's label for what follows, not part of what is
quoted. So does the scroll bar, whose arrows are press targets, and a press
target is emitted as a Button, which carries no ground of its own.

Most answers are prose and are read as prose. An agent given a schema answers
with an object instead, and returns it through a tool call rather than as text
— so its transcript holds no answer at all, and the run's journal line is the
only place the value is written down. The whole of it is kept, not the 120
characters a node's tail needs, and it is set out the way it would be written in
a file, one field to a line, with the block scrolling through it:

```
 Response ──────────────────────────────────────────────────── 1–5/6
 {                                                                  ▴
   "lines": 2096,                                                   █
   "kind": "code",                                                  █
   "headline": "Renders the run as a canvas of phases and nodes.",  ▾
```

One long `{"lines":2096,"kind":"code","headline":"Renders the…` is a wall a
reader has to parse by eye, and the line it fits on is shorter than the object.
An answer that is itself a JSON string is unquoted and read as the prose it is.

What the agent was given and what it did are two halves of one question, so
they read side by side; what it answered is the outcome of both, and an answer
is prose, which in a third of a pane wraps every four words. Each column needs
about forty cells, so a narrow dialog shows fewer blocks rather than unreadable
ones — and the dialog is sized to hold two of them wherever the pane can spare
the width, taking most of what is there: 92% of the pane's columns, and
twenty-four rows by default. It opens to be read. Inset far enough to show a
generous margin of graph all round it, it showed six lines of a fifteen-line
call list and a corner of one card, which is neither the answer nor the
drawing. A few cells of pane either side say the graph is still behind it as
well as twenty do. Past 92% it stops growing: a box as wide as the pane is the
strip again, whatever is drawn around its edge.

Tool payloads are read from the agent's own transcript, so a run recovered from
disk shows the same calls as one this module watched happen — the summary alone
knows a tool's name and a count, and nothing about what the call did.

The answer's block takes the rows it has lines for, up to two fifths of the
dialog, and what it does not need goes back to the two above it. It took the
share whatever it held: a one-line answer sat at the top of six blank rows while
the prompt and the call list beside it were scrolling nine lines at a time, so
the dialog was giving its room to the block with nothing to put in it.

Every block is headed by what it is, a rule to its own width, and where its
list stands — `3–14/27`. What moves it is the bar down its own right edge: the
▴ above the first line, the ▾ under the last, and the thumb between them. What
dividing the width evenly leaves over goes to the last block, so its bar stands
in the dialog's own last cell: split evenly it stopped two or three cells short
of the frame, and a bar that stops before the edge reads as the bar of something
narrower than the block it moves.

```
❯  Prompt ─────────────────────  │ ⚙  Tool Calls  4 ───────────────────── 1–6/9
Review the recent changes        │ ✔  Read  src/server/ro…  ⧖ 50ms  ∑ 8.8k tkns ▴
under src/server for bugs.       │ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ █
Report each finding with file    │ ✔  Bash  bun test        ⧖ 1.7s  ∑ 6.1k tkns █
and line, and say how            │          src/server                          █
confident you are.               │ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │
                                 │ ✔  Read  src/server/ha…  ⧖ 80ms  ∑ 6.1k tkns ▾
```

Each block scrolls on its own. One position for all of them was the bug this
was reported as: pressing the arrow under a nineteen-line call list emptied the
six-line prompt beside it, which reads as a control that does not work. An
arrow sits at the end of the list it moves, where a reader looking for more of
that list is already looking, and a block with nowhere to go has no bar at all.

The wheel does not reach the dialog yet: 2.1.271's declarations add a
`ui.scroll` event (a wheel tick or scroll key over a pane body, which a hook may
answer by scrolling its own rows), but the engine refuses a hook on it at load,
so a block scrolls by its arrows until that catches up.
