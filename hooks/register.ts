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

import { Canvas, DEFAULT_COLOR, rgb } from './canvas'
import {
  applyJournal,
  applyRunFile,
  inputPreviewOf,
  noteCallEnd,
  noteCallStart,
  noteStep,
  noteToolCall,
  phasesOfScript,
  readAgentTranscript,
  runFileOf,
  tokensOfUsage,
  type RunState,
} from './journal'
import type { Orientation } from './layout'
import { paint, paintSummary, type DetailView, type Hotspot } from './paint'
import { rowsOf } from './tree'

const PANE_ID = 'wfpane'
const COMMAND = 'wf'
/** With a Raster, frames are blitted and can run at animation speed. */
const FRAME_MS = 120
/** Without one, every frame is a re-render, so they come slower. */
const FRAME_MS_REDRAW = 320
/** Journal reads are cheaper than frames; one every fourth. */
const READ_EVERY = 4
/** Fewer rows than this and the band draws the run's top line, not a graph. */
const MIN_BAND_ROWS = 6
/** The band's opaque backdrop: dark, since the palette is drawn for a dark ground. */
const BACKDROP = rgb(0x15, 0x18, 0x1e)
const BACKDROP_HEX = '#15181e'
/** Calls the engine gave no `tool_use_id`; a counter names them instead. */
let callCounter = 0

/** The three seats: a pane, the band above the prompt, the hint line under the prompt. */
type Site = 'pane' | 'band' | 'below'
const SITES: Site[] = ['pane', 'band', 'below']

function isSite(value: unknown): value is Site {
  return SITES.includes(value as Site)
}

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
  /** The band's own canvas: it is a different width and height from the pane's. */
  band: Canvas | null
  bandSize: { columns: number; rows: number } | null
  bandHotspots: Hotspot[]
  /** Where the drawing goes: the pane beside the transcript, the band above the prompt, or the hint line under it. */
  site: Site
  bandRows: number
  timer: Timer | null
  tick: number
  isPaneOpen: boolean
  size: { columns: number; rows: number } | null
  /** Whether this build's terminal table has a Raster (2.1.271 and after). */
  hasRaster: boolean
  hotspots: Hotspot[]
  /** The agent whose detail strip is open. */
  selectedId: string | null
  /** Set by a Button's onPress, acted on by the `ui.press` hook, which has `$`. */
  pressed: string | null
  /** Agents whose transcript has been read, so it is read once. */
  loaded: Set<string>
  orientation: Orientation
  detailRows: number
  /** True while the footer shows the settings row instead of the run line. */
  isMenuOpen: boolean
  /** Rows the pane asks for while seated inline above the prompt. */
  paneRows: number | null
  /** The last time a frame ran, for hooks that must not await the clock. */
  nowMs: number
  /** The first line of the detail list on screen. */
  detailScroll: number
  /** What the last paint said about the detail list, for clamping a scroll. */
  detailView: DetailView | null
  /** True while the band paints on an opaque backdrop rather than the terminal's ground. */
  backdrop: boolean
} = {
  runs: [],
  shown: null,
  canvas: null,
  band: null,
  bandSize: null,
  bandHotspots: [],
  site: 'pane',
  bandRows: 16,
  timer: null,
  tick: 0,
  isPaneOpen: false,
  size: null,
  hasRaster: true,
  hotspots: [],
  selectedId: null,
  pressed: null,
  loaded: new Set(),
  orientation: 'auto',
  detailRows: 16,
  isMenuOpen: false,
  paneRows: null,
  nowMs: 0,
  detailScroll: 0,
  detailView: null,
  backdrop: true,
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
 * Finds the runs this session has already made, by walking the transcripts the
 * engine wrote for it.
 *
 * A module reload starts with an empty run list while the session's panes and
 * its finished runs are still there, so the pane would claim nothing had run.
 * The engine keeps each run's summary beside the session's transcripts, which is
 * enough to rebuild every run without having watched it happen.
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
    const dir = `${base}/workflows`

    if (!(await $.fs.exists(dir))) {
      continue
    }

    for (const file of await $.fs.list(dir)) {
      if (!file.name.endsWith('.json')) {
        continue
      }

      const runId = file.name.replace(/\.json$/, '')

      if (state.runs.some(r => r.runId === runId)) {
        continue
      }

      const run: RunState = {
        runId,
        name: runId,
        summary: '',
        transcriptDir: `${base}/subagents/workflows/${runId}`,
        runFile: `${dir}/${file.name}`,
        startedMs: 0,
        status: 'running',
        phases: [],
        agents: [],
        consumed: 0,
      }

      const summary = await $.fs.read(run.runFile)

      applyRunFile(run, summary, await $.clock.now())

      run.name = nameOf(summary) ?? runId

      await readRun($, run, await $.clock.now())

      state.runs.push(run)
    }

    break
  }

  state.runs.sort((a, b) => a.startedMs - b.startedMs)
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
}

