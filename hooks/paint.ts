/**
 * Paints a run onto a canvas: the header band, the phases along whichever axis
 * the layout chose, the barrier spines between them, the inferred carries that
 * cross a barrier, the agent nodes, and — when one is selected — the detail
 * strip carrying what the graph has no room for.
 *
 * Everything here is a pure function of the run, the tick and the selection, so
 * the ticker can repaint and blit without the engine re-rendering the tree. It
 * returns the label spans it drew, which is what makes a node clickable: the
 * tree builder lays a Button over the same cells.
 */

import { Canvas, detour, detourDown, edge, frame, line, meter, mix, rgb, spinnerAt, type Rgb } from './canvas'
import type { AgentRow, RunState, ToolCall } from './journal'
import { entryOf, exitOf, layout, type NodeBox, type Orientation } from './layout'
import { edgesOf, isPipelineLike, orderedLanes } from './shape'

const COLORS = {
  running: rgb(0xe8, 0xb0, 0x4b),
  done: rgb(0x4c, 0xc3, 0x8a),
  failed: rgb(0xef, 0x5f, 0x5f),
  idle: rgb(0x5a, 0x61, 0x69),
  dim: rgb(0x6b, 0x74, 0x80),
  text: rgb(0xd4, 0xd8, 0xdd),
  accent: rgb(0x7a, 0xa2, 0xf7),
  track: rgb(0x3a, 0x40, 0x48),
}

const DASH_H = 0x2504
const DASH_V = 0x2506
const BULLET = 0x25ae
const ARROW_RIGHT = 0x25b8
const ARROW_DOWN = 0x25be

/** Where a node's label was drawn, so the tree can lay a Button over it. */
export type Hotspot = {
  agentId: string
  x: number
  y: number
  w: number
}

export type PaintOptions = {
  nowMs: number
  tick: number
  orientation?: Orientation
  /** The agent whose detail strip is open, if any. */
  selectedId?: string
  /** Rows the detail strip may take; 0 draws none. */
  detailRows?: number
  /** The first line of the detail list to show; clamped to the list. */
  detailScroll?: number
}

export type PaintResult = {
  hotspots: Hotspot[]
  orientation: 'flow' | 'stack' | 'time'
  /** The detail list's extent and window, when one is drawn. */
  detail?: DetailView
}

/**
 * A running agent with nothing seen from it for this long is called quiet: no
 * request streaming, no tool call. Long enough that a slow model response is
 * not accused, short enough that a hung one is noticed before the run is.
 */
const QUIET_MS = 45_000

/** The tokens a row can claim: the summary's once it has them, the live sum until then. */
function tokensOf(agent: AgentRow): number | undefined {
  return agent.tokens ?? agent.liveTokens
}

/** How long a running agent has been silent, or 0 when it is not. */
function quietFor(agent: AgentRow, nowMs: number): number {
  if (agent.state !== 'running' || agent.isThinking || agent.tools.some(t => t.isRunning)) {
    return 0
  }

  const since = nowMs - (agent.activeMs ?? agent.startedMs)

  return since >= QUIET_MS ? since : 0
}

function colorOf(state: AgentRow['state']): Rgb {
  return state === 'done'
    ? COLORS.done
    : state === 'failed'
      ? COLORS.failed
      : state === 'stopped'
        ? COLORS.idle
        : COLORS.running
}

/** The glyph in a node's corner: spinner, tick, cross, or the stopped mark. */
function markOf(state: AgentRow['state'], tick: number): number {
  return state === 'running'
    ? spinnerAt(tick)
    : state === 'done'
      ? 0x2714
      : state === 'failed'
        ? 0x2718
        : 0x229d
}

function elapsed(ms: number): string {
  if (ms < 1000) {
    return `${Math.max(0, Math.round(ms))}ms`
  }

  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`
  }

  const minutes = Math.floor(ms / 60_000)

  return `${minutes}m${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}s`
}

function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function truncate(s: string, max: number): string {
  if (max <= 0) {
    return ''
  }

  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`
}

/** Wraps text to a width, breaking at spaces where it can. */
function wrap(s: string, width: number, lines: number): string[] {
  const words = s.replace(/\s+/g, ' ').trim().split(' ')
  const out: string[] = []
  let line = ''

  for (const word of words) {
    if (line && line.length + word.length + 1 > width) {
      out.push(line)
      line = word

      if (out.length === lines) {
        break
      }
    } else {
      line = line ? `${line} ${word}` : word
    }
  }

  if (out.length < lines && line) {
    out.push(line)
  }

  return out.slice(0, lines).map(l => truncate(l, width))
}

/**
 * A running node's border carries a highlight that travels it, which is the
 * only honest progress a running agent has: it says *alive*, and its speed is
 * the same for every node, so a stalled one is told from a busy one by its
 * elapsed time, never by a bar that pretends to know.
 */
function pulse(at: number, length: number, tick: number): number {
  const head = (((tick * 0.7) % length) + length) % length
  const distance = Math.min(Math.abs(at - head), length - Math.abs(at - head))

  return Math.max(0, 1 - distance / 3)
}

/** What the agent is doing right now, or what it answered once it is done. */
function tailOf(agent: AgentRow, nowMs: number): string {
  const busy = agent.tools.find(t => t.isRunning)

  if (agent.state === 'running' && busy) {
    return busy.count > 1 ? `${busy.name} ×${busy.count}` : busy.name
  }

  if (agent.state === 'running' && agent.isThinking) {
    const said = (agent.saying ?? '').replace(/\s+/g, ' ').trim()

    return said ? `“${said.slice(-60)}` : 'thinking'
  }

  const quiet = quietFor(agent, nowMs)

  if (quiet > 0) {
    return `quiet ${elapsed(quiet)}`
  }

  if (agent.state === 'running' && agent.tools.length > 0) {
    const calls = agent.tools.reduce((sum, t) => sum + t.count, 0)

    return `${calls} tool ${calls === 1 ? 'call' : 'calls'}`
  }

  return agent.resultPreview ?? ''
}

