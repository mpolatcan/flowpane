/**
 * The workflow pane.
 *
 * `tool.call` on Workflow catches the launch and reads the run's identity off
 * the result the engine hands back — the tool returns as soon as the run is
 * registered, so this fires seconds before the first agent lands. The pane opens
 * there, a timer tails the run's `journal.jsonl` and repaints, and `ui.render`
 * on the Pane hands the engine the drawing.
 *
 * The same `tool.call` chain carries every subagent's tool call, with the
 * `agentId` the journal names, so what an agent is doing right now needs no
 * polling: it arrives as an event, before and after the call.
 *
 * Repaints go through `$.ui.blit` where the surface has a Raster, which replaces
 * its cells without re-rendering the tree; otherwise through `$.ui.invalidate`.
 *
 * Every helper that takes `$` is declared at the top of this file: the engine
 * follows `$` statically and refuses a module that hands it to a closure, so the
 * pane's state lives in `state` here rather than in `register`'s scope.
 */

import type { EngineInterface, On, PluginOptions, Timer } from 'claude-code'

import { Canvas, cellColor, DEFAULT_COLOR } from './canvas'
import {
  applyFileClock,
  applyJournal,
  applyRunFile,
  readAgentMeta,
  inputOf,
  noteCallEnd,
  noteCallStart,
  noteStep,
  noteToolCall,
  phasesOfScript,
  readAgentTranscript,
  runFileOf,
  runOfScriptName,
  tokensOfUsage,
  type RunState,
} from './journal'
import { aboutText, NAME, VERSION } from './about'
import type { Orientation } from './layout'
import {
  ABOUT,
  paint,
  paintIdle,
  quietOf,
  SETTINGS,
  useTheme,
  type BodyScroll,
  type DetailView,
  type Hotspot,
  type PaintOptions,
  type PaintResult,
  type RunEntry,
  type SettingMenu,
} from './paint'
import { applyPress, drew, MAX_DETAIL, MIN_DETAIL, ORIENTATIONS, showDetail, wheel } from './press'
import { DEFAULT_THEME, hexOf, paletteOf, themeOf, THEMES } from './theme'
import { bandsOf, pictureOf, type Band } from './tree'

const PANE_ID = 'flowpane'
/**
 * The command the pane answers to, exported because `dev/recover.ts` keys its
 * handler table by it: a second spelling of the name in the tools is a rename
 * that typechecks, passes the suite, and breaks the tool at call time.
 */
export const COMMAND = 'flowpane'
/** With a Raster, frames are blitted and can run at animation speed. */
const FRAME_MS = 120
/** Without one, every frame is a re-render, so they come slower. */
const FRAME_MS_REDRAW = 320
/** Journal reads are cheaper than frames; one every fourth. */
const READ_EVERY = 4
/**
 * A node's label is an element, not a cell, so a blit does not touch it: its
 * spinner and its colour only move when the tree is built again. That is the
 * expensive path, so it runs on every third frame rather than on each one.
 */
const REDRAW_EVERY = 3
/** What the detail dialog's height is allowed to be, at the controls and at `/flowpane detail`. */
/** The pane's opaque backdrop: the theme's own ground. */
function backdropOf(): number {
  return themeOf(state.theme).bg
}

/** What a control under the pointer is drawn in: the pane's own selection colour. */
function accentHex(): string {
  return paneHex(paletteOf(themeOf(state.theme)).accent)
}

/**
 * One color as an element takes it. Rounded to the four bits a channel a Raster
 * keeps, so a row drawn as elements sits on the same ground as the cells above
 * and below it rather than a few values off it.
 */
function paneHex(color: number): string {
  return hexOf(cellColor(color))
}

/**
 * What a surface that draws no Buttons points at instead.
 *
 * Spelled from `COMMAND` rather than written out, because this string is drawn
 * in exactly one seat — the footer of a surface with no Button in its table —
 * and a seat nothing renders is a seat a rename can leave behind pointing at a
 * command that no longer answers.
 */
const HELP_HINT = `/${COMMAND} help`
/** Calls the engine gave no `tool_use_id`; a counter names them instead. */
let callCounter = 0

type Launch = {
  status?: string
  runId?: string
  workflowName?: string
  summary?: string
  transcriptDir?: string
}

