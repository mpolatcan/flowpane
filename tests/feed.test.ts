/**
 * The activity strip: what the run has done, one line per thing a reader of a
 * pipeline waits to hear about, under a rule at the foot of the pane.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import { noteCallStart, noteStep, type AgentRow, type AgentState, type RunState, type ToolCall } from '../hooks/journal'
import { paint } from '../hooks/paint'

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

function rows(run: RunState, columns: number, height: number, feedRows: number): { canvas: Canvas; lines: string[] } {
  const canvas = new Canvas(columns, height)

  paint(canvas, run, { nowMs: NOW, tick: 0, orientation: 'vertical', feedRows })

  const lines: string[] = []

  for (let y = 0; y < height; y++) {
    let text = ''

    for (let x = 0; x < columns; x++) {
      text += String.fromCodePoint(canvas.at(x, y) || 0x20)
    }

    lines.push(text.trimEnd())
  }

  return { canvas, lines }
}

test('the strip says what the run did, newest last, under a rule at the foot', () => {
  const { lines } = rows(pipeline(), 100, 30, 6)

  expect(lines.slice(-7)).toEqual([
    `── activity ${'─'.repeat(88)}`,
    '  4.0s  ✔ Preflight  passed: plan located, tools ready',
    '  5.0s    Develop    read 2 files, searched once',
    ' 10.0s    Develop    edited stores/config.ts',
    ' 12.0s  ✖ Develop    ran the linter, which failed',
    ' 14.0s    Develop    wrote stores/ai-status.ts',
    ' 16.0s  ▸ Develop    ran the tests',
  ])
})

test('only the newest lines are kept where there are more than the strip holds', () => {
  const { lines } = rows(pipeline(), 100, 30, 2)

  expect(lines.slice(-2)).toEqual([' 14.0s    Develop  wrote stores/ai-status.ts', ' 16.0s  ▸ Develop  ran the tests'])
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
    ' 5.0s    Develop  Lint clean. Now run the affected unit tests. \u2192 read config.ts, ran the tests for stores',
    ' 8.0s    Develop  See what changed so far \u2192 looked at the changes',
  ])
})

test('words too long for one line take a second under the first, and the strip keeps whole rows', () => {
  const why = 'The pill test failures are a mounting artifact: when the root v-if is false it renders as a comment node, so the element does not re-point after the flip. The fix is to mount it inside a stable wrapper.'
  const run = runOf([
    agent('Develop', 'running', [
      call('Bash', 'npm run lint', 4),
      call('Edit', 'file_path: /wt/feature/src/AiStatusPill.test.ts', 6, { why }),
    ]),
  ])
  const { lines } = rows(run, 80, 30, 2)

  expect(lines.slice(-3)).toEqual([
    `── activity ${'─'.repeat(68)}`,
    ' 6.0s    Develop  The pill test failures are a mounting artifact: when the root',
    '                  v-if is false it renders as a commen\u2026 \u2192 edited AiStatusPill.\u2026',
  ])
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

test('an agent thinking out loud is quoted in the sentence at the top', () => {
  const run = runOf([agent('Develop', 'running', [], { isThinking: true, stepSaid: 'The pill test failures are a mounting artifact.' })])
  const { lines } = rows(run, 120, 30, 0)

  expect(lines[0]).toBe(' In Develop, Develop is thinking: \u201cThe pill test failures are a mounting artifact\u201d.')
})
