# Engine constraints worth knowing

What the function-hooks API allows, and what it does not.

- `ui.render` is the only render hook; the components it can take over are
  `AskUserQuestion | UserMessage | AssistantMessage | ToolUse | ToolResult |
  ToolGroup | CommandOutput | Spinner | TurnDuration | InfoNotice | SessionMode |
  PromptHint | AbovePrompt | Pane`.
- `Raster` is a real canvas: `columns × rows` cells of
  `[codePoint, foreground, background]` u32s, base64, 24-bit color, up to
  512×256. Every code point must be one printable width-1 BMP character.
- `$.ui.blit` repaints a mounted Raster without re-rendering the tree, which is
  what lets the spinner run at 120ms off the renderer's clock.
- **A Raster is a leaf** — "no children, `hover` or `onPress` yet" — and `Box`
  lays out in a flex column with no way to overlap, so a Button cannot be put
  over one. A pane drawn as a single Raster therefore has nothing to click. The
  drawing is cut into bands instead: every row that carries a node's label is
  emitted as a row of `Text`s with a `Button` keyed `node:<agentId>` over the
  label's own cells, and the runs of rows between them — rules, edges, header,
  detail dialog, most of the picture — stay Rasters keyed by the row they start
  at. A frame blits each band by that key; the label rows are elements, which a
  blit does not touch, so they are re-rendered on every third frame. When the
  next picture would put a label on a different row, the cut has changed and the
  whole tree is rendered again rather than blitted into the old one.
- **A row is as wide as the drawing, not as wide as the seat.** A `Raster` is
  born with its `columns`, but a `Box` left to itself stretches to the pane's
  own width. The canvas is made at the `bodyColumns` the render reports, which
  is not the same number: a pane 90 columns across says its body is 84. The
  rows carrying a node's label painted their ground six cells past every Raster
  beside them, and the drawing had a step down its
  right edge on those rows alone. Every row is pinned to the canvas's own
  columns, so the ground ends where the picture ends. The footer takes the same
  width for the same reason.
- **A Raster's colours are not quite the colours it was given.** A cell carries
  two 24-bit colours in the encoding, but the surface keeps four bits a channel
  and rounds each to the nearest seventeenth, so a Raster draws `#282828` as
  `#222222`. An element's colour is not rounded at all. Handing both kinds of
  row the same ground therefore drew them six values apart, and every row that
  carried a node's label had a band across the width of the
  pane — the same rounding made a card's top border, which is an element row, a
  slightly different grey from its sides, which are not. `cellColor()` in
  `hooks/canvas.ts` rounds a colour the way the Raster will before it is written
  as hex, so both kinds of row land on one value. `tests/pane.test.ts` reads the
  ground out of the Raster's own cells and asserts the element rows carry it.
- **Nothing the engine writes records when a run started, except a file's
  mtime.** A journal line carries no timestamp and no run name; an agent's
  `.meta.json` carries its model and its phase but no clock; the run summary
  carries the engine's own figures and is not written until the run is over.
  `$.fs.stat` gives `{kind, size, mtimeMs}` — no birth time — and `$.fs.list`
  gives no times at all. So a run still going is timed by the mtimes of the
  files it has already written: the persisted script for the launch, each
  agent's `.meta.json` for its spawn, each agent's transcript for its last sign
  of life. Measured against the summary those land within 740ms, and the
  durations they give within 45ms.
- **No engine API lists a session's live workflow runs.** `BackgroundTaskSummary`
  carries a workflow task's `name`, but it is only on the shell `Stop` and
  `SubagentStop` hook inputs, and `$.agent.list()` documents itself as not
  naming them: "A workflow's agents and the engine's own forks (compaction,
  memory) carry ids no list names." The files are the only source.
- A hooks module runs with **no Node and no DOM**, so `Buffer` is unavailable —
  cells are encoded with `Uint8Array.toBase64`.
- The engine follows `$` statically: it may only be passed to functions declared
  at the top of the module. A helper nested in `register()` is refused at load
  with *"`$` is passed to X, which is not a function declared at the top of this
  file"*. That is why state lives in a module-level `state` object here.
- A Button's `onPress` is not a hook and never sees `$` — the architecture note
  calls it "that dispatch's ⊥, what `next(e)` resolves to beneath every
  `ui.press` hook". So a press records what was pressed, and the plugin's own
  `ui.press` hook (which does have `$`) does the work.
- `userConfig` fields are JSON-Schema shaped and take `title`, not `label`; this
  build's validator rejects `enum`, so a constrained field is a plain string
  validated in `register`.