/**
 * Reads one agent's own transcript for the prompt it was given and the text it
 * answered with — read once per agent, when its detail strip is first opened.
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
  }

  // A running agent's transcript grows; only a finished one is read for good.
  if (row.state !== 'running') {
    state.loaded.add(agentId)
  }
}

/** Paints the shown run and pushes the drawing to the pane. */
function repaint($: EngineInterface, run: RunState, nowMs: number): void {
  if (state.site !== 'pane') {
    // The band draws from the render hook itself; a frame only has to ask for
    // the redraw, since nothing is mounted for it to write into.
    $.ui.invalidate('ui.render')
    return
  }

  if (!state.canvas || !state.isPaneOpen) {
    return
  }

  const drawn = paint(state.canvas, run, {
    nowMs,
    tick: state.tick,
    orientation: state.orientation,
    selectedId: state.selectedId ?? undefined,
    detailRows: state.detailRows,
    detailScroll: state.detailScroll,
  })

  state.hotspots = drawn.hotspots
  state.detailView = drawn.detail ?? null

  // Without a Raster there is nothing to blit into: the tree itself carries the
  // picture, so the redraw has to go through the renderer. (The band returned
  // above; it never has one, drawing elements rather than a mounted buffer.)
  if (!state.hasRaster) {
    $.ui.invalidate('ui.render')
    return
  }

  void $.ui
    .blit({ requestId: PANE_ID, key: 'dag', cells: state.canvas.encode() })
    .catch(() => undefined)
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
  state.selectedId = null
  stopTimer()

  if (state.site !== 'pane') {
    state.isPaneOpen = true
    $.ui.invalidate('ui.render')

    return
  }

  await $.ui.open(
    focus ? { id: PANE_ID, title: 'workflow', focus: true } : { id: PANE_ID, title: 'workflow' },
  )

  state.isPaneOpen = true
}

