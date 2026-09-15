/**
 * The header block: three rows, the phase names centred, and the run menu
 * dropping clear of both.
 *
 * The bar's geometry is load-bearing for everything drawn under it — the
 * layout sizes the body from it, the menu opens below it, and the phase names
 * sit between it and the graph. A bar that is a row taller or shorter than the
 * layout thinks quietly overdraws whatever comes next, which is the kind of
 * fault a picture shows and a type does not.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import { applyJournal, applyRunFile, type RunState } from '../hooks/journal'
import { barRowsOf, layout } from '../hooks/layout'
import { paint } from '../hooks/paint'

const STARTED = 1_700_000_000_000
const PHASES = ['Gather', 'Draft', 'Critique']

const JOURNAL = PHASES.flatMap((phase, i) => [
  JSON.stringify({ type: 'started', agentId: `a${i}0`, label: `${phase.toLowerCase()}:rivers`, phase }),
  JSON.stringify({ type: 'started', agentId: `a${i}1`, label: `${phase.toLowerCase()}:reefs`, phase }),
]).join('\n')

const SUMMARY = JSON.stringify({
  status: 'completed',
  workflowName: 'haiku',
  startTime: STARTED,
  durationMs: 20_000,
  totalTokens: 311_500,
  defaultModel: 'claude-haiku-4-5-20251001',
  result: 'done',
  workflowProgress: PHASES.flatMap((phase, i) =>
    ['rivers', 'reefs'].map((topic, j) => ({
      type: 'workflow_agent',
      agentId: `a${i}${j}`,
      label: `${phase.toLowerCase()}:${topic}`,
      phaseTitle: phase,
      state: 'done',
      startedAt: STARTED + i * 5_000,
      durationMs: 4_000,
      tokens: 15_000,
    })),
  ),
})

function loaded(): RunState {
  const run: RunState = {
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

  applyJournal(run, JOURNAL, STARTED + 20_000)
  applyRunFile(run, SUMMARY, STARTED + 20_000)

  return run
}

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

/** The run's own line, wherever the bar starts: under the title and the lid. */
function runLineOf(canvas: Canvas): string {
  return rowsOf(canvas)[barRowsOf(canvas.rows, canvas.columns) - 2] ?? ''
}

test('the bar is a rule, the run line, and a rule', () => {
  const run = loaded()
  const canvas = new Canvas(100, 26)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'flow' })

  const rows = rowsOf(canvas)

  // A pane this size carries the title as well: the name, then the bar.
  expect(barRowsOf(canvas.rows, canvas.columns)).toBe(4)
  expect(rows[0]?.trim()).toBe('FlowPane - Dynamic Workflow Visualizer')
  // The lid stops short of the corner the surface draws its own close control
  // over; the foot runs the whole way, because it is the block's border.
  expect(rows[1]?.trimEnd()).toMatch(/^─+$/)
  expect(rows[3]).toMatch(/^─+$/)
  expect(rows[2]).toContain('haiku')

  // Both figures are marked — the clock and the sum — and the row of bars that
  // used to stand between them is gone. This row is where the pane teaches the
  // two marks, so it is the one that sets each off from its figure.
  expect(rows[2]).toContain('⧖')
  expect(rows[2]).toMatch(/∑ \d+(?:\.\d)?[km]/)
  expect(rows[2]).not.toMatch(/[▁-█]/)

  // Under ten rows the bar keeps the closing rule and gives up the opening one,
  // and the title went several rows before that.
  const short = new Canvas(100, 9)

  paint(short, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'flow' })

  const shortRows = rowsOf(short)

  expect(barRowsOf(short.rows, short.columns)).toBe(2)
  expect(shortRows[0]).toContain('haiku')
  expect(shortRows[1]).toMatch(/^─+$/)

  // Nor is it drawn where the pane has the height but not the width for it.
  const narrow = new Canvas(40, 26)

  paint(narrow, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'flow' })

  expect(barRowsOf(narrow.rows, narrow.columns)).toBe(3)
  expect(rowsOf(narrow)[0]).not.toContain('FlowPane')
})

