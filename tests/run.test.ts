/**
 * The files a run is rebuilt from, and the order they have to be read in.
 *
 * A journal line says an agent landed but carries no clock, so the reader
 * stamps it with the moment it read the line. The run summary carries the
 * engine's own `startedAt` and `durationMs`. Applied the wrong way round, a run
 * rebuilt an hour after it finished claimed every agent had been running for an
 * hour — which drew every timeline bar to the right-hand edge.
 *
 * A run that has not finished has no summary at all, and is rebuilt from its
 * script and the files each agent leaves instead.
 *
 * Also checks that the facts a node must always carry — what it spent and what
 * it ran on — survive the round trip and reach the drawing.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import { applyFileClock, applyJournal, applyRunFile, runOfScriptName, type RunState } from '../hooks/journal'
import { paint } from '../hooks/paint'

const STARTED = 1_700_000_000_000
const READ_AT = STARTED + 3_600_000

const JOURNAL = [
  JSON.stringify({ type: 'started', agentId: 'a1', label: 'gather:rivers', phase: 'Gather' }),
  JSON.stringify({ type: 'started', agentId: 'a2', label: 'draft:rivers', phase: 'Draft' }),
  JSON.stringify({ type: 'result', agentId: 'a1', result: 'three facts' }),
  JSON.stringify({ type: 'result', agentId: 'a2', result: 'a paragraph' }),
].join('\n')

const SUMMARY = JSON.stringify({
  status: 'completed',
  workflowName: 'haiku',
  startTime: STARTED,
  durationMs: 20_000,
  totalTokens: 30_000,
  defaultModel: 'claude-opus-5[1m]',
  result: 'done',
  workflowProgress: [
    {
      type: 'workflow_agent',
      agentId: 'a1',
      label: 'gather:rivers',
      phaseTitle: 'Gather',
      state: 'done',
      model: 'claude-haiku-4-5-20251001',
      startedAt: STARTED,
      durationMs: 4_000,
      tokens: 15_000,
    },
    {
      type: 'workflow_agent',
      agentId: 'a2',
      label: 'draft:rivers',
      phaseTitle: 'Draft',
      state: 'done',
      startedAt: STARTED + 4_000,
      durationMs: 16_000,
      tokens: 15_000,
    },
  ],
})

function emptyRun(): RunState {
  return {
    runId: 'wf_test',
    name: 'haiku',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_test',
    runFile: '/session/workflows/wf_test.json',
    startedMs: 0,
    status: 'running',
    phases: [],
    agents: [],
    consumed: 0,
  }
}

test('the summary times the run, not the moment it was read', () => {
  const run = emptyRun()

  applyJournal(run, JOURNAL, READ_AT)
  applyRunFile(run, SUMMARY, READ_AT)

  expect(run.status).toBe('completed')
  expect(run.endedMs).toBe(STARTED + 20_000)

  const took = run.agents.map(a => (a.endedMs ?? READ_AT) - a.startedMs)

  expect(took).toEqual([4_000, 16_000])
})

test('a journal read after the summary does not overwrite its clock', () => {
  const run = emptyRun()

  applyRunFile(run, SUMMARY, READ_AT)
  applyJournal(run, JOURNAL, READ_AT)

  expect(run.agents.map(a => (a.endedMs ?? READ_AT) - a.startedMs)).toEqual([4_000, 16_000])
})

test('every node carries its tokens and its model', () => {
  const run = emptyRun()

  applyJournal(run, JOURNAL, READ_AT)
  applyRunFile(run, SUMMARY, READ_AT)

  // The second agent has no model of its own; the run's default stands in.
  expect(run.agents[0]?.model).toBe('claude-haiku-4-5-20251001')
  expect(run.agents[1]?.model).toBeUndefined()
  expect(run.defaultModel).toBe('claude-opus-5[1m]')

  for (const orientation of ['horizontal', 'vertical', 'timeline'] as const) {
    const canvas = new Canvas(90, 24)

    paint(canvas, run, { nowMs: READ_AT, tick: 0, orientation })

    const drawn = rowsOf(canvas).join('\n')

    expect(drawn).toContain('15k')
    expect(drawn).toContain('Haiku 4.5')
    expect(drawn).toContain('Opus 5')
  }
})

test('a run still going is found by its script, which the summary is not there to name', () => {
  // `<workflowName>-<runId>.js`, and a workflow is free to be called `wf_`
  // something too, so the split is the last one, not the first.
  expect(runOfScriptName('audit-wf_2d3e9a34-a42.js')).toEqual({
    name: 'audit',
    runId: 'wf_2d3e9a34-a42',
  })
  expect(runOfScriptName('wf_thing-wf_0e1e7068-c8b.js')).toEqual({
    name: 'wf_thing',
    runId: 'wf_0e1e7068-c8b',
  })

  expect(runOfScriptName('wf_2d3e9a34-a42.json')).toBe(null)
  expect(runOfScriptName('helpers.js')).toBe(null)
})

test('a run adopted mid-flight is timed by its files, not by the moment it was read', () => {
  const run = emptyRun()

  // What the pane knows before any summary exists: the script's mtime for the
  // run, and the journal for who is in it.
  run.startedMs = STARTED

  applyJournal(run, JOURNAL, READ_AT)

  // Every row came out of the journal stamped with the read, so both agents
  // claim to have started an hour late and to have taken no time at all.
  expect(run.agents.map(a => a.startedMs)).toEqual([READ_AT, READ_AT])
  expect(run.agents.map(a => (a.endedMs ?? 0) - a.startedMs)).toEqual([0, 0])

  // Each agent's `.meta.json` is stamped when it is spawned and its transcript
  // when it last wrote, which is the pair the plugin stats.
  applyFileClock(run.agents[0], STARTED, STARTED + 4_000)
  applyFileClock(run.agents[1], STARTED + 4_000, STARTED + 20_000)

  expect(run.agents.map(a => a.startedMs - STARTED)).toEqual([0, 4_000])
  expect(run.agents.map(a => (a.endedMs ?? 0) - a.startedMs)).toEqual([4_000, 16_000])
})

test('an agent still working takes a start from its files and no end', () => {
  const run = emptyRun()

  applyJournal(run, JOURNAL.split('\n').slice(0, 2).join('\n'), READ_AT)

  expect(run.agents.map(a => a.state)).toEqual(['running', 'running'])

  // Its transcript is still being written to, so that mtime is when it last
  // said something rather than when it stopped, and taking it as an end would
  // land the agent in the past while it is still going.
  applyFileClock(run.agents[0], STARTED, READ_AT - 1_000)

  expect(run.agents[0].startedMs).toBe(STARTED)
  expect(run.agents[0].endedMs).toBeUndefined()

  // It is what the agent was last heard from at instead — the pane calls an
  // agent quiet by how long ago that was, and against a start an hour old every
  // agent of a recovered run would have been accused of hanging.
  expect(run.agents[0].activeMs).toBe(READ_AT - 1_000)

  // The two files are written a moment apart, so an agent that answered at once
  // can have them land out of order; a bar off a negative duration runs
  // backwards.
  run.agents[1].state = 'done'

  applyFileClock(run.agents[1], STARTED + 50, STARTED)

  expect(run.agents[1].startedMs).toBe(STARTED)
  expect(run.agents[1].endedMs).toBe(STARTED)
})

/** The canvas back as the lines a terminal would show. */
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