/** Opens the pane on a run and starts (or, for a finished run, skips) the timer. */
async function showRun($: EngineInterface, run: RunState, focus: boolean): Promise<void> {
  state.shown = run
  state.selectedId = null

  if (state.site !== 'pane') {
    // The band has nothing to open: the render hook draws while this is set,
    // and without it a launch in the band drew nothing at all.
    state.isPaneOpen = true
    state.nowMs = await $.clock.now()

    await readRun($, run, state.nowMs)

    if (run.status === 'running') {
      startTimer($, run)
    }

    $.ui.invalidate('ui.render')

    return
  }

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
async function applyPress($: EngineInterface): Promise<void> {
  const pressed = state.pressed

  state.pressed = null

  if (!pressed) {
    return
  }

  // The run picker, the settings and the site button work from the idle view
  // too: that view exists to pick an earlier run from.
  if (pressed.startsWith('run:')) {
    const run = state.runs.find(r => r.runId === pressed.slice(4))

    if (run) {
      // `showRun` retitles the pane, reads the run in, and starts or skips the
      // timer, whichever site the drawing is on.
      await showRun($, run, false)
    }
  } else if (pressed === 'menu') {
    state.isMenuOpen = !state.isMenuOpen
  } else if (pressed === 'site') {
    await setSite($, SITES[(SITES.indexOf(state.site) + 1) % SITES.length])
  } else if (!state.shown) {
    return
  } else if (pressed === 'detail-taller' || pressed === 'detail-shorter') {
    const step = pressed === 'detail-taller' ? 2 : -2

    state.detailRows = Math.max(5, Math.min(32, state.detailRows + step))
    await $.store.set('detailRows', state.detailRows)
  } else if (pressed === 'band-taller' || pressed === 'band-shorter') {
    const step = pressed === 'band-taller' ? 2 : -2

    state.bandRows = Math.max(8, Math.min(40, state.bandRows + step))
    await $.store.set('bandRows', state.bandRows)
  } else if (pressed === 'orientation') {
    state.orientation = nextOrientation(state.orientation)

    await $.store.set('orientation', state.orientation)
  } else if (pressed === 'clear') {
    state.selectedId = null
  } else if (pressed === 'detail-up' || pressed === 'detail-down') {
    scrollDetail(pressed === 'detail-up' ? -3 : 3)
  } else {
    state.selectedId = state.selectedId === pressed ? null : pressed
    state.detailScroll = 0

    if (state.selectedId) {
      await loadDetail($, state.shown, state.selectedId)
    }
  }

  state.nowMs = await $.clock.now()

  if (state.shown) {
    repaint($, state.shown, state.nowMs)
  }

  // A blit alone would leave the footer's buttons showing the old state, and
  // the idle view has nothing to blit into.
  $.ui.invalidate('ui.render')
}

/**
 * Moves the drawing to a seat and shows it there.
 *
 * The `site` button and `/wf <seat>` both land here, so the two ways of moving
 * cannot drift apart — and the command is the only one of them that works from
 * the hint line under the prompt, which holds no Buttons.
 */
async function setSite($: EngineInterface, site: Site): Promise<void> {
  state.site = site
  // The settings row is a Button row; a seat that draws none would strand it
  // open and leave the idle line hidden behind a menu nothing can close.
  state.isMenuOpen = false

  await $.store.set('site', site)

  if (site !== 'pane') {
    // The band is the full width above the prompt; the pane would only narrow
    // the transcript beside it. The band keeps drawing while the view is open,
    // so `isPaneOpen` stays true across the move.
    await $.ui.close({ id: PANE_ID }).catch(() => undefined)
    state.isPaneOpen = true
  } else if (state.shown) {
    await showRun($, state.shown, true)
  } else {
    await showIdle($, true)
  }
}

/** What each seat is called on the command line, and how it reads back. */
const SEAT_NAMES: Record<Site, string> = {
  pane: 'beside the transcript',
  band: 'above the prompt',
  below: 'under the prompt',
}

/** The layout words `/wf` takes, against the orientations they name. */
const LAYOUT_WORDS: Record<string, Orientation> = {
  across: 'flow',
  down: 'stack',
  timeline: 'time',
  fits: 'auto',
}

const HELP = [
  '/wf                toggle the view',
  '/wf pane|band|below   move it: beside the transcript, above the prompt, under it',
  '/wf runs           list this session’s runs',
  '/wf <n>            show run <n>',
  '/wf across|down|timeline|fits   lay the graph out',
  '/wf detail <n>     rows the detail strip takes (4–20)',
  '/wf height <n>     rows the drawing takes off the pane (8–40)',
  '/wf backdrop on|off   paint on an opaque ground',
].join('\n')

/** One run as the list and the picker both name it. */
function runLine(run: RunState, index: number): string {
  const landed = run.agents.filter(a => a.state === 'done' || a.state === 'failed').length

  return `${index + 1}. ${run.name}  ${run.status}  ${landed}/${run.agents.length}`
}

/**
 * `/wf` with something after it.
 *
 * Every control the settings row holds is reachable here too. That is what
 * makes the hint line under the prompt a usable seat rather than a trap: it
 * draws no Buttons, so without these words there is no way back off it.
 */
async function applyArgs($: EngineInterface, args: string): Promise<string> {
  const words = args.split(/\s+/)
  const verb = words[0].toLowerCase()
  const rest = words[1]

  if (verb === 'help') {
    return HELP
  }

  if (isSite(verb)) {
    await setSite($, verb)

    return `Drawing ${SEAT_NAMES[verb]}.`
  }

  if (verb === 'runs') {
    if (state.runs.length === 0) {
      return 'No runs in this session yet. Launch a workflow and the view opens on it.'
    }

    return state.runs.map(runLine).join('\n')
  }

  if (verb === 'backdrop' && (rest === 'on' || rest === 'off')) {
    state.backdrop = rest === 'on'

    await $.store.set('backdrop', state.backdrop)
    $.ui.invalidate('ui.render')

    return `Backdrop ${rest}.`
  }

  if (verb in LAYOUT_WORDS) {
    state.orientation = LAYOUT_WORDS[verb]

    await $.store.set('orientation', state.orientation)
    $.ui.invalidate('ui.render')

    return `${layoutLabel()}.`
  }

  const count = Number(rest)

  if (verb === 'detail' && Number.isFinite(count)) {
    state.detailRows = Math.max(5, Math.min(32, Math.floor(count)))

    await $.store.set('detailRows', state.detailRows)
    $.ui.invalidate('ui.render')

    return `Detail strip ${state.detailRows} rows.`
  }

  if (verb === 'height' && Number.isFinite(count)) {
    state.bandRows = Math.max(8, Math.min(40, Math.floor(count)))

    await $.store.set('bandRows', state.bandRows)
    $.ui.invalidate('ui.render')

    return `Drawing ${state.bandRows} rows.`
  }

  // A bare number, or `run 2`, names a run in the order `/wf runs` listed them.
  const which = Number(verb === 'run' ? rest : verb)

  if (Number.isFinite(which)) {
    const run = state.runs[Math.floor(which) - 1]

    if (!run) {
      return state.runs.length === 0
        ? 'No runs in this session yet.'
        : `No run ${Math.floor(which)}. There ${state.runs.length === 1 ? 'is 1 run' : `are ${state.runs.length} runs`}; /wf runs lists them.`
    }

    await showRun($, run, state.site === 'pane')
    $.ui.invalidate('ui.render')

    return runLine(run, state.runs.indexOf(run))
  }

  return `/wf takes no "${args}". ${HELP}`
}

/** The layout button's cycle: across, down, the timeline, then whichever fits. */
const ORIENTATIONS: Orientation[] = ['flow', 'stack', 'time', 'auto']

function isOrientation(value: unknown): value is Orientation {
  return ORIENTATIONS.includes(value as Orientation)
}

function nextOrientation(current: Orientation): Orientation {
  return ORIENTATIONS[(ORIENTATIONS.indexOf(current) + 1) % ORIENTATIONS.length]
}

function readOptions(options: PluginOptions): void {
  const orientation = options.orientation

  if (isOrientation(orientation)) {
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

  if (isSite(options.site)) {
    state.site = options.site
  }

  if (options.backdrop === 'off' || options.backdrop === false) {
    state.backdrop = false
  } else if (options.backdrop === 'on' || options.backdrop === true) {
    state.backdrop = true
  }

  const band = Number(options.bandRows)

  if (Number.isFinite(band) && band >= 8 && band <= 40) {
    state.bandRows = Math.floor(band)
  }
}

/** The choices a person made with the buttons, kept across sessions. */
async function readStore($: EngineInterface): Promise<void> {
  const site = await $.store.get('site')

  if (isSite(site)) {
    state.site = site
  }

  const orientation = await $.store.get('orientation')

  if (isOrientation(orientation)) {
    state.orientation = orientation
  }

  const bandRows = Number(await $.store.get('bandRows'))

  if (Number.isFinite(bandRows) && bandRows >= 8 && bandRows <= 40) {
    state.bandRows = Math.floor(bandRows)
  }

  const backdrop = await $.store.get('backdrop')

  if (typeof backdrop === 'boolean') {
    state.backdrop = backdrop
  }

  const detailRows = Number(await $.store.get('detailRows'))

  if (Number.isFinite(detailRows) && detailRows >= 5 && detailRows <= 32) {
    state.detailRows = Math.floor(detailRows)
  }
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

    const run: RunState = {
      runId: launch.runId,
      name: launch.workflowName ?? 'workflow',
      summary: launch.summary ?? '',
      transcriptDir: launch.transcriptDir,
      runFile: runFileOf(launch.transcriptDir, launch.runId),
      startedMs: await $.clock.now(),
      status: 'running',
      phases: phasesOfScript(script),
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

    // The frame clock may be stopped (pane closed, run being watched from the
    // band); the call's own time is what a quiet agent is measured against.
    const startedMs = await $.clock.now()
    const id = (e as { tool_use_id?: string }).tool_use_id ?? `call-${++callCounter}`

    noteToolCall(run, agentId, tool, startedMs, true)
    noteCallStart(run, agentId, { id, name: tool, input: inputPreviewOf(e as Record<string, unknown>) }, startedMs)

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
    state.isPaneOpen = true

    const run = state.shown
    const columns = columnsOf(e.props.bodyColumns, e.viewport?.columns)
    const chooser = picker(Select, Text, run)
    // The footer takes a row, and the picker one more where it draws: a canvas
    // sized to the whole seat would push its own last line out of view.
    const rows = Math.max(1, Math.max(6, e.props.scroll.bodyRows) - 1 - (chooser ? 1 : 0))

    if (!state.canvas || state.size?.columns !== columns || state.size.rows !== rows || state.canvas.background !== groundColor()) {
      state.canvas = new Canvas(columns, rows, groundColor())
      state.size = { columns, rows }
    }

    if (run) {
      const drawn = paint(state.canvas, run, {
        nowMs: await $.clock.now(),
        tick: state.tick,
        orientation: state.orientation,
        selectedId: state.selectedId ?? undefined,
        detailRows: state.detailRows,
        detailScroll: state.detailScroll,
      })

      state.hotspots = drawn.hotspots
      state.detailView = drawn.detail ?? null
    } else {
      // Idle: the last run's picture must not linger under the idle line.
      state.canvas.clear()
      state.hotspots = []
    }

    const picture = Raster
      ? [
          Raster({
            key: 'dag',
            columns: state.canvas.columns,
            rows: state.canvas.rows,
            cells: state.canvas.encode(),
          }),
        ]
      : rowsOf(state.canvas, { Box, Text, Button }, state.hotspots, pressNode)

    return Box({
      flexDirection: 'column',
      children: [...picture, footer(Box, Text, Button, run, false, !!chooser), ...(chooser ? [chooser] : [])],
    }) as never
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const drawn = await next(e)

    if (state.site !== 'band' || !state.isPaneOpen || e.surface !== 'terminal' || e.props.hasSurvey) {
      return drawn
    }

    const table = (await $.ui.resolve(e)) as unknown as SiteTable

    return siteTree($, table, drawn, columnsOf(e.props.bodyColumns, e.viewport?.columns), e.props.maxRows, true)
  })

  // The hint line under the prompt is the one site below it a hook may draw a
  // tree in. It has no measured height and arms no hotkeys, so the drawing
  // takes `bandRows` and its buttons want a Tab.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const drawn = await next(e)

    if (state.site !== 'below' || !state.isPaneOpen || e.surface !== 'terminal') {
      return drawn
    }

    // Only Pane and AbovePrompt sites hold the keyboard, so nothing here can
    // be pressed: the tree is text alone, and the pane or band is where the
    // buttons are.
    const { Box, Text } = (await $.ui.resolve(e)) as unknown as SiteTable

    return siteTree($, { Box, Text }, drawn, columnsOf(undefined, e.viewport?.columns), state.bandRows + 3, false)
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

    await applyPress($)

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

    await applyPress($)

    return result
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
      description: 'Toggle the workflow view; /wf help lists what else it takes',
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

    // A run still going is what the pane opens on. With none, it opens idle:
    // the session's earlier runs are there to pick from, not pushed on screen.
    const live =
      (state.shown?.status === 'running' ? state.shown : undefined) ??
      [...state.runs].reverse().find(r => r.status === 'running')

    if (!live) {
      await showIdle($, true)

      return {
        text:
          state.runs.length > 0
            ? `No workflow is running. ${state.runs.length} earlier run${state.runs.length === 1 ? '' : 's'} to look at.`
            : 'No workflow is running in this session.',
      }
    }

    await showRun($, live, true)

    const landed = live.agents.filter(a => a.state === 'done' || a.state === 'failed').length

    return {
      text: `${live.name} · ${live.status} · ${landed}/${live.agents.length} agents landed`,
    }
  })
}