const state: {
  runs: RunState[]
  shown: RunState | null
  canvas: Canvas | null
  /** How the last render cut the drawing up, so a frame can blit the same bands. */
  bands: Band[]
  /**
   * What was last written into each band, so a band that has not changed is not
   * written again.
   *
   * Every frame used to send every band. A pane a hundred and twenty columns
   * by forty is five thousand cells, twelve bytes each, and at eight frames a
   * second that is most of a megabyte a second crossing the wire to say that
   * nothing moved — because most of it has not: the cards of the agents that
   * already landed are the same cells they were a minute ago, and what changes
   * is the spinner, the clock on the top bar and the rows of whatever is still
   * running.
   */
  sent: Map<string, string>
  timer: Timer | null
  tick: number
  isPaneOpen: boolean
  size: { columns: number; rows: number } | null
  /** Whether this build's terminal table has a Raster (2.1.271 and after). */
  hasRaster: boolean
  hotspots: Hotspot[]
  /** The agent whose detail dialog is open, or `@run:<phase>` for a nested run. */
  selectedId: string | null
  /** The nested run an open agent was reached from, for the way back. */
  fromRun: string | null
  /** The tool call opened out of that agent's Calls list, by its own id. */
  openCall: string | null
  /** The first line on screen in the opened call. */
  callScroll: number
  callOutScroll: number
  /** Set by a Button's onPress, acted on by the `ui.press` hook, which has `$`. */
  pressed: string | null
  /** Agents whose transcript has been read, so it is read once. */
  loaded: Set<string>
  /** Agents whose `.meta.json` has been asked for, so it is asked for once. */
  models: Set<string>
  /**
   * `<agentId>:<state>` for each agent whose clock has been read off its files,
   * so the pair is read once when the agent appears and once after it stops.
   */
  clocks: Set<string>
  orientation: Orientation
  detailRows: number
  /** Which palette the drawing is painted in. */
  theme: string
  /** Rows the pane asks for while seated inline above the prompt. */
  paneRows: number | null
  /** The last time a frame ran, for hooks that must not await the clock. */
  nowMs: number
  /** The first line on screen in each block of the detail dialog. */
  detailScroll: number[]
  /** Which of the detail dialog's tabs is on top; kept across nodes. */
  detailTab: number
  /** What the last paint said about the detail list, for clamping a scroll. */
  detailView: DetailView | null
  /** Where the body is in a drawing larger than it, in cells. */
  bodyScroll: { x: number; y: number }
  /** The nested runs the reader has unfolded, by phase name. */
  opened: string[]
  /** What the last paint said the drawing overruns the body by, for clamping. */
  bodyView: BodyScroll | null
  /** Whether the body follows the phase the run is working in. */
  following: boolean
  /** The phase the last paint said the run was working in, to see it change. */
  front: string | null
  /** True while the run name's list is unrolled under the top bar. */
  picking: boolean
  /** True while the settings dialog is open over the drawing. */
  settings: boolean
  /** Which setting's list is unrolled inside that dialog, if any. */
  menu: SettingMenu | null
  /** True while the About dialog is open over the drawing. */
  about: boolean
  /** Whether this build's table has a Button, so the run's name can be pressed. */
  canChoose: boolean
} = {
  runs: [],
  shown: null,
  canvas: null,
  bands: [],
  sent: new Map(),
  timer: null,
  tick: 0,
  isPaneOpen: false,
  size: null,
  hasRaster: true,
  hotspots: [],
  selectedId: null,
  fromRun: null,
  openCall: null,
  callScroll: 0,
  callOutScroll: 0,
  pressed: null,
  loaded: new Set(),
  models: new Set(),
  clocks: new Set(),
  orientation: 'auto',
  detailRows: 24,
  theme: DEFAULT_THEME,
  paneRows: null,
  nowMs: 0,
  detailScroll: [],
  detailTab: 0,
  detailView: null,
  bodyScroll: { x: 0, y: 0 },
  opened: [],
  bodyView: null,
  following: true,
  front: null,
  picking: false,
  settings: false,
  menu: null,
  about: false,
  canChoose: true,
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Reads whatever `unknown` a tool result is into a launch record. */
function launchOf(value: unknown): Launch | null {
  const raw = typeof value === 'string' ? tryParse(value) : value

  if (!raw || typeof raw !== 'object') {
    return null
  }

  const launch = raw as Launch

  return launch.runId && launch.transcriptDir ? launch : null
}

function runOfAgent(agentId: string): RunState | undefined {
  return state.runs.find(run => run.agents.some(a => a.agentId === agentId))
}

function stopTimer(): void {
  state.timer?.cancel()
  state.timer = null
}

/**
 * Finds the runs this session has already made, by walking the files the engine
 * wrote for them.
 *
 * A module reload starts with an empty run list while the session's panes and
 * its runs are still there, so the pane would claim nothing had run. Two kinds
 * of run are on disk and they are found different ways: a run that is over has
 * a summary, and a run that is still going has only the script it was launched
 * from.
 */
async function recoverRuns($: EngineInterface): Promise<void> {
  const home = await $.env.get('HOME')
  const sessionId = await $.session.id()

  if (!home || !sessionId) {
    return
  }

  const projects = `${home}/.claude/projects`

  if (!(await $.fs.exists(projects))) {
    return
  }

  for (const entry of await $.fs.list(projects)) {
    if (entry.kind !== 'dir') {
      continue
    }

    const base = `${projects}/${entry.name}/${sessionId}`

    if (!(await $.fs.exists(`${base}/workflows`))) {
      continue
    }

    await recoverEnded($, base)
    await recoverLive($, base)

    break
  }

  state.runs.sort((a, b) => a.startedMs - b.startedMs)
}

/** The runs of this session that are over, from the summary each one wrote. */
async function recoverEnded($: EngineInterface, base: string): Promise<void> {
  const dir = `${base}/workflows`

  for (const file of await $.fs.list(dir)) {
    // A run's summary is named for the run. The engine keeps its own
    // bookkeeping in the same directory — `.skipped-runs.json` among it —
    // and a file that is not a run has no agents, no clock and no status,
    // so it listed as a run that had just started and never moved.
    if (!/^wf_.+\.json$/.test(file.name)) {
      continue
    }

    const runId = file.name.replace(/\.json$/, '')

    if (state.runs.some(r => r.runId === runId)) {
      continue
    }

    const summary = await $.fs.read(`${dir}/${file.name}`)
    const run = blankRun(base, runId, nameOf(summary) ?? runId)

    // The journal first, then the summary, and never the other way round.
    // The journal says an agent landed but not when: the reader stamps it
    // with the moment it read the line, which for a run recovered after the
    // fact is now. The summary carries the engine's own clock, so it has to
    // be the one that settles every row — otherwise a run that took two
    // minutes yesterday draws as having taken until today.
    await readJournal($, run)

    applyRunFile(run, summary, await $.clock.now())

    state.runs.push(run)
  }
}

/**
 * The runs of this session that are still going.
 *
 * A summary is written when a run ends, so the walk above finds only the runs
 * that are over: a workflow already in flight when the plugin loaded was
 * missing from the list, and the one run a reader most wants to watch was the
 * one run the pane could not offer. The engine persists each run's script at
 * launch, under a name carrying both the workflow's name and the run's id, so
 * the script is what says a run exists before there is anything to summarise.
 * Its mtime is the launch, to the second, which the journal does not record
 * either.
 */
async function recoverLive($: EngineInterface, base: string): Promise<void> {
  const dir = `${base}/workflows/scripts`

  if (!(await $.fs.exists(dir))) {
    return
  }

  for (const file of await $.fs.list(dir)) {
    const named = runOfScriptName(file.name)

    if (!named || state.runs.some(r => r.runId === named.runId)) {
      continue
    }

    const path = `${dir}/${file.name}`
    const run = blankRun(base, named.runId, named.name)

    run.startedMs = Math.round((await $.fs.stat(path)).mtimeMs)
    run.plan = phasesOfScript(await $.fs.read(path))
    run.phases = run.plan.map(step => step.title)

    await readJournal($, run)
    await readClocks($, run)

    state.runs.push(run)
  }
}

/** A run with nothing read into it yet, at the paths its files will be at. */
function blankRun(base: string, runId: string, name: string): RunState {
  return {
    runId,
    name,
    summary: '',
    transcriptDir: `${base}/subagents/workflows/${runId}`,
    runFile: `${base}/workflows/${runId}.json`,
    startedMs: 0,
    status: 'running',
    phases: [],
    agents: [],
    consumed: 0,
    recovered: true,
  }
}

/** Folds in whatever the run's journal holds, if it has written one yet. */
async function readJournal($: EngineInterface, run: RunState): Promise<void> {
  const path = `${run.transcriptDir}/journal.jsonl`

  if (await $.fs.exists(path)) {
    applyJournal(run, await $.fs.read(path), await $.clock.now())
  }
}

/** When a file was last written, or nothing when it is not there. */
async function mtimeOf($: EngineInterface, path: string): Promise<number | undefined> {
  return (await $.fs.exists(path)) ? (await $.fs.stat(path)).mtimeMs : undefined
}

/**
 * Stamps the agents of a run rebuilt from disk with the clock its files carry.
 *
 * The journal says an agent started and that it landed, but not when, so a
 * reader that joined late stamps both with the moment it read the line: every
 * agent of a run adopted mid-flight drew as having started now and taken no
 * time at all. The summary would settle it, but a run still going has not
 * written one. Each agent leaves two files that are stamped for it — its
 * `.meta.json`, written when it is spawned, and its transcript, written to
 * until it stops — and those two mtimes come within a second of the figures
 * the summary gives later.
 */
async function readClocks($: EngineInterface, run: RunState): Promise<void> {
  for (const agent of run.agents) {
    const path = `${run.transcriptDir}/agent-${agent.agentId}`
    const key = `${agent.agentId}:${agent.state}`

    // Once when the agent is first seen, and once more after it stops: those
    // are the two moments its files have something new to say.
    if (!state.clocks.has(key)) {
      state.clocks.add(key)

      applyFileClock(agent, await mtimeOf($, `${path}.meta.json`), await mtimeOf($, `${path}.jsonl`))

      continue
    }

    // While it runs, its transcript's mtime keeps moving, and the pane reads
    // how long ago that was as how long the agent has been quiet.
    if (agent.state === 'running') {
      applyFileClock(agent, undefined, await mtimeOf($, `${path}.jsonl`))
    }
  }
}

/** The workflow's own name out of a summary file. */
function nameOf(text: string): string | null {
  const parsed = tryParse(text)

  return parsed && typeof parsed === 'object' && typeof (parsed as { workflowName?: unknown }).workflowName === 'string'
    ? (parsed as { workflowName: string }).workflowName
    : null
}

/** Reads the journal's new lines, and the summary once the run has written it. */
async function readRun($: EngineInterface, run: RunState, nowMs: number): Promise<void> {
  const journalPath = `${run.transcriptDir}/journal.jsonl`

  if (await $.fs.exists(journalPath)) {
    applyJournal(run, await $.fs.read(journalPath), nowMs)
  }

  if (run.status === 'running' && (await $.fs.exists(run.runFile))) {
    applyRunFile(run, await $.fs.read(run.runFile), nowMs)
  }

  // A run the pane was not there for is still being read line by line, and each
  // new line is stamped `nowMs` again. Until its summary lands, the files are
  // the only clock it has.
  if (run.recovered && run.status === 'running') {
    await readClocks($, run)
  }

  await readModels($, run)
}

/**
 * Fills in the model of any agent the summary has not named yet.
 *
 * The summary is the better source — it is one file for the whole run — but the
 * engine does not write it until there is a run to summarise, so early on there
 * is nothing to read. Each agent's own `.meta.json` is there from the moment it
 * is spawned, so the pane asks those instead, once per agent, and stops asking
 * as soon as one of the two answers.
 */
async function readModels($: EngineInterface, run: RunState): Promise<void> {
  for (const agent of run.agents) {
    if (agent.model || state.models.has(agent.agentId)) {
      continue
    }

    state.models.add(agent.agentId)

    const path = `${run.transcriptDir}/agent-${agent.agentId}.meta.json`

    if (await $.fs.exists(path)) {
      agent.model = readAgentMeta(await $.fs.read(path))
    }
  }
}

/**
 * Reads one agent's own transcript for the prompt it was given and the text it
 * answered with — read once per agent, when its detail dialog is first opened.
 */
async function loadDetail($: EngineInterface, run: RunState, agentId: string): Promise<void> {
  const row = run.agents.find(a => a.agentId === agentId)

  if (!row || state.loaded.has(agentId)) {
    return
  }

  const path = `${run.transcriptDir}/agent-${agentId}.jsonl`

  if (!(await $.fs.exists(path))) {
    return
  }

  const read = readAgentTranscript(await $.fs.read(path))

  row.prompt = read.prompt ?? row.prompt
  row.result = read.result ?? row.result

  // The live chain records calls as they happen and knows their timing; the
  // transcript knows only what was passed and what came back. So the transcript
  // fills the list for a run that was never watched, and stands aside for one
  // that was.
  if (read.calls.length > 0 && (row.calls?.length ?? 0) === 0) {
    row.calls = read.calls

    // The tally the pane counts tools by is filled by the live chain, which was
    // never running for a replayed run. Recovered from the same calls, so the
    // figures a reopened run shows are the ones it showed while it ran.
    if (row.tools.length === 0) {
      for (const call of read.calls) {
        const seen = row.tools.find(t => t.name === call.name)

        if (seen) {
          seen.count++
          seen.atMs = Math.max(seen.atMs, call.startedMs)
        } else {
          row.tools.push({ name: call.name, count: 1, atMs: call.startedMs, isRunning: false })
        }
      }
    }
  }

  // A running agent's transcript grows; only a finished one is read for good.
  if (row.state !== 'running') {
    state.loaded.add(agentId)
  }
}

/**
 * Whether the run's name at the top of the pane opens the list of the session's
 * other runs. One run is not a choice, and a build with no Button has no way to
 * press the name — there the list stays a chooser of its own under the footer.
 */
function canPickRun(): boolean {
  return state.canChoose && state.runs.length > 1
}

/**
 * What every paint of the shown run is drawn with.
 *
 * The blit between renders has to produce the same hotspots the render did, so
 * both paints read their options from here rather than each listing their own.
 */
/**
 * The body row the rail along the foot is on, when the drawing has one.
 *
 * The canvas is painted into the top of the pane's body and the footer rule and
 * row come under it, so the canvas's own last row is the body row a pointer
 * reports — and the rail is drawn on that row whenever the drawing overruns
 * sideways. A wheel over it scrolls sideways; anywhere else is a wheel over the
 * drawing.
 */
function footRow(): number | null {
  return state.canvas && (state.bodyView?.spanX ?? 0) > 0 ? state.canvas.rows - 1 : null
}

/** What the paint just decided, kept for the next press and the next paint. */
function kept(drawn: PaintResult): void {
  state.hotspots = drawn.hotspots
  state.detailView = drawn.detail ?? null
  state.bodyView = drawn.body ?? null

  drew(state, drawn)
}

function paintOptions(nowMs: number): PaintOptions {
  return {
    nowMs,
    tick: state.tick,
    orientation: state.orientation,
    selectedId: state.selectedId ?? undefined,
    fromRun: state.fromRun ?? undefined,
    openCall: state.openCall ?? undefined,
    callScroll: state.callScroll,
    callOutScroll: state.callOutScroll,
    detailRows: state.detailRows,
    detailScroll: state.detailScroll,
    detailTab: state.detailTab,
    bodyScroll: state.bodyScroll,
    follow: state.following,
    opened: state.opened,
    runPicker: canPickRun() ? (state.picking ? 'open' : 'shut') : undefined,
    runs: state.picking ? state.runs.map(runEntry) : undefined,
    settings: state.settings,
    menu: state.menu ?? undefined,
    about: state.about,
  }
}

/** Paints the shown run and pushes the drawing to the pane. */
function repaint($: EngineInterface, run: RunState, nowMs: number): void {
  if (!state.canvas || !state.isPaneOpen) {
    return
  }

  kept(paint(state.canvas, run, paintOptions(nowMs)))

  // Without a Raster there is nothing to blit into: the tree itself carries the
  // picture, so the redraw has to go through the renderer.
  if (!state.hasRaster) {
    $.ui.invalidate('ui.render')
    return
  }

  // A blit writes into the Rasters the last render mounted. When this frame
  // puts a node's label on a different row, those Rasters no longer cover the
  // rows they did, so the tree has to be built again before anything is written
  // into it.
  const bands = bandsOf(state.canvas.rows, state.hotspots)

  if (!sameBands(bands, state.bands)) {
    // The Rasters this frame would have written into are about to be replaced,
    // so what was written into the old ones says nothing about the new.
    state.sent.clear()
    $.ui.invalidate('ui.render')

    return
  }

  for (const band of bands) {
    if (!band.key) {
      continue
    }

    const cells = state.canvas.encode(band.from, band.rows)

    // Byte for byte what this band already holds: sending it again would draw
    // the same picture over itself.
    if (state.sent.get(band.key) === cells) {
      continue
    }

    state.sent.set(band.key, cells)

    void $.ui
      .blit({
        requestId: PANE_ID,
        key: band.key,
        cells,
      })
      // A write that did not land leaves the band holding whatever it held, so
      // the note that it was written has to go with it.
      .catch(() => state.sent.delete(band.key as string))
  }

  if (state.tick % REDRAW_EVERY === 0 && bands.some(b => !b.key)) {
    $.ui.invalidate('ui.render')
  }
}

/** Whether two cuts name the same Rasters over the same rows. */
function sameBands(a: Band[], b: Band[]): boolean {
  return (
    a.length === b.length &&
    a.every((band, i) => band.key === b[i].key && band.from === b[i].from && band.rows === b[i].rows)
  )
}

/** One frame: advance the spinner, read the journal on the slow beat, repaint. */
async function frame($: EngineInterface, run: RunState): Promise<void> {
  state.tick++

  const nowMs = await $.clock.now()

  state.nowMs = nowMs

  if (state.tick % READ_EVERY === 0 && run.status === 'running') {
    await readRun($, run, nowMs)
  }

  // A selected agent that is still working has more to say each time it is read.
  if (state.selectedId && state.tick % READ_EVERY === 0) {
    await loadDetail($, run, state.selectedId)
  }

  repaint($, run, nowMs)

  // A finished run keeps its last frame; nothing is left to animate once no
  // agent is running.
  if (run.status !== 'running' && !run.agents.some(a => a.state === 'running')) {
    stopTimer()
    repaint($, run, run.endedMs ?? nowMs)
  }
}

function startTimer($: EngineInterface, run: RunState): void {
  stopTimer()

  state.timer = $.clock.every(state.hasRaster ? FRAME_MS : FRAME_MS_REDRAW, () => {
    void frame($, run)
  })
}


/**
 * Opens the pane with no run on it: the idle view, which says nothing is
 * running and offers the session's earlier runs to look at.
 */
async function showIdle($: EngineInterface, focus: boolean): Promise<void> {
  state.shown = null
  state.picking = false
  showDetail(state, null)
  stopTimer()

  await $.ui.open(
    focus ? { id: PANE_ID, title: 'workflow', focus: true } : { id: PANE_ID, title: 'workflow' },
  )

  state.isPaneOpen = true
}

/** Opens the pane on a run and starts (or, for a finished run, skips) the timer. */
async function showRun($: EngineInterface, run: RunState, focus: boolean): Promise<void> {
  state.shown = run
  state.picking = false
  showDetail(state, null)

  // `rows` is what the pane asks for while the surface seats it inline above the
  // prompt — the full-width seat a session gets outside the fullscreen renderer.
  // The dock ignores it, so it costs nothing to send either way.
  const open: { id: string; title: string; focus?: true; rows?: number } = {
    id: PANE_ID,
    title: `workflow · ${run.name}`,
  }

  if (focus) {
    open.focus = true
  }

  if (state.paneRows) {
    open.rows = state.paneRows
  }

  await $.ui.open(open)

  state.isPaneOpen = true
  state.nowMs = await $.clock.now()

  await readRun($, run, state.nowMs)

  if (run.status === 'running') {
    startTimer($, run)
  } else {
    repaint($, run, run.endedMs ?? state.nowMs)
  }
}

/** Acts on whatever a Button's onPress recorded, now that `$` is in hand. */
async function actOnPress($: EngineInterface): Promise<void> {
  const pressed = state.pressed

  state.pressed = null

  if (!pressed) {
    return
  }

  // What the press means to the view is decided in `press.ts`, which knows
  // nothing about the engine; what is left here is the part that needs one.
  const result = applyPress(state, pressed, {
    hasRun: state.shown !== null,
    detail: state.detailView,
    body: state.bodyView,
  })

  for (const key of result.store ?? []) {
    await $.store.set(key, state[key])
  }

  if (result.run !== undefined) {
    const run = state.runs.find(r => r.runId === result.run)

    if (run) {
      // `showRun` retitles the pane, reads the run in, and starts or skips the
      // timer, whichever site the drawing is on.
      await showRun($, run, false)
    }
  }

  if (result.opened !== undefined && state.shown) {
    await loadDetail($, state.shown, result.opened)
  }

  state.nowMs = await $.clock.now()

  if (state.shown) {
    repaint($, state.shown, state.nowMs)
  }

  // A blit alone would leave the footer's button and the state beside it showing
  // what the pane used to be set to, and the idle view has nothing to blit into.
  $.ui.invalidate('ui.render')
}

/**
 * The layout words `/flowpane` takes, against the orientations they name.
 *
 * The first three name the axis the run reads along, which is what a reader
 * picking between them is choosing. They were `across` and `down`, which name
 * the same two axes in words the pane uses for a dozen other things — a card's
 * frame is drawn `across` and `down`, a band's rule runs `across` — so the one
 * place the word had to mean the layout was the one place it did not stand out.
 * `across` and `down` still work, unlisted, for anyone who learned them.
 */
const LAYOUT_WORDS: Record<string, Orientation> = {
  horizontal: 'horizontal',
  vertical: 'vertical',
  timeline: 'timeline',
  fits: 'auto',
  across: 'horizontal',
  down: 'vertical',
}

/**
 * What the orientations were called before 0.5.0, against their names now.
 *
 * Read separately from the words above because they are read for a different
 * reason: nobody picks one now. They are what the layout control wrote into the
 * store, and what the manifest documented its `orientation` setting as taking,
 * so a reader who picked a layout on an earlier build — or who set one in their
 * own config — has `flow`, `stack` or `time` saved. Read strictly that is not an
 * orientation at all: the preference was dropped on the way in and the pane came
 * back on `auto`, which reads as a control that does not hold rather than as a
 * rename. Consulted after the words a reader can type, so the surface the help
 * lists is the surface these three do not join.
 */
const WAS_CALLED: Record<string, Orientation> = {
  flow: 'horizontal',
  stack: 'vertical',
  time: 'timeline',
}

/**
 * Every form of the command, against what it does.
 *
 * The lines are built from `COMMAND` and padded to the widest of them rather
 * than laid out by hand: the name was written out seven times here once, and a
 * rename that missed one produced a help page that taught the wrong word.
 */
const HELP = ((forms: [string, string][]) => {
  const width = Math.max(...forms.map(([args]) => `/${COMMAND} ${args}`.trimEnd().length)) + 3

  return forms.map(([args, does]) => `${`/${COMMAND} ${args}`.trimEnd().padEnd(width)}${does}`).join('\n')
})([
  ['', 'open the pane, or close it'],
  ['runs', 'list this session’s runs'],
  ['<n>', 'show run <n>'],
  ['horizontal|vertical|timeline|fits', 'lay the graph out'],
  ['detail <n>', 'rows the detail dialog takes (5–32)'],
  ['theme [name]', 'list the palettes, or paint in one'],
  ['about', 'what the pane is, and what presses it'],
])

/**
 * A run's state as one character.
 *
 * The pane already says what the run is doing, in words, on its top line. A
 * chooser that says it again underneath means the same fact is on screen twice
 * in two different wordings, and a reader checks both. The mark is the same
 * vocabulary the nodes use, so it reads without a key.
 */
function markOf(run: RunState): string {
  return run.status === 'running'
    ? '\u25b8'
    : run.status === 'completed'
      ? '\u2714'
      : run.status === 'failed'
        ? '\u2716'
        : '\u2298'
}

/** One run as the list and the picker both name it. */
function runLine(run: RunState, index: number): string {
  return `${index + 1}. ${runLabel(run)}`
}

/** What a run is called, with what it is and how far it got. */
function runLabel(run: RunState): string {
  return `${markOf(run)} ${run.name}  ${tallyOf(run)}`
}

/** How many of a run's agents have landed, over how many it has. */
function tallyOf(run: RunState): string {
  const landed = run.agents.filter(a => a.state === 'done' || a.state === 'failed').length

  return `${landed}/${run.agents.length}`
}

/**
 * One run as the menu lists it. The menu draws the state, the name and the
 * clock in columns of their own, so it takes the parts rather than the line.
 */
function runEntry(run: RunState): RunEntry {
  return {
    id: run.runId,
    mark: markOf(run),
    name: run.name,
    tally: tallyOf(run),
    status: run.status,
    startedMs: run.startedMs,
  }
}

/**
 * `/flowpane` with something after it.
 *
 * Every choice the settings dialog offers is reachable here too. That is what
 * makes the hint line under the prompt a usable seat rather than a trap: it
 * draws no Buttons, so neither the dialog nor the button that opens it exists
 * there, and without these words there is no way back off it.
 */
async function applyArgs($: EngineInterface, args: string): Promise<string> {
  const words = args.split(/\s+/)
  const verb = words[0].toLowerCase()
  const rest = words[1]

  if (verb === 'help') {
    return HELP
  }

  // The same words the About dialog draws. This is the seat where a reader
  // needs them most: no pane, no buttons, and no way to press a name.
  if (verb === 'about') {
    return aboutText()
  }

  if (verb === 'runs') {
    if (state.runs.length === 0) {
      return 'No runs in this session yet. Launch a workflow and the view opens on it.'
    }

    return state.runs.map(runLine).join('\n')
  }

  if (verb === 'theme') {
    if (!rest) {
      return `Themes: ${THEMES.map(t => (t.name === state.theme ? `${t.name} (on)` : t.name)).join(', ')}.`
    }

    if (!THEMES.some(t => t.name === rest)) {
      return `No theme "${rest}". Themes: ${THEMES.map(t => t.name).join(', ')}.`
    }

    state.theme = rest
    useTheme(state.theme)

    await $.store.set('theme', state.theme)
    $.ui.invalidate('ui.render')

    return `Theme ${state.theme}.`
  }

  if (verb in LAYOUT_WORDS) {
    state.orientation = LAYOUT_WORDS[verb]

    await $.store.set('orientation', state.orientation)
    $.ui.invalidate('ui.render')

    return `${layoutLabel()}.`
  }

  const count = Number(rest)

  if (verb === 'detail' && Number.isFinite(count)) {
    state.detailRows = Math.max(MIN_DETAIL, Math.min(MAX_DETAIL, Math.floor(count)))

    await $.store.set('detailRows', state.detailRows)
    $.ui.invalidate('ui.render')

    return `Detail dialog ${state.detailRows} rows.`
  }

  // A bare number, or `run 2`, names a run in the order `/flowpane runs` listed them.
  const which = Number(verb === 'run' ? rest : verb)

  if (Number.isFinite(which)) {
    const run = state.runs[Math.floor(which) - 1]

    if (!run) {
      return state.runs.length === 0
        ? 'No runs in this session yet.'
        : `No run ${Math.floor(which)}. There ${state.runs.length === 1 ? 'is 1 run' : `are ${state.runs.length} runs`}; /flowpane runs lists them.`
    }

    await showRun($, run, true)
    $.ui.invalidate('ui.render')

    return runLine(run, state.runs.indexOf(run))
  }

  return `/flowpane takes no "${args}". ${HELP}`
}


/**
 * A layout by either name. The button and `/flowpane` say what the layout looks like
 * — horizontal, vertical, timeline, fits — and the setting is named after the axis it
 * uses. One vocabulary would be better; until the stored values can change, both
 * are read wherever a layout is named.
 */
export function orientationOf(value: unknown): Orientation | null {
  if (ORIENTATIONS.includes(value as Orientation)) {
    return value as Orientation
  }

  const word = String(value ?? '').toLowerCase()

  if (word in LAYOUT_WORDS) {
    return LAYOUT_WORDS[word]
  }

  return word in WAS_CALLED ? WAS_CALLED[word] : null
}


function readOptions(options: PluginOptions): void {
  const orientation = orientationOf(options.orientation)

  if (orientation) {
    state.orientation = orientation
  }

  const rows = Number(options.detailRows)

  if (Number.isFinite(rows) && rows >= 5 && rows <= 32) {
    state.detailRows = Math.floor(rows)
  }

  const pane = Number(options.paneRows)

  if (Number.isFinite(pane) && pane >= 6 && pane <= 80) {
    state.paneRows = Math.floor(pane)
  }

  if (typeof options.theme === 'string' && THEMES.some(t => t.name === options.theme)) {
    state.theme = options.theme
  }

  useTheme(state.theme)
}

/** The choices a person made with the buttons, kept across sessions. */
async function readStore($: EngineInterface): Promise<void> {
  const orientation = orientationOf(await $.store.get('orientation'))

  if (orientation) {
    state.orientation = orientation
  }

  const detailRows = Number(await $.store.get('detailRows'))

  if (Number.isFinite(detailRows) && detailRows >= 5 && detailRows <= 32) {
    state.detailRows = Math.floor(detailRows)
  }

  const theme = await $.store.get('theme')

  if (typeof theme === 'string' && THEMES.some(t => t.name === theme)) {
    state.theme = theme
  }

  useTheme(state.theme)
}

export function register(on: On, options: PluginOptions) {
  readOptions(options ?? {})

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const out = await next(e)
    const launch = launchOf((out as { result?: unknown }).result)

    if (!launch?.runId || !launch.transcriptDir) {
      return out
    }

    const script =
      typeof (e as { script?: unknown }).script === 'string' ? (e as { script: string }).script : ''
    const plan = phasesOfScript(script)

    const run: RunState = {
      runId: launch.runId,
      name: launch.workflowName ?? 'workflow',
      summary: launch.summary ?? '',
      transcriptDir: launch.transcriptDir,
      runFile: runFileOf(launch.transcriptDir, launch.runId),
      startedMs: await $.clock.now(),
      status: 'running',
      phases: plan.map(step => step.title),
      plan,
      agents: [],
      consumed: 0,
    }

    state.runs.push(run)

    await showRun($, run, false)

    return out
  })

  // Every other tool call: the subagents' own. The chain runs around the call,
  // so the node shows the tool while it runs and the count after it lands.
  on('tool.call', async ($, e, next) => {
    const agentId = (e as { agentId?: string }).agentId
    const tool = (e as { tool?: string }).tool

    if (!agentId || !tool) {
      return next(e)
    }

    const run = runOfAgent(agentId)

    if (!run) {
      return next(e)
    }

    // The frame clock may be stopped (the pane closed); the call's own time is
    // what a quiet agent is measured against.
    const startedMs = await $.clock.now()
    const id = (e as { tool_use_id?: string }).tool_use_id ?? `call-${++callCounter}`

    noteToolCall(run, agentId, tool, startedMs, true)
    noteCallStart(run, agentId, { id, name: tool, input: inputOf(e as Record<string, unknown>) }, startedMs)

    let outcome: { result?: unknown; text?: unknown; isError?: boolean } = {}

    try {
      const out = await next(e)

      outcome = (out ?? {}) as typeof outcome

      return out
    } catch (error) {
      outcome = { text: String(error), isError: true }
      throw error
    } finally {
      const endedMs = await $.clock.now()

      noteToolCall(run, agentId, tool, endedMs, false)
      noteCallEnd(run, agentId, id, endedMs, outcome)
    }
  })

  // Every model request a workflow agent makes streams through here with the
  // agent's id. The chunks pass on untouched; the hook only watches them go by,
  // which is how the pane knows an agent is thinking, what it is saying, and
  // what its requests have cost — before the run summary says any of it.
  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId
    const run = agentId ? runOfAgent(agentId) : undefined

    if (!agentId || !run) {
      return yield* next(e)
    }

    const nowMs = await $.clock.now()

    noteStep(run, agentId, nowMs, { kind: 'start' })

    try {
      for await (const chunk of next(e)) {
        if (chunk.kind === 'text') {
          noteStep(run, agentId, nowMs, { kind: 'text', text: chunk.text })
        } else if (chunk.kind === 'stop') {
          noteStep(run, agentId, nowMs, {
            kind: 'stop',
            tokens: chunk.usage ? tokensOfUsage(chunk.usage) : undefined,
            output: chunk.usage?.output_tokens,
          })
        }

        yield chunk
      }
    } finally {
      noteStep(run, agentId, nowMs, { kind: 'end' })
    }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID || e.surface !== 'terminal') {
      return next(e)
    }

    // The table is read loosely on purpose: `Raster` arrived in 2.1.271, and a
    // build without it must fall back rather than fail to compile against it.
    const table = (await $.ui.resolve(e)) as unknown as {
      Box: Element
      Text: Element
      Button?: Element
      Select?: Element
      Raster?: Element
    }
    const { Box, Text, Button, Select, Raster } = table

    state.hasRaster = typeof Raster === 'function'
    state.canChoose = typeof Button === 'function'
    state.isPaneOpen = true

    const run = state.shown
    const columns = columnsOf(e.props.bodyColumns, e.viewport?.columns)
    const chooser = picker(Select, run)
    // The footer takes a row, the rule above it one more, and the picker one
    // more again where it draws: a canvas sized to the whole seat would push
    // its own last line out of view. The settings cost nothing here — they are
    // a dialog over the drawing, not a row under it, so opening them takes no
    // row from the graph.
    const reserved = 2 + (chooser ? 1 : 0)
    const rows = Math.max(1, Math.max(6, e.props.scroll.bodyRows) - reserved)

    if (!state.canvas || state.size?.columns !== columns || state.size.rows !== rows || state.canvas.background !== groundColor()) {
      state.canvas = new Canvas(columns, rows, groundColor())
      state.size = { columns, rows }
    }

    if (run) {
      kept(paint(state.canvas, run, paintOptions(await $.clock.now())))
    } else {
      // Idle the pane draws what the session has run, so the last run's picture
      // is cleared and the list takes its place.
      const nowMs = await $.clock.now()

      state.hotspots = paintIdle(state.canvas, state.runs.map(runEntry), nowMs, paintOptions(nowMs))
      state.detailView = null
      state.bodyView = null
      state.front = null
    }

    // A Raster is a leaf, so a pane drawn as one whole has nothing to click.
    // `pictureOf` cuts it at the rows that carry a node's label and draws those
    // as elements, where the label becomes a Button; the cut comes back with it
    // so the next frame blits the same Rasters.
    const picture = pictureOf(state.canvas, { Box, Text, Button, Raster }, state.hotspots, pressNode)

    state.bands = picture.bands
    // These Rasters are mounted with the cells this paint produced, so what a
    // later frame has to compare against is what went out here.
    state.sent = new Map(
      picture.bands.flatMap(band =>
        band.key ? [[band.key, (state.canvas as Canvas).encode(band.from, band.rows)] as const] : [],
      ),
    )

    return Box({
      flexDirection: 'column',
      children: [
        ...picture.children,
        footerRule(Box, Text),
        footerRow(Box, Text, Button),
        ...(chooser ? [chooser] : []),
      ],
    }) as never
  })

  // The element's key names what was pressed, so the press is read off the
  // event rather than waited for from the Button's own handler: the tree is
  // redrawn several times a second while a run is live, and a press that lands
  // against a handler the last redraw replaced makes `next(e)` throw with
  // "no handler is held under handle N". The handlers stay as a fallback for
  // a surface that reaches them first.
  on('ui.press', { plugin: PANE_ID }, async ($, e, next) => {
    state.pressed = actionOfKey(e.element)

    let result

    try {
      result = await next(e)
    } catch {
      result = { element: e.element }
    }

    await actOnPress($)

    return result
  })

  on('ui.select', { plugin: PANE_ID }, async ($, e, next) => {
    if (e.element === 'run') {
      state.pressed = `run:${e.value}`
    }

    let result

    try {
      result = await next(e)
    } catch {
      result = { element: e.element, value: e.value }
    }

    await actOnPress($)

    return result
  })

  // The wheel over the pane. The pane paints one screenful and keeps its own
  // window, so the engine's scroll has nowhere to go — its tree is exactly as
  // tall as its body, and a reader turning the wheel over the drawing got
  // nothing. This answers instead, and deliberately does not call `next`: the
  // engine's own window stays where it is and the pane moves its own.
  //
  // The arrows in the margin stay. A wheel is what a reader reaches for without
  // looking, and a control that can be pressed is what says the drawing goes on
  // past the edge of the pane at all.
  on('ui.scroll', { requestId: PANE_ID }, async ($, e) => {
    if (!state.shown) {
      return {}
    }

    wheel(
      state,
      { detail: state.detailView, body: state.bodyView, foot: footRow() },
      e.by,
      e.pointer?.row,
    )

    state.nowMs = await $.clock.now()
    repaint($, state.shown, state.nowMs)

    return {}
  })

  on('ui.close', { id: PANE_ID }, ($, e, next) => {
    state.isPaneOpen = false
    stopTimer()

    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await readStore($)
    await recoverRuns($)

    await $.command.register({
      name: COMMAND,
      description: `Toggle the workflow view; ${HELP_HINT} lists what else it takes`,
    })

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e, next) => {
    const args = String(e.args ?? '').trim()

    if (args) {
      await recoverRuns($)

      return { text: await applyArgs($, args) }
    }

    if (state.isPaneOpen) {
      await $.ui.close({ id: PANE_ID }).catch(() => undefined)

      state.isPaneOpen = false
      stopTimer()

      return { text: state.shown ? `Closed the workflow pane for ${state.shown.name}.` : 'Closed the workflow pane.' }
    }

    await recoverRuns($)

    // A run still going is what the pane opens on. With none, the last run of
    // the session is: the pane opens on a drawing, with its own top bar and the
    // run's name there to open the list of the others from. It used to open on
    // the idle line instead, which has no bar to open anything from — so the
    // only way through to an earlier run was a chooser under the footer, and
    // the pane opened on a sentence where a run was there to be drawn.
    const shown =
      (state.shown?.status === 'running' ? state.shown : undefined) ??
      [...state.runs].reverse().find(r => r.status === 'running') ??
      state.shown ??
      state.runs[state.runs.length - 1]

    if (!shown) {
      await showIdle($, true)

      return { text: 'No workflow is running in this session.' }
    }

    await showRun($, shown, true)

    const landed = shown.agents.filter(a => a.state === 'done' || a.state === 'failed').length

    return {
      text: `${shown.name} · ${shown.status} · ${landed}/${shown.agents.length} agents landed`,
    }
  })
}

