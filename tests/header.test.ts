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

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'horizontal' })

  const rows = rowsOf(canvas)

  // No row above the bar: what the run is doing is the activity strip's to say.
  expect(barRowsOf(canvas.rows, canvas.columns)).toBe(3)
  // The lid stops short of the corner the surface draws its own close control
  // over; the foot runs the whole way, because it is the block's border.
  expect(rows[0]?.trimEnd()).toMatch(/^─+$/)
  expect(rows[2]).toMatch(/^─+$/)
  expect(rows[1]).toContain('haiku')

  // Both figures are marked — the clock and the sum — and the row of bars that
  // used to stand between them is gone. This row is where the pane teaches the
  // two marks, so it is the one that sets each off from its figure.
  expect(rows[1]).toContain('⧖')
  expect(rows[1]).toMatch(/∑ \d+(?:\.\d)?[km]/)
  expect(rows[2]).not.toMatch(/[▁-█]/)

  // Under ten rows the bar keeps the closing rule and gives up the opening one,
  // and the title went several rows before that.
  const short = new Canvas(100, 9)

  paint(short, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'horizontal' })

  const shortRows = rowsOf(short)

  expect(barRowsOf(short.rows, short.columns)).toBe(2)
  expect(shortRows[0]).toContain('haiku')
  expect(shortRows[1]).toMatch(/^─+$/)

  // Nor is it drawn where the pane has the height but not the width for it.
  const narrow = new Canvas(40, 26)

  paint(narrow, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'horizontal' })

  expect(barRowsOf(narrow.rows, narrow.columns)).toBe(3)
  expect(rowsOf(narrow)[0]).not.toContain('FlowPane')
})

test('each phase heading stands over the middle of its column, on its state mark', () => {
  const run = loaded()
  const canvas = new Canvas(100, 26)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'horizontal' })

  const view = layout(run, canvas.columns, canvas.rows, 'horizontal', 0)
  // The headings stand on one row under the bar, moved down with the drawing
  // where the body is taller than it.
  const caption =
    rowsOf(canvas).find(
      (row, y) => y >= barRowsOf(canvas.rows, canvas.columns) && row.includes(view.lanes[0]!.phase),
    ) ?? ''

  expect(view.orientation).toBe('horizontal')

  for (const lane of view.lanes) {
    const over = caption.slice(lane.x, lane.x + lane.w)

    expect(over).toContain(lane.phase)

    // Over the middle of the cards it heads. Flush left it sat over the first
    // cell of a card and left the rest of the column blank to its right, so in
    // a pane whose phases spread across it the names read as a list down the
    // left edge rather than as the heads of the columns under them.
    const start = over.search(/\S/)
    const end = over.trimEnd().length

    expect(over[start]).toMatch(/[\u2714\u2716\u2298\u25cb\u2800-\u28ff]/)
    expect(over.slice(start + 2).startsWith(lane.phase)).toBe(true)
    expect(Math.abs(start - (lane.w - end))).toBeLessThanOrEqual(1)
  }
})

test('a stacked band carries its heading in its own rule, over the middle of its cards', () => {
  const run = loaded()
  const canvas = new Canvas(80, 30)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'vertical' })

  const view = layout(run, canvas.columns, canvas.rows, 'vertical', 0)
  const cards = view.lanes[0]!.nodes
  const rule = rowsOf(canvas).find(row => row.includes(PHASES[0]!)) ?? ''
  // The state mark, the name, how many landed and how long it took, two cells
  // apart, set into the rule with a blank cell either side.
  const found = / (\S) (\S+) {2}(\d+\/\d+) {2}(\S+) /.exec(rule)

  expect(found).not.toBeNull()
  expect(found?.[2]).toBe(PHASES[0])

  // Rule either side of it, to both edges: the band's own border, filled to
  // the fraction of the phase that has landed.
  const at = found?.index ?? 0

  expect(rule.slice(0, at)).toMatch(/^[\u2501\u2500\u2502]+$/)
  expect(rule.slice(at + (found?.[0].length ?? 0))).toMatch(/^[\u2501\u2500\u2502]+$/)

  // And the heading's middle is the middle of the cards it heads.
  const left = Math.min(...cards.map(n => n.x))
  const right = Math.max(...cards.map(n => n.x + n.w))
  const middle = at + 1 + Math.floor((found?.[0].length ?? 2) - 2) / 2

  expect(Math.abs(middle - (left + right) / 2)).toBeLessThanOrEqual(1)
})

test('in the list a heading stays flush left, over the marks of the rows under it', () => {
  const run = loaded()
  const canvas = new Canvas(120, 30)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'list' })

  const rule = rowsOf(canvas).find(row => row.includes(PHASES[0]!)) ?? ''
  const mark = / (\S) (\S+) {2}\d+\/\d+/.exec(rule)

  // The list has no cards to stand over: centring it over rows that span the
  // pane put it near the middle, far from the marks it heads.
  expect(mark).not.toBeNull()
  expect(mark?.index ?? 99).toBeLessThanOrEqual(4)
})

test('a band rule stops at the scroll rail, and its heading keeps clear of it', () => {
  const run = loaded()
  // Short enough that the stack runs past the foot, which is what puts the
  // scroll rail down the right edge.
  const canvas = new Canvas(80, 18)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'vertical' })

  const rows = rowsOf(canvas)
  const rule = rows.find(row => row.includes(PHASES[0]!)) ?? ''

  // The rail is there, and it has taken the last of the row; the rule runs on
  // past the heading to meet it.
  expect(rule.slice(-2)).not.toMatch(/[\u2501\u2500]/)
  expect(rule.indexOf(PHASES[0]!)).toBeGreaterThan(3)
  expect(rule.slice(-4, -2)).toMatch(/^[\u2501\u2500]+$/)
})

test('the run menu drops below the bar, not through it', () => {
  const run = loaded()
  const canvas = new Canvas(100, 26)

  paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'horizontal',
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

  paint(wide, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'horizontal' })

  // The total, then the two called most, divided from each other by spacing
  // alone — the strokes say where one measurement ends and the next begins.
  // With room to spare the counts say what they count.
  expect(runLineOf(wide)).toContain('⚙ 9 tool calls  5×Read  3×Bash')
  expect(runLineOf(wide)).toContain('⧉ 6 agents')
  expect(runLineOf(wide)).toMatch(/∑ [\d.]+[km]? tokens/)
  expect(runLineOf(wide)).not.toContain('Grep')

  // Squeezed, the breakdown is given up a name at a time while the models are
  // still written out, and the count itself is the last of it to go.
  const narrow = new Canvas(84, 26)

  paint(narrow, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'horizontal' })

  const line = runLineOf(narrow)

  // The words are the first thing the row gives up, and all of them at once.
  expect(line).not.toContain('tool calls')
  expect(line).not.toContain('agents')
  expect(line).toContain('⚙ 9  5×Read')
  expect(line).not.toContain('3×Bash')
  expect(line).toContain('Haiku 4.5')

  const tighter = new Canvas(76, 26)

  paint(tighter, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'horizontal' })

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

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'horizontal' })

  expect(runLineOf(canvas)).toContain('⚙ 11')
  expect(runLineOf(canvas)).not.toMatch(/\d×[A-Z]/)
})