/** One element constructor of a surface's table, read loosely. */
type Element = (props: Record<string, unknown>) => unknown

type SiteTable = {
  Box: Element
  Text: Element
  Button?: Element
  Select?: Element
}

/**
 * The drawing as a tree for a site the engine seats by itself (the band above
 * the prompt, the hint line under it): the site's own content first, then the
 * canvas as rows, the footer, and the run picker.
 *
 * A site scrolls a tree taller than it in a window, which hides most of a
 * drawing, so the canvas takes what is left after the footer and the picker;
 * with fewer rows than a graph needs (a fullscreen layout's bottom slot) it
 * gets the run's top line instead.
 */
async function siteTree(
  $: EngineInterface,
  table: SiteTable,
  drawn: unknown,
  columns: number,
  maxRows: number,
  inBand: boolean,
): Promise<never> {
  const { Box, Text, Button, Select } = table
  const run = state.shown
  const chooser = picker(Select, Text, run)

  const spare = maxRows - 1 - (chooser ? 1 : 0)
  const wantsGraph = spare >= MIN_BAND_ROWS
  const rows = wantsGraph ? Math.max(MIN_BAND_ROWS, Math.min(state.bandRows, spare)) : 1

  if (!state.band || state.bandSize?.columns !== columns || state.bandSize.rows !== rows || state.band.background !== groundColor()) {
    state.band = new Canvas(columns, rows, groundColor())
    state.bandSize = { columns, rows }
  }

  if (run) {
    const options = {
      nowMs: await $.clock.now(),
      tick: state.tick,
      orientation: state.orientation,
      selectedId: state.selectedId ?? undefined,
      detailRows: state.detailRows,
      detailScroll: state.detailScroll,
    }
    const painted = wantsGraph ? paint(state.band, run, options) : paintSummary(state.band, run, options)

    state.bandHotspots = painted.hotspots
    state.detailView = painted.detail ?? null
  } else {
    // Idle keeps the seat's height rather than collapsing to the footer: the
    // pane has always held its room with nothing on it, and a band that shrank
    // to one line made the same view look like two different things. The last
    // run's picture must not linger under the idle line either.
    state.band.clear()
    state.bandHotspots = []
    state.detailView = null
  }

  return Box({
    flexDirection: 'column',
    children: [
      drawn,
      ...rowsOf(state.band, { Box, Text, Button }, state.bandHotspots, pressNode),
      footer(Box, Text, Button, run, inBand, !!chooser),
      ...(chooser ? [chooser] : []),
    ],
  }) as never
}

