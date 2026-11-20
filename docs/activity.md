# The activity strip

The rows at the foot of the pane, under a rule: what the run has done, one line
per thing a reader of a pipeline waits to hear about, newest last.

```
── activity ──────────────────────────────────────────────────────────────
  4.0s  ✔ Preflight  passed: plan located, tools ready
  5.0s    Develop    read 2 files, searched once
 10.0s    Develop    edited stores/config.ts
 12.0s  ✖ Develop    ran npm run lint, which failed
 14.0s    Develop    wrote stores/ai-status.ts
 16.0s  ▸ Develop    ran npx vitest run
```

## Why it is there

The sentence above the bar says what is happening now, and the cards say where.
Neither says what happened a minute ago, which is what a reader who looked away
from a dev-pipeline run wants first: which files the develop step changed, which
command a gate ran and whether it failed, what the last gate said. The detail
dialog says all of that about one agent; the strip says it about the run, in the
order it happened, without a press.

## What gets a line

- A file changed: `edited` for `Edit`, `MultiEdit` and `NotebookEdit`, `wrote`
  for `Write`.
- A command run, without the `cd <worktree> &&` a pipeline puts in front of every
  one: that prefix is the same on all of them, and the command is what tells
  them apart.
- A subagent started.
- A gate's verdict, as the agent lands: `passed` or `failed`, and the summary
  the gate gave. See the verdicts in [nodes.md](nodes.md).

Reads and searches do not get a line each. A develop step reads forty files
between two edits, and a line apiece would push every edit off the strip before
anyone saw it. Each stretch of them between two lines that matter is gathered
into one — `read 6 files`, `searched 3 times` — which says the agent was looking,
and how hard, without saying it forty times.

A line is the time into the run, a mark where the line is news — `✔` a gate that
passed, `✖` a gate or a call that failed, `▸` a command still running — the
agent's name in its state's colour, and what it did in grey. Colour says state
here as it does everywhere else in the pane; the words are not coloured.

## How much room it takes

`feedRows` rows, four unless set otherwise, and a rule: see
[settings.md](settings.md). The setting is in the settings dialog as `Activity`,
and `/flowpane activity <n>` or `/flowpane activity off` sets it.

None at all while nothing has happened. The strip is a band of the pane's own,
and a band that opened empty on every run would spend four rows saying what the
drawing already says.

None on a pane that would keep fewer than sixteen rows for the drawing. The
strip is read beside the drawing, never instead of it.

The drawing is painted as a pane that many rows shorter and the strip drawn
under it, rather than every layout being taught to stop short of it. To the
layouts, the rails and the dialogs the pane is simply shorter, so a dialog open
over the drawing leaves the strip readable under it.
