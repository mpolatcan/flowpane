/**
 * The words the plugin writes back at the prompt, and the one command they are
 * allowed to name.
 *
 * Everything here is a string the reader is meant to type next. The command was
 * called something else once, and a line of help that still names the old one
 * is worse than no line at all: it reads as an instruction, it is followed, and
 * what comes back is that there is no such command. So each of these replies is
 * checked the same way — every command it shows is the command the plugin
 * answers to, and the old name appears nowhere in it.
 */

import { expect, mock, test } from 'claude-code/testing'

const COMMAND = '/flowpane'
/** What the command was called before, and what none of these replies may say. */
const FORMER = '/wf'

const TRANSCRIPT = '/session/subagents/workflows/wf_test'

const LAUNCH = {
  status: 'async_launched',
  taskId: 't1',
  taskType: 'local_workflow',
  runId: 'wf_test',
  workflowName: 'probe',
  summary: 'a probe',
  transcriptDir: TRANSCRIPT,
}

const SCRIPT = `export const meta = {
  name: 'probe',
  description: 'a probe',
  phases: [{ title: 'Collect' }],
}
phase('Collect')
return agent('say red', { label: 'color:red', phase: 'Collect' })`

const JOURNAL = [
  { type: 'launched' },
  { type: 'started', agentId: 'a1', label: 'color:red', phase: 'Collect' },
]
  .map(line => JSON.stringify(line))
  .join('\n')

function stubEngine(on: any): void {
  on('env.get', () => ({ value: '/home/test' }))
  on('ui.open', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: { requestId: 'flowpane' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'flowpane' } }))
  on('session.id', () => ({ value: 'test-session' }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('fs.exists', ($$: unknown, e: { path: string }) => ({
    value: e.path === `${TRANSCRIPT}/journal.jsonl`,
  }))
  on('fs.read', ($$: unknown, e: { path: string }) => {
    if (e.path === `${TRANSCRIPT}/journal.jsonl`) {
      return { value: JOURNAL }
    }

    throw new Error(`unexpected read: ${e.path}`)
  })
}

/** What the prompt shows for a `/flowpane ...` line, as one string. */
async function reply($: any, args: string): Promise<string> {
  const result = await $.command.run({ command: 'flowpane', args })

  return typeof result?.text === 'string' ? result.text : JSON.stringify(result)
}

/** Every command named anywhere in a reply: a slash and the word after it. */
function commandsIn(text: string): string[] {
  return text.match(/\/[A-Za-z][\w-]*/g) ?? []
}

test('every line of the help names the command the plugin answers to', async ($, on) => {
  mock.clock(on, { now: 0 })
  stubEngine(on)

  const text = await reply($, 'help')
  const lines = text.split('\n').filter(line => line.trim() !== '')

  // Seven lines, and the value of the help is that each one can be typed. A
  // line that names anything else is a dead end a reader follows.
  expect(lines.length).toBeGreaterThan(0)

  for (const line of lines) {
    expect(`${line} :: ${commandsIn(line).every(named => named === COMMAND)}`).toBe(`${line} :: true`)
  }
})

test('the help says nothing about the name the command used to have', async ($, on) => {
  mock.clock(on, { now: 0 })
  stubEngine(on)

  expect(await reply($, 'help')).not.toContain(FORMER)
})

test('the reply to a word the pane does not know names the live command', async ($, on) => {
  mock.clock(on, { now: 0 })
  stubEngine(on)

  const text = await reply($, 'sideways')

  expect(text).toContain(`${COMMAND} takes no "sideways"`)
  expect(commandsIn(text).every(named => named === COMMAND)).toBe(true)
})

test('the reply to a run number there is no run for names the live command', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  stubEngine(on)

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await clock.advance(600)

  const text = await reply($, '9')

  // The way out of the mistake is the list, so the reply has to name it in a
  // form that can be typed.
  expect(text).toContain(`${COMMAND} runs`)
  expect(commandsIn(text).every(named => named === COMMAND)).toBe(true)
})
