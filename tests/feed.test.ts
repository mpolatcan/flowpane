/**
 * The activity strip: what the run has done, one line per thing a reader of a
 * pipeline waits to hear about, under a rule at the foot of the pane.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import type { AgentRow, AgentState, RunState, ToolCall } from '../hooks/journal'
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
      call('Bash', 'command: cd /wt/feature && npm run lint\ndescription: Lint', 12, { isError: true }),
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
    ' 12.0s  ✖ Develop    ran npm run lint, which failed',
    ' 14.0s    Develop    wrote stores/ai-status.ts',
    ' 16.0s  ▸ Develop    ran npx vitest run',
  ])
})

test('only the newest lines are kept where there are more than the strip holds', () => {
  const { lines } = rows(pipeline(), 100, 30, 2)

  expect(lines.slice(-2)).toEqual([' 14.0s    Develop  wrote stores/ai-status.ts', ' 16.0s  ▸ Develop  ran npx vitest run'])
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
