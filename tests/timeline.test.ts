/**
 * What the timeline says over its bars: the chain of agents that decided how
 * long the run took, the ribbon that stands for the whole run while zoomed, and
 * the presses that change the scale.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import type { AgentRow, RunState } from '../hooks/journal'
import { paint, ZOOM_IN, ZOOM_OUT } from '../hooks/paint'

const STARTED = 1_700_000_000_000
const ENDED = STARTED + 30_000
const SHADES = ['░', '▒', '▓', '█']

function at(label: string, from: number, to: number): AgentRow {
  return {
    agentId: label,
    label,
    phase: 'Work',
    state: 'done',
    startedMs: STARTED + from,
    endedMs: STARTED + to,
    tools: [],
  }
}

function runOf(agents: AgentRow[]): RunState {
  return {
    runId: 'wf_trace',
    name: 'trace',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_trace',
    runFile: '/session/workflows/wf_trace.json',
    startedMs: STARTED,
    endedMs: ENDED,
    status: 'completed',
    phases: ['Work'],
    agents,
    consumed: 0,
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

function drawn(run: RunState, zoom: number, x = 0) {
  const canvas = new Canvas(110, 24)
  const result = paint(canvas, run, {
    nowMs: ENDED, tick: -1, orientation: 'timeline', follow: false, zoom, bodyScroll: { x, y: 0 },
  })

  return { canvas, result, rows: rowsOf(canvas), ruler: rowsOf(canvas).findIndex(row => row.includes(`${zoom}×`)) }
}

const TRACE = () => runOf([at('alpha', 0, 10_000), at('bravo', 2_000, 4_000), at('charlie', 10_000, 30_000)])
const SHORT = () => runOf([at('alpha', 0, 10_000), at('bravo', 2_000, 2_100), at('charlie', 10_000, 30_000)])

test('the agents the run waited on are marked down the gutter, and the ruler says how long they took', () => {
  const { canvas, rows, ruler } = drawn(TRACE(), 1)
  const rowOf = (name: string) => rows.findIndex(row => row.includes(name))

  expect(String.fromCodePoint(canvas.at(0, rowOf('alpha')))).toBe('┃')
  expect(String.fromCodePoint(canvas.at(0, rowOf('charlie')))).toBe('┃')
  expect(String.fromCodePoint(canvas.at(0, rowOf('bravo')) || 0x20)).not.toBe('┃')
  expect((rows[ruler] ?? '').trimEnd().endsWith('┃ critical path 30.0s')).toBe(true)
})

test('zoomed in, the row over the ruler is the whole run, shaded', () => {
  const { rows, ruler } = drawn(SHORT(), 4)
  const ribbon = rows[ruler - 1] ?? ''

  expect(ribbon).toContain('whole run')
  expect(SHADES.some(shade => ribbon.includes(shade))).toBe(true)
})

test('at the whole run in one pane there is no ribbon', () => {
  const { rows } = drawn(SHORT(), 1)

  expect(rows.some(row => row.includes('whole run'))).toBe(false)
})

test('scrolled along a zoomed timeline, the lit stretch of the ribbon moves right', () => {
  const first = drawn(SHORT(), 4)
  const spanX = first.result.body?.spanX ?? 0

  expect(spanX).toBeGreaterThan(0)

  const later = drawn(SHORT(), 4, spanX)
  const shaded = (row: string) => [...row].flatMap((ch, x) => (SHADES.includes(ch) ? [x] : []))
  const ends = (d: ReturnType<typeof drawn>) => {
    const xs = shaded(d.rows[d.ruler - 1] ?? '')
    const fg = (x: number) => JSON.stringify(d.canvas.cell(x, d.ruler - 1).fg)

    return { head: fg(xs[0] ?? 0), tail: fg(xs[xs.length - 1] ?? 0) }
  }

  const before = ends(first)
  const after = ends(later)

  expect(before.head).not.toBe(after.head)
  expect(after.tail).toBe(before.head)
})

test('the ruler carries the zoom presses in its gutter', () => {
  const { result, rows, ruler } = drawn(TRACE(), 1)

  expect((rows[ruler] ?? '').slice(2, 8)).toBe('− 1× +')

  const spots = result.hotspots.filter(h => h.agentId === ZOOM_OUT || h.agentId === ZOOM_IN)

  expect(spots.find(h => h.agentId === ZOOM_OUT)?.x).toBe(2)
  expect(spots.find(h => h.agentId === ZOOM_IN)?.x).toBe(7)
})