/** One element constructor of the terminal surface's table, read loosely. */
type Element = (props: Record<string, unknown>) => unknown

/**
 * The width the pane gives its drawing. `bodyColumns` is not on every build's
 * props, and a NaN width makes a canvas with no cells — every row draws empty
 * while the footer draws fine. The viewport's width stands in, and a plain 80
 * when nothing was measured.
 */
function columnsOf(bodyColumns: unknown, viewportColumns: unknown): number {
  const body = Number(bodyColumns)

  if (Number.isFinite(body) && body > 0) {
    return Math.max(20, Math.floor(body))
  }

  const viewport = Number(viewportColumns)

  return Number.isFinite(viewport) && viewport > 0 ? Math.max(20, Math.floor(viewport)) : 80
}


/** What a Button's key asks for: a node's key names its agent, the rest name themselves. */
function actionOfKey(key: string): string {
  return key.startsWith('node:') ? key.slice(5) : key
}

/**
 * A Button's handler is not a hook and never sees `$`; it records what was
 * pressed, and the `ui.press` hook beneath it does the work.
 */
function pressNode(agentId: string): void {
  state.pressed = agentId
}

function pressSettings(): void {
  state.pressed = SETTINGS
}

function pressAbout(): void {
  state.pressed = ABOUT
}