/** The colour a tail is drawn in: a quiet agent's is the warning, the rest fade toward its state. */
function tailColorOf(agent: AgentRow, nowMs: number, color: Rgb): Rgb {
  if (quietFor(agent, nowMs) > 0) {
    return mix(COLORS.failed, COLORS.running, 0.5)
  }

  const live = agent.state === 'running' && (agent.tools.length > 0 || agent.isThinking)

  return mix(COLORS.dim, color, live ? 0.6 : 0.45)
}

/**
 * A node's name with the phase it already sits under taken off the front.
 *
 * Every lane is captioned with its phase, so `gather:rivers` in a column headed
 * Gather spends seven of its cells repeating the header — and in a six-phase
 * run those are the cells that would have carried `rivers`, the only part that
 * tells one agent of a phase from its four siblings.
 */
function nodeLabel(agent: AgentRow): string {
  const phase = agent.phase?.trim()

  if (!phase || !agent.label.toLowerCase().startsWith(phase.toLowerCase())) {
    return agent.label
  }

  const rest = agent.label.slice(phase.length).replace(/^[\s:/_-]+/, '')

  // A label that is only its phase keeps it; the alternative is an empty node.
  return rest.length > 0 ? rest : agent.label
}

function paintNode(
  c: Canvas,
  box: NodeBox,
  nowMs: number,
  tick: number,
  density: 'full' | 'compact' | 'dense',
  slowestMs: number,
  isSelected: boolean,
  hotspots: Hotspot[],
): void {
  const { agent } = box
  const color = colorOf(agent.state)
  const running = agent.state === 'running'
  const took = (agent.endedMs ?? nowMs) - agent.startedMs
  const mark = markOf(agent.state, tick)
  const busy = running && agent.tools.some(t => t.isRunning)

  const label = nodeLabel(agent)

  if (density === 'dense') {
    const labelX = box.x + 2
    const room = Math.max(1, box.w - 9)

    c.put(box.x, box.y, mark, color)
    c.text(labelX, box.y, truncate(label, room), isSelected ? COLORS.accent : COLORS.text)
    c.text(box.x + box.w - 6, box.y, elapsed(took).padStart(6), COLORS.dim)
    hotspots.push({
      agentId: agent.agentId,
      x: labelX,
      y: box.y,
      w: Math.min(room, label.length),
    })

    return
  }

  const border = isSelected ? COLORS.accent : running ? mix(COLORS.idle, color, 0.6) : color

  frame(c, box.x, box.y, box.w, box.h, border, isSelected ? 'heavy' : 'round')

  if (running && !isSelected) {
    // The highlight rides the top and bottom borders, the two runs of cells long
    // enough to read as motion at this size.
    const span = box.w - 2
    const glow = busy ? rgb(0xff, 0xe4, 0xa8) : rgb(0xff, 0xd9, 0x8a)

    for (let i = 0; i < span; i++) {
      c.put(box.x + 1 + i, box.y, 0x2500, mix(border, glow, pulse(i, span * 2, tick)))
      c.put(
        box.x + 1 + i,
        box.y + box.h - 1,
        0x2500,
        mix(border, glow, pulse(span * 2 - 1 - i, span * 2, tick)),
      )
    }
  }

  const inner = box.w - 4
  const labelX = box.x + 3

  c.put(box.x + 1, box.y + 1, mark, color)
  c.text(labelX, box.y + 1, truncate(label, inner), isSelected ? COLORS.accent : COLORS.text)
  hotspots.push({
    agentId: agent.agentId,
    x: labelX,
    y: box.y + 1,
    w: Math.min(inner, label.length),
  })

  if (density === 'compact') {
    return
  }

  // How long this agent took against the slowest in the run: the run's shape in
  // time rather than in structure, and the only way the critical path shows.
  const spent = tokensOf(agent)
  const full = spent === undefined ? elapsed(took) : `${elapsed(took)}  ${tokens(spent)}`
  const wanted = Math.max(4, Math.min(12, Math.floor(inner / 3)))
  // The numbers outrank the bar. The bar only ranks this agent against the
  // slowest in the run; what it spent is written nowhere else on the graph, so
  // a node too narrow for both gives up meter cells rather than the count.
  const fits = Math.min(wanted, box.w - 7 - full.length)
  // Two cells of bar is not a comparison, it is a smudge next to the number it
  // competes with, so a node with room for only that draws no bar at all.
  const barWidth = fits >= 3 ? fits : 0

  if (barWidth > 0) {
    meter(
      c,
      box.x + 3,
      box.y + 2,
      barWidth,
      slowestMs > 0 ? took / slowestMs : 0,
      running ? color : mix(color, COLORS.track, 0.45),
      COLORS.track,
    )
  }

  const statX = box.x + 3 + (barWidth > 0 ? barWidth + 2 : 0)
  const room = box.x + box.w - 2 - statX
  const stat = full.length <= room ? full : elapsed(took)

  c.text(statX, box.y + 2, truncate(stat, room), COLORS.dim)

  const tailX = statX + Math.min(stat.length, room) + 2
  const tailRoom = box.x + box.w - 2 - tailX
  const tail = tailOf(agent, nowMs)

  if (tail && tailRoom > 3) {
    const isLive = running && (agent.tools.length > 0 || agent.isThinking)
    const tone = tailColorOf(agent, nowMs, color)

    if (isLive) {
      c.put(tailX, box.y + 2, ARROW_RIGHT, tone)
      c.text(tailX + 1, box.y + 2, truncate(tail, tailRoom - 1), tone)
    } else {
      c.text(tailX, box.y + 2, truncate(tail, tailRoom), tone)
    }
  }
}

