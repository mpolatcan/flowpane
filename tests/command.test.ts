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

/**
 * `seen` catches what the plugin sent, for the tests that read a payload rather
 * than a reply: the registration is the one line of the command a reader meets
 * before typing anything, and nothing renders it back.
 */
function stubEngine(on: any, seen?: { register?: { name?: string; description?: string } }): void {
  on('env.get', () => ({ value: '/home/test' }))
  on('ui.open', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: { requestId: 'flowpane' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', ($$: unknown, e: { name?: string; description?: string }) => {
    if (seen) {
      seen.register = e
    }

    return { value: { command: 'flowpane' } }
  })
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

test('the command is registered described by what typing it does', async ($, on) => {
  mock.clock(on, { now: 0 })

  const seen: { register?: { name?: string; description?: string } } = {}

  on('session.start', ($$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  stubEngine(on, seen)

  await $.session.start({ cwd: '/home/test', surface: 'terminal', isInteractive: true })

  // The description is read in the command list, where there is no pane to look
  // at: it has to say what pressing it does and where the rest of it is, and it
  // names the live command while doing so.
  expect(seen.register?.description).toBe(
    'Toggle the workflow view; /flowpane help lists what else it takes',
  )
})

test('the command is registered under the name the plugin answers to', async ($, on) => {
  mock.clock(on, { now: 0 })

  const seen: { register?: { name?: string; description?: string } } = {}

  on('session.start', ($$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  stubEngine(on, seen)

  await $.session.start({ cwd: '/home/test', surface: 'terminal', isInteractive: true })

  expect(seen.register?.name).toBe(COMMAND.slice(1))
})

test('what the pane says about itself names the run list as a line to type', async ($, on) => {
  mock.clock(on, { now: 0 })
  stubEngine(on)

  const text = await reply($, 'about')
  const row = text.split('\n').find(line => line.includes(`${COMMAND} runs`)) ?? ''

  // The seat that prints this draws no Buttons, so every way on from it is a
  // line a reader types. The row has to carry both halves: the command, and
  // what it answers with.
  expect(row).toContain(`${COMMAND} runs`)
  expect(row).toContain('this session\u2019s runs')
})