/** A Select keeps its handler in the plugin too; `ui.select` does the work. */
function selectRun(value: string): void {
  state.pressed = `run:${value}`
}

/**
 * The line between the drawing and the row under it.
 *
 * The footer is elements where everything above it is canvas, and without a
 * divider the two ran together: the last line of the graph and the first word
 * of the state sat one row apart on the same ground, so a node parked at the
 * bottom of the pane read as though it belonged to the settings.
 *
 * It is drawn in the tone the drawing's own rules take — mixed from the ground
 * rather than fixed — so it reads as the last line of the picture rather than
 * as a border the surface put there. It spans the drawing, not the seat: a rule
 * wider than the graph above it steps off the right edge.
 */
function footerRule(Box: Element, Text: Element): unknown {
  const columns = state.size?.columns ?? 0

  return Box({
    flexDirection: 'row',
    ...ground(),
    children: [Text({ color: paneHex(quietOf(groundColor())), children: RULE_ACROSS.repeat(columns) })],
  })
}

/** The rule above the footer, the same line the pane divides its bars with. */
const RULE_ACROSS = '\u2500'

/**
 * The row under the drawing: the way in, what the pane is set to, and what the
 * pane is.
 *
 * It used to be the settings themselves — four controls and three rules, on
 * screen in every session whether or not anyone was changing anything, each one
 * a cycle that could only be read by pressing it. That spent the row's whole
 * width on the few seconds a reader spends setting the pane up, and still could
 * not show them what they were choosing: you picked a palette by pressing past
 * five others and watching the pane change colour.
 *
 * The settings are a dialog now, and the row is built like the bar at the top
 * of the pane, which is the other row a reader reads rather than looks at: the
 * control in the left gutter, the quiet facts in the middle, and the identity
 * at the far right.
 *
 * Each fact is named and every one is divided from the next by the same rule
 * the top bar uses — `Layout: across │ Theme: gruvbox` — so a reader who has
 * never opened the dialog can still tell which word is the setting and which is
 * the value. Unnamed and spaced, the row read as a list of four words from a
 * vocabulary nobody has been taught: `fits  gruvbox  24-row detail` is three
 * answers to three questions that are not on screen.
 *
 * The name at the right is the About button. An `i` in a circle is two cells
 * wide in some terminals and one in others, and the row is a grid; what a
 * reader presses to find out what this is, is what it is called.
 */
