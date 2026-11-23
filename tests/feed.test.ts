/**
 * The activity strip: what the run has done, one line per thing a reader of a
 * pipeline waits to hear about, under a rule at the foot of the pane.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import { applyRunFile, noteCallStart, noteStep, type AgentRow, type AgentState, type RunState, type ToolCall } from '../hooks/journal'
import { paint, type FeedView } from '../hooks/paint'

const STARTED = 1_700_000_000_000
const NOW = STARTED + 60_000

let id = 0

function call(name: string, input: string, atS: number, extra: Partial<ToolCall> = {}): ToolCall {
  return { id: `c${id++}`, name, input, startedMs: STARTED + atS * 1_000, endedMs: STARTED + atS * 1_000 + 500, ...extra }
}

function agent(label: string, state: AgentState, calls: ToolCall[], extra: Partial<AgentRow> = {}): AgentRow {
  return {
    agentId: label.toLowerCase(),
    label,
    phase: label,
    state,
    startedMs: STARTED,
    activeMs: NOW - 500,
    ...(state === 'running' ? {} : { endedMs: STARTED + 30_000 }),
    tools: [],
    calls,
    ...extra,
  }
}

function runOf(agents: AgentRow[]): RunState {
  return {
    runId: 'wf_feed',
    name: 'dev-pipeline',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_feed',
    runFile: '/session/workflows/wf_feed.json',
    startedMs: STARTED,
    status: 'running',
    phases: agents.map(a => a.phase),
    agents,
    consumed: 0,
  }
}

/** The pipeline mid-develop: a gate that passed, then reads, edits and commands. */
function pipeline(): RunState {
  return runOf([
    agent('Preflight', 'done', [], { verdict: { passed: true, summary: 'plan located, tools ready' }, endedMs: STARTED + 4_000 }),
    agent('Develop', 'running', [
      call('Read', '/wt/feature/src/stores/config.ts', 5),
      call('Read', '/wt/feature/src/stores/ai-status.ts', 6),
      call('Grep', 'pattern: useAiStatus', 7),
      call('Edit', 'replace_all: false\nfile_path: /wt/feature/src/stores/config.ts\nold_string: a', 10),
      call('Bash', 'cd /wt/feature && npm run lint', 12, { isError: true }),
      call('Write', 'file_path: /wt/feature/src/stores/ai-status.ts\ncontent: export {}', 14),
      call('Bash', 'command: cd "/wt/feature" && npx vitest run', 16, { endedMs: undefined }),
    ]),
  ])
}

function rows(
  run: RunState,
  columns: number,
  height: number,
  feedRows: number,
  feedTop?: number,
): { canvas: Canvas; lines: string[]; feed?: FeedView } {
  const canvas = new Canvas(columns, height)

  const drawn = paint(canvas, run, { nowMs: NOW, tick: 0, orientation: 'vertical', feedRows, feedTop })

  const lines: string[] = []

  for (let y = 0; y < height; y++) {
    let text = ''

    for (let x = 0; x < columns; x++) {
      text += String.fromCodePoint(canvas.at(x, y) || 0x20)
    }

    lines.push(text.trimEnd())
  }

  return { canvas, lines, feed: drawn.feed }
}

test('the strip says what the run did, newest last, under a rule with its label in the middle and a row naming its columns', () => {
  const { lines } = rows(pipeline(), 100, 30, 6)

  expect(lines.slice(-8)).toEqual([
    `${'─'.repeat(45)} activity ${'─'.repeat(45)}`,
    '  time    agent      what happened',
    '  4.0s  ✔ Preflight  passed: plan located, tools ready',
    '  5.0s  · Develop    read 2 files, searched once',
    ' 10.0s  · Develop    edited stores/config.ts',
    ' 12.0s  ✖ Develop    ran the linter, which failed',
    ' 14.0s  · Develop    wrote stores/ai-status.ts',
    ' 16.0s  \u25b8 Develop    ran the tests',
  ])
})

/** A strip line with an arrow in the pane's last column, at 100 columns. */
function edge(line: string, arrow: string): string {
  return `${line.padEnd(99)}${arrow}`
}

