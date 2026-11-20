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
import type { AgentRow, AgentState, RunState } from '../hooks/journal'
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
  expect(firstRow(live(), 80).text).toBe(' Verify: bugs reading and perf thinking. tests failed. Next: Report.')
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