function footerRow(Box: Element, Text: Element, Button: Element | undefined): unknown {
  const stamp = `${NAME} ${VERSION}`

  if (!Button) {
    return Box({
      flexDirection: 'row',
      ...ground(),
      children: [Text({ dimColor: true, children: `${settingsSummary()}   ${HELP_HINT}` })],
    })
  }

  const label = `${ICON.settings} Settings`
  const row = footerWidths(state.size?.columns ?? 0, label.length, stamp.length)

  return Box({
    flexDirection: 'row',
    ...ground(),
    children: [
      control(Button, SETTINGS, label, pressSettings),
      // The surface's own dim rather than a colour of the pane's, so the state
      // reads as quiet next to two buttons that are dim at rest and light under
      // the pointer. A hue here would compete with the things to press.
      Text({ dimColor: true, children: row.state }),
      Text({ children: ' '.repeat(row.gap) }),
      ...(row.stamp ? [control(Button, ABOUT, stamp, pressAbout)] : []),
    ],
  })
}

/**
 * How much of the row fits, and where the right-hand end sits.
 *
 * The row never wraps. A footer one cell wider than the pane costs the drawing
 * a line and puts half of the state under the graph, which is worse than a
 * footer that says less — so what will not fit is dropped, from the end: the
 * detail height matters while a node is open, the palette can be read off the
 * pane itself, and the layout is the one a reader changes most.
 * The name has first call on the width — a pane that will not say what it is
 * has nowhere to send the reader who asks — and where even the name will not
 * fit, the cells go back to the state rather than being left empty.
 */