test('each phase name is centred over what it names', () => {
  const run = loaded()
  const canvas = new Canvas(100, 26)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'flow' })

  const view = layout(run, canvas.columns, canvas.rows, 'flow', 0)
  const caption = rowsOf(canvas)[barRowsOf(canvas.rows, canvas.columns)] ?? ''

  expect(view.orientation).toBe('flow')

  for (const lane of view.lanes) {
    const over = caption.slice(lane.x, lane.x + lane.w)
    const lead = over.length - over.trimStart().length
    const trail = over.length - over.trimEnd().length

    expect(over).toContain(lane.phase)
    // One cell of slack: an odd amount of space cannot be split evenly.
    expect(Math.abs(lead - trail)).toBeLessThanOrEqual(1)
  }
})

test('a stacked band carries its name centred in its own rule', () => {
  const run = loaded()
  const canvas = new Canvas(80, 30)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'stack' })

  const rule = rowsOf(canvas).find(row => row.includes(PHASES[0]!)) ?? ''
  // The name is set into the rule with a blank cell either side of it.
  const found = / (\S+ \d+\/\d+) /.exec(rule)

  expect(found).not.toBeNull()

  const at = (found?.index ?? 0) + 1
  const label = found?.[1] ?? ''

  expect(label).toContain(PHASES[0]!)
  expect(Math.abs((at + label.length / 2) - canvas.columns / 2)).toBeLessThanOrEqual(1)
  // Either side of it, rule and nothing else: the band's own border, filled to
  // the fraction of the phase that has landed.
  expect(rule.replace(found?.[0] ?? '', '')).toMatch(/^[\u2501\u2500]+$/)
})

test('the run menu drops below the bar, not through it', () => {
  const run = loaded()
  const canvas = new Canvas(100, 26)

  paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'flow',
    runPicker: 'open',
    runs: [
      { id: 'wf_test', mark: '\u2714', name: 'haiku', tally: '6/6', status: 'completed', startedMs: STARTED },
      { id: 'wf_other', mark: '\u2714', name: 'other', tally: '4/4', status: 'completed', startedMs: STARTED - 60_000 },
    ],
  })

  const rows = rowsOf(canvas)
  const top = rows.findIndex(row => row.includes('╭'))

  expect(top).toBe(barRowsOf(canvas.rows, canvas.columns))
  // The bar is whole underneath it: the run's name is still readable, and the
  // rule it closes on still runs the width of the pane.
  expect(rows[barRowsOf(canvas.rows, canvas.columns) - 2]).toContain('haiku')
  expect(rows[barRowsOf(canvas.rows, canvas.columns) - 1]).toMatch(/^─+$/)
})

test('the run line says what the agents called, and gives the names up first', () => {
  const run = loaded()

  run.agents[0]!.tools = [
    { name: 'Read', count: 5, atMs: STARTED + 1_000, isRunning: false },
    { name: 'Bash', count: 3, atMs: STARTED + 2_000, isRunning: false },
    { name: 'Grep', count: 1, atMs: STARTED + 3_000, isRunning: false },
  ]

  const wide = new Canvas(120, 26)

  paint(wide, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'flow' })

  // The total, then the two called most, divided from each other by spacing
  // alone — the strokes say where one measurement ends and the next begins.
  expect(runLineOf(wide)).toContain('⚙ 9  5×Read  3×Bash')
  expect(runLineOf(wide)).not.toContain('Grep')

  // Squeezed, the breakdown is given up a name at a time while the models are
  // still written out, and the count itself is the last of it to go.
  const narrow = new Canvas(84, 26)

  paint(narrow, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'flow' })

  const line = runLineOf(narrow)

  expect(line).toContain('⚙ 9  5×Read')
  expect(line).not.toContain('3×Bash')
  expect(line).toContain('Haiku 4.5')

  const tighter = new Canvas(76, 26)

  paint(tighter, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'flow' })

  const tight = runLineOf(tighter)

  expect(tight).toContain('⚙ 9')
  expect(tight).not.toContain('5×Read')
})

test('a run nobody watched counts the calls its journal counted', () => {
  const run = loaded()

  // No tool names anywhere: this is a run read back off disk whose transcripts
  // have not been opened. The count is still a fact, and still worth saying.
  run.agents[0]!.toolCalls = 7
  run.agents[1]!.toolCalls = 4

  const canvas = new Canvas(120, 26)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'flow' })

  expect(runLineOf(canvas)).toContain('⚙ 11')
  expect(runLineOf(canvas)).not.toMatch(/\d×[A-Z]/)
})
