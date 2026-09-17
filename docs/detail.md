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

The name carries the agent's own state mark — the same ✔, ✖, ⊘ or spinner frame
the node behind the dialog is drawn with, turning while the agent runs. The
dialog used to mark a running agent `▸` and everything else `•`, which are two
marks this pane uses nowhere else and which say *running* and *not running*
where the drawing underneath distinguishes four states. A reader who opens a
node to find out how it went should not have to shut the dialog to read the
answer off the card.

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
phase, `from` whatever fed this agent from further back than the band above it,
`⧖` elapsed, `∑` tokens, `⇄` model requests,
`⚙` tool calls with the two called most (`⚙ 4  2×Read  1×Bash`), `↻` the
attempt where there was more than one, the model in full — each in the same
colour the graph gives it, and each marked with the same mark it carries
everywhere else on the pane, and each divided from the next by an upright. A
cell or three of air alone was read
as one run of figures: a clock, a count and a model name are three kinds of fact,
and at that spacing the eye groups them by whichever happens to be short. A rule
runs above the row for the same reason — set straight against the last line of an
answer, the figures read as the answer's last line.

The count and the tools it breaks down are one field, not three. Everything else
on that row is divided from its neighbour by an upright, and `⚙ 4 │ 2×Read │
1×Bash` reads as three measurements, the last two of which have lost the thing
they are counts of. Squeezed, the tool names go first — the list below names
every one of them — then the word on the token count, which nothing else on
the row says, and last `from` and the phases after it, which the graph behind
the dialog is also saying.

`from Develop` is the same word the graph writes, in a row that always has the
cells for it. A card fed from further back carries `▾ from Develop` above it,
and gives the word up for the name where the row it shares with an arriving wire
is too short for both. The dialog's foot is never that short, so a reader who
opened the node to find out what the bare name beside it meant has the answer
among the rest of the node's facts. It is also the one place the name is certain
to be whole: beside a card twelve columns wide it is `▾ from Setup +2`.

Figures under the reading rather than over it: the
first thing wanted from a detail is what is in it, and the first line of that
should be the first line of the dialog's own reading order. Above them the
dialog shows **one pane at a time**, across its whole width, and a strip of tabs
under the title says which panes there are and which is open:

```
├── Prompt ──┤ Tool Calls (20) ├── Thinking ─── Response ───────────────────────┤
```

The panes are the same four they always were:

- **Prompt**: what the agent was asked, from its own transcript.
- **Tool Calls**, with the count in brackets after the name: every call the agent made,
  **newest first**. A reader opens a detail to see what an agent is doing or
  what it did last, and in a list long enough to scroll that call was at the
  bottom — so the block opened on the oldest call every time and the interesting
  end had to be hunted for.

  Each call is one row, and every row is the same height: its outcome mark, the
  tool in a column of its own, what the tool was passed, then `⧖` how long it
  took and `∑` what the model wrote to issue it against the far edge.

  ```
   ✔  Bash    git add -A src/ && git status --short && echo "=== staged…  ⧖ 2.6s   ∑ 3 tkns
   ✔  Bash    bunx eslint src/stores/ai-status.ts src/composables/useA…  ⧖ 7.7s   ∑ 395 tkns
   ✔  Edit    …/workspace/src/composables/useCortexBlueprintBridge.ts   ⧖ 148ms   ∑ 437 tkns
   ✖  Edit    …/workspace/src/components/organisms/header/MiddleSlot.vue  ⧖ 10ms   ∑ 3 tkns
  ```

  The row shows the one argument that says which call this is, and drops its
  key. A payload is two or three fields and only one of them identifies the
  call — `command` for a shell call, `file_path` for an edit, `pattern` for a
  search — but which one that is differs by tool. So the row looks down a list
  of nine names the tools in this corpus use for that field (`command`,
  `file_path`, `notebook_path`, `path`, `pattern`, `query`, `url`,
  `description`, `prompt`), takes the first of them the payload has, and shows
  that field's value and the lines under it. A payload written as anything but
  `key: value` lines, and one with no field on the list, is shown from the top
  as it stands.

  It showed the payload from the top with the keys kept, which spent the head
  of every row on `command: ` or `file_path: ` — a word the tool column two
  cells to the left has already said — and gave a tool whose leading field is
  not the interesting one a column of rows that all begin the same way.

  What is shown is then flattened to one line: its own line breaks and runs of
  space closed up, so the whole of it reads as a sentence, and what does not
  fit is cut off the end. A path is cut off the *front* instead, at a
  separator, and the cut marked `…/`. An agent works inside one tree, so its
  paths share their first forty cells and differ in the last ten: cut off the
  end, a column of edits came out as a dozen copies of
  `…/.edison/runs/f8494b805da840c387dbe…`. The file is the part that says which
  call this is, and on a path it is at the wrong end for the general rule.

  It used to be a heading and however many lines the payload wrapped to, with a
  dashed rule between one call and the next. On an agent with forty-two calls
  that came out as a column of ragged blocks two to six rows deep, four of them
  on screen at a time: the list whose whole job is to be read as a sequence
  could not be read as one, and finding a call meant scrolling past the text of
  every call before it. Uniform rows put twenty-two on the same screen, and the
  rule between them went with the raggedness it was there to divide.

  The tool names take a column, as wide as the longest of them and no wider,
  under two ceilings: eighteen cells, and a fifth of the row. The first is for
  the single long name among forty short ones, the second for a narrow pane,
  where a fixed column that is a fifth of the row at a hundred and ten cells is
  half of it at fifty. An MCP tool is named `mcp__<server>__<tool>` and is drawn
  by its last segment: one knowledge-base server in this corpus contributes
  fifteen tools whose first forty cells are identical, so cut to a column
  `mcp__plugin_engineering-knowledge-base_ekb…` is the same string for a file
  read, a tree walk and a semantic search. `hybrid_search` is the part that
  differs and the part a reader says out loud. The whole name is in the call's
  own dialog.

  The argument is the last thing on the row to give way, because it is the only
  thing on the row that says which call this is. The figures go down a ladder
  until it has twenty-four cells — about a path's last two segments, or a
  command and its first flag: the unit first (`∑ 4.2k tkns` to `∑ 4.2k`), then
  the count, then the clock with it. A narrow pane runs out before the ladder
  does, and there the row is the tool and what it was passed, with the figures
  in the call's own dialog where they are three fields on a row of their own.

  The list sits on the pane's own ground rather than the quoted ground the
  other panes take. Every row on it is a control, a control is emitted as a
  `Button`, and a `Button` carries no background — so a ground painted under
  these rows is a ground the surface throws away, and the block would come out
  in stripes. It is also true: an index the pane built is the pane talking, and
  the quoted material is behind the press.

  What each call *returned* is not on the row, a call that failed included: a
  list of answers is the agent's own material, one `read 200 lines` per row, and
  six of them pushed the calls themselves off the block. A failed call kept up
  to three lines of its reason for a while — three lines of an engine's own
  wording in a list of one-line rows. The ✖ says the call failed, which is the
  part that belongs in the sequence; the call's own dialog has the rest.

  The figures are the call's duration and what the request that issued it wrote.
  Not what that request *cost*: a request's cost is mostly the context it read
  back, which is all but the same number on every request an agent makes, and a
  column of `∑ 28k` twenty-five deep says nothing about any one call. Tokens
  belong to a request, not a call, so two calls from one request show the same
  figure. Both ends of a call are stamped in the recording, so a call read back
  from a transcript states its own duration like one this plugin watched.
- **Thinking** while a request runs, **Response** once there is an answer.

## A prompt is read as the document it was written as

Prompt, Thinking and Response are somebody else's writing, and a prompt in
particular is usually a markdown document: a heading, a block quote naming the
source of truth, a list of what changed between one revision and the next,
fenced code. The pane keeps the line breaks the writer put in and wraps each
line inside itself, rather than closing the whole thing up and re-wrapping it
as one paragraph.

