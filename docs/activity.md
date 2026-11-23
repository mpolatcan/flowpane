# The activity strip

The rows at the foot of the pane, under a rule: what the run has done, one line
per thing a reader of a pipeline waits to hear about, newest last, and every
line of it whole.

```
──────────────────────────────────────── activity ────────────────────────────────────────
   time    agent    what happened
 18m51s  · Develop  The pill test failures are a mounting artifact: when the pill's root   ▴
                    `v-if` is false it renders as a comment node, so the element does not  │
                    re-point after the flip. → read AiStatusPill.test.ts                   ┃
 19m24s  · Develop  edited header/AiStatusPill.test.ts                                     ┃
 19m47s  ⣾ Develop  All 87 pass. Let me run the full unit suite to confirm no regressions  │
                    from the shared-file edits (MiddleSlot, bridge). → ran npx vitest run  ▾
```

## Whole lines, scrolled

A line takes as many rows as its words need, wrapped at word boundaries, with
what the calls did after an arrow in the same stream. The clock, the mark and
the name stand on its first row only, and on the strip's top row whenever the
window starts inside a line. A line taller than the strip, followed to its
newest row, would otherwise fill the strip with words and nothing to say which
agent wrote them or when.

A word longer than the whole room is broken across rows between characters,
counted as the pane counts cells: by code point, so a break never lands inside
a character.

It used to be cut: the words to two rows ending on `…`, the words themselves to
four hundred characters before that, and what the calls did to a few cells, so
the agent's reasoning — the one thing on the strip a reader cannot read whole
anywhere else on the pane — was the thing it cut. The strip scrolls instead.

It is a window of `feedRows` rows over every line the run has written, following
the newest until the reader moves it. Moved back, it stays on the lines the
reader is reading while new ones arrive under them, and moved down to the newest
again, it follows the run again. There is no control for following: arriving at
the bottom is the control. The strip's last column is the detail dialog's own
scrollbar: an arrow at each end, lit while there is more that way, and a heavy
thumb on a light track saying how much of the history is on screen and where.
It replaced a lone `▴` or `▾`, which said there was more and nothing about how
much. The strip's rows are not Buttons, so the arrows are read, not pressed; the
keys and the wheel move the strip.

It moves by:

- the wheel over its rows, a line a step as the engine reports them;
- a press held and dragged: the lines are carried with the pointer, so dragged
  up they go up and the newer lines come into view, and the drag goes on past
  the strip's edges until the button is let go;
- the keys once a press has given it the focus: up and down a line, page up and
  page down eight, home and end to either end. Escape gives the focus back.

The drag is why the strip's rows are a `Client` of their own
(`hooks/feed.ts`) rather than part of the drawing's Rasters: pointer down, move
and up reach only a surface module, and a surface module cannot hold a Raster.
The paint still draws the strip onto the canvas as it draws everything else,
which is what the tests read, and the module is handed those rows as plain data.
It posts how far it was moved on its own clock, at the pane's frame rate, and the
answer is its next rows, so the same post that carries a drag brings in the
lines the run wrote meanwhile and none of it costs a render of the pane. On a
build whose table has no `Client`, the strip stays in the drawing and the wheel
still moves it.

## The agent's words first

A line used to be what the agent did — `ran npx vitest run`, `ran git diff` —
which a reader can see in the cards and the dialog already, and which says
nothing about why. What a pipeline's reader is asking is what the agent made of
the last result and what it means to do about it, and the agent says so: in the
text a model request writes ahead of the calls it issues. Thinking is recorded
redacted, so that narration is the only reasoning a transcript keeps.

So every call carries the words of the request that issued it (`why` on the
call — see `hooks/journal.ts`), read from the transcript or, live, from the
request's own stream as it arrives. Calls one request issued share its words
and get one line between them: the words, run together, and after an arrow,
quieter, what the calls did — `read config.ts, ran the tests for stores`.

An agent that says nothing between calls — a small model sent to commit, say —
still says what a command is for, in the `description` the shell tool asks for
beside it, and that stands in for the words. Calls with neither are listed as
below.

## A command in words

A command line says what ran to a reader who reads shell, and an agent that says
nothing about its calls leaves a strip of them: `ran sed -n '81,131p'
README.md; ls -a`. So a command is said by what it does — `read lines 81–131 of
README.md and listed the files` — from a table of the programs a pipeline runs
most (`hooks/shell.ts`). Each step of the line is said once and in order, and
what is not a step is left out: an `echo` marker, a redirect, a variable set in
front, the stage after a pipe that only filters what the first one printed. A
program the table does not know is named — `ran terraform` — rather than
guessed at. A line with no step worth saying is shown as written where it is
one line, and as `ran a shell script` where it is several, since twenty lines of
shell clipped to the width of a row is a row nobody can read.

