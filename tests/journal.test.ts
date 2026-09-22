/**
 * What the run holds of a tool call: which argument says what the call was
 * about, how much of it is kept, and what a tool that answered with an object
 * leaves behind.
 *
 * The detail dialog draws these, and the dialog's tests build a `ToolCall` by
 * hand — so the reader that fills one in from a live `tool.call`, and the one
 * that fills it in from a recording, are checked here instead. The two are held
 * to the same cap on purpose: a run watched live and the same run replayed have
 * to say the same thing.
 */

import { expect, test } from 'claude-code/testing'

import type { AgentRow, RunState } from '../hooks/journal'
import {
  contextOfUsage,
  inputOf,
  noteCallEnd,
  noteCallStart,
  noteStep,
  readAgentTranscript,
} from '../hooks/journal'

/** The cells of an argument the run keeps, past which it is cut and marked. */
const INPUT_MAX = 4_000
const ELLIPSIS = '…'

const STARTED = 1_700_000_000_000

function agentOf(): AgentRow {
  return {
    agentId: 'a1',
    label: 'probe',
    phase: 'Collect',
    state: 'running',
    startedMs: STARTED,
    tools: [],
  }
}

function runOf(): RunState {
  return {
    runId: 'wf_test',
    name: 'probe',
    summary: 'a probe',
    transcriptDir: '/session/subagents/workflows/wf_test',
    runFile: '/session/subagents/workflows/wf_test.json',
    startedMs: STARTED,
    status: 'running',
    phases: ['Collect'],
    agents: [agentOf()],
    consumed: 0,
  }
}

test('an argument longer than the cap is cut to it and marked', () => {
  const held = inputOf({ tool: 'Bash', command: 'x'.repeat(INPUT_MAX + 500) })

  // The mark is what says the rest exists: cut silently, a command in the
  // dialog reads as a command that ended there.
  expect(held.length).toBe(INPUT_MAX + 1)
  expect(held.endsWith(ELLIPSIS)).toBe(true)
})

test('an argument shorter than the cap is returned untouched', () => {
  const said = 'gh api repos/owner/name/pulls --paginate'

  expect(inputOf({ tool: 'Bash', command: said })).toBe(said)
})

test('an argument of exactly the cap is not marked', () => {
  const said = 'x'.repeat(INPUT_MAX)

  // The cap is the length kept, not the length past which cutting starts, so
  // the boundary itself is whole.
  expect(inputOf({ tool: 'Bash', command: said })).toBe(said)
})

test('a command of several lines keeps its own line breaks', () => {
  const said = ['cat <<EOF', 'first', 'second', 'EOF'].join('\n')

  // A heredoc cut to its first line is a command nobody can check, which is
  // what the whole-argument reader replaced.
  expect(inputOf({ tool: 'Bash', command: said })).toBe(said)
})

test('a call carrying both a command and a path is held by its command', () => {
  const held = inputOf({ tool: 'Bash', file_path: '/tmp/out.txt', command: 'echo hi > /tmp/out.txt' })

  // The keys are tried in a set order rather than in the order the event
  // happens to list them: the command is what the call was about and the path
  // is one of its arguments.
  expect(held).toBe('echo hi > /tmp/out.txt')
})

test('a call with a path and no command is held by its path', () => {
  expect(inputOf({ tool: 'Read', file_path: '/hooks/paint.ts' })).toBe('/hooks/paint.ts')
})

test('a tool that answered with an object has the object kept as JSON', () => {
  const run = runOf()

  noteCallStart(run, 'a1', { id: 'c1', name: 'Probe', input: 'ask' }, STARTED + 10)
  noteCallEnd(run, 'a1', 'c1', STARTED + 20, { result: { ok: true, count: 2 } })

  // Dropped instead, the call's own dialog has nothing under its heading — and
  // an agent given a schema answers this way for every call it makes.
  expect(run.agents[0].calls?.[0].result).toBe('{"ok":true,"count":2}')
})