Flattening is right for a node's tail, where there are forty cells for a
sentence, and wrong for a document. Markdown run together does not degrade, it
disappears: `#` lands in the middle of a sentence, a list becomes a run of
clauses separated by hyphens, and the shape that said which part of a brief was
which is gone. The plan the corpus's longest prompt carries is four hundred and
forty-four lines of structure, and flattened it was three hundred and
forty-three lines of unbroken prose.

The line length stops at ninety-six cells even where the pane is wider. Prose
set the full width of a two-hundred-column pane is prose a reader loses their
place in between one line and the next. A table of calls is not prose and keeps
the whole block.

A heading line is drawn a step back from the body — the pane's rule for
structure everywhere else, where what the words say is the content and the
scaffolding around it is grey. The body keeps the strength it had, so nothing a
reader came to read is quieter than it was, and a heading is findable while
scrolling because it is the one line in view in a different colour. That is the
whole of the styling: marking quotes, code spans and emphasis as well would be
a syntax highlighter in a pane that is not an editor.

The pane runs to the end of the document. The wrapper came from the calls list,
where an argument was a block of rows among other blocks and stopping at two
hundred rows with the rest counted was generous. A prompt is the pane, and the
reader opened the tab to read it: a four-hundred-line plan cut off at two
hundred is a document the pane declines to show the end of.

## An empty pane says why it is empty

An agent with nothing recorded gets a sentence rather than a blank block, and
which sentence depends on whether there is anything still to come:

- Running: *Nothing recorded yet. What this agent was asked, and every call it
  makes, appear here as it works.* — the pane is waiting with the reader, and
  the sentence says what will fill it.
- Finished: *No transcript for this agent: `agent-<id>.jsonl` is not in the
  run's transcript folder.* — nothing more is coming, and the reason is a file
  that is not there. Naming the file is what makes the difference between a
  dialog that looks broken and one a reader can check.

## A nested run opens as the list of what it ran

A nested workflow is drawn as one row, because fourteen agents of somebody
else's workflow standing in the middle of this one's graph is a drawing of the
wrong run. The cost of that used to be a row with nothing behind it. The row
carries the figures of the agent that *decided* the trip — the one that failed,
or the last to land — so pressing its name opened that one agent, and a reader
who asked what the review panel did was answered with the last of fourteen
answers, with nothing on the dialog saying the other thirteen existed.

So the name opens the run:

```
╭──────────────────── ⊘ ai-review-agentic ───────────────────── ✕ ─╮
│ ✔  context     {"review_started_at_ms":1783614481936,"rep…  ⧖ 4m43s  ∑ 139.9k tkns │
│ ✔  reviewer    **Verdict**: `request_changes`               ⧖ 4m06s  ∑ 172.1k tkns │
│ ✔  native      ## Review Summary                            ⧖ 3m17s  ∑ 105.1k tkns │
│ ⊘  reviewer (retry)  claude-sonnet-5                        ⧖ 1m37s  ∑ 154.2k tkns │
│──────────────────────────────────────────────────────────────────│
│ stopped 7/8 │ ⧖ 10m28s │ ∑ 943.1k tkns │ ⧉ 8                     │
╰──────────────────────────────────────────────────────────────────╯
```

It is built as the Tool Calls list is built, and for the same reason: one row each,
every row the same height, the text cut where the row runs out. The two read
alike on purpose — a reader who has used one knows what pressing a row of the
other does. Pressing a row opens that agent's own dialog in full, and `◂ Back`
in its corner returns here, which is what a reader working down fourteen agents
presses thirteen times.

The column of text is what each agent **answered**, not what it was asked. The
prompts inside one nested run are near-identical by design — a panel hands its
six reviewers the same brief with one line changed — so a column of them tells a
reader nothing, while the first line of each answer is the one thing that
differs. The foot is what the whole run came to, the count of agents included:
that count is the thing the row the reader pressed was saying, and leaving it to
the length of a list they have to scroll to the end of would lose it.

The title drops the `▸` the phase name carries. It means *press to unfold*, and
it is the one thing a reader looking at this dialog has already done.

