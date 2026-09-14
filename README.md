# wfpane — a live DAG pane for Claude Code workflows

Replaces the default `Workflow` progress list with a phase-by-phase graph drawn
beside the transcript: one column per phase, agents as nodes, barriers and
carries as edges, repainted about eight times a second while the run is live.

Built on Claude Code **function hooks** (Claude Mods), the early-access plugin
API from [anthropics/claude-code#91870](https://github.com/anthropics/claude-code/issues/91870).

## Running it

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir ~/claude-mods/wfpane
```

Then run any workflow. The pane opens on launch; `/wf` toggles it afterwards.
Click a node to open its detail panel — what it was asked, what tools it called,
what it answered — and click it again to close. The footer button switches the
layout between across, down, and whichever fits.

A node drops the phase from the front of its own name: under a column headed
Gather, `gather:rivers` draws as `rivers`. The header already said the phase,
and in a run whose agents are named `<phase>:<topic>` those are the cells that
carry the topic — the only part that tells one agent of a phase from its
siblings. A name that does not start with its phase is left alone.

## Where the pane sits

The drawing has three homes, and the footer button (hotkey `2`) cycles them;
`/wf pane|band|below` names one directly. The choice is kept in `$.store`, so
it survives a reload and the next session.

| Site | Where it is | Notes |
| --- | --- | --- |
| `pane` | A pane the surface seats: docked beside the transcript in the fullscreen renderer from 110 columns, inline above the prompt otherwise | `paneRows` asks for a height in the inline seat; the dock ignores it |
| `band` | The `AbovePrompt` band: full width, directly above the prompt, in any renderer | `bandRows` sets how tall, up to the band's own `maxRows` |
| `below` | The `PromptHint` line under the prompt, the one site beneath it a hook may draw a tree in | `bandRows` sets how tall; no hotkeys are armed there, so buttons want a Tab; the engine's hint line stays as the first row |

**Full width along the bottom is the band.** A pane cannot be moved there by a
plugin — its `placement` is read-only at `ui.render` and a hook that rewrites it
fails — so the band is a different render site rather than a moved pane. It also
arms its Buttons' hotkeys, which a pane does not: `2` moves the drawing, `3`
switches the layout, `4` closes the detail panel.

The band wraps whatever the engine already draws there rather than replacing it,
and stands down while a survey holds the band.

Two things about the seats on Claude Code 2.1.270, both found by driving a pty
session (`dev/drive.py`) and reading the engine's debug log:

- **Under `/tui default` (the main-screen renderer) a pane never draws.**
  `$.ui.open` succeeds, `ui.close` later says the pane was open, but no `Pane`
  render is ever dispatched and nothing is seated. Fullscreen docks it beside the
  transcript from 110 columns. If the drawing has to sit full width at the
  bottom, the band is the only seat that does it on either renderer.
- **The band's `AbovePrompt` props carry no `bodyColumns`** on 2.1.270 (the
  declarations that name it are 2.1.271's). A width read straight off the props
  is `NaN`, the canvas gets no cells, and every band row draws empty while the
  footer under it draws fine. The band reads `e.viewport.columns` instead, and
  the canvas refuses a non-finite size.

## Controls

The footer under the drawing carries them. Hotkeys are armed in the band
(`AbovePrompt`); in a pane, click or Tab to a button and press Enter.

| Control | Key | What it does |
| --- | --- | --- |
| Settings | `1` | swaps the run line for the settings row, and back |
| Draw beside the transcript / above the prompt / under it | `2` | cycles the three seats; remembered in `$.store` |
| Layout | `3` | across → down → timeline → fits the shape |
| Close detail | `4` | closes the selected agent's panel |
| ▲ / ▼ | `5` / `6` | scrolls the detail list three lines |
| Detail / Panel `−` `+` | — | sizes whichever shape the detail is in: a column by four cells, a strip by two rows |
| A node's label | click | opens that agent's detail panel; click again to close |
| Run list | — | a `Select` under the footer once a session has more than one run; switching it moves the drawing to that run, live or finished |

The hint line under the prompt (`site: below`) draws no Buttons — the engine
does not focus it — so there the footer names `/wf help` instead, and the
commands below are the whole control surface. They work at every seat:

| Command | What it does |
| --- | --- |
| `/wf` | opens the view, or closes it if it is already open |
| `/wf pane` \| `band` \| `below` | moves it to that seat |
| `/wf runs` | lists this session's runs, numbered |
| `/wf <n>` | shows run `<n>` from that list |
| `/wf across` \| `down` \| `timeline` \| `fits` | lays the graph out |
| `/wf detail <n>` | rows the detail strip takes (4–20) |
| `/wf height <n>` | rows the drawing takes in the band (8–40) |
| `/wf backdrop on` \| `off` | paints on an opaque ground, or the terminal's own |
| `/wf help` | prints the above |

A run still going when the plugin reloads is picked back up: the mod walks the
session's own transcripts on `session.start` and on a `/wf` that finds nothing
running, so `/wf` works on a run it never watched start. Finished and stopped
runs are not brought back — the pane is for watching, not for a museum of runs —
though a run this module watched land stays until the next one starts. With
nothing to show, `/wf` closes the pane rather than leaving an empty one open.

## Settings

`/plugin configure wfpane`, or `pluginConfigs` in settings.json:

| Field | Values | What it does |
| --- | --- | --- |
| `orientation` | `auto` (default), `flow`, `stack`, `time` | `flow` runs the phases across the pane, `stack` runs them down it, `auto` follows the pane's proportions. Below the width a stacked band needs for legible boxes, `stack` becomes a list: one agent per row under each phase. `time` swaps the graph for a timeline: one bar per agent against the clock, grouped by phase, with a marker where now is. |
| `detailRows` | 5–32 (default 16) | Rows the detail strip takes when a node is selected, capped at half the canvas. |
| `paneRows` | 6–80 (0 = let the layout decide) | Rows the pane asks for in the inline seat. Ignored by the dock. |
| `site` | `pane` (default), `band`, `below` | Where the drawing goes: beside the transcript, in the band above the prompt, or in the hint line under it. The footer button (`2`) cycles them, `/wf pane\|band\|below` names one, and the choice is remembered. |
| `bandRows` | 8–40 (default 16) | Rows the drawing takes in the band. The `−`/`+` buttons change it live and remember it. |
| `backdrop` | `on` (default), `off` | `on` paints the band on an opaque dark ground, footer included. `off` leaves the cells' background unset, so the terminal's own shows through: the drawing is transparent by construction, since a cell with no background colour is the terminal's. |

## The detail strip

A click on a node (or Tab to it and Enter) opens the strip across the bottom.
It heads with the agent's name and its facts — phase, elapsed, tokens, how many
model requests it made, how many tool calls, a retry count, the model. Under
that, **Asked** and **Called** sit side by side divided by a rule, and **Said**
takes a row of its own across the full width beneath them:

- **Asked**: the prompt, from the agent's own transcript.
- **Called**: every tool call in order — its outcome mark, tool, duration, the
  model request that issued it and that request's tokens — then the payload it
  was passed and what came back, wrapped rather than elided, because what a
  call was *about* is usually why the detail was opened. Tokens belong to a
  request, not a call, so two calls from one request show the same figure; the
  `req n` says so. A call read back from a transcript has no clock, so it shows
  no duration rather than one measured from zero.
- **Saying** while a request runs, **Said** once there is an answer.

What the agent was given and what it did are two halves of one question, so
they read side by side; what it answered is the outcome of both, and an answer
is prose, which in a third of a pane wraps every four words. Each column needs
about forty cells, so a narrow strip shows fewer blocks rather than unreadable
ones.

Tool payloads are read from the agent's own transcript, so a run recovered from
disk shows the same calls as one this module watched happen — the summary alone
knows a tool's name and a count, and nothing about what the call did.

A bar down each column shows where its window is when it has more than fits.
One scroll position moves every column at once, each clamped to its own length:
separate positions would need a focused column to aim them at, and there is
nothing on the footer to say which column has the focus. The ▲/▼ buttons move
it three lines (`5` and `6` in the band).
The wheel does not reach it yet: 2.1.271's declarations add a `ui.scroll` event
(a wheel tick or scroll key over a pane body or the band, which a hook may
answer by scrolling its own rows), but 2.1.270 refuses a hook on it at load, so
the strip scrolls by its buttons until the engine catches up.

A run has four states, and the pane says which: `running`, `completed`,
`failed`, and `stopped` — the last for a run that was killed part way. An agent
with no result of its own when its run ends is drawn `⊝` rather than left
spinning, and does not count toward a phase's landed total.

Iterate on the drawing without a session:

```bash
bun dev/preview.ts                    # a synthetic review/verify pipeline
bun dev/preview.ts --animate          # the same run playing out
bun dev/preview.ts --journal <dir>    # a real run's transcript directory
bun dev/stress.ts                     # wide fan-outs and a narrow body
bunx tsc --noEmit                     # typecheck against types/claude-code.d.ts
```

And with a session, without watching it: `dev/drive.py` gives Claude Code a pty,
types a prompt, then keys at offsets (`--after '30:/wf\r'`), and keeps the raw
screen and (with `--debug-file`) the engine's log. Loading the plugin with
`--plugin-dir` and disabling the skills-dir copy keeps the test's `$.store`
apart from the one the real session writes:

```bash
python3 dev/drive.py --cols 140 --rows 40 --seconds 45 --cwd "$PWD" \
  --out dev/cap.raw --plugin-dir "$PWD" \
  --prompt 'Call the Workflow tool now with name "wfpane-tiny".' \
  --after '34:/wf\r' -- --model haiku --debug-file dev/cap-debug.log \
  --settings '{"enabledPlugins":{"wfpane@skills-dir":false},"pluginConfigs":{"wfpane@inline":{"options":{"site":"band"}}}}'
```

`wfpane-tiny` is one haiku agent, saved under `~/.claude/workflows/`, the
smallest run that opens the pane.

## How it gets its data

The pane is fed by two files the engine already writes, because the hook events
alone are not enough:

| Source | Carries | When |
| --- | --- | --- |
| `tool.call` on `Workflow` | `runId`, `transcriptDir`, `workflowName` | at launch — the tool returns as soon as the run registers, so this is seconds before the first agent |
| `<transcriptDir>/journal.jsonl` | `{type:"started",agentId,label,phase}`, `{type:"result",agentId,result}` | live, as the run goes |
| `<session>/workflows/<runId>.json` | final status, per-agent `startedAt`, `durationMs`, `tokens`, `model`, the run's return value | once, at the end |
| `tool.call`, unmatched | every subagent's tool call, with the `agentId` the journal names | live, around each call |
| `turn.step` | every model request a subagent makes, with its `agentId`: the text as it streams and the request's `usage` at its stop | live, chunk by chunk |
| `<transcriptDir>/agent-<id>.jsonl` | the prompt the agent was given and the text it answered | when its detail strip is opened |

`turn.step` is what makes the pane honest about a running agent. The hook is an
async generator that forwards every chunk untouched and only watches them go by,
so a node says `thinking` (or the tail of what the model is saying) while a
request streams, its token count climbs request by request rather than landing
once at the end, and the header sums the spend across the run. The four usage
counts are added the same way the run summary adds them, so the live figure
lands on the final one. An agent nothing has been heard from — no chunk, no tool
call — for 45 seconds is marked `quiet` in the warning colour, and the header
counts them, which is how a hung agent is told from a slow one before the run
itself times out.

The run summary's `attempt`, `toolCalls`, `lastToolName` and `logs` are folded in
too: a retried agent's detail strip says `try 2`, a run this module never watched
still shows its last tool call, and a finished run with no return value shows the
last thing the script `log()`ged in the header.

A workflow subagent's tool calls run through the same `tool.call` chain as the
main loop's, carrying `agentId`, so "what is this agent doing right now" needs
no polling: the hook wraps the call, and the node shows the tool while it runs
and the count once it lands.

Classic settings hooks were the first thing tried and are the wrong tool here:
`PostToolUse` on `Workflow` fires ~50ms in with `status: "async_launched"`, and
`SubagentStop` fires per workflow agent but carries no phase, no label and no
start — completion events only, nothing to animate.

## What is inferred, and how it is drawn

No dependency field exists anywhere the engine writes — not in `journal.jsonl`,
not in the per-agent `.meta.json`, not in the run summary. The graph is derived,
and the three kinds are drawn differently on purpose:

- **Barrier** — a spine in the gutter between two phases, every agent of the
  earlier phase feeding it and every agent of the later one fed from it. This is
  a fact: a later phase runs after what the script awaited in the earlier one.
  It also keeps the line count at `n + m` instead of `n × m`.
- **Flow** — a solid edge, drawn where one agent's answer appears verbatim in
  another's prompt. That is how a workflow passes a result along, so finding it
  is a record of what actually flowed rather than a guess about it. Both sides
  come from `promptPreview` and `resultPreview` in the run summary the pane
  already reads, so this costs no extra file. They are capped near four hundred
  characters, so a prompt that quotes its source late can hide the overlap and
  go unfound — which is the safe way to be wrong, since the carry below still
  says the same thing more weakly.
- **Carry** — a dashed edge, read off labels that share a token unique to both
  sides (`review:bugs` → `verify:bugs`, the shape `pipeline()` makes). Dimmed
  and dashed, because a label convention is a hint, not a record. When every
  agent of a lane carries, the barrier steps back and the carries draw alone.

A flow may skip a phase — a revision takes the draft as well as the critique of
it, and a join takes the revisions rather than the word-counts beside them. An
edge over more than one lane cannot run straight without crossing the nodes in
between, so it detours: laid out across, it drops into one of the empty rows
between node rows; laid out downward, into one of the empty columns between
node columns. Without that, a stacked run drew a horizontal line clean through
every node of the band it crossed.

Matching every answer against every prompt is cheap once and wasteful eight
times a second, so the result is memoised against a stamp of each agent's id and
text lengths — which changes exactly when an edge could have.

A running node has no honest progress bar, so it gets a highlight travelling its
border instead: it says *alive*, at the same speed for every node.

The **timeline** (`orientation: time`, or the layout button) is the same run seen
from the side: one row per agent, its bar from start to landing on a time axis,
rows grouped by phase in the graph's order, a dashed marker down the column where
now is. The graph says what fed what; the timeline says what waited on what, and
the longest chain of bars is the critical path the node meters can only hint at.
A bar's numbers ride after it where there is room, before it when it runs up
against the clock (every running bar does), and inside it when neither fits.

## Engine constraints worth knowing

- `ui.render` is the only render hook; the components it can take over are
  `AskUserQuestion | UserMessage | AssistantMessage | ToolUse | ToolResult |
  ToolGroup | CommandOutput | Spinner | TurnDuration | InfoNotice | SessionMode |
  PromptHint | AbovePrompt | Pane`.
- `Raster` is a real canvas: `columns × rows` cells of
  `[codePoint, foreground, background]` u32s, base64, 24-bit color, up to
  512×256. Every code point must be one printable width-1 BMP character.
- `$.ui.blit` repaints a mounted Raster without re-rendering the tree, which is
  what lets the spinner run at 120ms off the renderer's clock.
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

## Status

Loads and runs on Claude Code 2.1.270: hooks register, `/wf` lists, the launch
hook fires and reads the journal. The Pane's own drawing is exercised by
`dev/preview.ts` and `dev/stress.ts`, and needs an interactive terminal to see in
place. `tests/pane.test.ts` is written against the `claude-code/testing` kit,
which ships with `claude plugin test` — not present in 2.1.270.