test('the strip follows the newest lines under its column names, and its bar says there is more above', () => {
  const { canvas, lines } = rows(pipeline(), 100, 30, 2)

  expect(lines.slice(-3)).toEqual([
    '  time    agent      what happened',
    edge(' 14.0s  \u00b7 Develop    wrote stores/ai-status.ts', '\u25b4'),
    edge(' 16.0s  \u25b8 Develop    ran the tests', '\u25be'),
  ])
  // The arrow towards more is lit and the one at the end it stands at is not.
  expect(canvas.cell(99, 28).fg).not.toEqual(canvas.cell(99, 29).fg)
})

test('scrolled back, the strip shows older lines, with an arrow either way there is more', () => {
  const { lines, feed } = rows(pipeline(), 100, 30, 2, 2)

  expect(lines.slice(-2)).toEqual([
    edge(' 10.0s  \u00b7 Develop    edited stores/config.ts', '\u25b4'),
    edge(' 12.0s  \u2716 Develop    ran the linter, which failed', '\u25be'),
  ])
  expect(feed).toEqual({ y: 28, rows: 2, top: 2, lines: 6 })
})

test('the strip cannot be scrolled past its oldest line', () => {
  const { lines, feed } = rows(pipeline(), 100, 30, 2, -5)

  expect(lines.slice(-2)).toEqual([
    edge('  4.0s  \u2714 Preflight  passed: plan located, tools ready', '\u25b4'),
    edge('  5.0s  \u00b7 Develop    read 2 files, searched once', '\u25be'),
  ])
  expect(feed?.top).toBe(0)
})

test('the mark and the name carry the state, and the words stay grey', () => {
  const { canvas, lines } = rows(pipeline(), 100, 30, 6)
  const y = lines.findIndex(line => line.includes('which failed'))
  const fg = (text: string) => canvas.cell(lines[y]!.indexOf(text), y).fg
  const passed = lines.findIndex(line => line.includes('passed:'))

  expect(fg('✖')).not.toEqual(fg('ran'))
  expect(fg('Develop')).not.toEqual(fg('ran'))
  expect(canvas.cell(lines[passed]!.indexOf('✔'), passed).fg).not.toEqual(fg('✖'))
})

test('the strip takes no rows while it is off, while nothing has happened, or on a pane too short for it', () => {
  const off = rows(pipeline(), 100, 30, 0).lines.join('\n')
  const quiet = rows(runOf([agent('Develop', 'running', [])]), 100, 30, 6).lines.join('\n')
  const short = rows(pipeline(), 100, 18, 6).lines.join('\n')

  for (const text of [off, quiet, short]) {
    expect(text).not.toContain('activity')
  }
})

test('the settings dialog reads the strip it is drawn over', () => {
  const canvas = new Canvas(100, 34)

  paint(canvas, pipeline(), { nowMs: NOW, tick: 0, orientation: 'vertical', feedRows: 3, settings: true })

  let text = ''

  for (let y = 0; y < 34; y++) {
    for (let x = 0; x < 100; x++) {
      text += String.fromCodePoint(canvas.at(x, y) || 0x20)
    }

    text += '\n'
  }

  // The drawing over the strip is painted as a pane three rows and a rule
  // shorter, and a dialog in it that read the setting as spent on that would
  // say `off` while the strip stood under it.
  expect(text).toContain('[3 rows]')
  expect(text).toContain('activity')
})

test('an agent that said why it made its calls is quoted, with what it did after the words', () => {
  const why = 'Lint clean. Now run the affected unit tests.'
  const run = runOf([
    agent('Develop', 'running', [
      call('Read', '/wt/feature/src/stores/config.ts', 5, { why }),
      call('Bash', 'command: npx vitest run stores\ndescription: Run tests', 6, { why }),
      call('Bash', 'command: git diff --stat\ndescription: See what changed so far', 8),
    ]),
  ])
  const { lines } = rows(run, 110, 30, 2)

  // Calls one request issued share its words and one line; a call with no words
  // of its own says what its description says it is for.
  expect(lines.slice(-2)).toEqual([
    ' 5.0s  \u00b7 Develop  Lint clean. Now run the affected unit tests. \u2192 read config.ts, ran the tests for stores',
    ' 8.0s  \u00b7 Develop  See what changed so far \u2192 looked at the changes',
  ])
})

