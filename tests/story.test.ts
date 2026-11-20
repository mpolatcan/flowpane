/**
 * The row above the bar: the run said in a sentence.
 *
 * The run line is figures with marks and the drawing is a diagram with no key,
 * so the first row says in words which phase is working, what each of its
 * agents is doing, what failed and what comes next — and, once the run is over,
 * how it ended. These paint a run and read that row back.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import { applyJournal, verdictOf, type AgentRow, type AgentState, type RunState, type ToolCall } from '../hooks/journal'
import { paint } from '../hooks/paint'

const STARTED = 1_700_000_000_000
const NOW = STARTED + 8_000

function agent(id: string, phase: string, label: string, state: AgentState, extra: Partial<AgentRow> = {}): AgentRow {
  return {
    agentId: id,
    label: `${phase.toLowerCase()}:${label}`,
    phase,
    state,
    startedMs: STARTED + 1_000,
    activeMs: NOW - 500,
    ...(state === 'running' ? {} : { endedMs: STARTED + 5_000 }),
    tools: [],
    ...extra,
  }
}

function runOf(status: RunState['status'], agents: AgentRow[], extra: Partial<RunState> = {}): RunState {
  return {
    runId: 'wf_story',
    name: 'review-changes',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_story',
    runFile: '/session/workflows/wf_story.json',
    startedMs: STARTED,
    ...(status === 'running' ? {} : { endedMs: NOW }),
    status,
    phases: ['Review', 'Verify', 'Report'],
    agents,
    consumed: 0,
    ...extra,
  }
}

/** A run in its second phase: one agent reading, one thinking, one failed. */
function live(): RunState {
  return runOf('running', [
    agent('r1', 'Review', 'bugs', 'done'),
    agent('v1', 'Verify', 'bugs', 'running', { tools: [{ name: 'Read', count: 2, atMs: NOW - 300, isRunning: true }] }),
    agent('v2', 'Verify', 'perf', 'running', { isThinking: true }),
    agent('v3', 'Verify', 'tests', 'failed'),
  ])
}

function firstRow(run: RunState, columns: number): { canvas: Canvas; text: string } {
  const canvas = new Canvas(columns, 26)

  paint(canvas, run, { nowMs: NOW, tick: run.status === 'running' ? 0 : -1, orientation: 'horizontal' })

  let text = ''

  for (let x = 0; x < columns; x++) {
    text += String.fromCodePoint(canvas.at(x, 0) || 0x20)
  }

  return { canvas, text: text.trimEnd() }
}

test('a live run says which phase is working, what each agent is doing, what failed and what is next', () => {
  expect(firstRow(live(), 110).text).toBe(
    ' In Verify, bugs is reading a file and perf is thinking. tests failed. Report comes next.',
  )
})

test('a narrower pane gets a shorter sentence, never one cut off at the edge', () => {
  expect(firstRow(live(), 80).text).toBe(' In Verify, bugs is reading a file and perf is thinking. tests failed.')
  expect(firstRow(live(), 60).text).toBe(' Verify: bugs reading and perf thinking. tests failed.')
  expect(firstRow(live(), 48).text).toBe(' Verify: 2 running, 1 failed')
})

test('more than three agents at work are counted rather than listed', () => {
  const run = runOf(
    'running',
    ['a', 'b', 'c', 'd', 'e'].map((name, i) => agent(`v${i}`, 'Verify', name, 'running', { isThinking: i < 2 })),
  )

  expect(firstRow(run, 110).text).toBe(' In Verify, 5 agents are running, 2 of them thinking. Report comes next.')
})

test('an agent nothing has been heard from is said to be silent, and for how long', () => {
  const run = runOf('running', [agent('v1', 'Verify', 'perf', 'running', { activeMs: NOW - 125_000 })])

  expect(firstRow(run, 110).text).toBe(' In Verify, perf has said nothing for 2m05s. Report comes next.')
})

test('a finished run says how long it took and how many of its agents finished', () => {
  const run = runOf('completed', [agent('r1', 'Review', 'bugs', 'done'), agent('v1', 'Verify', 'tests', 'failed')])

  expect(firstRow(run, 110).text).toBe(' Done in 8.0s. 1 of 2 agents finished; tests failed in Verify.')
})

test('a stopped run says which phase it stopped in', () => {
  const run = runOf('stopped', [agent('r1', 'Review', 'bugs', 'done'), agent('v1', 'Verify', 'perf', 'stopped')])

  expect(firstRow(run, 110).text).toBe(' Stopped after 8.0s in Verify. 1 of 2 agents finished.')
})

