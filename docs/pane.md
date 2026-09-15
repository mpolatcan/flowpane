# Where the pane sits

Which seat the drawing takes, and what it draws when the session has nothing running.

In a pane the surface seats: docked beside the transcript in the fullscreen
renderer from 110 columns, inline above the prompt otherwise. `paneRows` asks
for a height in the inline seat; the dock ignores it.

It used to draw in two other places — a full-width band above the prompt
(`AbovePrompt`) and the hint line under it (`PromptHint`). Both are gone. A pane
is the only seat the engine focuses, and focus is what makes a node clickable
and a `Select` openable; the other two could show the graph but never let anyone
work it, and keeping three seats meant three heights to size and three footers
to lay out for the one people actually used.

**Under `/tui default` (the main-screen renderer) a pane never draws.**
`$.ui.open` succeeds and `ui.close` later says the pane was open, but no `Pane`
render is ever dispatched and nothing is seated. Run `/tui fullscreen`, which
docks it beside the transcript from 110 columns. (Found by driving a pty session
with `dev/drive.py` and reading the engine's debug log.)

## With nothing running

The pane with no run to draw is still the pane. It opens with the same bar, and
under it the session's runs in the same grouping, the same state glyphs and the
same clock the menu uses, to the same second — each one a press, which draws it.

```
────────────────────────────────────────────────────────
▮ flowpane │ nothing running         4 runs this session
────────────────────────────────────────────────────────

  ✔ Done ────────────────────────
  ✔ demo   26/26         05:53:10
  ✖ Failed ──────────────────────
  ✖ audit   2/10  Sep 14 07:53:44
  ⊘ Stopped ─────────────────────
  ⊘ audit   6/10         12:23:09
  ⊘ audit   7/11         11:29:52

  Press a run to draw it.
```

It used to clear the canvas to nothing, put a sentence under it, and list the
runs in a native chooser below that. So the thing the pane is for sat in a list
under an empty rectangle the height of the seat, and the empty rectangle was the
largest thing on screen — a pane that looked broken rather than idle. The
sentence has gone with it: the drawing says what the session has run, which is
both the answer and the way through to it.

The names and the tallies each take a column of their own. A session's runs are
mostly the same workflow over and over, so the names repeat and how far each got
is the only thing that differs — down a column it can be read, along a ragged
line it cannot.

A session with nothing to list gets the one thing left to say:

```
  No workflow has run in this session yet.

  Start one and its graph draws itself here as it goes.
```

The chooser under the footer is what a build with no `Button` falls back to.
Where there are Buttons the drawing is the list, live or idle, and a chooser
under it would be the same list twice.
