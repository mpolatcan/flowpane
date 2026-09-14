/**
 * Lays the run out as a layered graph, along whichever axis the pane's shape
 * (or the person's setting) calls for.
 *
 * `flow` puts one phase per column and reads left to right, which is how a
 * pipeline is usually drawn and what a wide seat wants. `stack` puts one phase
 * per row and reads top to bottom, which is what a tall narrow seat wants — a
 * pane docked beside the transcript is often forty columns wide, and a
 * five-phase run drawn across it would be five columns of eight characters.
 *
 * The layout answers to the body it is given either way: as the widest lane
 * outgrows the room, nodes drop first their stat line and then their frames, so
 * a forty-agent run still reads as a graph rather than scrolling out of view.
 */

import type { AgentRow, RunState } from './journal'
import { orderedLanes } from './shape'

/**
 * Which way the phases run. `auto` picks from the pane's proportions; `time`
 * is not a direction for the graph but the timeline in its place, one row per
 * agent along a clock, which `paint` draws without this layout.
 */
export type Orientation = 'auto' | 'flow' | 'stack' | 'time'

export type NodeBox = {
  agent: AgentRow
  x: number
  y: number
  w: number
  h: number
}

export type LaneBox = {
  phase: string
  index: number
  x: number
  y: number
  w: number
  h: number
  /** Columns reserved to the left of a stacked band for its phase caption. */
  rail?: number
  /** Where the barrier's spine stands, in the gutter before this lane. */
  busAt: number
  nodes: NodeBox[]
  /** Where a declared-but-unentered phase draws its outline. */
  ghost?: { x: number; y: number; w: number; h: number }
}

export type Layout = {
  lanes: LaneBox[]
  density: 'full' | 'compact' | 'dense'
  headerRows: number
  /** Which axis this layout used, after `auto` resolved. */
  orientation: 'flow' | 'stack'
}

const GUTTER = 5
const STACK_GUTTER = 2
const MIN_COL = 12
/**
 * Columns take the width the pane gives them; the cap is only the point past
 * which a wider node stops carrying more label and starts carrying air.
 */
const MAX_COL = 44

/**
 * Picks the axis from the pane's proportions: a seat wide enough to give every
 * phase a legible column reads left to right, anything squarer or taller reads
 * downward.
 */
export function resolveOrientation(
  setting: Orientation,
  columns: number,
  rows: number,
  phases: number,
): 'flow' | 'stack' {
  if (setting === 'flow' || setting === 'stack') {
    return setting
  }

  // One phase has no direction to read in; keep the familiar one.
  if (phases <= 1) {
    return 'flow'
  }

  const fits = phases * (MIN_COL + GUTTER)

  return columns >= fits && columns >= rows * 2 ? 'flow' : 'stack'
}

export function layout(
  run: RunState,
  columns: number,
  rows: number,
  setting: Orientation = 'auto',
  reservedRows = 0,
): Layout {
  const lanes = orderedLanes(run)
  const headerRows = 3

  if (lanes.length === 0) {
    return { lanes: [], density: 'full', headerRows, orientation: 'flow' }
  }

  const body = Math.max(1, rows - headerRows - 1 - reservedRows)
  const orientation = resolveOrientation(setting, columns, body, lanes.length)
  const widest = Math.max(1, ...lanes.map(l => l.agents.length))

  return orientation === 'flow'
    ? flowLayout(lanes, columns, body, headerRows, widest)
    : stackLayout(lanes, columns, body, headerRows, widest)
}

function densityOf(widest: number, room: number): Layout['density'] {
  return widest * 5 <= room ? 'full' : widest * 4 <= room ? 'compact' : 'dense'
}

/** Phases as columns, agents stacked inside them, the run reading rightward. */
function flowLayout(
  lanes: { phase: string; agents: AgentRow[] }[],
  columns: number,
  body: number,
  headerRows: number,
  tallest: number,
): Layout {
  const density = densityOf(tallest, body)
  const nodeH = density === 'full' ? 4 : density === 'compact' ? 3 : 1
  // Room the tallest lane leaves over goes between its nodes rather than into
  // margins at the two ends: a lane of three boxes in thirty rows read as a
  // clump with half the pane blank around it. Capped, so a lane of two does not
  // put its nodes at opposite corners.
  const tightGap = density === 'dense' ? 0 : 1
  const slack = tallest > 1 ? Math.floor((body - tallest * nodeH) / (tallest - 1)) : 0
  const nodeGap = Math.max(tightGap, Math.min(density === 'dense' ? 1 : 3, slack))

  const gutters = GUTTER * Math.max(0, lanes.length - 1)
  const spare = Math.max(0, columns - gutters - 1)
  const wanted = Math.floor(spare / Math.max(1, lanes.length))
  // MIN_COL is a floor on legibility, not on fit: a body too narrow for every
  // lane at that width loses the lanes past its edge, which is better than a
  // column of two characters.
  const colW = Math.max(4, Math.min(MAX_COL, Math.max(MIN_COL, wanted), spare))

  const boxes: LaneBox[] = []
  const graphW = colW * lanes.length + gutters
  let x = Math.max(0, Math.min(1, columns - graphW), Math.floor((columns - graphW) / 2))

  // The tallest lane sets the block every other lane centres inside, so a
  // fan-out still reads as a fan. The block itself sits near the top rather
  // than in the middle: centring it split the leftover room into a margin above
  // and an equal one below, and one gap under the graph reads as room left over
  // where two read as a drawing lost in the pane.
  const blockH = tallest * nodeH + Math.max(0, tallest - 1) * nodeGap
  const blockTop = headerRows + Math.min(2, Math.max(0, Math.floor((body - blockH) / 2)))

  lanes.forEach((lane, index) => {
    const height = lane.agents.length * nodeH + Math.max(0, lane.agents.length - 1) * nodeGap
    const top = blockTop + Math.max(0, Math.floor((blockH - height) / 2))

    boxes.push({
      phase: lane.phase,
      index,
      x,
      y: headerRows,
      w: colW,
      h: body,
      busAt: index === 0 ? x - 1 : x - Math.ceil(GUTTER / 2),
      nodes: lane.agents.map((agent, i) => ({
        agent,
        x,
        y: top + i * (nodeH + nodeGap),
        w: colW,
        h: nodeH,
      })),
      ghost:
        lane.agents.length === 0
          ? {
              x,
              y: blockTop + Math.max(0, Math.floor((blockH - Math.max(3, nodeH)) / 2)),
              w: colW,
              h: Math.max(3, nodeH),
            }
          : undefined,
    })

    x += colW + GUTTER
  })

  return { lanes: boxes, density, headerRows, orientation: 'flow' }
}