test('words too long for one line wrap over as many as they need, whole', () => {
  const why = 'The pill test failures are a mounting artifact: when the root v-if is false it renders as a comment node, so the element does not re-point after the flip. The fix is to mount it inside a stable wrapper.'
  const run = runOf([
    agent('Develop', 'running', [
      call('Bash', 'npm run lint', 4),
      call('Edit', 'file_path: /wt/feature/src/AiStatusPill.test.ts', 6, { why }),
    ]),
  ])
  const { lines } = rows(run, 80, 30, 6)

  expect(lines.slice(-5)).toEqual([
    ' 6.0s  \u00b7 Develop  The pill test failures are a mounting artifact: when the',
    '                  root v-if is false it renders as a comment node, so the',
    '                  element does not re-point after the flip. The fix is to',
    '                  mount it inside a stable wrapper. \u2192 edited',
    '                  AiStatusPill.test.ts',
  ])
  expect(lines.join('\n')).not.toContain('\u2026')
})

test('what a request says before its calls is what those calls are stamped with, live', () => {
  const run = runOf([agent('Develop', 'running', [])])

  noteStep(run, 'develop', NOW, { kind: 'start' })
  noteStep(run, 'develop', NOW, { kind: 'text', text: 'Lint clean. ' })
  noteStep(run, 'develop', NOW, { kind: 'text', text: 'Now run the affected unit tests.' })
  noteCallStart(run, 'develop', { id: 'x1', name: 'Bash', input: 'npx vitest run' }, NOW)

  expect(run.agents[0]!.calls![0]!.why).toBe('Lint clean. Now run the affected unit tests.')

  // A new request starts with nothing said, so its calls are not stamped with
  // the last one's words.
  noteStep(run, 'develop', NOW, { kind: 'start' })
  noteCallStart(run, 'develop', { id: 'x2', name: 'Bash', input: 'git status' }, NOW)

  expect(run.agents[0]!.calls![1]!.why).toBeUndefined()
})

test('a run that failed after every agent landed closes the strip with what the script threw', () => {
  const run = runOf([agent('Gate', 'done', [call('Bash', 'npm test', 5)])])

  applyRunFile(
    run,
    JSON.stringify({
      status: 'failed',
      startTime: STARTED,
      durationMs: 40_000,
      error: 'Error: gate tests failed: 3 tests failed\n    at <anonymous> (workflow.js:5:7)',
    }),
    NOW,
  )

  const { lines } = rows(run, 100, 30, 6)

  const strip = lines.slice(lines.findIndex(line => line.includes(' activity ')) + 1).filter(line => line !== '')

  expect(strip).toEqual([
    '  time    agent  what happened',
    '  5.0s  \u00b7 Gate   ran the tests',
    ' 40.0s  \u2716 run    gate tests failed: 3 tests failed',
  ])
})

test('a subagent an agent started is told by the description it was given, or bare without one', () => {
  const run = runOf([
    agent('Develop', 'done', [
      call('Agent', 'description: review the diff\nprompt: read the staged diff and list what breaks', 5),
      call('Agent', '', 9),
    ]),
  ])
  const { lines } = rows(run, 100, 30, 2)

  expect(lines.slice(-2)).toEqual([
    ' 5.0s  \u00b7 Develop  started a subagent: review the diff',
    ' 9.0s  \u00b7 Develop  started a subagent',
  ])
})

test('a row taller than the strip, followed to its newest line, still says whose row it is and when', () => {
  const why = 'The pill test failures are a mounting artifact: when the root v-if is false it renders as a comment node, so the element does not re-point after the flip. The fix is to mount it inside a stable wrapper.'
  const run = runOf([
    agent('Develop', 'running', [
      call('Bash', 'npm run lint', 4),
      call('Edit', 'file_path: /wt/feature/src/AiStatusPill.test.ts', 6, { why }),
    ]),
  ])
  const { lines } = rows(run, 80, 30, 3)

  expect(lines.slice(-3)).toEqual([
    ' 6.0s  \u00b7 Develop  element does not re-point after the flip. The fix is to      \u25b4',
    '                  mount it inside a stable wrapper. \u2192 edited                   \u2503',
    '                  AiStatusPill.test.ts                                         \u25be',
  ])
})