Pipelines run scripts, not one-liners, and a script is read as shell only where
it is shell. A heredoc's body is the script handed to the command — read as
shell, a Python body said `ran import` — so it is skipped. Comments, continued
lines, arrays assigned, a `case` pattern, the keywords around a loop and a
function the script defines and then calls are grammar, not steps, and say
nothing. A path held in a variable is `a file`. Swept over twenty-one thousand
commands from real runs, what is left as `ran <name>` is the scripts a pipeline
calls by name.

A table rather than a small model. A model would describe more, and say what a
command was looking for as well as what it read, but it would bill every run
for a few dozen requests the reader did not ask for, and draw each line twice:
the command, then the words a second later. Where an agent writes why it runs a
command, the strip leads with that, and that is what no table or model could
supply; the table is for the agents that do not.

## Why it is there

The sentence above the bar says what is happening now, and the cards say where.
Neither says what happened a minute ago, which is what a reader who looked away
from a dev-pipeline run wants first: which files the develop step changed, which
command a gate ran and whether it failed, what the last gate said. The detail
dialog says all of that about one agent; the strip says it about the run, in the
order it happened, without a press.

## What gets a line where the agent said nothing

- A file changed: `edited` for `Edit`, `MultiEdit` and `NotebookEdit`, `wrote`
  for `Write`.
- A command run, in words (see above), without the `cd <worktree> &&` a
  pipeline puts in front of every one.
- A subagent started.
- A gate's verdict, as the agent lands: `passed` or `failed`, and the summary
  the gate gave. See the verdicts in [nodes.md](nodes.md).
- What the script threw, for a run that failed, as the last line, under the
  name `run`: `✖ run  gate tests failed: 3 tests failed in store.spec.ts`. A
  script can fail a run after every agent in it landed, on a check of its own,
  and then the reason is in no agent's line; the pane used to say `failed` over
  a drawing of nothing but `✔`. The engine writes the error into the run's
  summary, and the line is its first line, without the class name.

Reads and searches do not get a line each. A develop step reads forty files
between two edits, and a line apiece would push every edit off the strip before
anyone saw it. Each stretch of them between two lines that matter is gathered
into one — `read 6 files`, `searched 3 times` — which says the agent was looking,
and how hard, without saying it forty times.

A line is the time into the run, a mark, the agent's name, and what it did in
grey, under a row naming the three columns — `time`, `agent`, `what happened` —
that stands still while the lines scroll.

Every line has a mark, for what that line says: `✔` a gate that passed, `✖` a
gate or a call that failed, the spinner's first frame for a command still
running, and a grey `·` for a step that simply happened. The name takes the
mark's colour, and a plain step's name is in the words' own tone. The marks used
to stand only on the lines that were news, so three lines in ten had one and the
other seven read as missing something; and the name took the colour of the
agent's state *now*, so an agent that failed at the end turned every one of its
earlier lines red, the ones that went fine included. The running mark holds
still because the strip's rows are re-sent whenever they change, and a mark
that turned with the clock would re-send the whole strip every frame.

The name is the phase and the agent, `Verify · bugs`. The card leaves the phase
off because it stands under its phase's heading; the strip has no heading over
it, so the same name in two phases was two agents the strip could not tell
apart. A label that already says its phase keeps its own words. A nested run's
phase is named without its unfold mark and without its plugin's namespace —
`ai-review-panel · reviewer`, not `▸ code-review:ai-review-panel · reviewer` —
and where the column is too narrow the phase gives way before the agent's own
name does.

## How much room it takes

`feedRows` lines, six unless set otherwise, under its row of column names and a
rule with ` activity ` in the middle of it, as every title on the pane stands in the middle of its rule: see
[settings.md](settings.md). The setting is in the settings dialog as `Activity`,
and `/flowpane activity <n>` or `/flowpane activity off` sets it.

None at all while nothing has happened. The strip is a band of the pane's own,
and a band that opened empty on every run would spend four rows saying what the
drawing already says.

On a pane too short for the lines asked for, as many as leave the drawing
sixteen rows, and none when that is fewer than two. The strip is read beside
the drawing, never instead of it. It used to be all or nothing, which was right
while the strip asked for four lines; at six and a row of column names it would
have taken the strip away from every pane that showed one at twenty rows.

The drawing is painted as a pane that many rows shorter and the strip drawn
under it, rather than every layout being taught to stop short of it. To the
layouts, the rails and the dialogs the pane is simply shorter, so a dialog open
over the drawing leaves the strip readable under it.
