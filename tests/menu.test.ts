/**
 * The session's runs, wherever they are listed: the menu the run's name drops,
 * and the idle pane, which is that list with nothing drawn over it.
 *
 * A session leaves a dozen runs behind and they are not alike — one may still
 * be going, the rest landed, were stopped, or failed. This is the only place a
 * reader sees them together, so the grouping and the clock are the whole of
 * what it is for, and a flat list of identical names is not a list.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import type { RunState } from '../hooks/journal'
import { barRowsOf } from '../hooks/layout'
import { paint, paintIdle, type RunEntry } from '../hooks/paint'

const NOW = new Date(2026, 8, 15, 14, 30).getTime()
const HOUR = 3_600_000
const SHOWN = '\u25ae'

const MARK = { running: '\u25b8', completed: '\u2714', failed: '\u2716', stopped: '\u2298' } as const

// A heading is that state's own mark, its name, and a rule out to the edge of
// the box: the mark says which state without reading the word, and the rule
// says where the group starts.
const HEADING = /^\s*([\u25b8\u2714\u2716\u2298]) (Running|Done|Failed|Stopped) \u2500+\s*$/

/** The state names on the list, in the order the list stacks them. */
function captionsOf(lines: string[]): string[] {
  return lines.map(l => HEADING.exec(l)?.[2]).filter((c): c is string => c !== undefined)
}

function entry(id: string, status: RunEntry['status'], startedMs: number, name = id): RunEntry {
  return { id, mark: MARK[status], name, tally: '3/6', status, startedMs }
}

/** A run for the pane to be drawing while the menu is open over it. */
function shownRun(runId: string): RunState {
  return {
    runId,
    name: runId,
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_a',
    runFile: '/session/workflows/wf_a.json',
    startedMs: NOW - HOUR,
    status: 'running',
    phases: ['Collect'],
    agents: [
      {
        agentId: 'x1',
        label: 'collect:one',
        phase: 'Collect',
        state: 'running',
        startedMs: NOW - HOUR,
        tools: [],
      },
    ],
    consumed: 0,
  }
}

/** The menu's own lines: the rows of the box the run's name drops. */
function menuOf(runs: RunEntry[], shownId = 'wf_a', rows = 26): string[] {
  const canvas = new Canvas(80, rows)

  paint(canvas, shownRun(shownId), {
    nowMs: NOW,
    tick: 0,
    orientation: 'horizontal',
    runPicker: 'open',
    runs,
  })

  const lines: string[] = []

  for (let y = 0; y < canvas.rows; y++) {
    let line = ''

    for (let x = 0; x < canvas.columns; x++) {
      line += String.fromCodePoint(canvas.at(x, y) || 0x20)
    }

    lines.push(line)
  }

  const top = barRowsOf(canvas.rows, canvas.columns)
  const height = lines.slice(top).findIndex(line => line.includes('\u2570'))

  return lines.slice(top + 1, top + height).map(line => line.slice(line.indexOf('\u2502') + 1, line.lastIndexOf('\u2502')))
}

test('the menu stacks the runs by state, what is still going first', () => {
  const lines = menuOf([
    entry('wf_c', 'stopped', NOW - 3 * HOUR, 'audit'),
    entry('wf_a', 'running', NOW - HOUR, 'audit'),
    entry('wf_d', 'failed', NOW - 4 * HOUR, 'demo'),
    entry('wf_b', 'completed', NOW - 2 * HOUR, 'demo'),
  ])

  expect(captionsOf(lines)).toEqual(['Running', 'Done', 'Failed', 'Stopped'])

  // A heading carries the same mark its runs do, so a reader who has learnt
  // the mark on a card reads the group without reading the word.
  const headings = lines.map(l => HEADING.exec(l)?.[1]).filter(Boolean)

  expect(headings).toEqual([MARK.running, MARK.completed, MARK.failed, MARK.stopped])

  // Each run stands under its own heading, in that order.
  const marks = lines
    .filter(l => /\d\d:\d\d:\d\d/.test(l))
    .map(l => l.replace(SHOWN, '').trim()[0])

  expect(marks).toEqual([MARK.running, MARK.completed, MARK.failed, MARK.stopped])
})

test('inside a state the most recent run is the first one', () => {
  const lines = menuOf([
    entry('wf_old', 'stopped', NOW - 5 * HOUR, 'audit'),
    entry('wf_new', 'stopped', NOW - HOUR, 'audit'),
    entry('wf_mid', 'stopped', NOW - 3 * HOUR, 'audit'),
  ])

  const clocks = lines.map(l => /(\d\d:\d\d:\d\d)\s*$/.exec(l)?.[1]).filter(Boolean)

  expect(clocks).toEqual(['13:30:00', '11:30:00', '09:30:00'])
})

