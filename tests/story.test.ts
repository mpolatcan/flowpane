/**
 * How a run's outcome is told: the count on the run line, and a gate's verdict
 * on its own card. These paint a run and read those rows back.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import { applyJournal, applyRunFile, verdictOf, type AgentRow, type AgentState, type RunState } from '../hooks/journal'
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

test('a gate that answered passed: false is failed, and keeps why', () => {
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
  expect(run.agents[0]!.verdict).toEqual({ passed: false, summary: 'tree not clean after commit' })
})

test('an answer with no verdict leaves the agent as it landed', () => {
  expect(verdictOf({ findings: [] })).toBeUndefined()
  expect(verdictOf('{"ok": true, "headline": "clean"}')).toEqual({ passed: true, summary: 'clean' })
  expect(verdictOf('passed: false')).toBeUndefined()
})

test('a finished run counts the agents that finished, and the one that failed keeps its place on a narrow row', () => {
  const run = runOf('completed', [agent('r1', 'Review', 'bugs', 'done'), agent('v1', 'Verify', 'tests', 'failed')])

  for (const columns of [110, 70]) {
    const canvas = new Canvas(columns, 26)

    paint(canvas, run, { nowMs: NOW, tick: -1, orientation: 'horizontal' })

    let header = ''

    for (let x = 0; x < columns; x++) {
      header += String.fromCodePoint(canvas.at(x, 1) || 0x20)
    }

    expect(header).toContain('completed 1/2')
    expect(header).toContain('✖ 1 failed')
  }
})

test('a gate that has landed says its verdict on its card, where the model was', () => {
  const run = runOf('completed', [
    agent('g1', 'Review', 'lint', 'failed', { model: 'claude-haiku-4-5', verdict: { passed: false, summary: 'tree not clean' } }),
    agent('g2', 'Review', 'tests', 'done', { model: 'claude-haiku-4-5' }),
  ])
  const canvas = new Canvas(110, 26)

  paint(canvas, run, { nowMs: NOW, tick: -1, orientation: 'horizontal' })

  const feet: string[] = []

  for (let y = 0; y < 26; y++) {
    let row = ''

    for (let x = 0; x < 110; x++) {
      row += String.fromCodePoint(canvas.at(x, y) || 0x20)
    }

    if (row.includes('╰')) {
      feet.push(row)
    }
  }

  expect(feet.some(row => row.includes(' tree not clean '))).toBe(true)
  expect(feet.some(row => row.includes(' Haiku 4.5 '))).toBe(true)
})

test('an agent that errored is failed, with the first line of the error as its verdict', () => {
  const run = runOf('running', [], { phases: ['Review'] })

  applyJournal(
    run,
    [
      JSON.stringify({ type: 'started', agentId: 'a1', label: 'Review', phase: 'Review' }),
      JSON.stringify({ type: 'error', agentId: 'a1', error: 'boom\nstack' }),
    ].join('\n'),
    NOW,
  )

  expect(run.agents[0]!.state).toBe('failed')
  expect(run.agents[0]!.verdict).toEqual({ passed: false, summary: 'boom' })
})

test('a gate that answered passed: false stays failed when the engine says it is done', () => {
  const run = runOf('running', [], { phases: ['Commit (tests)'] })

  applyJournal(
    run,
    [
      JSON.stringify({ type: 'started', agentId: 'g1', label: 'Commit (tests)', phase: 'Commit (tests)' }),
      JSON.stringify({ type: 'result', agentId: 'g1', result: { passed: false, summary: 'tree not clean after commit' } }),
    ].join('\n'),
    NOW,
  )
  applyRunFile(
    run,
    JSON.stringify({
      status: 'running',
      workflowProgress: [{ type: 'workflow_agent', agentId: 'g1', label: 'Commit (tests)', phaseTitle: 'Commit (tests)', state: 'done' }],
    }),
    NOW,
  )

  expect(run.agents[0]!.state).toBe('failed')
})

test('an answer cut off inside its JSON carries no verdict, and the agent lands done', () => {
  const cut = '{"passed": false, "summary": "trunc'

  expect(verdictOf(cut)).toBeUndefined()

  const run = runOf('running', [], { phases: ['Review'] })

  applyJournal(
    run,
    [
      JSON.stringify({ type: 'started', agentId: 'g1', label: 'Review', phase: 'Review' }),
      JSON.stringify({ type: 'result', agentId: 'g1', result: cut }),
    ].join('\n'),
    NOW,
  )

  expect(run.agents[0]!.state).toBe('done')
  expect(run.agents[0]!.verdict).toBeUndefined()
})