/**
 * The width a site gives its drawing. 2.1.270's `AbovePrompt` props carry no
 * `bodyColumns` (the declarations that name it are 2.1.271's), and a NaN width
 * made a canvas with no cells: every band row drew empty while its footer drew
 * fine. The viewport's width stands in, and a plain 80 when nothing measured.
 */
function columnsOf(bodyColumns: unknown, viewportColumns: unknown): number {
  const body = Number(bodyColumns)

  if (Number.isFinite(body) && body > 0) {
    return Math.max(20, Math.floor(body))
  }

  const viewport = Number(viewportColumns)

  return Number.isFinite(viewport) && viewport > 0 ? Math.max(20, Math.floor(viewport)) : 80
}

/** Moves the detail list by `by` lines, clamped to what the last paint said it has. */
function scrollDetail(by: number): void {
  const view = state.detailView
  const last = view ? Math.max(0, view.total - view.visible) : 0

  state.detailScroll = Math.max(0, Math.min(last, state.detailScroll + by))
}

function pressDetailUp(): void {
  state.pressed = 'detail-up'
}

function pressDetailDown(): void {
  state.pressed = 'detail-down'
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

function pressOrientation(): void {
  state.pressed = 'orientation'
}

function pressSite(): void {
  state.pressed = 'site'
}

function pressMenu(): void {
  state.pressed = 'menu'
}

function pressDetailTaller(): void {
  state.pressed = 'detail-taller'
}

function pressDetailShorter(): void {
  state.pressed = 'detail-shorter'
}

function pressBandTaller(): void {
  state.pressed = 'band-taller'
}

function pressBandShorter(): void {
  state.pressed = 'band-shorter'
}

/** A Select keeps its handler in the plugin too; `ui.select` does the work. */
function selectRun(value: string): void {
  state.pressed = `run:${value}`
}

function pressClear(): void {
  state.pressed = 'clear'
}

/**
 * The line under the drawing: which run is on screen, which others there are,
 * and the handful of things that can be done to the view.
 *
 * The settings sit behind one button rather than always on the line: the graph
 * is what the pane is for, and a row of six controls under it would compete
 * with it every frame.
 */
function footer(
  Box: Element,
  Text: Element,
  Button: Element | undefined,
  run: RunState | null,
  inBand: boolean,
  canPick: boolean,
) {
  const children: unknown[] = []

  if (!run && !state.isMenuOpen) {
    children.push(Text({ dimColor: true, children: idleLine(canPick) }))
    children.push(Text({ children: '   ' }), settings(Text, Button, inBand))

    return Box({ flexDirection: 'row', ...ground(), children })
  }

  if (state.isMenuOpen && Button) {
    children.push(
      Button({ key: 'menu', label: 'Done', ...key(inBand, '1'), plain: true, dimColor: true, onPress: pressMenu }),
      Text({ children: '   ' }),
      Button({
        key: 'site',
        label:
          state.site === 'pane'
            ? 'Draw at the bottom'
            : state.site === 'band'
              ? 'Draw under the prompt'
              : 'Draw beside the transcript',
        ...key(inBand, '2'),
        plain: true,
        dimColor: true,
        onPress: pressSite,
      }),
      Text({ children: '   ' }),
      Button({
        key: 'orientation',
        label: layoutLabel(),
        ...key(inBand, '3'),
        plain: true,
        dimColor: true,
        onPress: pressOrientation,
      }),
      Text({ children: '   ' }),
      Text({ dimColor: true, children: `Detail ${state.detailRows}` }),
      Text({ children: ' ' }),
      Button({ key: 'detail-shorter', label: '−', plain: true, dimColor: true, onPress: pressDetailShorter }),
      Text({ children: ' ' }),
      Button({ key: 'detail-taller', label: '+', plain: true, dimColor: true, onPress: pressDetailTaller }),
    )

    if (state.site !== 'pane') {
      children.push(
        Text({ children: '   ' }),
        Text({ dimColor: true, children: `Height ${state.bandRows}` }),
        Text({ children: ' ' }),
        Button({ key: 'band-shorter', label: '−', plain: true, dimColor: true, onPress: pressBandShorter }),
        Text({ children: ' ' }),
        Button({ key: 'band-taller', label: '+', plain: true, dimColor: true, onPress: pressBandTaller }),
      )
    }

    return Box({ flexDirection: 'row', ...ground(), children })
  }

  const landed = run ? run.agents.filter(a => a.state === 'done' || a.state === 'failed').length : 0

  children.push(
    Text({
      dimColor: true,
      wrap: 'truncate-end',
      children: run ? `${run.status}  ${landed}/${run.agents.length}` : 'idle',
    }),
  )

  children.push(Text({ children: '   ' }), settings(Text, Button, inBand))

  if (state.selectedId) {
    const view = state.detailView
    const where = view && view.total > view.visible ? `${view.scroll + 1}–${Math.min(view.total, view.scroll + view.visible)}/${view.total}` : ''

    if (Button) {
      children.push(
        Text({ children: '   ' }),
        Button({
          key: 'clear',
          label: 'Close detail',
          ...key(inBand, '4'),
          plain: true,
          dimColor: true,
          onPress: pressClear,
        }),
        Text({ children: '   ' }),
        Button({ key: 'detail-up', label: '▲', ...key(inBand, '5'), plain: true, dimColor: true, onPress: pressDetailUp }),
        Text({ children: ' ' }),
        Button({ key: 'detail-down', label: '▼', ...key(inBand, '6'), plain: true, dimColor: true, onPress: pressDetailDown }),
      )
    }

    // Where the detail list is scrolled to is a fact about the drawing, not a
    // control, so it reads the same at a seat that cannot hold the arrows.
    if (where) {
      children.push(Text({ children: Button ? ' ' : '   ' }), Text({ dimColor: true, children: where }))
    }
  }

  return Box({ flexDirection: 'row', ...ground(), children })
}

/**
 * The idle line. A seat that can draw a Select offers the list; one that cannot
 * names the command that does the same thing, rather than pointing at a chooser
 * that is not there.
 */
function idleLine(canPick: boolean): string {
  if (state.runs.length === 0) {
    return 'No workflow is running in this session.'
  }

  if (canPick) {
    return 'No workflow is running. Pick an earlier run below, or start one.'
  }

  return `No workflow is running. ${state.runs.length} earlier run${state.runs.length === 1 ? '' : 's'} — /wf runs to list them.`
}

/**
 * The settings slot, in the same place on the line at every seat. The hint line
 * under the prompt takes no Buttons, so there it names the command instead of
 * drawing one.
 */
function settings(Text: Element, Button: Element | undefined, inBand: boolean): unknown {
  if (!Button) {
    return Text({ dimColor: true, children: '/wf help' })
  }

  return Button({ key: 'menu', label: 'Settings', ...key(inBand, '1'), plain: true, dimColor: true, onPress: pressMenu })
}

/**
 * The ground every canvas clears to. One value for all three seats: the palette
 * is drawn for a dark ground, and a pane left on the terminal's own colour made
 * the same graph read differently from seat to seat.
 */
function groundColor(): number {
  return state.backdrop ? BACKDROP : DEFAULT_COLOR
}

/** The footer sits on the same ground as the drawing above it. */
function ground(): { backgroundColor?: string } {
  return state.backdrop ? { backgroundColor: BACKDROP_HEX } : {}
}

/**
 * A hotkey only where one is honoured. The band takes a digit from an empty
 * composer; a pane honours none, and would still print `m:` on the label.
 */
function key(inBand: boolean, digit: string): { hotkey?: string } {
  return inBand ? { hotkey: digit } : {}
}

function layoutLabel(): string {
  return state.orientation === 'auto'
    ? 'Layout: fits'
    : state.orientation === 'flow'
      ? 'Layout: across'
      : state.orientation === 'stack'
        ? 'Layout: down'
        : 'Layout: timeline'
}

/**
 * The other runs of this session, as a list to switch between.
 *
 * Only drawn from the second run on: one run needs no chooser, and the line it
 * would take is a line of graph.
 */
function picker(Select: Element | undefined, Text: Element, run: RunState | null) {
  // One run needs no chooser while it is on screen; idle, even one is a choice.
  if (!Select || state.runs.length === 0 || (run && state.runs.length < 2)) {
    return null
  }

  return Select({
    key: 'run',
    label: 'Run',
    // Idle, the picker is the one thing to do, so the focus ring starts on it
    // when the pane takes the keyboard: Enter opens it without a Tab first.
    ...(run ? {} : { autoFocus: true as const }),
    value: run?.runId,
    options: state.runs.map(r => {
      const landed = r.agents.filter(a => a.state === 'done' || a.state === 'failed').length

      return {
        value: r.runId,
        label: `${r.name}  ${r.status}  ${landed}/${r.agents.length}`,
      }
    }),
    onSelect: selectRun,
  })
}