/**
 * Draws the barrier between two lanes: a spine in the gutter, every agent of
 * the earlier lane feeding it, every agent of the later one fed from it.
 *
 * The spine is what the phase actually is — a join, then a fork — so one of
 * these replaces the `n × m` edges a literal graph would draw, and the count of
 * lines stays the count of agents.
 */
function paintBarrier(
  c: Canvas,
  left: NodeBox[],
  right: NodeBox[],
  busAt: number,
  crossed: boolean,
  orientation: 'flow' | 'stack',
): void {
  if (left.length === 0 || right.length === 0) {
    return
  }

  const along = (p: { x: number; y: number }) => (orientation === 'flow' ? p.y : p.x)
  const ports = [
    ...left.map(n => exitOf(n, orientation)),
    ...right.map(n => entryOf(n, orientation)),
  ]
  const from = Math.min(...ports.map(along))
  const to = Math.max(...ports.map(along))
  const color = crossed ? mix(COLORS.idle, COLORS.done, 0.5) : COLORS.idle
  const spine = orientation === 'flow' ? 0x2502 : 0x2500
  const feeder = orientation === 'flow' ? 0x2500 : 0x2502

  for (let at = from; at <= to; at++) {
    if (orientation === 'flow') {
      line(c, busAt, at, spine, color)
    } else {
      line(c, at, busAt, spine, color)
    }
  }

  // Which sides of the spine each tap is on, so the junction glyph says whether
  // it feeds the barrier, leaves it, or both.
  const taps = new Map<number, { in: boolean; out: boolean }>()
  const tapOf = (at: number) => {
    const tap = taps.get(at) ?? { in: false, out: false }

    taps.set(at, tap)

    return tap
  }

  for (const node of left) {
    const port = exitOf(node, orientation)
    const tone = mix(colorOf(node.agent.state), color, 0.35)

    if (orientation === 'flow') {
      for (let x = port.x; x < busAt; x++) {
        line(c, x, port.y, feeder, tone)
      }
    } else {
      for (let y = port.y; y < busAt; y++) {
        line(c, port.x, y, feeder, tone)
      }
    }

    tapOf(along(port)).in = true
  }

  for (const node of right) {
    const port = entryOf(node, orientation)
    const head = mix(color, colorOf(node.agent.state), 0.5)

    if (orientation === 'flow') {
      for (let x = busAt + 1; x <= port.x; x++) {
        line(c, x, port.y, feeder, color)
      }

      c.put(port.x, port.y, ARROW_RIGHT, head)
    } else {
      for (let y = busAt + 1; y <= port.y; y++) {
        line(c, port.x, y, feeder, color)
      }

      c.put(port.x, port.y, ARROW_DOWN, head)
    }

    tapOf(along(port)).out = true
  }

  for (const [at, tap] of taps) {
    const ends = at === from && at === to
    const glyph = ends
      ? spine
      : tap.in && tap.out
        ? 0x253c
        : orientation === 'flow'
          ? tap.in
            ? 0x2524
            : 0x251c
          : tap.in
            ? 0x2534
            : 0x252c

    if (orientation === 'flow') {
      c.put(busAt, at, glyph, color)
    } else {
      c.put(at, busAt, glyph, color)
    }
  }
}

/**
 * The run as its top line alone, for a site with no room for a drawing: the
 * band in a fullscreen layout whose bottom slot is a few rows tall.
 */
export function paintSummary(c: Canvas, run: RunState, options: PaintOptions): PaintResult {
  c.clear()
  paintRunLine(c, run, options.nowMs, options.tick)

  return { hotspots: [], orientation: 'flow' }
}