function footerWidths(
  columns: number,
  labelW: number,
  stampW: number,
): { state: string; gap: number; stamp: boolean } {
  const facts = settingsFacts()

  if (columns <= 0) {
    return { state: ` ${RULE} ${facts.join(` ${RULE} `)}`, gap: 3, stamp: true }
  }

  const stamp = columns - labelW >= stampW + FOOTER_GAP
  let room = columns - labelW - (stamp ? stampW + FOOTER_GAP : 0)
  let state = ''

  for (const fact of facts) {
    const next = ` ${RULE} ${fact}`

    if (next.length > room) {
      break
    }

    state += next
    room -= next.length
  }

  return {
    state,
    gap: Math.max(stamp ? FOOTER_GAP : 0, columns - labelW - state.length - (stamp ? stampW : 0)),
    stamp,
  }
}

/** The rule between the button and the state, the same one the top bar uses. */
const RULE = '\u2502'

/** The least air between the state and the name at the right-hand end. */
const FOOTER_GAP = 2

/**
 * What the pane is set to, in the words the dialog uses for the same things,
 * and in the order the dialog lists them.
 *
 * The row says the state and the dialog changes it, so the two have to agree
 * word for word: a footer reading `Layout: vertical` beside a dialog offering
 * `horizontal vertical timeline fits` is two names for one setting. They agree on the
 * order as well, so a reader scanning the row and a reader scanning the dialog
 * are reading the same list.
 */
