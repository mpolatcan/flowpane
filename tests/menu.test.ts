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
import { paint, paintIdle, type RunEntry, type RunWindow } from '../hooks/paint'

const NOW = new Date(2026, 8, 15, 14, 30).getTime()
const HOUR = 3_600_000
const SHOWN = '\u25ae'

const MARK = { running: '\u25b8', completed: '\u2714', failed: '\u2716', stopped: '\u2298' } as const

// A heading is that state's own mark, its name, and a rule out to the edge of
// the box: the mark says which state without reading the word, and the rule
// says where the group starts.
// The rule stops where the clocks do, so on a list tall enough to scroll the
// bar's own column stands after it.
const HEADING = /^\s*([\u25b8\u2714\u2716\u2298]) (Running|Done|Failed|Stopped) \u2500+[\s\u2502\u2588\u25b4\u25be]*$/

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

/**
 * The menu drawn over a run, and everything the paint said about it: its own
 * rows, what can be pressed, and how much of the list the box could stand.
 */
function menuPaint(
  runs: RunEntry[],
  shownId = 'wf_a',
  rows = 26,
  runScroll?: number,
): { lines: string[]; pressable: string[]; runList?: RunWindow } {
  const canvas = new Canvas(80, rows)

  const drawn = paint(canvas, shownRun(shownId), {
    nowMs: NOW,
    tick: 0,
    orientation: 'horizontal',
    runPicker: 'open',
    runs,
    ...(runScroll === undefined ? {} : { runScroll }),
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

  return {
    lines: lines
      .slice(top + 1, top + height)
      .map(line => line.slice(line.indexOf('\u2502') + 1, line.lastIndexOf('\u2502'))),
    pressable: drawn.hotspots.map(h => h.agentId),
    ...(drawn.runList ? { runList: drawn.runList } : {}),
  }
}

/** The menu's own lines: the rows of the box the run's name drops. */
function menuOf(runs: RunEntry[], shownId = 'wf_a', rows = 26): string[] {
  return menuPaint(runs, shownId, rows).lines
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

/** One run still going and twelve stopped: more list than any short pane holds. */
function crowd(): RunEntry[] {
  const many = Array.from({ length: 12 }, (_, i) => entry(`wf_${i}`, 'stopped', NOW - (i + 1) * HOUR, 'audit'))

  return [entry('wf_a', 'running', NOW), ...many]
}

test('a menu too tall for the pane keeps its headings and offers the rest', () => {
  const { lines, pressable, runList } = menuPaint(crowd(), 'wf_a', 16)

  // The headings used to be the first thing dropped, on a list that was being
  // cut off anyway. A list that scrolls keeps them: they are three rows out of
  // fifteen, and the piles they divide are what the list is for.
  expect(captionsOf(lines)).toEqual(['Running', 'Stopped'])
  expect(lines[0]).toContain(MARK.running)

  // And what did not fit is reachable rather than counted: no line says how
  // many runs were left out, because none were.
  expect(lines.join('\n')).not.toMatch(/more/)
  expect(pressable).toContain('runs-down')
  expect(runList?.total).toBe(15)
  expect(runList?.visible).toBeLessThan(15)
})

test('a menu scrolled to its end shows the runs the top of the list hid', () => {
  const runs = crowd()
  const held = menuPaint(runs, 'wf_a', 16)
  const { lines, pressable, runList } = menuPaint(runs, 'wf_a', 16, 99)

  // Asked for further than the list goes, it settles on the last screenful:
  // a reader holding the arrow down stops at the end rather than at a blank.
  expect(runList?.scroll).toBe((held.runList?.total ?? 0) - (held.runList?.visible ?? 0))
  // The oldest run of the pile, twelve hours back: the last row the list has.
  expect(lines.join('\n')).toContain('02:30:00')
  expect(pressable).toContain('runs-up')
  expect(pressable).not.toContain('runs-down')
})

test('an unscrolled menu opens on the run the pane is drawing', () => {
  const runs = Array.from({ length: 20 }, (_, i) => entry(`wf_${i}`, 'stopped', NOW - (i + 1) * HOUR, 'audit'))
  const { lines } = menuPaint(runs, 'wf_18', 14)

  // The list is opened to move off the run in the bar. Seated at the top it
  // opened ten rows above the only row that says where the reader is standing.
  expect(lines.some(line => line.includes(SHOWN))).toBe(true)
})

/** The idle pane's own lines, trailing blanks trimmed. */
function idleOf(
  runs: RunEntry[],
  columns = 76,
  rows = 20,
  runScroll?: number,
): { lines: string[]; pressable: string[]; runList?: RunWindow } {
  const canvas = new Canvas(columns, rows)
  const drawn = paintIdle(
    canvas,
    runs,
    NOW,
    runScroll === undefined ? undefined : { nowMs: NOW, tick: 0, detailRows: 24, runScroll },
  )
  const { hotspots } = drawn
  const lines: string[] = []

  for (let y = 0; y < canvas.rows; y++) {
    let line = ''

    for (let x = 0; x < canvas.columns; x++) {
      line += String.fromCodePoint(canvas.at(x, y) || 0x20)
    }

    lines.push(line.trimEnd())
  }

  return {
    lines,
    pressable: hotspots.map(h => h.agentId),
    ...(drawn.runList ? { runList: drawn.runList } : {}),
  }
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

test('a short idle pane scrolls to the runs it has no room for', () => {
  const many = Array.from({ length: 9 }, (_, i) => entry(`wf_${i}`, 'stopped', NOW - (i + 1) * HOUR, 'audit'))
  const { lines, pressable, runList } = idleOf(many, 60, 10)

  // The pane is the list here, so the list is the thing that gets the room and
  // the runs it cannot stand are reachable rather than counted.
  expect(pressable.length).toBeGreaterThan(0)
  expect(pressable).toContain('runs-down')
  expect(lines.join('\n')).not.toMatch(/more/)
  expect(runList?.total).toBe(9)
  expect(lines.length).toBe(10)

  const end = idleOf(many, 60, 10, 99)

  // And moved to its end it shows the oldest run, clamped to the last
  // screenful rather than run off into blank rows.
  expect(end.runList?.scroll).toBe(9 - (runList?.visible ?? 0))
  expect(end.lines.join('\n')).toContain('05:30:00')
  expect(end.pressable).toContain('runs-up')
  expect(end.pressable).not.toContain('runs-down')
})