export function paint(c: Canvas, run: RunState, options: PaintOptions): PaintResult {
  const { nowMs, tick, selectedId } = options

  c.clear()

  const selected = run.agents.find(a => a.agentId === selectedId)
  const detailRows = selected ? Math.min(options.detailRows ?? 0, Math.floor(c.rows / 2)) : 0
  const panel: Rect | null =
    selected && detailRows >= 5 ? { x: 0, y: c.rows - detailRows, w: c.columns, h: detailRows } : null

  if (options.orientation === 'time') {
    const hotspots = paintTimeline(c, run, nowMs, tick, selectedId, detailRows)

    const detail = panel && selected ? paintDetail(c, selected, nowMs, panel, options.detailScroll ?? 0) : undefined

    return { hotspots, orientation: 'time', detail }
  }

  const view = layout(run, c.columns, c.rows, options.orientation ?? 'auto', detailRows)
  const lanes = orderedLanes(run)
  const carries = edgesOf(run)
  const byId = new Map<string, NodeBox>()
  const hotspots: Hotspot[] = []

  const laneOf = new Map<string, number>()

  view.lanes.forEach((lane, index) => {
    for (const node of lane.nodes) {
      byId.set(node.agent.agentId, node)
      laneOf.set(node.agent.agentId, index)
    }
  })

  const slowestMs = Math.max(1, ...run.agents.map(a => (a.endedMs ?? nowMs) - a.startedMs))

  paintHeader(c, run, view.lanes, lanes, nowMs, tick, view.orientation)

  const isList = view.orientation === 'stack' && view.density === 'dense'

  // Barriers first, so a node's frame always wins the cells it shares.
  for (let i = 1; i < view.lanes.length && !isList; i++) {
    const left = view.lanes[i - 1]
    const right = view.lanes[i]

    if (right.ghost && left.nodes.length > 0) {
      // Nothing has crossed into this phase yet, so the barrier is drawn as the
      // one thing that is known: the run arrives here next.
      const tone = mix(COLORS.idle, COLORS.track, 0.4)

      if (view.orientation === 'flow') {
        const y = right.ghost.y + Math.floor(right.ghost.h / 2)

        for (let x = left.x + left.w; x < right.ghost.x; x++) {
          line(c, x, y, DASH_H, tone)
        }
      } else {
        const x = right.ghost.x + Math.floor(right.ghost.w / 2)

        for (let y = left.y + left.h; y < right.ghost.y; y++) {
          line(c, x, y, DASH_V, tone)
        }
      }

      continue
    }

    if (!isPipelineLike(lanes[i - 1], lanes[i], carries)) {
      paintBarrier(
        c,
        left.nodes,
        right.nodes,
        right.busAt,
        left.nodes.every(n => n.agent.state !== 'running'),
        view.orientation,
      )
    }
  }

  // Two registers, and the difference is the point. A confirmed edge is drawn
  // solid and at full strength: this agent's answer is in that agent's prompt,
  // which is a record of what flowed. An inferred one stays dashed and dimmed,
  // because a shared label is a hint about the run, not a fact about it.
  for (const carry of isList ? [] : carries) {
    const from = byId.get(carry.fromId)
    const to = byId.get(carry.toId)

    if (!from || !to) {
      continue
    }

    const start = exitOf(from, view.orientation)
    const end = entryOf(to, view.orientation)
    const tone = mix(colorOf(from.agent.state), colorOf(to.agent.state), 0.5)
    const solid = carry.confirmed === true
    const stroke = solid ? tone : mix(COLORS.idle, tone, 0.55)
    const across = solid ? 0x2500 : DASH_H
    const down = solid ? 0x2502 : DASH_V
    const span = (laneOf.get(carry.toId) ?? 0) - (laneOf.get(carry.fromId) ?? 0)

    // An edge over more than one lane has a whole band of nodes in its way, so
    // it is routed through the empty rows (or columns) the layout leaves
    // between them. Stacked, a straight run drew a horizontal line clean
    // through every node of the band it crossed.
    if (span > 1) {
      if (view.orientation === 'flow') {
        detour(c, start, end, from.y + from.h, across, down, stroke)
        c.put(end.x, end.y, ARROW_RIGHT, tone)
      } else {
        // The gap column just past the source's own box: stacked nodes sit two
        // columns apart, and a channel inside the box would be drawn over the
        // node standing under it.
        detourDown(c, start, end, from.x + from.w, across, down, stroke)
        c.put(end.x, end.y, ARROW_DOWN, tone)
      }

      continue
    }

    if (view.orientation === 'flow' && start.y === end.y) {
      for (let x = start.x; x < end.x; x++) {
        line(c, x, start.y, across, stroke)
      }

      c.put(end.x, end.y, ARROW_RIGHT, tone)
    } else if (view.orientation === 'stack' && start.x === end.x) {
      for (let y = start.y; y < end.y; y++) {
        line(c, start.x, y, down, stroke)
      }

      c.put(end.x, end.y, ARROW_DOWN, tone)
    } else if (view.orientation === 'flow') {
      edge(c, start.x, start.y, end.x, end.y, solid ? tone : mix(COLORS.idle, tone, 0.4), tone)
    } else {
      // A carry that changes column: down, across, down.
      const mid = start.y + Math.max(1, Math.floor((end.y - start.y) / 2))

      for (let y = start.y; y < mid; y++) {
        line(c, start.x, y, down, stroke)
      }

      for (let x = Math.min(start.x, end.x); x <= Math.max(start.x, end.x); x++) {
        line(c, x, mid, across, stroke)
      }

      for (let y = mid + 1; y <= end.y; y++) {
        line(c, end.x, y, down, stroke)
      }

      c.put(end.x, end.y, ARROW_DOWN, tone)
    }
  }

  for (const lane of view.lanes) {
    if (lane.ghost) {
      paintGhost(c, lane.ghost, lane.phase)
    }

    for (const node of lane.nodes) {
      paintNode(
        c,
        node,
        nowMs,
        tick,
        view.density,
        slowestMs,
        node.agent.agentId === selectedId,
        hotspots,
      )
    }
  }

  const detail = panel && selected ? paintDetail(c, selected, nowMs, panel, options.detailScroll ?? 0) : undefined

  return { hotspots, orientation: view.orientation, detail }
}

/** The tick spacings a time axis may use, in ms: the smallest that keeps labels apart wins. */
const AXIS_STEPS_MS = [
  250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000,
]

/** An axis label: `0`, `2s`, `1m30s`. */
function axisLabel(ms: number): string {
  return ms === 0 ? '0' : elapsed(ms).replace(/\.0s$/, 's')
}

/**
 * The run against the clock: one row per agent, its bar from when it started
 * to when it landed, the rows grouped by phase in the graph's order.
 *
 * The graph says what fed what; this says what waited on what. A phase whose
 * bars start where the last of the phase before it ends is a barrier seen from
 * the side, and the longest chain of bars is the critical path — which the
 * node meters only hint at, since they compare each agent to the slowest, not
 * to the clock.
 */