This is not the same control as unfolding the run in the drawing, and the two
answer different questions. Unfolded, the run's agents are nodes in the graph,
with their wires and their waves, which answers *where in the run did this
happen*. The list answers *what did it do* without giving up the shape of the
run that called it.

## A call is shown whole, in a dialog of its own

A row of the Tool Calls list is a press, and what it opens is the call:

```
╭─ ◂ Back ─────────────── ✔ Bash ──────────────────── ✕ ─╮
├── command ──────────────────────────────────────────────┤
│ command: git add -A src/ && git status --short && echo ▴│
│   "=== staged diffstat ===" && git diff --staged --sta █│
│ description: Stage source changes and show the staged  ▾│
├── output ───────────────────────────────────────────────┤
│ M  src/stores/ai-status.ts                             ▴│
│  M src/components/Guido.vue                            █│
│ ?? src/composables/useAiStatus.test.ts                 ▾│
├─────────────────────────────────────────────────────────┤
│ done │ ⧖ 2.6s │ ∑ 3 tkns │ ⇄ 4                          │
╰─────────────────────────────────────────────────────────╯
```

It takes the same rectangle the agent's detail took rather than opening as a
smaller box inside it. What it holds is a command, a patch or a query — the
content that most wants width on the whole pane, and the content a box inside a
box would have wrapped every five words, which is the keyhole the tabs were
introduced to close. So it replaces the detail and says so with the way back in
the corner it came from: `◂ Back` returns to the list at the row it was left on,
and `✕` shuts the reading altogether.

The agent's dialog is untouched while this is open — same tab, same line — and
the call keeps its own place in its own payload, under its own number rather
than an index into the tabs'. Keyed as a tab, a reader scrolling a long command
was moving the Prompt pane behind it, and coming back landed the prompt wherever
the command happened to be left.

The argument keeps the caller's own line breaks and its paths whole, folded at
the column rather than wrapped at the spaces:

```
 ✖  Bash  set -e
          git fetch --all --prune

          git status --short
```

### Three weights, and no fourth colour

The text of a call is set in three weights of the block's own grey:

```
 command: git status --porcelain && git diff HEAD --stat
 ───────  ───        ───────────    ───        ─────────
 dropped  lifted     dropped        lifted     dropped
```

Lifted is what identifies the line: the word that ran, the mark down the left of
a `git status` or a diff, the file at the end of a path. Dropped is the
punctuation holding it together: the `key:` in front of a payload field, the
operators joining one command to the next, a flag, the directory in front of a
file name. Everything else stays exactly the weight it was.

Tone and not hue, and three weights at most. Colour in this pane already says
one of two things — what state a node is in, or that a line is a wire — and a
third meaning taken on here would cost the first two theirs. A reader who does
not notice reads the same text in the same grey it was in before.

Two rules keep the weights honest. A quoted string is one thing however many
words are inside it, so its first word is not lifted as a command; and nothing
in a tool's output is dropped, because a pane that decides which parts of
somebody else's output matter is a pane editing it.

The dropped weight goes a third of the way to `dim` rather than half. At half it
fell under 3.0 against the block's ground in four themes, which is the bar a
reader has to lean in past.

A script run together into one paragraph is a script whose second command reads
as an argument to its first, so the lines that were written are the lines that
are shown. A command rewrapped at the spaces, or shown as `…/worktrees/feature-1
&& echo`, is a command a reader cannot check — which is most of what a detail is
opened for. Up to 4,000 characters are kept at capture; past that it ends in an
ellipsis.

Both of those are new. Before, an argument was cut to its first non-blank line
and then to 117 characters, at capture, so no dialog could show more however
wide it was — and an absolute path was cut a second time to `…/` and its last
two segments, because the call list shared the dialog with the prompt and had
about forty cells to say a path in.

### Two compartments, not two runs of text

A payload and a result are both somebody else's text, and set against each other
with only a blank between them the second reads as more of the first. So the box
is divided in two, a shelf over each:

```
├── command ──────────────────────────────────────────────┤
```