/**
 * Phases as rows, agents side by side inside them, the run reading downward.
 *
 * The phase captions take a rail down the left rather than a row of their own:
 * a stacked band already spends a row on each node's border, and a caption row
 * between bands would land exactly where the barrier's arrowheads arrive.
 */
function stackLayout(
  lanes: { phase: string; agents: AgentRow[] }[],
  columns: number,
  body: number,
  headerRows: number,
  widest: number,
): Layout {
  const rail = columns >= 44 ? 16 : 0
  const bandGap = STACK_GUTTER + 1
  const nodeGap = 2
  const usable = Math.max(8, columns - rail - 2)
  const spare = Math.max(0, usable - nodeGap * Math.max(0, widest - 1))
  const wide = Math.min(MAX_COL, Math.floor(spare / Math.max(1, widest)))

  // Below the width a label needs, side-by-side boxes stop being a graph and
  // start being confetti. The band becomes a list instead: one agent per row,
  // which is what a pane forty columns wide can actually carry.
  if (wide < MIN_COL) {
    return listLayout(lanes, columns, headerRows, rail)
  }

  const perBand = Math.floor(
    (body - bandGap * Math.max(0, lanes.length - 1)) / Math.max(1, lanes.length),
  )
  const nodeH = perBand >= 5 ? 4 : perBand >= 4 ? 3 : 1
  const density: Layout['density'] = nodeH === 4 ? 'full' : nodeH === 3 ? 'compact' : 'dense'
  const colW = wide

  const boxes: LaneBox[] = []
  let y = headerRows

  lanes.forEach((lane, index) => {
    const width = lane.agents.length * colW + Math.max(0, lane.agents.length - 1) * nodeGap
    const left = rail + Math.max(1, Math.floor((columns - rail - width) / 2))

    boxes.push({
      phase: lane.phase,
      index,
      x: 0,
      y,
      w: columns,
      h: nodeH,
      rail,
      busAt: index === 0 ? y - 1 : y - Math.ceil(bandGap / 2),
      nodes: lane.agents.map((agent, i) => ({
        agent,
        x: left + i * (colW + nodeGap),
        y,
        w: colW,
        h: nodeH,
      })),
      ghost:
        lane.agents.length === 0
          ? {
              x: rail + Math.max(1, Math.floor((columns - rail - colW) / 2)),
              y,
              w: colW,
              h: Math.max(3, nodeH),
            }
          : undefined,
    })

    y += nodeH + bandGap
  })

  return { lanes: boxes, density, headerRows, orientation: 'stack' }
}

/**
 * Every phase as a section of one-line rows: the shape a pane too narrow for
 * boxes can still carry. Order down the page is the run's order, so the list
 * needs no edges drawn between its rows.
 */
function listLayout(
  lanes: { phase: string; agents: AgentRow[] }[],
  columns: number,
  headerRows: number,
  rail: number,
): Layout {
  const left = rail > 0 ? rail : 2
  const width = Math.max(8, columns - left - 1)
  const boxes: LaneBox[] = []
  let y = headerRows

  lanes.forEach((lane, index) => {
    const nodes = lane.agents.map((agent, i) => ({
      agent,
      x: left,
      y: y + i,
      w: width,
      h: 1,
    }))

    boxes.push({
      phase: lane.phase,
      index,
      x: 0,
      y,
      w: columns,
      h: Math.max(1, lane.agents.length),
      rail,
      busAt: y - 1,
      nodes,
      ghost:
        lane.agents.length === 0 ? { x: left, y, w: width, h: 1 } : undefined,
    })

    y += Math.max(1, lane.agents.length) + 1
  })

  return { lanes: boxes, density: 'dense', headerRows, orientation: 'stack' }
}

/** Where an edge leaves a node, on the axis the layout runs along. */
export function exitOf(node: NodeBox, orientation: 'flow' | 'stack'): { x: number; y: number } {
  return orientation === 'flow'
    ? { x: node.x + node.w, y: node.y + Math.floor(node.h / 2) }
    : { x: node.x + Math.floor(node.w / 2), y: node.y + node.h }
}

/** Where an edge arrives. */
export function entryOf(node: NodeBox, orientation: 'flow' | 'stack'): { x: number; y: number } {
  return orientation === 'flow'
    ? { x: node.x - 1, y: node.y + Math.floor(node.h / 2) }
    : { x: node.x + Math.floor(node.w / 2), y: node.y - 1 }
}