function paintTimeline(
  c: Canvas,
  run: RunState,
  nowMs: number,
  tick: number,
  selectedId: string | undefined,
  reservedRows: number,
  columns = c.columns,
): Hotspot[] {
  const hotspots: Hotspot[] = []
  const lanes = orderedLanes(run)

  paintRunLine(c, run, nowMs, tick, columns)

  if (run.agents.length === 0) {
    c.text(0, 2, 'Waiting for the first agent to start.', COLORS.dim)

    return hotspots
  }

  const labelW = Math.max(10, Math.min(28, Math.floor(columns / 3)))
  const axisX = labelW + 1
  const axisW = Math.max(4, columns - axisX - 1)
  const startMs = Math.min(run.startedMs, ...run.agents.map(a => a.startedMs))
  const endMs = Math.max(run.endedMs ?? nowMs, ...run.agents.map(a => a.endedMs ?? nowMs))
  const span = Math.max(1000, endMs - startMs)
  const cellOf = (ms: number) =>
    axisX + Math.min(axisW - 1, Math.max(0, Math.floor(((ms - startMs) / span) * axisW)))

  // Ticks about twelve cells apart, on a round number of seconds.
  const wanted = (span / axisW) * 12
  const step = AXIS_STEPS_MS.find(s => s >= wanted) ?? AXIS_STEPS_MS[AXIS_STEPS_MS.length - 1]

  for (let x = axisX; x < axisX + axisW; x++) {
    c.put(x, 2, 0x2500, COLORS.track)
  }

  let lastLabelEnd = -1

  for (let t = 0; t <= span; t += step) {
    const x = cellOf(startMs + t)
    const label = axisLabel(t)

    c.put(x, 2, 0x253c, COLORS.idle)

    if (x > lastLabelEnd && x + label.length <= columns) {
      c.text(x, 1, label, COLORS.dim)
      lastLabelEnd = x + label.length
    }
  }

  const bottom = c.rows - reservedRows
  const running = run.status === 'running'
  const nowX = cellOf(nowMs)

  if (running) {
    c.put(nowX, 2, 0x25be, COLORS.running)
  }

  let y = 3
  let remaining = run.agents.length

  outer: for (const lane of lanes) {
    if (y >= bottom) {
      break
    }

    const landed = lane.agents.filter(a => a.state === 'done' || a.state === 'failed').length
    const active = lane.agents.some(a => a.state === 'running')
    const count = lane.agents.length > 0 ? `${landed}/${lane.agents.length}` : 'pending'
    const caption = truncate(lane.phase || 'phase', Math.max(1, labelW - count.length - 2))

    c.text(0, y, caption, active ? COLORS.accent : COLORS.text)
    c.text(labelW - count.length, y, count, COLORS.dim)
    y++

    for (const agent of lane.agents) {
      // The last row is kept for the count of what did not fit.
      if (y >= bottom - 1 && remaining > 1) {
        c.text(0, Math.min(y, bottom - 1), `… ${remaining} more`, COLORS.dim)
        break outer
      }

      if (y >= bottom) {
        break outer
      }

      const isSelected = agent.agentId === selectedId
      const color = colorOf(agent.state)
      const took = (agent.endedMs ?? nowMs) - agent.startedMs
      const room = labelW - 3

      c.put(1, y, markOf(agent.state, tick), color)
      c.text(3, y, truncate(agent.label, room), isSelected ? COLORS.accent : COLORS.text)
      hotspots.push({ agentId: agent.agentId, x: 3, y, w: Math.min(room, agent.label.length) })

      const x0 = cellOf(agent.startedMs)
      const x1 = cellOf(agent.endedMs ?? nowMs)
      const length = x1 - x0 + 1
      const isLive = agent.state === 'running'
      const glow = rgb(0xff, 0xe4, 0xa8)

      for (let x = x0; x <= x1; x++) {
        const tone = isLive
          ? mix(color, glow, pulse(x - x0, Math.max(2, length * 2), tick))
          : isSelected
            ? mix(color, COLORS.accent, 0.35)
            : color

        c.put(x, y, 0x2588, tone)
      }

      // The numbers ride after the bar where there is room; a bar against the
      // clock's edge (every running one) takes them on its left instead, and
      // one with room on neither side carries the time inside itself.
      const spent = tokensOf(agent)
      const stat = spent === undefined ? elapsed(took) : `${elapsed(took)}  ${tokens(spent)}`
      const tail = tailOf(agent, nowMs)
      const note = tail ? `${stat}  ${tail}` : stat
      const tone = tailColorOf(agent, nowMs, color)
      const after = x1 + 2
      const afterRoom = columns - after
      const beforeRoom = x0 - 1 - axisX

      if (afterRoom >= stat.length) {
        c.text(after, y, truncate(note, afterRoom), tone)
      } else if (beforeRoom >= stat.length) {
        const shown = truncate(note, beforeRoom)

        c.text(x0 - 1 - shown.length, y, shown, tone)
      } else if (length >= elapsed(took).length + 2) {
        c.text(x0 + 1, y, elapsed(took), COLORS.track, color)
      }

      remaining--
      y++
    }

    if (y < bottom) {
      y++
    }
  }

  // Where the clock stands, down the rows the agents took, in the cells no bar
  // claimed: a bar that reaches it is still going, one that stops short landed.
  if (running) {
    for (let row = 3; row < Math.min(y, bottom); row++) {
      if (c.at(nowX, row) === 0x20) {
        c.put(nowX, row, DASH_V, mix(COLORS.track, COLORS.running, 0.35))
      }
    }
  }

  return hotspots
}

/** A phase that has not started: its band, outlined, and nothing claimed. */
function paintGhost(
  c: Canvas,
  box: { x: number; y: number; w: number; h: number },
  phase: string,
): void {
  const tone = mix(COLORS.idle, COLORS.track, 0.4)

  for (let dx = 0; dx < box.w; dx++) {
    c.put(box.x + dx, box.y, DASH_H, tone)
    c.put(box.x + dx, box.y + box.h - 1, DASH_H, tone)
  }

  for (let dy = 1; dy < box.h - 1; dy++) {
    c.put(box.x, box.y + dy, DASH_V, tone)
    c.put(box.x + box.w - 1, box.y + dy, DASH_V, tone)
  }

  c.text(
    box.x + 2,
    box.y + Math.floor(box.h / 2),
    truncate(phase ? `${phase} pending` : 'pending', box.w - 4),
    tone,
  )
}

