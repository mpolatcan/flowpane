/**
 * A band whose cards are spread across the pane, read off the drawing.
 *
 * Down the pane the room a band does not need goes between its cards, so the
 * gap two neighbours leave can be most of a card wide. What stands in that gap
 * and over it has to follow: the hop from one pass to the next reaches across
 * it, the heading stands over the cards rather than off the pane, and the
 * drawing as a whole stands in the middle of the body with the phases still
 * ahead counted in.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import type { AgentRow, RunState } from '../hooks/journal'
import { entryOf, layout } from '../hooks/layout'
import { paint } from '../hooks/paint'

const STARTED = 1_700_000_000_000
const PORT = '•'
const ARROW_RIGHT = '▸'
const FOUND = 'The token refresh path renews the access token and never the refresh one, so a session lapses at an hour.'

function agentOf(id: string, label: string, phase: string, from: number, ms: number): AgentRow {
  return {
    agentId: id,
    label,
    phase,
    state: 'done',
    startedMs: STARTED + from,
    endedMs: STARTED + from + ms,
    tools: [],
    tokens: 12_000,
    result: 'done',
  }
}

function runOf(phases: string[], agents: AgentRow[], status: RunState['status'] = 'completed'): RunState {
  return {
    runId: 'wf_test',
    name: 'audit',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_test',
    runFile: '/session/workflows/wf_test.json',
    startedMs: STARTED,
    status,
    phases,
    agents,
    consumed: 120_000,
  }
}

function rowsOf(canvas: Canvas): string[] {
  const lines: string[] = []

  for (let y = 0; y < canvas.rows; y++) {
    let line = ''

    for (let x = 0; x < canvas.columns; x++) {
      line += String.fromCodePoint(canvas.at(x, y) || 0x20)
    }

    lines.push(line)
  }

  return lines
}

function drawn(run: RunState, columns: number, rows: number) {
  const canvas = new Canvas(columns, rows)
  const painted = paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    follow: false,
    bodyScroll: { x: 0, y: 0 },
  })

  return {
    rows: rowsOf(canvas),
    view: painted.view ?? layout(run, columns, rows, 'vertical', 0),
  }
}

test('down a wide pane, the hop from one pass to the next reaches across the spread gap', () => {
  const run = runOf(['Survey', 'Review'], [
    agentOf('s1', 'survey:paint', 'Survey', 0, 4_000),
    agentOf('r1', 'review:pass 1', 'Review', 5_000, 3_000),
    agentOf('r2', 'review:pass 2', 'Review', 8_100, 3_000),
  ])
  const { rows, view } = drawn(run, 160, 24)
  const review = view.lanes.find(lane => lane.phase === 'Review')?.nodes ?? []
  const from = review.find(node => node.agent.agentId === 'r1')
  const to = review.find(node => node.agent.agentId === 'r2')

  expect(from).toBeDefined()
  expect(to).toBeDefined()

  if (!from || !to) {
    return
  }

  const y = from.y + Math.floor(from.h / 2)

  expect(to.x - (from.x + from.w)).toBeGreaterThan(3)
  expect((rows[y] as string)[from.x + from.w]).toBe(PORT)
  expect((rows[y] as string)[to.x - 1]).toBe(ARROW_RIGHT)
})

test('down the pane, a carry the files record arrives in the heavy upright stroke', () => {
  const run = runOf(['Gather', 'Fix'], [
    { ...agentOf('g1', 'gather:paint', 'Gather', 0, 900), result: FOUND },
    agentOf('g2', 'gather:layout', 'Gather', 0, 900),
    { ...agentOf('f1', 'fix:paint', 'Fix', 2_000, 900), prompt: `Fix what was found. ${FOUND}` },
    agentOf('f2', 'fix:layout', 'Fix', 2_000, 900),
  ])
  const { rows, view } = drawn(run, 100, 24)
  const fix = view.lanes.find(lane => lane.phase === 'Fix')?.nodes ?? []
  const above = (id: string) => {
    const node = fix.find(n => n.agent.agentId === id)

    if (!node) {
      return undefined
    }

    const into = entryOf(node, 'vertical')

    return (rows[into.y - 1] as string)[into.x]
  }

  expect(above('f1')).toBe('┃')
  expect(above('f2')).toBe('│')
})

test('a heading over a band that runs past the pane stays inside the pane, on its rule', () => {
  const names = ['rivers', 'reefs', 'dunes', 'fjords', 'deltas', 'mesas', 'atolls', 'tarns']
  const run = runOf(
    ['Survey'],
    names.map((name, i) => agentOf(`s${i}`, `survey:${name}`, 'Survey', 0, 4_000)),
  )
  const columns = 80
  const { rows, view } = drawn(run, columns, 24)
  const cards = view.lanes.find(lane => lane.phase === 'Survey')?.nodes ?? []
  const rule = rows.find(row => row.includes('Survey')) ?? ''

  expect(Math.max(...cards.map(n => n.x + n.w))).toBeGreaterThan(columns)
  const at = rule.indexOf('Survey')

  expect(at).toBeGreaterThan(0)
  expect(at + 'Survey'.length).toBeLessThan(columns - 2)
  expect(rule).toContain('Survey  8/8  4.0s')
  expect(rule.slice(0, at)).toMatch(/[─━]/)
})

test('down a tall pane, the phases still ahead are counted in when the drawing is stood in the middle', () => {
  const run = runOf(
    ['Survey', 'Verify', 'Escalate'],
    [agentOf('s1', 'survey:paint', 'Survey', 0, 4_000), agentOf('s2', 'survey:layout', 'Survey', 0, 4_000)],
    'running',
  )
  const { rows } = drawn(run, 90, 40)
  const blank = (row: string) => row.trim() === ''
  const lastAhead = rows.map((row, y) => (/^ ○ /.test(row) ? y : -1)).reduce((a, b) => Math.max(a, b), -1)
  const firstBody = rows.findIndex((row, y) => y > 2 && !blank(row))
  let headerEnd = firstBody - 1

  while (headerEnd > 0 && blank(rows[headerEnd] as string)) {
    headerEnd--
  }

  const above = firstBody - headerEnd - 1
  const below = rows.slice(lastAhead + 1).filter(blank).length

  expect(lastAhead).toBeGreaterThan(firstBody)
  expect(below >= above && below <= above + 1).toBe(true)
})

test('in the timeline, the phases still ahead are counted in once when the trace is stood in the middle', () => {
  const run = runOf(
    ['Survey', 'Verify', 'Escalate', 'Report', 'Close'],
    [agentOf('s1', 'survey:paint', 'Survey', 0, 4_000), agentOf('s2', 'survey:layout', 'Survey', 0, 4_000)],
    'running',
  )
  const canvas = new Canvas(140, 60)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: -1, orientation: 'timeline', follow: false })

  const rows = rowsOf(canvas)
  const blank = (row: string) => row.trim() === ''
  const lastAhead = rows.map((row, y) => (/○ /.test(row) ? y : -1)).reduce((a, b) => Math.max(a, b), -1)
  const firstBody = rows.findIndex((row, y) => y > 2 && !blank(row))
  let headerEnd = firstBody - 1

  while (headerEnd > 0 && blank(rows[headerEnd] as string)) {
    headerEnd--
  }

  const above = firstBody - headerEnd - 1
  const below = rows.slice(lastAhead + 1).filter(blank).length

  expect(lastAhead).toBeGreaterThan(firstBody)
  expect(Math.abs(above - below)).toBeLessThanOrEqual(2)
})