test('two runs a minute apart are told apart by the second they started on', () => {
  const lines = menuOf([
    entry('wf_a', 'stopped', NOW - 61_000, 'audit'),
    entry('wf_b', 'stopped', NOW - 47_000, 'audit'),
  ])

  // Same name, same state, same minute: the clock is the only thing that says
  // which run is which, so it is drawn to the second.
  expect(lines[0]).toMatch(/14:29:13\s*$/)
  expect(lines[1]).toMatch(/14:28:59\s*$/)
})

test('one state on the list takes no heading', () => {
  const lines = menuOf([entry('wf_a', 'stopped', NOW - HOUR), entry('wf_b', 'stopped', NOW - 2 * HOUR)])

  expect(captionsOf(lines)).toEqual([])
  expect(lines.length).toBe(2)
})

test('a run from another day carries the day as well as the clock', () => {
  const lines = menuOf([entry('wf_a', 'stopped', NOW - HOUR), entry('wf_b', 'stopped', NOW - 30 * HOUR)])

  expect(lines[0]).toMatch(/13:30:00\s*$/)
  expect(lines[1]).toMatch(/Sep 14 08:30:00\s*$/)
})

test('the run the pane is drawing is the marked one', () => {
  const lines = menuOf([entry('wf_a', 'stopped', NOW - HOUR), entry('wf_b', 'stopped', NOW - 2 * HOUR)], 'wf_b')

  expect(lines[0].includes(SHOWN)).toBe(false)
  expect(lines[1].includes(SHOWN)).toBe(true)
})

test('a menu too tall for the pane drops its headings before it drops a run', () => {
  const many = Array.from({ length: 12 }, (_, i) => entry(`wf_${i}`, 'stopped', NOW - (i + 1) * HOUR, 'audit'))
  const lines = menuOf([entry('wf_a', 'running', NOW), ...many], 'wf_a', 16)

  expect(captionsOf(lines)).toEqual([])
  expect(lines[0]).toContain(MARK.running)
  expect(lines[lines.length - 1]).toMatch(/more — \/flowpane runs/)
})

/** The idle pane's own lines, trailing blanks trimmed. */
function idleOf(runs: RunEntry[], columns = 76, rows = 20): { lines: string[]; pressable: string[] } {
  const canvas = new Canvas(columns, rows)
  const hotspots = paintIdle(canvas, runs, NOW)
  const lines: string[] = []

  for (let y = 0; y < canvas.rows; y++) {
    let line = ''

    for (let x = 0; x < canvas.columns; x++) {
      line += String.fromCodePoint(canvas.at(x, y) || 0x20)
    }

    lines.push(line.trimEnd())
  }

  return { lines, pressable: hotspots.map(h => h.agentId) }
}

test('with no run to draw the pane draws what the session has run', () => {
  const { lines, pressable } = idleOf([
    entry('wf_a', 'running', NOW - HOUR, 'audit'),
    entry('wf_b', 'completed', NOW - 2 * HOUR, 'demo'),
    entry('wf_c', 'stopped', NOW - 3 * HOUR, 'audit'),
  ])

  // The same bar the run view opens with, title and all, so idle is the same
  // pane rather than a second one that resembles it.
  expect(lines[0].trim()).toBe('FlowPane - Dynamic Workflow Visualizer')
  expect(lines[1]).toMatch(/^\u2500+$/)
  expect(lines[2]).toContain('FlowPane')
  expect(lines[2]).toContain('nothing running')
  expect(lines[2]).toContain('3 runs this session')
  expect(lines[3]).toMatch(/^\u2500+$/)

  const body = lines.join('\n')

  // Headed the way the menu heads the same runs: one list, one treatment.
  expect(captionsOf(lines)).toEqual(['Running', 'Done', 'Stopped'])
  expect(body).toMatch(/audit\s+3\/6\s+13:30:00/)

  // Every run is a press, and nothing else on the pane is.
  expect(pressable).toEqual(['run:wf_a', 'run:wf_b', 'run:wf_c'])
  expect(body).toContain('Press a run to draw it.')
})

test('a session with nothing to list is told what will fill the pane', () => {
  const { lines, pressable } = idleOf([])
  const body = lines.join('\n')

  expect(pressable).toEqual([])
  expect(body).toContain('No workflow has run in this session yet.')
  expect(body).toContain('Start one and its graph draws itself here as it goes.')
  // Nothing counts runs that are not there.
  expect(body).not.toMatch(/\d+ runs? this session/)
})

test('a short idle pane keeps the runs and drops what it can', () => {
  const many = Array.from({ length: 9 }, (_, i) => entry(`wf_${i}`, 'stopped', NOW - (i + 1) * HOUR, 'audit'))
  const { lines, pressable } = idleOf(many, 60, 10)

  expect(pressable.length).toBeGreaterThan(0)
  expect(lines.join('\n')).toMatch(/more — \/flowpane runs/)
  expect(lines.length).toBe(10)
})