/** One line of the detail list, and the colour it is drawn in. */
type DetailLine = { text: string; color: Rgb; bg?: Rgb }

export type DetailView = {
  /** Lines the longest column has; what a scroll is measured against. */
  total: number
  /** Lines a column shows at once. */
  visible: number
  /** The first line shown, after clamping. */
  scroll: number
}

/**
 * The lines a call takes: what it was, what it was passed, and what came back.
 *
 * The payload and the answer wrap rather than truncate — what a call was
 * *about* is usually the reason the detail was opened, and one elided line of
 * it says little — so the column scrolls instead of cutting.
 *
 * A call read back from a transcript has no clock: the recording knows what was
 * passed and what returned, not when. Its duration is left off rather than
 * measured from zero, which would read as an agent that ran since the epoch.
 */
function callLines(call: ToolCall, nowMs: number, width: number): DetailLine[] {
  const running = call.startedMs > 0 && call.endedMs === undefined
  const mark = running ? '…' : call.isError ? '✘' : '✔'
  const color = running ? COLORS.running : call.isError ? COLORS.failed : COLORS.done
  const head = [
    `${mark} ${call.name}`,
    call.startedMs > 0 ? elapsed((call.endedMs ?? nowMs) - call.startedMs) : '',
    call.step ? `req ${call.step}` : '',
    call.stepTokens === undefined ? '' : tokens(call.stepTokens),
  ]
    .filter(Boolean)
    .join('  ')

  const lines: DetailLine[] = [{ text: truncate(head, width), color }]
  const body = Math.max(8, width - 2)

  wrap(call.input, body, 8).forEach(text => {
    lines.push({ text: `  ${text}`, color: mix(COLORS.text, color, 0.3) })
  })

  wrap(call.result ?? '', body, 8).forEach((text, i) => {
    lines.push({ text: i === 0 ? `  → ${text}` : `    ${text}`, color: COLORS.dim })
  })

  return lines
}

/** The cells a panel owns, its dividing rule included. */
export type Rect = { x: number; y: number; w: number; h: number }

/**
 * The selected agent, in full: what it was asked, every tool call it made
 * with what each was about and what it got back, and what it answered. The
 * graph can only hint at any of it, so this is a list, and the list scrolls:
 * the caller hands in the first line to show and gets back how many there are.
 *
 * `side` puts the panel down the right of the graph rather than across the
 * bottom. A column is the better shape for this content — it is a list of
 * wrapped prose and call results, which wants many short lines rather than few
 * long ones — so where the seat is wide enough the column is what it gets, and
 * the rule dividing the two turns ninety degrees with it.
 */
/** One titled block of the detail, laid out as a column of its own. */
type Section = { title: string; lines: (width: number) => DetailLine[] }

/**
 * The selected agent, in full, as a strip across the bottom of the canvas.
 *
 * The three things worth knowing about an agent — what it was asked, what it
 * did, what it answered — do not belong in one list. Two of them are prose and
 * one is a table of calls, and stacked in a single column the prose pushed the
 * calls off the bottom. So each takes a column of its own, divided by a rule,
 * and the strip is read across rather than scrolled through.
 *
 * One scroll position moves every column at once, each clamped to its own
 * length: separate positions would need a focused column to aim them at, and
 * there is nothing on the line to say which column has the focus.
 */