A shelf and not a rule drawn inside the block. Tied into the frame at both ends
— the idiom the tab strip and the figures rule already use — it is a shelf of
this box, and what is under it is a compartment rather than a run of text that
happens to start there. A rule drawn into the block scrolled away with the
fourth line, and what was left was one slab of somebody else's text with no word
anywhere saying where the argument stopped and the answer started.

Each compartment keeps **its own scroll and its own bar**. Moving the answer
leaves the command where it was, which is the whole point of dividing them: a
reader checks a command against what it printed, and a division that cannot hold
one of the two still is a division in name. It is the bug the tabs were
introduced for, one level down — the pointer on a three-line command, the wheel
turned, and the answer moving instead.

The first shelf says `command` where the call is a shell line and `argument`
where it takes named fields, because those are two different things to read and
a reader who sees `command` knows before reading a word that what follows is one.
The second says `output`. It said `answered` before, from an era when one line of
a result was recorded and the rule was the only thing saying there was more.

The argument takes the rows it needs and no more, up to a third of the box. A
command is a line or three and an answer is a hundred, so an even split would
stand two blank rows over every diff; past the cap the argument keeps its own bar
and scrolls. A call with no answer takes the whole box, and a box under four rows
— a compartment, a shelf and a compartment with nothing in either — goes back to
one block with the sections ruled off inside it.

Side by side rather than stacked was the other way to divide them, and it is the
wrong one twice over. It halves the width, and width is what a command needs:
the same `git status --porcelain` that folds to three rows across the whole box
folds to five across half of it, with `--porcelain` broken as `-` and
`-porcelain` — a flag torn across rows is a flag nobody can check. And the two
are not the same size. Over 688 calls in the corpus the median argument is 173
characters and the median answer 367; 290 of them answer four times longer than
they were asked, and 288 answer shorter. One height for both leaves a blank
column beside a long one, whichever way round it falls.

The whole of a result is kept now, to the same four thousand characters its
argument is kept to, live and replayed alike. A test run's first line is
`RUN  v2.1.9` and the verdict is thirty lines down; one line of that is a header
with nothing under it.

A value too long for the block keeps **both its ends**:

```
│ 15 > - **v3** — incorporated DB-verified facts, three locked decisions…   │
│                                                                          │
│ ── … 31.2k characters not shown … ────────────────────────────────────── │
│ 436 - [ ] **Neo `flow_dependencies_v2.email-agent → liquid-agent`** — …   │
```

Twelve rows of the block at each end, cut where the value already broke a line
so the row after the count is a whole line rather than the tail of one. The
first of it and not the last was what a plain truncation kept, which is the part
a reader had already guessed; a build log's last line is the verdict, and the
verdict was the thing the call was opened for. What is left out is counted in
the rule standing where it was, so nothing goes missing quietly.

## One pane at a time, across the whole dialog

The prompt and the calls used to sit side by side with the response under them,
each in a third of the room. That gave a call about forty cells to be said in,
which is why paths had to be elided; and it gave a seventy-eight-line call list
seventeen rows, with eight rows of white space beside it on every frame.

A tab strip replaces the split. The open pane has the dialog's whole width and
all of its rows — about a hundred cells by thirty where the split gave
forty-five by eleven — and the others wait behind a press. A reader is doing one
of these things at a time: reading what an agent was asked, or checking what it
ran, or reading what it said.

Which tab is open outlives the dialog. A reader working down a failed phase is
reading the same pane of each agent, and a dialog that opened on the prompt
every time made them press twice per node. Out of range for the agent now open
— an agent with no calls has no calls tab — the paint clamps it and reports
back which tab it settled on.

Every tab keeps the cells it had whether it is open or not: the open one is
bracketed, `┤ Tool Calls (20) ├`, rather than widened, so the strip never shifts
under the pointer and the tab a reader meant to press is the one they press.

Squeezed, the strip goes down a ladder of its own, the same shape the header's
groups and the token units go down. `Tool Calls (20)` first; then the count,
since it is what a reader would have found by pressing the tab anyway; then the
word in front of the name, leaving `Calls`. Every tab drops its rung together,
because a strip with one name in its full form and its neighbour in short reads
as two different kinds of thing. Below the last rung the names are cut from the
end of the strip: which panes there are matters more than how much is in each.