test('a failed run gives the first line of its error', () => {
  const run = runOf('failed', [agent('r1', 'Review', 'bugs', 'failed')], { error: 'agent bugs exited\nstack...' })

  expect(firstRow(run, 110).text).toBe(' Failed after 8.0s in Review: agent bugs exited')
})

test('only the agent names carry colour, so colour still says state', () => {
  const { canvas, text } = firstRow(live(), 110)
  const prose = canvas.cell(text.indexOf('In'), 0).fg
  const reading = canvas.cell(text.indexOf('bugs'), 0).fg
  const failed = canvas.cell(text.indexOf('tests'), 0).fg

  expect(reading).not.toEqual(prose)
  expect(failed).not.toEqual(prose)
  expect(failed).not.toEqual(reading)
  expect(canvas.cell(text.indexOf('Verify'), 0).fg).not.toEqual(reading)
})

/** A pipeline in its develop step, with the calls the hooks would have seen. */
function developing(open: ToolCall | undefined, thinking = false): RunState {
  const calls: ToolCall[] = [
    { id: 'c1', name: 'Read', input: '/wt/feature/src/stores/config.ts', startedMs: NOW - 4_000, endedMs: NOW - 3_900 },
    { id: 'c2', name: 'Edit', input: '/wt/feature/src/stores/config.ts', startedMs: NOW - 3_000, endedMs: NOW - 2_900 },
    { id: 'c3', name: 'Edit', input: '/wt/feature/src/components/QuotaCard.vue', startedMs: NOW - 2_000, endedMs: NOW - 1_900 },
    { id: 'c4', name: 'Bash', input: 'npm run type-check', startedMs: NOW - 1_500, endedMs: NOW - 1_000 },
    ...(open ? [open] : []),
  ]

  return runOf(
    'running',
    [
      agent('p1', 'Preflight', 'Preflight', 'done', {
        label: 'Preflight',
        endedMs: NOW - 5_000,
        verdict: { passed: true, summary: 'plan located, tools ready' },
      }),
      agent('d1', 'Develop', 'Develop', 'running', { label: 'Develop', calls, isThinking: thinking }),
    ],
    { phases: ['Preflight', 'Develop', 'Verify'] },
  )
}

test('a running agent is said to be at the file or command its call names, with what it has changed so far', () => {
  const open = { id: 'c5', name: 'Bash', input: 'command: npm run lint', startedMs: NOW - 200 }

  expect(firstRow(developing(open), 160).text).toBe(
    ' In Develop, Develop is running `npm run lint` (2 files changed). Preflight: plan located, tools ready. Verify comes next.',
  )
})

test('an agent between calls is thinking about the last thing it did', () => {
  expect(firstRow(developing(undefined, true), 120).text).toBe(
    ' In Develop, Develop is thinking, after running `npm run type-check` (2 files changed). Verify comes next.',
  )
})

test('a narrower pane keeps the file and gives up the tally and the report first', () => {
  const open = { id: 'c5', name: 'Edit', input: '/wt/feature/src/stores/config.ts', startedMs: NOW - 200 }

  expect(firstRow(developing(open), 72).text).toBe(' In Develop, Develop is editing config.ts. Verify comes next.')
})

test('a gate that answered passed: false is drawn failed, and says why', () => {
  const run = runOf('running', [], { phases: ['Commit (tests)', 'Publish'] })

  applyJournal(
    run,
    [
      JSON.stringify({ type: 'started', agentId: 'g1', label: 'Commit (tests)', phase: 'Commit (tests)' }),
      JSON.stringify({ type: 'result', agentId: 'g1', result: { passed: false, summary: 'tree not clean after commit' } }),
    ].join('\n'),
    NOW,
  )

  expect(run.agents[0]!.state).toBe('failed')
  expect(firstRow(run, 110).text).toBe(' Between phases, after Commit (tests). Commit (tests) failed.')

  run.status = 'stopped'
  run.endedMs = NOW

  expect(firstRow(run, 140).text).toBe(
    ' Stopped after 8.0s in Commit (tests). 0 of 1 agents finished; Commit (tests) failed: tree not clean after commit.',
  )
})

test('an answer with no verdict leaves the agent as it landed', () => {
  expect(verdictOf({ findings: [] })).toBeUndefined()
  expect(verdictOf('{"ok": true, "headline": "clean"}')).toEqual({ passed: true, summary: 'clean' })
  expect(verdictOf('passed: false')).toBeUndefined()
})