function paintDetail(c: Canvas, agent: AgentRow, nowMs: number, rect: Rect, scroll: number): DetailView {
  const color = colorOf(agent.state)

  for (let x = rect.x; x < rect.x + rect.w; x++) {
    c.put(x, rect.y, 0x2500, COLORS.track)
  }

  const took = (agent.endedMs ?? nowMs) - agent.startedMs
  const spent = tokensOf(agent)
  const quiet = quietFor(agent, nowMs)
  const calls = agent.calls ?? []
  const facts = [
    agent.phase,
    elapsed(took),
    quiet > 0 ? `quiet ${elapsed(quiet)}` : '',
    spent === undefined ? '' : `${tokens(spent)} tokens`,
    agent.steps ? `${agent.steps} ${agent.steps === 1 ? 'request' : 'requests'}` : '',
    calls.length > 0 ? `${calls.length} ${calls.length === 1 ? 'call' : 'calls'}` : '',
    agent.attempt && agent.attempt > 1 ? `try ${agent.attempt}` : '',
    agent.model ?? '',
  ].filter(Boolean)

  const headY = rect.y + 1
  const right = rect.x + rect.w - 1

  c.put(rect.x + 1, headY, agent.state === 'running' ? ARROW_RIGHT : BULLET, color)

  let x = rect.x + 3

  x += c.text(x, headY, truncate(agent.label, Math.floor(rect.w / 3)), COLORS.text)
  c.text(x + 2, headY, truncate(facts.join('   '), right - x - 2), COLORS.dim)

  const sections: Section[] = []

  if (agent.prompt) {
    const prompt = agent.prompt

    sections.push({
      title: 'Asked',
      lines: w => wrap(prompt, w, 200).map(text => ({ text, color: COLORS.text })),
    })
  }

  if (calls.length > 0) {
    sections.push({
      title: `Called  ${calls.length} ${calls.length === 1 ? 'time' : 'times'}`,
      lines: w => calls.flatMap(call => callLines(call, nowMs, w)),
    })
  } else if (agent.tools.length > 0) {
    const list = agent.tools.map(t => (t.count > 1 ? `${t.name} ×${t.count}` : t.name)).join('   ')

    sections.push({
      title: 'Called',
      lines: w => wrap(list, w, 40).map(text => ({ text, color: mix(COLORS.text, color, 0.3) })),
    })
  } else if (agent.lastTool) {
    // A run this module never watched has no call list, only the summary's
    // last call and its count.
    const count = agent.toolCalls ? `${agent.toolCalls} ${agent.toolCalls === 1 ? 'call' : 'calls'}, last ` : ''

    sections.push({
      title: 'Called',
      lines: w => wrap(`${count}${agent.lastTool}`, w, 40).map(text => ({ text, color: mix(COLORS.text, color, 0.3) })),
    })
  }

  const saying = agent.state === 'running' && agent.isThinking ? agent.saying : undefined
  const answer = agent.result ?? agent.resultPreview

  if (saying) {
    sections.push({
      title: 'Saying',
      lines: w => wrap(saying, w, 200).map(text => ({ text, color: mix(COLORS.text, color, 0.25) })),
    })
  } else if (answer) {
    sections.push({
      title: 'Said',
      lines: w => wrap(answer, w, 200).map(text => ({ text, color: mix(COLORS.text, color, 0.25) })),
    })
  }

  const bodyY = headY + 1
  const rows = Math.max(0, rect.y + rect.h - bodyY)

  if (sections.length === 0 || rows < 2) {
    return { total: 0, visible: Math.max(0, rows), scroll: 0 }
  }

  // What the agent was given and what it did are two halves of the same
  // question and read side by side. What it answered is the outcome of both,
  // so it takes a row of its own underneath, the full width of the strip: an
  // answer is prose, and prose in a third of a pane wraps every four words.
  const tail = sections.length > 1 && rows >= 7 ? sections[sections.length - 1] : null
  const head = tail ? sections.slice(0, -1) : sections
  const tailRows = tail ? Math.max(3, Math.round(rows * 0.4)) : 0
  const headRows = rows - tailRows - (tail ? 1 : 0)

  const top = paintColumns(c, { x: rect.x, y: bodyY, w: rect.w, h: headRows }, head, scroll)

  if (!tail) {
    return top
  }

  const ruleY = bodyY + headRows

  for (let x = rect.x + 1; x < rect.x + rect.w - 1; x++) {
    c.put(x, ruleY, 0x2500, COLORS.track)
  }

  const bottom = paintColumns(c, { x: rect.x, y: ruleY + 1, w: rect.w, h: tailRows }, [tail], scroll)

  return {
    total: Math.max(top.total, bottom.total),
    visible: Math.max(top.visible, bottom.visible),
    scroll: Math.max(top.scroll, bottom.scroll),
  }
}

/**
 * A row of the strip: its sections side by side, each with its title, its own
 * scrollbar, and a rule between it and the next.
 */
function paintColumns(c: Canvas, rect: Rect, sections: Section[], scroll: number): DetailView {
  const rows = rect.h - 1

  if (sections.length === 0 || rows < 1) {
    return { total: 0, visible: Math.max(0, rows), scroll: 0 }
  }

  // Each column gets an equal share; the rules between them and the scrollbar
  // each cost a cell, which comes out before the share is struck. A strip too
  // narrow for one column per section stacks the leftovers into the last one
  // rather than dropping them — a detail that silently omits what an agent
  // called is worse than one that asks for a scroll.
  const count = columnsFor(rect.w, sections.length)
  const groups: Section[][] = Array.from({ length: count }, () => [])

  sections.forEach((s, i) => groups[Math.min(i, count - 1)].push(s))

  const each = Math.floor((rect.w - 2 - (count - 1) * 3) / count)
  const body = Math.max(8, each - 1)
  const lists = groups.map(group =>
    group.flatMap((s, i) =>
      i === 0
        ? s.lines(body)
        : [{ text: '', color: COLORS.dim }, { text: s.title, color: COLORS.dim }, ...s.lines(body)],
    ),
  )
  const total = Math.max(...lists.map(l => l.length))
  const first = Math.max(0, Math.min(scroll, total - rows))

  groups.forEach((group, i) => {
    const colX = rect.x + 1 + i * (each + 3)
    const lines = lists[i]

    c.text(colX, rect.y, truncate(group[0].title, body), COLORS.dim)

    lines.slice(first, first + rows).forEach((line, row) => {
      c.text(colX, rect.y + 1 + row, line.text, line.color, line.bg, body)
    })

    if (lines.length > rows) {
      const thumb = Math.max(1, Math.round((rows / lines.length) * rows))
      const at = Math.round((first / Math.max(1, lines.length - rows)) * (rows - thumb))

      for (let row = 0; row < rows; row++) {
        const isThumb = row >= at && row < at + thumb

        c.put(colX + body, rect.y + 1 + row, isThumb ? 0x2588 : 0x2502, isThumb ? COLORS.dim : COLORS.track)
      }
    }

    // The rule between two columns runs the height of the row, so the blocks
    // read as columns rather than as text that happens to line up.
    if (i < count - 1) {
      for (let row = 0; row < rect.h; row++) {
        c.put(colX + each + 1, rect.y + row, 0x2502, COLORS.track)
      }
    }
  })

  return { total, visible: rows, scroll: first }
}

/**
 * How many of the sections fit side by side. Each needs about forty cells to
 * carry a wrapped line without breaking mid-phrase; below that the strip shows
 * fewer blocks rather than three unreadable ones.
 */