function settingsFacts(): string[] {
  return [
    `Layout: ${layoutWord()}`,
    `Theme: ${state.theme}`,
    `Detail height: ${state.detailRows} rows`,
  ]
}

/** The same facts as one line, for a seat that draws no buttons to divide them. */
function settingsSummary(): string {
  return settingsFacts().join(` ${RULE} `)
}

/**
 * The row's one control: the label at rest, and what it does under the pointer.
 *
 * A dim label with nothing around it does not read as pressable — the reader
 * who found out it was found out by clicking it. It lights instead: full
 * strength, in the colour the pane gives the thing a reader is acting on, while
 * the state beside it stays quiet. `hover` is the surface's own, so nothing
 * crosses back to this plugin to do it and the row does not redraw to light a
 * word.
 */
function control(Button: Element, key: string, label: string, onPress: () => void): unknown {
  return Button({
    key,
    label,
    plain: true,
    dimColor: true,
    hover: { scope: `flowpane:${key}`, dimColor: false, color: accentHex(), bold: true },
    onPress,
  })
}

/**
 * The row's icon.
 *
 * A single-width geometric glyph rather than an emoji. The pane itself is a grid
 * of cells, and an emoji is two of them wide in some terminals and one in
 * others — a footer that reads well in one terminal and wraps in the next is
 * worse than one with no icon at all. The same gear the dialog is titled with,
 * so the button and what it opens are one thing.
 */
