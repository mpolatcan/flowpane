/**
 * The controls in a dialog that stay back until they are pointed at.
 *
 * A Button draws its label in the plain text colour whatever the cells under it
 * were, so a closed tab, a trip not being read, `◂ Back` and `✕` all read at
 * full strength live unless the hotspot hands the surface a colour to set them
 * back by. These read that colour off the hotspots the paint hands back.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import type { AgentRow, RunState } from '../hooks/journal'
import {
  ABOUT_CLOSE,
  CALL_BACK,
  COLORS,
  DETAIL_CLOSE,
  DETAIL_TAB,
  paint,
  PASS_OPEN,
  SETTINGS_CLOSE,
  useTheme,
  type Hotspot,
  type PaintOptions,
} from '../hooks/paint'

const STARTED = 1_700_000_000_000
const CALLS = 1

function agentOf(id: string, label: string, phase: string, from: number, ms: number): AgentRow {
  return {
    agentId: id,
    label,
    phase,
    state: 'done',
    startedMs: STARTED + from,
    endedMs: STARTED + from + ms,
    tools: [],
    tokens: 12_000,
    result: 'done',
  }
}

function runOf(agents?: AgentRow[], phases?: string[]): RunState {
  const reviewer: AgentRow = {
    ...agentOf('r1', 'review:correctness', 'Review', 5_000, 0),
    state: 'running',
    endedMs: undefined,
    isThinking: true,
    saying: 'reading the file',
    prompt: 'Review hooks/paint.ts for correctness.',
    calls: [
      {
        id: 'c0',
        name: 'Bash',
        input: 'command: git log -1',
        startedMs: STARTED + 5_000,
        endedMs: STARTED + 5_050,
        result: 'commit abc',
      },
    ],
  }

  return {
    runId: 'wf_quiet',
    name: 'audit',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_quiet',
    runFile: '/session/workflows/wf_quiet.json',
    startedMs: STARTED,
    status: 'running',
    phases: phases ?? ['Survey', 'Review'],
    agents: agents ?? [agentOf('s1', 'survey:paint', 'Survey', 0, 4_000), reviewer],
    consumed: 0,
  }
}

function spotsOf(options: Partial<PaintOptions>, run: RunState = runOf()): Hotspot[] {
  useTheme('tokyo-night')

  return paint(new Canvas(110, 32), run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    detailRows: 14,
    ...options,
  }).hotspots
}

function spotOf(spots: Hotspot[], key: string): Hotspot {
  const spot = spots.find(s => s.agentId === key)

  expect(spot).toBeDefined()

  return spot!
}

test('every closed tab of a dialog stays back in the accent, and the open one does not', () => {
  const tabs = spotsOf({ selectedId: 'r1', detailTab: CALLS }).filter(s => s.agentId.startsWith(DETAIL_TAB))
  const closed = tabs.filter(s => s.agentId !== `${DETAIL_TAB}${CALLS}`)

  expect(tabs.length).toBeGreaterThan(1)
  expect(closed.length).toBe(tabs.length - 1)
  expect(closed.every(s => JSON.stringify(s.quiet) === JSON.stringify(COLORS.accent))).toBe(true)
  expect(spotOf(tabs, `${DETAIL_TAB}${CALLS}`).quiet).toBeUndefined()
})

test('every trip of a loop but the one being read stays back, and the open trip does not', () => {
  const agents: AgentRow[] = Array.from({ length: 4 }, (_, i) => [
    agentOf(`d${i + 1}`, 'Develop', 'Develop', i * 10_000, 4_000),
    agentOf(`v${i + 1}`, 'Verify', 'Verify', i * 10_000 + 5_000, 4_000),
  ]).flat()
  const spots = spotsOf({ selectedId: 'd3', tick: -1, detailTab: 0 }, { ...runOf(agents, ['Develop', 'Verify']), status: 'completed' })
  const trips = spots.filter(s => s.agentId.startsWith(PASS_OPEN))
  const others = trips.filter(s => s.agentId !== `${PASS_OPEN}d3`)

  expect(trips.length).toBe(4)
  expect(others.every(s => JSON.stringify(s.quiet) === JSON.stringify(COLORS.accent))).toBe(true)
  expect(spotOf(trips, `${PASS_OPEN}d3`).quiet).toBeUndefined()
})

test("an opened call's way back stays back in the accent", () => {
  const spots = spotsOf({ selectedId: 'r1', detailTab: CALLS, openCall: 'c0' })

  expect(spotOf(spots, CALL_BACK).quiet).toEqual(COLORS.accent)
})

test("the agent dialog's close mark stays back in the accent", () => {
  const spots = spotsOf({ selectedId: 'r1' })

  expect(spotOf(spots, DETAIL_CLOSE).quiet).toEqual(COLORS.accent)
})

test("an opened call's close mark stays back in the accent", () => {
  const spots = spotsOf({ selectedId: 'r1', detailTab: CALLS, openCall: 'c0' })

  expect(spots.some(s => s.agentId === CALL_BACK)).toBe(true)
  expect(spotOf(spots, DETAIL_CLOSE).quiet).toEqual(COLORS.accent)
})

test("a nested run's dialog keeps its close mark back in the accent", () => {
  const phase = '▸ code-review'
  const run = runOf(
    [
      agentOf('s1', 'survey:paint', 'Survey', 0, 4_000),
      agentOf('n1', 'plan', phase, 1_000, 2_000),
      agentOf('n2', 'review:bugs', phase, 3_000, 4_000),
    ],
    ['Survey', phase],
  )
  const spots = spotsOf({ selectedId: `@run:${phase}` }, run)

  expect(spotOf(spots, DETAIL_CLOSE).quiet).toEqual(COLORS.accent)
})

test("the settings dialog's close mark stays back in the accent", () => {
  expect(spotOf(spotsOf({ settings: true }), SETTINGS_CLOSE).quiet).toEqual(COLORS.accent)
})

test("the About dialog's close mark stays back in the accent", () => {
  expect(spotOf(spotsOf({ about: true }), ABOUT_CLOSE).quiet).toEqual(COLORS.accent)
})