The tab was `Calls 20` for a while, and read two ways — the calls made, or the
calls still to make. `Tool Calls` says which, and the brackets say the number is
part of the label rather than the start of the next one.

The strip is a crossbar and is drawn as one, tied into the frame at both ends,
and so is the rule over the figures at the foot. Drawn from the first cell inside
the frame to the last, each of them left a `│` at either end with a stroke
running up to it and no joint, and a dialog with two of those read as three
strips stacked up rather than as one box with shelves in it.

Each pane's lines sit on a ground of their own, one step up from the pane's.
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
├── Prompt ─── Tool Calls (20) ──┤ Response ├───────────────────────┤
│ {                                                                 ▴│
│   "lines": 2096,                                                  █│
│   "kind": "code",                                                 █│
│   "headline": "Renders the run as a canvas of phases and nodes.", ▾│
```

One long `{"lines":2096,"kind":"code","headline":"Renders the…` is a wall a
reader has to parse by eye, and the line it fits on is shorter than the object.
An answer that is itself a JSON string is unquoted and read as the prose it is.

The dialog takes most of the pane: 92% of its columns, and twenty-four rows by
default. It opens to be read. Inset far enough to show a
generous margin of graph all round it, it showed six lines of a fifteen-line
call list and a corner of one card, which is neither the answer nor the
drawing. A few cells of pane either side say the graph is still behind it as
well as twenty do. Past 92% it stops growing: a box as wide as the pane is the
strip again, whatever is drawn around its edge.

Tool payloads are read from the agent's own transcript, so a run recovered from
disk shows the same calls as one this module watched happen — the summary alone
knows a tool's name and a count, and nothing about what the call did.

Where the open pane's list stands is the last of the figures at the foot —
`1–21/140`, pinned to the right end of that row — and what moves it is the bar
down the dialog's right edge: the ▴ above the first line, the ▾ under the last,
and the thumb between them.

```
├── Prompt ──┤ Tool Calls (20) ├── Thinking ─── Response ───────────────────────┤
│ ✔  Bash   git rev-parse --abbrev-ref HEAD                ⧖ 40ms  ∑ 5.4k tkns ▴│
│ ✔  Bash   set -e bun test --reporter junit bunx tsc --n…  ⧖ 1.7s  ∑ 210 tkns █│
│ ✔  Read   file_path: hooks/paint.ts offset: 5900 limit:… ⧖ 120ms  ∑ 1.1k tkns││
│ ✖  Edit   file_path: hooks/layout.ts old_string: const b… ⧖ 10ms     ∑ 3 tkns▾│
├──────────────────────────────────────────────────────────────────────────────┤
│ Review │ ⧖ 2m30s │ ∑ 99.9k tkns │ ⚙ 20 │ Opus 4.8                    │ 1–4/20 │
╰──────────────────────────────────────────────────────────────────────────────╯
```

It used to be written at the right end of the tab strip, which put a measurement
on the one row of the dialog that is otherwise all controls — and put it in line
with the tabs, so a reader picking along them read `1–21/140` as another of them.
It belongs with the clock and the spend: that row is where the dialog says how
big a thing is. It is the last field there, so it is the first to go when the row
runs out of cells, which is right — everything else on that row is a fact about
the agent, and this is a fact about the reader's own scrolling, which the bar
beside them already shows.

Each pane keeps its own place in its own list. One position for all of them was
the bug this was reported as: pressing the arrow under a nineteen-line call list
emptied the six-line prompt, which reads as a control that does not work. A tab
pressed and pressed back gives the reader the lines they were on.

The wheel does not reach the dialog yet: 2.1.271's declarations add a
`ui.scroll` event (a wheel tick or scroll key over a pane body, which a hook may
answer by scrolling its own rows), but the engine refuses a hook on it at load,
so a block scrolls by its arrows until that catches up.