function columnsFor(width: number, sections: number): number {
  return Math.max(1, Math.min(sections, Math.floor((width - 2) / 40)))
}

/** The colour a run's status reads in. */
function runColorOf(run: RunState): Rgb {
  return run.status === 'running'
    ? COLORS.running
    : run.status === 'completed'
      ? COLORS.done
      : run.status === 'stopped'
        ? COLORS.idle
        : COLORS.failed
}

/**
 * The top line: the run's name, its clock, and the counts that say how it is
 * going — landed, failed, busy with tools, thinking, gone quiet — then, once it
 * is over, what it returned or the last thing it logged.
 */
function paintRunLine(c: Canvas, run: RunState, nowMs: number, tick: number, columns = c.columns): void {
  const running = run.status === 'running'
  const color = runColorOf(run)
  const done = run.agents.filter(a => a.state === 'done').length
  const failed = run.agents.filter(a => a.state === 'failed').length
  const busy = run.agents.filter(a => a.tools.some(t => t.isRunning)).length
  const thinking = run.agents.filter(a => a.state === 'running' && a.isThinking).length
  const quiet = run.agents.filter(a => quietFor(a, nowMs) > 0).length
  const spent =
    run.totalTokens ??
    run.agents.reduce((sum, a) => sum + (tokensOf(a) ?? 0), 0)

  c.put(0, 0, running ? spinnerAt(tick) : BULLET, color)

  let x = 2

  x += c.text(x, 0, run.name, COLORS.text)
  x += c.text(x + 2, 0, elapsed((run.endedMs ?? nowMs) - run.startedMs), color) + 2
  x += c.text(x + 2, 0, `${run.agents.length} agents`, COLORS.dim) + 2

  if (spent > 0) {
    x += c.text(x + 2, 0, tokens(spent), COLORS.dim) + 2
  }

  if (failed > 0) {
    x += c.text(x + 2, 0, `${failed} failed`, COLORS.failed) + 2
  }

  if (running) {
    if (failed === 0) {
      x += c.text(x + 2, 0, `${done} landed`, COLORS.dim) + 2
    }

    if (busy > 0) {
      x += c.text(x + 2, 0, `${busy} using tools`, mix(COLORS.dim, COLORS.accent, 0.5)) + 2
    }

    if (thinking > 0) {
      x += c.text(x + 2, 0, `${thinking} thinking`, mix(COLORS.dim, COLORS.running, 0.5)) + 2
    }

    if (quiet > 0) {
      x += c.text(x + 2, 0, `${quiet} quiet`, mix(COLORS.failed, COLORS.running, 0.5)) + 2
    }
  }

  const lastLog = run.logs?.at(-1)
  const tail = running
    ? ''
    : run.status === 'stopped'
      ? `stopped after ${done} of ${run.agents.length}`
      : (run.result ?? run.error ?? lastLog ?? '')

  if (tail) {
    c.text(x + 2, 0, truncate(tail, Math.max(0, columns - x - 3)), COLORS.text)
  }
}

function paintHeader(
  c: Canvas,
  run: RunState,
  lanes: { phase: string; x: number; y: number; w: number; rail?: number; nodes: NodeBox[] }[],
  laneAgents: { phase: string; agents: AgentRow[] }[],
  nowMs: number,
  tick: number,
  orientation: 'flow' | 'stack',
  columns = c.columns,
): void {
  paintRunLine(c, run, nowMs, tick, columns)

  // A phase caption sits over its band, and the rule under it is the phase's own
  // completion: filled to the fraction that has landed.
  lanes.forEach((lane, i) => {
    const agents = laneAgents[i]?.agents ?? []
    // An agent the run took down with it never landed; counting it as landed
    // would say a phase finished work it never did.
    const landed = agents.filter(a => a.state === 'done' || a.state === 'failed').length
    const active = agents.some(a => a.state === 'running')
    const count = agents.length > 0 ? `${landed}/${agents.length}` : 'pending'
    const tone = active ? COLORS.accent : COLORS.text

    if (orientation === 'flow') {
      c.text(lane.x, 1, truncate(lane.phase || `phase ${i + 1}`, lane.w - count.length - 2), tone)
      c.text(lane.x + lane.w - count.length, 1, count, COLORS.dim)

      const filled = agents.length > 0 ? Math.round((landed / agents.length) * lane.w) : 0

      for (let dx = 0; dx < lane.w; dx++) {
        const isFilled = dx < filled

        c.put(
          lane.x + dx,
          2,
          isFilled ? 0x2501 : 0x2500,
          isFilled ? (active ? COLORS.accent : COLORS.done) : COLORS.track,
        )
      }
    } else if (lane.rail && lane.rail > 4) {
      // Stacked, the captions run down a rail to the left of the bands, clear of
      // the arrowheads that land above each node.
      const room = lane.rail - 2

      c.text(1, lane.y, truncate(lane.phase || `phase ${i + 1}`, room), tone)
      c.text(1, lane.y + 1, count, COLORS.dim)

      const filled = agents.length > 0 ? Math.round((landed / agents.length) * (room - 2)) : 0

      for (let dx = 0; dx < room - 2; dx++) {
        const isFilled = dx < filled

        c.put(
          1 + dx,
          lane.y + 2,
          isFilled ? 0x2501 : 0x2500,
          isFilled ? (active ? COLORS.accent : COLORS.done) : COLORS.track,
        )
      }
    } else {
      c.text(1, Math.max(0, lane.y - 1), `${truncate(lane.phase || `phase ${i + 1}`, 12)} ${count}`, tone)
    }
  })

  if (lanes.length === 0) {
    c.text(0, 2, 'Waiting for the first agent to start.', COLORS.dim)
  }
}

export { COLORS }