test('a tool that answered with text has the text kept as it was written', () => {
  const run = runOf()

  noteCallStart(run, 'a1', { id: 'c1', name: 'Bash', input: 'ls' }, STARTED + 10)
  noteCallEnd(run, 'a1', 'c1', STARTED + 20, { text: 'one\ntwo' })

  expect(run.agents[0].calls?.[0].result).toBe('one\ntwo')
})

test('a replayed call holds as much of its argument as a live one', () => {
  const said = 'x'.repeat(INPUT_MAX + 500)
  const live = inputOf({ tool: 'Bash', command: said })
  const replayed = readAgentTranscript(
    JSON.stringify({
      type: 'assistant',
      timestamp: new Date(STARTED).toISOString(),
      message: { content: [{ type: 'tool_use', id: 'c1', name: 'Bash', input: { command: said } }] },
    }),
  ).calls[0].input

  // The parity is the reason both readers cap at all: a run watched as it went
  // and the same run opened afterwards draw the same call.
  expect(replayed).toBe(live)
})

test('a replayed call holds as much of its answer as a live one', () => {
  const said = 'y'.repeat(INPUT_MAX + 500)
  const run = runOf()

  noteCallStart(run, 'a1', { id: 'c1', name: 'Bash', input: 'ls' }, STARTED + 10)
  noteCallEnd(run, 'a1', 'c1', STARTED + 20, { text: said })

  const replayed = readAgentTranscript(
    [
      JSON.stringify({
        type: 'assistant',
        timestamp: new Date(STARTED).toISOString(),
        message: { content: [{ type: 'tool_use', id: 'c1', name: 'Bash', input: { command: 'ls' } }] },
      }),
      JSON.stringify({
        type: 'user',
        timestamp: new Date(STARTED + 20).toISOString(),
        message: { content: [{ type: 'tool_result', tool_use_id: 'c1', content: said }] },
      }),
    ].join('\n'),
  ).calls[0].result

  expect(replayed).toBe(run.agents[0].calls?.[0].result)
})

test('a request’s cost is what it had to hold, not what it produced', () => {
  // The run summary's own per-agent `tokens` is the context a request carried:
  // what was sent fresh, what was written to the cache, and what was read back
  // out of it. Adding the output on overshoots it on every agent of every run
  // on this machine.
  const usage = {
    input_tokens: 8,
    output_tokens: 661,
    cache_read_input_tokens: 20_960,
    cache_creation_input_tokens: 355,
  }

  expect(contextOfUsage(usage)).toBe(21_323)
})

/** An agent that made these requests, in this order, and stopped. */
function spent(asked: number[]): number | undefined {
  const run = runOf()

  for (const tokens of asked) {
    noteStep(run, 'a1', STARTED + 1_000, { kind: 'start' })
    noteStep(run, 'a1', STARTED + 2_000, { kind: 'stop', tokens, output: 300 })
  }

  return run.agents[0].liveTokens
}

test('an agent’s live spend is its newest request, not every request added up', () => {
  // Nine requests over one twenty-thousand-token context, which is an agent
  // reading its own cache back on each. Added up they came to 224k while the
  // engine's own panel beside the pane read 21.3k; a long agent read `∑ 2m`
  // against `153.5k`. Cached context is read back whole every request and is
  // not spent again.
  expect(spent([18_684, 18_684, 18_684, 20_119, 20_119, 20_411, 20_968, 21_323])).toBe(21_323)
})

test('an agent whose context was compacted carries what is left, not what it had', () => {
  // Five agents in the corpus ran to a quarter of a million tokens, were cut
  // back, and finished at a third of that. The engine reports what they
  // finished carrying, so a high-water mark would leave the pane a hundred
  // thousand above the panel beside it for the rest of the run.
  expect(spent([120_000, 247_025, 82_000, 166_031])).toBe(166_031)
})

test('the empty usage that closes a stream is not read as the newest request', () => {
  // The last record of a transcript is often a usage with every count zero: the
  // stream being closed rather than a request being paid for. Taken as the
  // newest, it dropped the figure to nothing at the moment the agent finished.
  expect(spent([38_041, 0])).toBe(38_041)
})
