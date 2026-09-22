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

import { COMMAND as REGISTERED, orientationOf } from '../hooks/register'

/**
 * The home the stub answers with: a directory this machine actually has.
 *
 * The plugin looks for `$HOME/.claude/projects` on the way up, to recover the
 * runs of earlier sessions, and the engine refuses `fs.exists` on a path it
 * cannot reach — `a network location is not reached from here (host check)`. A
 * refusal is not a false. The whole hook is skipped, so `command.run` and
 * `session.start` came back with nothing, and the eighteen tests across these
 * five files that drive a hook rather than the painter read an empty reply and
 * failed for a reason none of them was about.
 *
 * `import.meta.dir` is this file's own folder: it exists, it holds no `.claude`,
 * so the recovery finds nothing and returns — which is what `/home/test` was
 * there to arrange — and it is wherever the repo happens to be checked out.
 */
const HOME = import.meta.dir

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
  on('env.get', () => ({ value: HOME }))
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

  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })

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

  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })

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

/** The `/flowpane ...` half of a help line, and the description after the gutter. */
function helpRows(text: string): Array<{ form: string; gutter: string; does: string }> {
  return text
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => line.match(/^(\S+(?: \S+)*)(\s{2,})(\S.*)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(match => ({ form: match[1], gutter: match[2], does: match[3] }))
}

test('the help lists every form of the command, and no more', async ($, on) => {
  mock.clock(on, { now: 0 })
  stubEngine(on)

  const forms = helpRows(await reply($, 'help')).map(row => row.form)

  // The seven are the whole surface: a form missing from here is a feature with
  // no way in, since this reply is the only place the words are written down.
  expect(forms.join(' | ')).toBe(
    [
      COMMAND,
      `${COMMAND} runs`,
      `${COMMAND} <n>`,
      `${COMMAND} horizontal|vertical|timeline|list|fits`,
      `${COMMAND} detail <n>`,
      `${COMMAND} theme [name]`,
      `${COMMAND} about`,
    ].join(' | '),
  )
})

test('every description in the help starts in the same column', async ($, on) => {
  mock.clock(on, { now: 0 })
  stubEngine(on)

  const rows = helpRows(await reply($, 'help'))
  const columns = [...new Set(rows.map(row => row.form.length + row.gutter.length))]

  // The forms are of very different lengths, so a ragged second column is read
  // as two lists rather than one. The bare `/flowpane` line is the one that
  // tests this: it is the shortest form, and it lands where the rest do.
  expect(`${columns.join(',')} :: ${rows.length}`).toBe(`${columns[0]} :: 7`)
})

test('the widest form of the command is three spaces clear of what it does', async ($, on) => {
  mock.clock(on, { now: 0 })
  stubEngine(on)

  const rows = helpRows(await reply($, 'help'))
  const widest = rows.reduce((a, b) => (b.form.length > a.form.length ? b : a))

  // Three is the gap that reads as a column rather than a wrapped sentence, and
  // it is measured off the visible text of the longest line: one space here and
  // the widest row's two halves run together into one phrase.
  expect(`${widest.form} ::${widest.gutter}::`).toBe(`${COMMAND} horizontal|vertical|timeline|list|fits ::   ::`)
})

/**
 * The two words the help no longer lists.
 *
 * `across` and `down` named the layouts before the axis words did, and they
 * still work for anyone who learned them. Being unlisted is exactly what makes
 * losing them quiet: the help is pinned to seven forms, and dropping an alias
 * from the table breaks nothing any other test reads.
 */
test('the unlisted word for the horizontal layout still sets it', async ($, on) => {
  mock.clock(on, { now: 0 })
  stubEngine(on)

  const named = await reply($, 'horizontal')

  expect(await reply($, 'across')).toBe(named)
})

test('the unlisted word for the vertical layout still sets it', async ($, on) => {
  mock.clock(on, { now: 0 })
  stubEngine(on)

  const named = await reply($, 'vertical')

  expect(await reply($, 'down')).toBe(named)
})

test('an unlisted layout word is answered with the layout, not with a refusal', async ($, on) => {
  mock.clock(on, { now: 0 })
  stubEngine(on)

  // Dropped from the table, `across` falls through to the line that says the
  // command takes no such word — which is the reply a reader who learned it
  // would get, and the whole of what this pins.
  expect(await reply($, 'across')).not.toContain('takes no')
})

test('the flat list is a layout the command sets by name', async ($, on) => {
  mock.clock(on, { now: 0 })
  stubEngine(on)

  // The list used to be reached only by making the pane small enough that a
  // band could not be drawn as cards, which made it a shape a reader arrived
  // at rather than one they chose. It is a word now, beside the other four.
  const said = await reply($, 'list')

  expect(said).not.toContain('takes no')
  expect(said).toContain('list')
})

test('the one constant the command is spelled from is the word it answers to', async ($, on) => {
  mock.clock(on, { now: 0 })

  const seen: { register?: { name?: string; description?: string } } = {}

  on('session.start', ($$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  stubEngine(on, seen)

  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })

  // Every form of the command is built from this one word, so the word and the
  // registration are the same fact said twice. Said twice and checked once,
  // a rename produces a help page that teaches a command nothing answers to.
  expect(`/${REGISTERED}`).toBe(COMMAND)
  expect(seen.register?.name).toBe(REGISTERED)
})

/**
 * The names the orientations carried before this release, against their names
 * now.
 *
 * These were never words anybody typed — `across`, `down` and `timeline` were,
 * and still are. They are what the layout control wrote into the store, and
 * what `plugin.json` still documents its `orientation` setting as taking. So a
 * reader who picked a layout on an earlier build, or who set one in their own
 * config, has one of these saved; read strictly it is not an orientation at
 * all, and the preference was dropped on the way in.
 */
test('a layout stored under the name it used to have still selects it', () => {
  const was = ['flow', 'stack', 'time'].map(word => orientationOf(word))

  // Dropped, every one of them came back as the pane's default, which reads as
  // a control that does not hold rather than as a rename.
  expect(was.join(',')).toBe('horizontal,vertical,timeline')
})

test('a layout stored under a word the pane has never had is no layout', () => {
  // Nothing is not a layout either: an unset setting has to leave the pane on
  // whatever it was, and the only way to say so is to name no orientation.
  expect([orientationOf('sideways'), orientationOf(undefined), orientationOf('')]).toEqual([
    null, null, null,
  ])
})

test('the word the command takes for the list selects the list, not the axis it reads on', () => {
  // The reply says `list`, so a mapping that set the pane to `vertical` would
  // be answered with the same line and read as correct — and the reader would
  // get bands of cards down the pane, which is the layout `list` exists to be
  // different from. The word and what it is mapped to are two facts, and this
  // is the one the reply cannot show.
  expect(orientationOf('list')).toBe('list')
  expect(orientationOf('list')).not.toBe('vertical')
})
