/**
 * An agent's transcript, read for its dialog: what it was asked, and the calls
 * it made.
 */

import { expect, test } from 'claude-code/testing'

import { readAgentTranscript } from '../hooks/journal'

const lines = (...rows: unknown[]) => rows.map(row => JSON.stringify(row)).join('\n')

const REQUEST =
  '[Workflow harness — user request] The harness relays, verbatim and indented below, the user request. Where they conflict, this request wins:\n  Run the audit workflow.'
const TASK =
  '[Workflow harness — computed task] The task text below was computed at runtime. The computed task text follows:\n  Survey README.md.\n  Answer with the survey fields.'

test('the prompt is the task the agent was set, with the request that started the run after it', () => {
  const read = readAgentTranscript(
    lines(
      { type: 'user', message: { content: REQUEST } },
      { type: 'user', message: { content: TASK } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'On it.' }] } },
    ),
  )

  expect(read.prompt).toBe('Survey README.md.\nAnswer with the survey fields.\n\nThe run was started by: Run the audit workflow.')
})

test('a call is read once, from the conversation, not again from the copy of the request', () => {
  const use = { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'wc -l README.md' } }
  const read = readAgentTranscript(
    lines(
      { type: 'user', message: { content: TASK } },
      { type: 'assistant', message: { content: [use] } },
      { type: 'api-request-blob', message: { content: [{ ...use, input: { command: 'cd /tmp/x && wc -l README.md' } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: '3 README.md' }] } },
    ),
  )

  expect(read.calls.map(c => c.input)).toEqual(['wc -l README.md'])
})

test('a call carries what the agent said before it, until an answer comes back', () => {
  const read = readAgentTranscript(
    lines(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Check lint.' },
            { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm run lint' } },
          ],
        },
      },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'clean' }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'ls' } }] } },
    ),
  )

  expect(read.calls[0]!.why).toBe('Check lint.')
  expect(read.calls[1]!.why).toBeUndefined()
})