const ICON = {
  settings: '\u2699',
}

/**
 * The ground the canvas clears to: always the palette's own.
 *
 * It was a setting, and a setting is a question — and this one asked the reader
 * to answer for the pane what only the pane knows. The palette is drawn for a
 * dark ground, so on a light terminal, or on any terminal whose ground is not
 * the one these six palettes were picked against, the drawing came out in
 * colours nobody chose. Off, it was a bug a reader could switch on. On, the
 * pane is the same picture in every terminal, which is what the setting was
 * really for.
 */
function groundColor(): number {
  return backdropOf()
}

/**
 * The footer sits on the same ground as the drawing above it — and stops where
 * the drawing stops. A row left to itself takes the pane's width, which is not
 * always the width the canvas was made at, and a footer band wider than the
 * graph above it is the same step down the right edge the rows carrying a
 * node's label used to have.
 */
function ground(): { backgroundColor?: string; width?: number } {
  const columns = state.size?.columns

  return { backgroundColor: paneHex(backdropOf()), ...(columns ? { width: columns } : {}) }
}

/** What the layout in force is called, in one word, wherever it is named. */
function layoutWord(): string {
  return state.orientation === 'auto'
    ? 'fits'
    : state.orientation
}

function layoutLabel(): string {
  return `Layout: ${layoutWord()}`
}

/**
 * The other runs of this session, as a list to switch between.
 *
 * Only drawn from the second run on: one run needs no chooser, and the line it
 * would take is a line of graph.
 */
function picker(Select: Element | undefined, run: RunState | null) {
  if (!Select || state.runs.length === 0) {
    return null
  }

  // Where there are Buttons the list is not an element at all. Over a run, the
  // name in the top bar opens it and `paint` unrolls it into the canvas under
  // that name; idle, the drawing is the list, and every line of it is pressable
  // already. The chooser is what a build with no Button falls back to.
  if (state.canChoose) {
    return null
  }

  // One run needs no chooser while it is on screen; idle, even one is a choice.
  if (run && state.runs.length < 2) {
    return null
  }

  return Select({
    key: 'run',
    label: 'Run',
    // The list takes the focus ring when it appears, so it can be walked with
    // the arrow keys without a Tab first. Idle it is the one thing to do; over
    // a run it has just been asked for by name.
    ...(!run || state.picking ? { autoFocus: true as const } : {}),
    value: run?.runId,
    options: state.runs.map(r => ({ value: r.runId, label: runLabel(r) })),
    onSelect: selectRun,
  })
}