test('a word broken across lines is broken between characters, never inside one', () => {
  const faces = '\u{1F600}'.repeat(120)

  // One letter ahead of the faces and two: the summary is clipped before it is
  // wrapped, and a cut by UTF-16 units lands inside a pair for one of the two.
  for (const lead of ['a', 'ab']) {
    const run = runOf([agent('Preflight', 'done', [], { verdict: { passed: true, summary: `${lead}${faces}` }, endedMs: STARTED + 4_000 })])
    const { canvas } = rows(run, 80, 30, 6)
    const codes: number[] = []

    for (let y = 0; y < canvas.rows; y++) {
      for (let x = 0; x < canvas.columns; x++) {
        codes.push(canvas.at(x, y))
      }
    }

    expect(codes.filter(code => code >= 0xd800 && code <= 0xdfff)).toEqual([])
  }
})

test('a word longer than the strip’s room is broken across lines rather than run past the edge', () => {
  const path = `/${'x'.repeat(119)}`
  const run = runOf([agent('Preflight', 'done', [], { verdict: { passed: true, summary: `kept ${path}` }, endedMs: STARTED + 4_000 })])
  const { lines } = rows(run, 80, 30, 6)
  const rule = lines.findIndex(line => line.includes(' activity '))
  const strip = lines.slice(rule + 1).map(line => line.replace(/[▴▾]$/, '').trimEnd())
  const holding = strip.filter(line => line.includes('x'))

  expect(holding.length).toBeGreaterThan(1)
  expect(holding.join('').split('x').length - 1).toBe(119)
  expect(Math.max(...strip.map(line => line.length))).toBeLessThanOrEqual(78)
})

test('an agent the card names without its phase is named on the strip with it, so the same name in two phases reads as two agents', () => {
  const run = runOf([
    agent('Review: bugs', 'done', [call('Bash', 'npm test', 4)], { agentId: 'review-bugs', phase: 'Review' }),
    agent('Verify: bugs', 'done', [call('Bash', 'npm test', 6)], { agentId: 'verify-bugs', phase: 'Verify' }),
  ])
  const strip = rows(run, 100, 30, 6).lines.filter(line => line.includes('ran the tests'))

  expect(strip).toEqual([' 4.0s  · Review · bugs  ran the tests', ' 6.0s  · Verify · bugs  ran the tests'])
})

test('a nested run’s phase is named on the strip without its unfold mark or its plugin’s namespace', () => {
  const run = runOf([
    agent('reviewer', 'done', [call('Bash', 'npm test', 4)], { phase: '▸ code-review:ai-review-panel' }),
  ])
  const strip = rows(run, 100, 30, 6).lines.filter(line => line.includes('ran the tests'))

  expect(strip).toEqual([' 4.0s  · ai-review-panel · reviewer  ran the tests'])
})

test('a name too long for its column gives up its phase before its own name', () => {
  const run = runOf([
    agent('reviewer', 'done', [call('Bash', 'npm test', 4)], { phase: 'an-unusually-long-phase-name-from-a-script' }),
  ])
  const line = rows(run, 100, 30, 6).lines.find(l => l.includes('ran the tests'))!

  expect(line).toContain('… · reviewer')
  expect(line).not.toContain('reviewe…')
})

test('a line’s mark and name take the colour of what that line says, not of the state its agent ended in', () => {
  const run = runOf([
    agent('Develop', 'failed', [call('Bash', 'npm run lint', 4), call('Bash', 'npm test', 6, { isError: true })]),
  ])
  const { canvas, lines } = rows(run, 100, 30, 6)
  const fine = lines.findIndex(line => line.includes('ran the linter'))
  const broke = lines.findIndex(line => line.includes('which failed'))
  const fg = (y: number, text: string) => canvas.cell(lines[y]!.indexOf(text), y).fg

  expect(lines[fine]).toContain('· Develop')
  expect(lines[broke]).toContain('✖ Develop')
  expect(fg(fine, 'Develop')).not.toEqual(fg(broke, 'Develop'))
})

test('a pane too short for the lines asked for shows as many as leave the drawing its rows, rather than none', () => {
  const { lines, feed } = rows(pipeline(), 100, 21, 6)

  expect(lines.some(line => line.includes(' activity '))).toBe(true)
  expect(feed?.rows).toBe(3)
})
