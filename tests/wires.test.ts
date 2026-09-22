/**
 * The lines between the nodes, read off the drawing.
 *
 * Two things a reader asks of them: that a line can be followed from the node
 * it leaves to the node it reaches, and that where it starts says something
 * true about the run. A phase whose agents ran one at a time is entered at its
 * head and left from its tail — feeding every one of them from the phase above
 * says they started together, which their own clocks disprove.
 *
 * Following one is the harder of the two. Every carry that changed row used to
 * turn in a column of its own, which drew a weave: four wires, four paths, and
 * a reader picking one out of the crossings. They share a column now, and the
 * column is dealt cell by cell: a wire takes the first one that leaves it clear
 * of every wire already placed, counting the run out of its card and the run
 * into its target as part of it.
 *
 * Two wires out of one card are the exception, and the picture is a comb. They
 * leave by the one point that card has on that side, run together to the shared
 * column and part there, and the cell they part on is drawn as a fork. A fork
 * says one line becomes two, which is what happened. A crossing says two
 * unrelated lines meet, which is the thing being ruled out.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas, cross, line } from '../hooks/canvas'
import type { AgentRow, RunState } from '../hooks/journal'
import { entryOf, exitOf, layout } from '../hooks/layout'
import { edgesOf } from '../hooks/shape'
import { frameOf, paint, quietOf, useTheme } from '../hooks/paint'
import { DEFAULT_THEME, paletteOf, THEMES } from '../hooks/theme'

const STARTED = 1_700_000_000_000

const ARROW_DOWN = '▾'
const ARROW_RIGHT = '▸'
const DASH_V = '┆'
const DASH_H = '┄'
const LINE_V = '│'
// Where a carry leaves the run it shares: a fork, drawn as the arms that meet
// there. Allowed only on the line a card's own point stands on, because that is
// the only line two wires out of one card can be sharing.
const FORKS = ['┴', '┬', '├', '┤']
/** Two lines with nothing to do with each other, in one cell. Never allowed. */
const CROSS = '┼'
/** The point a wire leaves a card by: one per side, in the middle of it. */
const PORT = '•'
/** Where one wire steps over another. Drawn where they cross, nowhere else. */
const HOP = '◠'
/** Where a wire turns. One to a line: two would be two wires sharing it. */
const CORNERS = ['╭', '╮', '╰', '╯']

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

function runOf(name: string, phases: string[], agents: AgentRow[]): RunState {
  return {
    runId: 'wf_test',
    name,
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_test',
    runFile: '/session/workflows/wf_test.json',
    startedMs: STARTED,
    status: 'completed',
    phases,
    agents,
    consumed: 120_000,
  }
}

/**
 * Three passes at one file, each begun once the one before it landed, with a
 * phase either side of them.
 */
function chained(): RunState {
  return runOf('audit', ['Survey', 'Review', 'Report'], [
    agentOf('s1', 'survey:paint', 'Survey', 0, 4_000),
    agentOf('s2', 'survey:layout', 'Survey', 0, 4_000),
    agentOf('r1', 'review:pass 1', 'Review', 5_000, 3_000),
    agentOf('r2', 'review:pass 2', 'Review', 8_100, 3_000),
    agentOf('r3', 'review:pass 3', 'Review', 11_200, 3_000),
    agentOf('p1', 'report:join', 'Report', 15_000, 2_000),
  ])
}

/** The same phases, with the middle one's three agents opened at once. */
function fanned(): RunState {
  const run = chained()

  run.agents
    .filter(a => a.phase === 'Review')
    .forEach(a => {
      a.startedMs = STARTED + 5_000
      a.endedMs = STARTED + 8_000
    })

  return run
}

/**
 * A phase that took one pass, then opened three at once, then took one more.
 *
 * Neither a chain nor a fan, and the shape a nested run opened out always has:
 * a claim, a panel, a write-up. Read as a fan it takes an arrow into all five
 * and a line out of all five; read as what it is, one of each.
 */
function waved(): RunState {
  return runOf('audit', ['Survey', 'Review', 'Report'], [
    agentOf('s1', 'survey:paint', 'Survey', 0, 4_000),
    agentOf('s2', 'survey:layout', 'Survey', 0, 4_000),
    agentOf('r0', 'review:plan', 'Review', 5_000, 2_000),
    agentOf('r1', 'review:bugs', 'Review', 8_000, 3_000),
    agentOf('r2', 'review:style', 'Review', 8_100, 2_900),
    agentOf('r3', 'review:perf', 'Review', 8_200, 2_800),
    agentOf('r4', 'review:write', 'Review', 12_000, 2_000),
    agentOf('p1', 'report:join', 'Report', 15_000, 2_000),
  ])
}

/**
 * Two sources, each feeding two targets: every agent of the later phase has a
 * named source and every agent of the earlier one feeds something, so the
 * carries draw themselves rather than bundling into a barrier.
 */
function fannedOut(): RunState {
  return runOf('haiku', ['Gather', 'Draft'], [
    agentOf('g0', 'gather:rivers', 'Gather', 0, 4_000),
    agentOf('g1', 'gather:reefs', 'Gather', 0, 4_000),
    agentOf('d0', 'draft:rivers alpha', 'Draft', 5_000, 4_000),
    agentOf('d1', 'draft:rivers beta', 'Draft', 5_000, 4_000),
    agentOf('d2', 'draft:reefs alpha', 'Draft', 5_000, 4_000),
    agentOf('d3', 'draft:reefs beta', 'Draft', 5_000, 4_000),
  ])
}

/**
 * Three sources and three targets, so the middle carry crosses the middle of
 * the rule the band below is named on — the cell the name would otherwise take.
 */
function abreast(): RunState {
  return runOf('haiku', ['Gather', 'Draft'], [
    agentOf('g0', 'gather:rivers', 'Gather', 0, 4_000),
    agentOf('g1', 'gather:reefs', 'Gather', 0, 4_000),
    agentOf('g2', 'gather:dunes', 'Gather', 0, 4_000),
    agentOf('d0', 'draft:rivers', 'Draft', 5_000, 4_000),
    agentOf('d1', 'draft:reefs', 'Draft', 5_000, 4_000),
    agentOf('d2', 'draft:dunes', 'Draft', 5_000, 4_000),
  ])
}

/**
 * A run that went round three times, doing more each time.
 *
 * Every attempt repeats the agents of the one before it and adds one, so the
 * carries between two attempts fan out from a lane the barrier also has to
 * reach past — and the wires that come out of it cannot all be drawn without
 * one passing another. Ordering a lane to follow the one before it unpicks
 * every crossing a pipeline makes, so this is where the arc is still needed.
 */
function retried(): RunState {
  return runOf('retry', ['Attempt 1', 'Attempt 2', 'Attempt 3'], [
    agentOf('a0', 'develop', 'Attempt 1', 0, 2_000),
    agentOf('a1', 'verify', 'Attempt 1', 2_000, 2_000),
    agentOf('b0', 'develop', 'Attempt 2', 5_000, 2_000),
    agentOf('b1', 'verify', 'Attempt 2', 7_000, 2_000),
    agentOf('b2', 'lint', 'Attempt 2', 7_000, 2_000),
    agentOf('b3', 'build', 'Attempt 2', 7_000, 2_000),
    agentOf('c0', 'develop', 'Attempt 3', 10_000, 2_000),
    agentOf('c1', 'verify', 'Attempt 3', 12_000, 2_000),
    agentOf('c2', 'lint', 'Attempt 3', 12_000, 2_000),
    agentOf('c3', 'build', 'Attempt 3', 12_000, 2_000),
    agentOf('c4', 'unit-test', 'Attempt 3', 12_000, 2_000),
  ])
}

/**
 * A phase whose work nothing in the phase before it fed, with the phase before
 * that feeding the one after — so the run has an edge over a whole lane, drawn
 * as a rail across the gutter the skipped lane's own carries turn in. Two lines
 * with nothing to do with each other, in one cell, which is the one case an arc
 * is for.
 */
function railed(): RunState {
  return runOf('audit', ['Gather', 'Widen', 'Draft'], [
    agentOf('g0', 'gather:alpha', 'Gather', 0, 4_000),
    agentOf('g1', 'gather:beta', 'Gather', 0, 4_000),
    agentOf('w0', 'widen:one', 'Widen', 5_000, 30_000),
    agentOf('w1', 'widen:two', 'Widen', 5_000, 30_000),
    agentOf('w2', 'widen:three', 'Widen', 5_000, 30_000),
    agentOf('d0', 'draft:alpha', 'Draft', 6_000, 4_000),
    agentOf('d1', 'draft:beta', 'Draft', 6_000, 4_000),
  ])
}

/**
 * The same skip, with phases the run never entered declared around it.
 *
 * The drawing holds only the phases it can fit, and the ones with nothing in
 * them are the first to go — so this run has six phases and the picture has
 * three. A skip names its two ends by their place in the run, which is not
 * their place in the picture.
 */
function railedPast(): RunState {
  const run = railed()

  run.phases = ['Setup', ...run.phases, 'Later', 'Last']

  return run
}

/**
 * The same skip with a phase after it, so the fed cards have a band below them.
 *
 * Down the pane the row under a card is the rule the next band is named on, so a
 * source with work after it is written on the row above the card instead — which
 * is the row the wires arrive on.
 */
function railedMiddle(): RunState {
  const run = railed()

  run.phases = [...run.phases, 'Final']
  run.agents.push(agentOf('f0', 'final:one', 'Final', 12_000, 4_000))

  return run
}

/**
 * The same skip, from a nested run.
 *
 * A workflow engine writes `\u25b8` in front of a nested run's phase name, and this
 * pane uses `\u25b8` for *press to unfold*. Beside a card the two collide.
 */
function railedNested(): RunState {
  const run = railedMiddle()
  const named = '\u25b8 code-review:ai-review'

  run.phases = run.phases.map(p => (p === 'Gather' ? named : p))

  for (const agent of run.agents) {
    if (agent.phase === 'Gather') {
      agent.phase = named
    }
  }

  return run
}

/**
 * The same skip, from a phase named at a given length.
 *
 * A written source has the card it points at to write in and no more, so what
 * decides whether the word in front of the name fits is the name, not the pane:
 * a card is the same width at every size the pane is drawn at.
 */
function railedNamed(named: string): RunState {
  const run = railedMiddle()

  run.phases = run.phases.map(p => (p === 'Gather' ? named : p))

  for (const agent of run.agents) {
    if (agent.phase === 'Gather') {
      agent.phase = named
    }
  }

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

/** Which columns of a row carry any of these glyphs. */
function columnsOf(row: string, glyphs: string[]): number[] {
  const at: number[] = []

  for (let x = 0; x < row.length; x++) {
    if (glyphs.includes(row[x] as string)) {
      at.push(x)
    }
  }

  return at
}

function drawn(run: RunState, columns: number, rows: number, orientation: 'horizontal' | 'vertical') {
  const canvas = new Canvas(columns, rows)
  // The painter's own layout, not a fresh one at the same size: a drawing too
  // big for the pane gives a column to its scroll rail, and the boxes move.
  //
  // Held at the drawing's own origin rather than on the phase the run is
  // working in, because every test here reads a cell off the canvas at a box's
  // own coordinates. A window that has scrolled is the same drawing at a
  // different offset, and the two stop lining up.
  const drawn = paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation,
    follow: false,
    bodyScroll: { x: 0, y: 0 },
  })

  return {
    canvas,
    rows: rowsOf(canvas),
    view: drawn.view ?? layout(run, columns, rows, orientation, 0),
  }
}

test('a phase its agents ran one at a time is entered at its head', () => {
  const { rows, view } = drawn(chained(), 96, 34, 'vertical')
  const review = view.lanes.find(l => l.phase === 'Review')

  expect(review?.nodes.length).toBe(3)

  const cardY = review?.nodes[0]?.y ?? 0
  const heads = columnsOf(rows[cardY - 1] ?? '', [ARROW_DOWN])

  // One arrowhead, over the first of the three. The other two are reached by
  // the pass before them, not by the phase above.
  expect(heads.length).toBe(1)
  expect(heads[0]).toBeGreaterThanOrEqual(review?.nodes[0]?.x ?? 0)
  expect(heads[0]).toBeLessThan((review?.nodes[0]?.x ?? 0) + (review?.nodes[0]?.w ?? 0))

  // And the passes are joined to each other, which is the line that says the
  // phase was a sequence.
  expect(columnsOf(rows[cardY + 1] ?? '', [ARROW_RIGHT]).length).toBe(2)
})

test('a phase its agents ran one at a time is left from its tail', () => {
  const { rows, view } = drawn(chained(), 96, 34, 'vertical')
  const review = view.lanes.find(l => l.phase === 'Review')
  const nodes = review?.nodes ?? []
  const last = nodes[nodes.length - 1]
  // The cell under the card is the point the line leaves by, and under that the
  // line itself. Either answers the question being asked — one thing leaves the
  // phase, and it leaves from the last of its passes.
  const below = columnsOf(rows[(last?.y ?? 0) + (last?.h ?? 0)] ?? '', [LINE_V, DASH_V, PORT])

  expect(below.length).toBe(1)
  expect(below[0]).toBeGreaterThanOrEqual(last?.x ?? 0)
  expect(below[0]).toBeLessThan((last?.x ?? 0) + (last?.w ?? 0))
})

/**
 * What a card says above it, out of the rows a written source may take.
 *
 * Across the pane that is the row against the card. Down the pane the band
 * keeps a row of its own one further up, because the row against the card is
 * the one the arrowheads land on.
 */
function saidOver(rows: string[], node: { x: number; y: number; w: number }): string {
  for (const y of [node.y - 2, node.y - 1]) {
    const said = (rows[y] ?? '').slice(node.x, node.x + node.w)

    if (said.replace(/[\s\u2502\u2506]/g, '').length > 0) {
      return said
    }
  }

  return ''
}

test('a card fed from further back says which phase fed it, in words', () => {
  const { rows, view } = drawn(railedPast(), 168, 30, 'horizontal')
  const draft = view.lanes.find(l => l.phase === 'Draft')
  const nodes = draft?.nodes ?? []

  expect(nodes.length).toBe(2)

  // Nothing is drawn between the two phases. A line long enough to span a whole
  // lane has to be followed past everything drawn in between, and a reader who
  // has scrolled into the middle of it sees a rule with no ends. The name goes
  // on the card that was fed, where the reader already is, and says in words
  // what the line would have said in a shape.
  for (const node of nodes) {
    const said = saidOver(rows, node)

    // And it names the phase the work came from, not the one before it: a
    // source read off the drawing's own order rather than the run's named the
    // phase after the one it belonged to, in every run the picture left out a
    // phase of.
    //
    // The word, because the mark alone was read as decoration — it is the word
    // the detail dialog's foot uses for the same fact. The mark is the
    // arrowhead every drawn input to a card ends in, pointing at the card from
    // the row it landed on. It was `↰`, which is the return arrow everywhere
    // else a developer meets it, and was read as the run rewinding to this
    // step.
    expect(said).toContain('▾ from Gather')
  }
})

test('a written source stands above the card in either layout', () => {
  // One row, one mark, whichever way the run is drawn. The row under a card is
  // the row its wires leave by down the pane, so a name written there reads as
  // something coming out of the card; and a label that stood under a card
  // across the pane and over one down it was the same fact in two shapes.
  //
  // The mark was `↰` in both places, which is the return arrow everywhere else
  // a developer meets it: a reader asked whether the run rewound to this step.
  // Every input this pane draws ends in an arrowhead pointing into the card it
  // feeds, and one it writes instead of drawing says it the same way. Where a
  // wire is already arriving on that row, that arrowhead serves both and the
  // source is written up against it rather than given a second one.
  const across = drawn(railedPast(), 168, 30, 'horizontal')
  const down = drawn(railedMiddle(), 104, 52, 'vertical')

  for (const { rows, view } of [across, down]) {
    const draft = view.lanes.find(l => l.phase === 'Draft')
    const nodes = draft?.nodes ?? []

    expect(nodes.length).toBe(2)

    for (const node of nodes) {
      const above = saidOver(rows, node)
      const below = (rows[node.y + node.h] ?? '').slice(node.x, node.x + node.w)

      expect(above).toContain('Gather')
      expect(below).not.toContain('Gather')
      // Whole. The name is the thing on the row that says anything, and the
      // word in front of it is given up before a letter of it is.
      expect(above).not.toContain('\u2026')
    }
  }
})

test('the word in front of a written source gives way before the name does', () => {
  // A label has the card it points at to write in, so a name long enough leaves
  // no room for the word. `from Gather the evidence in fu…` names nothing while
  // spelling out a word the reader has already met spelled out on a shorter
  // name in the same drawing — the ladder a token count runs down, for the same
  // reason.
  //
  // The name is what decides it, at one pane size for both: a card is the same
  // width whatever the pane is, so the same label on the same card cannot say
  // one thing in a wide window and another in a narrow one.
  const saidIn = (named: string): string => {
    const { rows, view } = drawn(railedNamed(named), 104, 52, 'vertical')
    const node = view.lanes.find(l => l.phase === 'Draft')?.nodes[0]

    return node === undefined ? '' : saidOver(rows, node).trim()
  }

  // Short enough for both, and the label says both.
  expect(saidIn('Gather the evidence')).toContain('from Gather the evidence')

  // Too long for both. The name comes through whole and the word goes.
  const tight = saidIn('Gather the evidence in full')

  expect(tight).toContain('Gather the evidence in full')
  expect(tight).not.toContain('from')
  expect(tight).not.toContain('\u2026')
})

test('a written source stands centred on the card it points at', () => {
  // The way a card centres its own name and its own model. Set against the left
  // edge it hung off a card wider than it by the whole of the difference, which
  // read as a label belonging to whatever was further left rather than to the
  // card it points at.
  const { rows, view } = drawn(railedPast(), 168, 30, 'horizontal')
  const nodes = view.lanes.find(l => l.phase === 'Draft')?.nodes ?? []

  expect(nodes.length).toBe(2)

  for (const node of nodes) {
    const over = saidOver(rows, node)

    expect(over).toContain('from Gather')

    // Wider than what it says, so there is something to centre.
    expect(over.trim().length).toBeLessThan(node.w)

    const left = over.length - over.trimStart().length
    const right = over.length - over.trimEnd().length

    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
  }
})

test('a source that is a nested run is named without the mark that unfolds it', () => {
  // `\u25b8` is this pane's press-to-unfold mark, and the engine writes it in front
  // of a nested run's phase name. Left on, a card fed by one read
  // `\u25be from \u25b8 code-review:ai-review` — two marks and a control a reader cannot
  // press, since the press is on the band's own caption. The detail dialog's
  // title strips it for the same reason.
  const { rows, view } = drawn(railedNested(), 140, 30, 'vertical')
  const node = view.lanes.find(l => l.phase === 'Draft')?.nodes[0]
  const above = node === undefined ? '' : saidOver(rows, node)

  expect(above).toContain('code-review:ai-review')
  expect(above).not.toContain('\u25b8')
})

test('a phase that ran in waves is entered at its first and left from its last', () => {
  const { rows, view } = drawn(waved(), 170, 46, 'vertical')
  const review = view.lanes.find(l => l.phase === 'Review')
  const nodes = review?.nodes ?? []

  expect(nodes.length).toBe(5)

  // One arrowhead, over the pass that started the phase. The three that ran at
  // once were opened by it, not by the phase above, and the one after them
  // waited on all three.
  const heads = columnsOf(rows[(nodes[0]?.y ?? 0) - 1] ?? '', [ARROW_DOWN])

  expect(heads.length).toBe(1)
  expect(heads[0]).toBeGreaterThanOrEqual(nodes[0]?.x ?? 0)
  expect(heads[0]).toBeLessThan((nodes[0]?.x ?? 0) + (nodes[0]?.w ?? 0))

  // And one line out, from the last of them.
  const last = nodes[nodes.length - 1]
  const below = columnsOf(rows[(last?.y ?? 0) + (last?.h ?? 0)] ?? '', [LINE_V, DASH_V, PORT])

  expect(below.length).toBe(1)
  expect(below[0]).toBeGreaterThanOrEqual(last?.x ?? 0)
  expect(below[0]).toBeLessThan((last?.x ?? 0) + (last?.w ?? 0))
})

test('a phase its agents ran at once is fed into every one of them', () => {
  const { rows, view } = drawn(fanned(), 96, 34, 'vertical')
  const review = view.lanes.find(l => l.phase === 'Review')
  const cardY = review?.nodes[0]?.y ?? 0

  // Whatever the phase above produced was there for all three at once, and the
  // drawing says so with an arrow into each.
  expect(columnsOf(rows[cardY - 1] ?? '', [ARROW_DOWN]).length).toBe(3)
  expect(columnsOf(rows[cardY + 1] ?? '', [ARROW_RIGHT]).length).toBe(0)
})

test('the carries that change row all turn in one column', () => {
  const { rows, view } = drawn(fannedOut(), 120, 34, 'horizontal')
  const [from, to] = view.lanes
  const gutter = { start: (from?.x ?? 0) + (from?.w ?? 0), end: to?.x ?? 0 }
  const turns = new Set<number>()

  for (let y = 0; y < rows.length; y++) {
    // The wire's own run and its corners, not every vertical in the gutter:
    // the boundary between the two phases stands there too, and it is a line
    // the wires cross rather than one of them.
    for (const x of columnsOf(rows[y] as string, [DASH_V, ...CORNERS])) {
      if (x >= gutter.start && x < gutter.end) {
        turns.add(x)
      }
    }
  }

  // A column each was a column each way: four carries took four paths across
  // one gutter and the reader had to pick a line out of the weave. They turn in
  // one column now, so the gutter reads as a comb — a trunk with a tooth into
  // each target — and following one is following it along a row.
  expect(turns.size).toBe(1)

  // Nothing crosses in that column: a ┼ there is two carries with nothing to do
  // with each other in one cell, and an arm a reader cannot assign to either.
  const turn = [...turns][0] as number

  expect(rows.some(row => row[turn] === CROSS)).toBe(false)

  // What does meet there is a fork, and only on a row a card's own point stands
  // on. Both wires out of that card leave by the point, run to the column
  // together and part on it, so the fork is the cell where one line becomes two.
  for (let y = 0; y < rows.length; y++) {
    if (!FORKS.includes(rows[y]?.[turn] as string)) {
      continue
    }

    expect(columnsOf(rows[y] as string, [PORT]).length).toBe(1)
  }

  // And no row carries two turns. Two corners on one row is two wires running
  // along each other across the gutter, which is the weave under another name.
  for (const row of rows) {
    const corners = columnsOf(row, CORNERS).filter(x => x >= gutter.start && x < gutter.end)

    expect(corners.length).toBeLessThanOrEqual(1)
  }

  // Every node of the later phase is reached, and reached once.
  for (const node of to?.nodes ?? []) {
    const into = columnsOf(rows[node.y + 1] ?? '', [ARROW_RIGHT]).filter(x => x < node.x)

    expect(into.length).toBe(1)
  }
})

test('down the pane, they turn in one row', () => {
  const { rows, view } = drawn(fannedOut(), 136, 34, 'vertical')
  const [from, to] = view.lanes
  const band = { start: (from?.nodes[0]?.y ?? 0) + (from?.nodes[0]?.h ?? 0), end: to?.nodes[0]?.y ?? 0 }
  const turns = new Set<number>()

  for (let y = band.start; y < band.end; y++) {
    if (columnsOf(rows[y] as string, [DASH_H]).length > 0) {
      turns.add(y)
    }
  }

  // The same rule, rotated: one row the carries turn on, and a drop from it
  // into each target.
  expect(turns.size).toBe(1)

  const turn = [...turns][0] as number

  expect(columnsOf(rows[turn] as string, [CROSS]).length).toBe(0)

  // The same rule about forks, rotated: every one of them stands in a column a
  // card's own point stands in, one row above.
  for (const x of columnsOf(rows[turn] as string, FORKS)) {
    expect(columnsOf(rows[turn - 1] as string, [PORT])).toContain(x)
  }

  // One turn to a column, for the reason the row layout has one to a row: two
  // turns in one column is two wires running down it together.
  for (let x = 0; x < (rows[turn] ?? '').length; x++) {
    const column = rows.slice(band.start, band.end).map(row => row[x] ?? ' ')

    expect(column.filter(ch => CORNERS.includes(ch)).length).toBeLessThanOrEqual(1)
  }

  for (const node of to?.nodes ?? []) {
    const into = columnsOf(rows[node.y - 1] ?? '', [ARROW_DOWN]).filter(
      x => x >= node.x && x < node.x + node.w,
    )

    expect(into.length).toBe(1)
  }
})


test("a band's name stands centred, and the wire gives way for it", () => {
  const { rows, view } = drawn(abreast(), 120, 34, 'vertical')
  const draft = view.lanes.find(l => l.phase === 'Draft')
  const y = draft?.captionRow ?? -1

  expect(y).toBeGreaterThan(0)

  const rule = rows[y] as string
  const crossings = columnsOf(rows[y - 1] as string, [LINE_V, DASH_V])

  expect(crossings.length).toBe(3)

  // The caption is the run of cells around the name that carry no stroke: the
  // name, what trails it, and the blank cleared either side of the lot.
  const at = rule.indexOf('Draft')

  expect(at).toBeGreaterThan(0)

  const strokes = ['\u2501', '\u2500', '\u254d', '\u254c']
  let from = at
  let to = at

  while (from > 0 && !strokes.includes(rule[from - 1] as string)) {
    from--
  }

  while (to < rule.length - 1 && !strokes.includes(rule[to + 1] as string)) {
    to++
  }

  // Equal rule either side of it, which is the one measurement a centred title
  // has. One cell of slack: an odd number of cells cannot be split evenly.
  expect(Math.abs(from - (rule.length - 1 - to))).toBeLessThanOrEqual(1)

  const behind = crossings.filter(x => x >= from && x <= to)

  expect(behind.length).toBe(1)

  // The rule gives way to every wire it does not share with the caption. It
  // gives way by breaking, not by arcing over: an arc is the mark for *two
  // lines, and this is the one in front*, and a rule is a boundary rather than
  // a line anything travels along, so a reader followed the arc looking for a
  // second line and found the edge of a phase.
  for (const x of crossings.filter(column => column < from || column > to)) {
    expect([LINE_V, DASH_V]).toContain(rule[x])
  }

  // Where the caption wants the same cell, the wire is the one that gives way,
  // and it gives way for that one row alone: it is whole above the rule and
  // whole below it, which is what says the two halves are one line.
  //
  // The caption used to give way instead, stepping along the rule until it
  // found a window with no wire in it. Down a pane of centred cards the spine
  // runs down the middle — the caption's own column — so every band stepped
  // aside, each by a different amount, and the names came out on no column at
  // all.
  for (const x of behind) {
    expect([LINE_V, DASH_V]).not.toContain(rule[x])
    expect([LINE_V, DASH_V]).toContain((rows[y - 1] as string)[x])
    expect([LINE_V, DASH_V, PORT, ...CORNERS, ...FORKS, ARROW_DOWN]).toContain((rows[y + 1] as string)[x])
  }
})

test('a wire steps over a wire, and over nothing else', () => {
  const { rows, view } = drawn(retried(), 100, 30, 'horizontal')
  const hops = rows.flatMap((row, y) => columnsOf(row, [HOP]).map(x => ({ x, y })))

  // One wire passes another here, so there is something to measure at all.
  expect(hops.length).toBeGreaterThan(0)

  const WIRES = [LINE_V, DASH_V, CROSS, PORT, ARROW_DOWN, ...CORNERS, ...FORKS]

  for (const { x, y } of hops) {
    // What the arc steps over is a line, above and below it both. An arc says
    // *two lines, and this is the one in front*; drawn where a wire met a
    // phase's own border it said that about a boundary nothing travels along,
    // and a reader followed it looking for a second line to follow.
    expect(WIRES).toContain((rows[y - 1] ?? '')[x] ?? ' ')
    expect(WIRES).toContain((rows[y + 1] ?? '')[x] ?? ' ')

    // Never on one of the lines the drawing itself speaks for.
    expect(view.lanes.map(lane => lane.edgeAt)).not.toContain(x)
  }
})

test('every point a wire leaves a card by is marked', () => {
  const { rows, view } = drawn(fanned(), 120, 34, 'vertical')

  for (const lane of view.lanes) {
    for (const node of lane.nodes) {
      const below = rows[node.y + node.h] ?? ''
      const arm = columnsOf(below, [LINE_V, DASH_V, PORT]).filter(
        x => x >= node.x && x < node.x + node.w,
      )

      // A run that starts in the blank under a card is a line with one end
      // against nothing. The point is what says which card it came out of, so
      // it is marked whether or not the next cell has room for the line itself.
      for (const x of arm) {
        expect([PORT, LINE_V, DASH_V]).toContain(below[x])
      }
    }
  }

  // Every card of the phase that fed the next one has one, and only one.
  const gather = view.lanes[0]
  const ports = (rows[(gather?.nodes[0]?.y ?? 0) + (gather?.nodes[0]?.h ?? 0)] ?? '')

  expect(columnsOf(ports, [PORT]).length).toBeGreaterThan(0)
})


/** Two phases whose agents are named at more than a card's own width. */
function longNamed(): RunState {
  return runOf('haiku', ['Gather', 'Draft'], [
    agentOf('g0', 'gather:the rivers and the reefs and the dunes', 'Gather', 0, 4_000),
    agentOf('g1', 'gather:the deltas and the plains and the ridges', 'Gather', 0, 4_000),
    agentOf('d0', 'draft:the rivers and the reefs and the dunes', 'Draft', 5_000, 4_000),
    agentOf('d1', 'draft:the deltas and the plains and the ridges', 'Draft', 5_000, 4_000),
  ])
}

test('a name too long for its card stops before the point the wire leaves by', () => {
  // The name, not the pane: a card is the same width whatever the pane is, so
  // what cuts a name is the name's own length.
  const { rows, view } = drawn(longNamed(), 96, 16, 'horizontal')
  const from = view.lanes[0]

  expect(from?.nodes.length).toBeGreaterThan(0)

  // A name this long is cut on every card, and the mark that says a name was
  // cut used to be written past the width it was cut to — over the one cell
  // that says which card the wire belongs to.
  for (const node of from?.nodes ?? []) {
    const name = rows[node.y] as string

    // The name is cut, and the mark that says so stands inside the frame.
    expect(name.slice(node.x, node.x + node.w)).toContain('\u2026')
    expect(name[node.x + node.w - 1]).toBe('\u256e')

    // And the cell the wire leaves by, a row under it, is still the point.
    expect((rows[node.y + 1] as string)[node.x + node.w]).toBe(PORT)
  }
})

test('no theme draws its edges in a hue one of its states is drawn in', () => {
  const hue = (color: number) => {
    const [r, g, b] = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map(c => c / 255) as [
      number,
      number,
      number,
    ]
    const top = Math.max(r, g, b)
    const span = top - Math.min(r, g, b)

    if (span === 0) {
      return -1
    }

    const sixth = top === r ? ((g - b) / span) % 6 : top === g ? (b - r) / span + 2 : (r - g) / span + 4

    return (sixth * 60 + 360) % 360
  }
  const turn = (a: number, b: number) => {
    const [x, y] = [hue(a), hue(b)]

    if (x < 0 || y < 0) {
      return 180
    }

    const gap = Math.abs(x - y) % 360

    return gap > 180 ? 360 - gap : gap
  }

  // An edge says two agents are joined. A reader who has to work out whether an
  // orange line means *connected* or means *this one is running* is reading the
  // drawing twice, and the palettes that spend their accent on a warm brand
  // colour put the edges 19 degrees off their own gold and their own red.
  for (const theme of THEMES) {
    const palette = paletteOf(theme)

    for (const role of ['done', 'running', 'failed'] as const) {
      expect(`${theme.name} ${role} ${Math.round(turn(palette.wire, palette[role])) >= 45}`).toBe(
        `${theme.name} ${role} true`,
      )
    }
  }
})

test('every theme draws a card frame a reader can tell from a plain border', () => {
  const apart = (a: number, b: number) =>
    Math.hypot(
      ((a >> 16) & 0xff) - ((b >> 16) & 0xff),
      ((a >> 8) & 0xff) - ((b >> 8) & 0xff),
      (a & 0xff) - (b & 0xff),
    )

  // A frame carries its agent's state, and a tint too close to the tone every
  // other border is drawn in says nothing at all. Forty is about a third of the
  // way across the cube, and the closest any palette comes is sixty.
  for (const theme of THEMES) {
    useTheme(theme.name)

    const plain = quietOf(theme.bg)

    for (const state of ['done', 'running', 'failed', 'stopped'] as const) {
      expect(`${theme.name} ${state} ${Math.round(apart(frameOf(state, theme.bg), plain)) >= 40}`).toBe(
        `${theme.name} ${state} true`,
      )
    }
  }

  useTheme(DEFAULT_THEME)
})

/** Two phases of eight, which is a band wider than most panes are. */
function eightEach(): RunState {
  const names = ['rivers', 'reefs', 'dunes', 'forests', 'ridges', 'marshes', 'deltas', 'plains']

  return runOf('haiku', ['Gather', 'Draft'], [
    ...names.map((name, i) => agentOf(`g${i}`, `gather:${name}`, 'Gather', 0, 4_000)),
    ...names.map((name, i) => agentOf(`d${i}`, `draft:${name}`, 'Draft', 5_000, 4_000)),
  ])
}

test('a band of eight stands on one row, and hands straight on to the band under it', () => {
  // A band used to wrap into as many rows as its nodes needed at a width they
  // could be named at, and only its outer row faced anything outside it: a wire
  // out of the row above would have been drawn down through the cards on the
  // row below, and a line through a card is a line through a word. A band
  // stands whole now and the pane scrolls to what it cannot hold, so every card
  // of it faces the band beyond it and the carries are drawn one to a card.
  const { rows, view } = drawn(eightEach(), 280, 40, 'vertical')
  const gather = view.lanes.find(lane => lane.phase === 'Gather')
  const draft = view.lanes.find(lane => lane.phase === 'Draft')

  expect(gather?.nodes.length).toBe(8)
  expect(draft?.nodes.length).toBe(8)
  expect(new Set((gather?.nodes ?? []).map(node => node.y)).size).toBe(1)
  expect(new Set((draft?.nodes ?? []).map(node => node.y)).size).toBe(1)

  // Left by a point under every card of the band above, entered by an arrowhead
  // over every card of the band below.
  for (const node of gather?.nodes ?? []) {
    const under = columnsOf(rows[node.y + node.h] as string, [PORT])

    expect(under.filter(x => x >= node.x && x < node.x + node.w).length).toBe(1)
  }

  for (const node of draft?.nodes ?? []) {
    const over = columnsOf(rows[node.y - 1] as string, [ARROW_DOWN])

    expect(over.filter(x => x >= node.x && x < node.x + node.w).length).toBe(1)
  }

  // And nothing between them is two wires in one cell.
  const last = Math.max(...(gather?.nodes ?? []).map(node => node.y + node.h))
  const first = Math.min(...(draft?.nodes ?? []).map(node => node.y))

  for (const row of rows.slice(last, first)) {
    expect(columnsOf(row, [CROSS]).length).toBe(0)
  }
})

/** Eight names, which is a band wider than most panes are. */
const EIGHT = ['rivers', 'reefs', 'dunes', 'forests', 'ridges', 'marshes', 'deltas', 'plains']

/** A band of eight taken one at a time, so the band is a chain. */
function walked(): RunState {
  return runOf('audit', ['Gather', 'Report'], [
    ...EIGHT.map((name, i) => agentOf(`g${i}`, `gather:${name}`, 'Gather', i * 1_000, 800)),
    agentOf('p1', 'report:join', 'Report', 9_000, 800),
  ])
}

test('a chain of eight hands on along the one row it stands on', () => {
  // The chain used to wrap, and the turn was the hard part: the fourth agent
  // handed on to the fifth, which stood at the left of the row below, so the
  // line between them ran back across the row it came from and over every card
  // on it. A band stands whole now, so the chain is a chain: seven hops between
  // eight cards, all of them along the one row.
  const { rows, view } = drawn(walked(), 280, 40, 'vertical')
  const gather = view.lanes.find(lane => lane.phase === 'Gather')
  const nodes = gather?.nodes ?? []

  expect(nodes.length).toBe(8)
  expect(new Set(nodes.map(node => node.y)).size).toBe(1)

  const along = rows[nodes[0].y + 1] as string

  expect(columnsOf(along, [ARROW_RIGHT]).length).toBe(7)

  // And the chain ends where the band does: nothing runs out of the last card
  // into the air beside it, or into the first one from it.
  const head = nodes[0]
  const tail = nodes[nodes.length - 1]

  expect(along[head.x - 1]).toBe(' ')
  expect(along[tail.x + tail.w]).toBe(' ')
})

/** What one phase found, long enough for the next prompt to be proved to quote it. */
const FOUND = 'The token refresh path renews the access token and never the refresh one, so a session lapses at an hour.'

/**
 * A run that went back: the gate reported, and the phase that had already run
 * was entered again over what the gate said.
 */
function backwards(): RunState {
  return runOf('audit', ['Fix', 'Gate'], [
    agentOf('f1', 'fix:first', 'Fix', 0, 900),
    { ...agentOf('g1', 'gate:report', 'Gate', 1_000, 900), result: FOUND },
    { ...agentOf('f2', 'fix:second', 'Fix', 3_000, 900), prompt: `Fix what the gate found. ${FOUND}` },
  ])
}

test('a card fed from a band further down is not drawn as a line back up the pane', () => {
  const run = backwards()

  // The run really does carry it: the gate's answer is quoted in the prompt of
  // an agent whose phase stands above the gate's.
  expect(edgesOf(run).some(edge => edge.fromId === 'g1' && edge.toId === 'f2')).toBe(true)

  const { rows, view } = drawn(run, 96, 30, 'vertical')
  const fix = view.lanes.find(lane => lane.phase === 'Fix')
  const node = (fix?.nodes ?? []).find(box => box.agent.agentId === 'f2')

  expect(node).toBeDefined()

  const head = (node?.x ?? 0) + Math.floor((node?.w ?? 0) / 2)

  // Drawn, it is a line from the foot of the drawing to its head, across every
  // band between and every name on them — and what came out was the head alone,
  // a lone arrowhead under a phase rule pointing at nothing, because the run
  // from the source stopped before it started. The loop mark on the card
  // already says the phase was entered again.
  expect(columnsOf(rows[(node?.y ?? 1) - 1] as string, [ARROW_DOWN, LINE_V, DASH_V])).not.toContain(head)
})

/** A band of eight whose work fed a band of two. */
function frontFed(): RunState {
  return runOf('haiku', ['Gather', 'Draft'], [
    ...EIGHT.map((name, i) => agentOf(`g${i}`, `gather:${name}`, 'Gather', 0, 4_000)),
    agentOf('d0', 'draft:rivers', 'Draft', 5_000, 4_000),
    agentOf('d1', 'draft:reefs', 'Draft', 5_000, 4_000),
  ])
}

test('a band of eight into a band of two converges without a crossing', () => {
  const { rows, view } = drawn(frontFed(), 280, 40, 'vertical')
  const gather = view.lanes.find(lane => lane.phase === 'Gather')
  const draft = view.lanes.find(lane => lane.phase === 'Draft')
  const nodes = gather?.nodes ?? []

  expect(nodes.length).toBe(8)
  expect(draft?.nodes.length).toBe(2)

  // Every card of the wider band is left by a point of its own, and the points
  // stand under the cards they belong to rather than wherever the bundle went.
  const below = rows[nodes[0].y + nodes[0].h] as string
  const marks = columnsOf(below, [PORT])

  expect(marks.length).toBe(8)

  for (const x of marks) {
    expect(nodes.some(node => x >= node.x && x < node.x + node.w)).toBe(true)
  }

  // And each of the two is entered once. Eight lines into two cards is a funnel
  // and the funnel's own row joins them; what a reader has to be able to do is
  // count the ends, and an end drawn twice is a card that was fed twice.
  for (const node of draft?.nodes ?? []) {
    const over = columnsOf(rows[node.y - 1] as string, [ARROW_DOWN])

    expect(over.filter(x => x >= node.x && x < node.x + node.w).length).toBe(1)
  }
})

/**
 * A lane of rows standing a row apart, with the work at its head entered twice.
 *
 * `spare` leaves out the row that stands in the gap, which is the same run with
 * nothing in the way of the hop.
 */
function paced(spare: boolean): RunState {
  return runOf('audit', ['Plan', 'Develop'], [
    agentOf('p1', 'plan:order', 'Plan', 0, 900),
    agentOf('d1', 'develop:patch', 'Develop', 1_000, 900),
    ...(spare ? [] : [agentOf('d2', 'develop:notes', 'Develop', 2_000, 900)]),
    agentOf('d3', 'develop:patch', 'Develop', 3_000, 900),
    agentOf('d4', 'develop:ship', 'Develop', 4_000, 900),
  ])
}

/** Where a hop between two rows of one lane would be drawn, and what is there. */
function hopOf(spare: boolean) {
  const { rows, view } = drawn(paced(spare), 90, 18, 'horizontal')
  const develop = view.lanes.find(lane => lane.phase === 'Develop')
  const from = (develop?.nodes ?? [])[0]
  const to = (develop?.nodes ?? [])[(develop?.nodes ?? []).length - 1]
  const at = from.x + Math.floor(from.w / 2)

  return {
    port: (rows[from.y + from.h] as string)[at],
    head: (rows[to.y - 1] as string)[at],
  }
}

test('a hop to the next pass gives way to a node standing in the gap', () => {
  // Nothing in the way: the work handed on to the row under it, and the hop is
  // the whole of the gap between two neighbours — a point against the one card
  // and an arrowhead against the other.
  expect(hopOf(true)).toEqual({ port: PORT, head: ARROW_DOWN })

  // With a third row of the lane standing in those columns, the line would be
  // drawn through it, under its name: the names are written after the wires, so
  // the cell came back a letter with the point or the arrowhead lost beneath
  // it. The stack already says which pass went first.
  expect(hopOf(false)).toEqual({ port: ' ', head: ' ' })
})

/**
 * Two phases dispatched in one batch: the second opens while the first is still
 * going, so neither of them waited for the other.
 */
function alongside(): RunState {
  return runOf('gates', ['Commit', 'Review', 'Scan'], [
    agentOf('c1', 'commit:tests', 'Commit', 0, 4_000),
    agentOf('r1', 'review:panel', 'Review', 5_000, 9_000),
    agentOf('s1', 'scan:security', 'Scan', 5_200, 4_000),
  ])
}

test('two phases that overlapped are marked as running alongside, not joined', () => {
  useTheme('tokyo-night')

  const canvas = new Canvas(150, 20)

  paint(canvas, alongside(), {
    nowMs: STARTED + 20_000,
    tick: -1,
    orientation: 'horizontal',
    detailRows: 14,
  })

  const rows = rowsOf(canvas)
  const marked = rows.filter(row => row.includes('═'))

  // One mark, in one gutter: the one between the two phases whose clocks
  // overlap. The gutter before them holds a wire instead, because `Commit`
  // really did land before either of them started.
  expect(marked).toHaveLength(1)

  const row = marked[0] as string
  const at = row.indexOf('═')
  const arrows = columnsOf(row, [ARROW_RIGHT])

  expect(arrows.length).toBeGreaterThan(0)
  expect(arrows.every(x => x < at)).toBe(true)
  // Laid along the run rather than across it, which is what tells it from a
  // barrier's spine at a glance.
  expect(rows.join('\n')).not.toContain('║')
})

test('the same two phases are marked down the pane, in the other stroke', () => {
  useTheme('tokyo-night')

  const canvas = new Canvas(110, 40)

  paint(canvas, alongside(), {
    nowMs: STARTED + 20_000,
    tick: -1,
    orientation: 'vertical',
    detailRows: 14,
  })

  const rows = rowsOf(canvas)

  expect(rows.filter(row => row.includes('║'))).toHaveLength(1)
  expect(rows.join('\n')).not.toContain('═')

  // The mark stands in the gutter the barrier would have crossed, which is the
  // gutter the wire out of `Commit` does not reach.
  const marked = rows.findIndex(row => row.includes('║'))
  const last = rows.map(row => row.includes(ARROW_DOWN)).lastIndexOf(true)

  expect(last).toBeLessThan(marked)
})

/** The mark laid along the run where two phases overlapped: across, and down. */
const ALONGSIDE_H = 0x2550
const ALONGSIDE_V = 0x2551
const STROKE_H = 0x2500
const STROKE_V = 0x2502
const GREY = 0xffffff

test('a wire drawn through the mark that says two phases overlapped leaves it standing', () => {
  const c = new Canvas(6, 3)

  // The mark stands in the gutter, which is where the wires run: a carry from
  // the band above passing that column asks for this very cell. Drawn over, the
  // concurrency statement is off the pane and the wire is a cell of line that
  // is drawn again a cell along.
  c.put(3, 1, ALONGSIDE_H, GREY)
  line(c, 3, 1, STROKE_V, GREY)

  expect(c.at(3, 1)).toBe(ALONGSIDE_H)
})

test('the same holds down the pane, where the mark is the upright stroke', () => {
  const c = new Canvas(6, 3)

  c.put(3, 1, ALONGSIDE_V, GREY)
  line(c, 3, 1, STROKE_H, GREY)

  expect(c.at(3, 1)).toBe(ALONGSIDE_V)
})

test('a hop steps over another wire, never over the mark that two phases overlapped', () => {
  const c = new Canvas(6, 3)

  // A hop arc here would read as two wires crossing and would take the
  // statement with it: the arc says go and find the second line, and there is
  // no second line, only the fact that neither phase waited.
  c.put(3, 1, ALONGSIDE_H, GREY)
  cross(c, 3, 1, STROKE_V, GREY)

  expect(c.at(3, 1)).toBe(ALONGSIDE_H)
})

test('a hop down the pane leaves the upright mark standing too', () => {
  const c = new Canvas(6, 3)

  c.put(3, 1, ALONGSIDE_V, GREY)
  cross(c, 3, 1, STROKE_H, GREY)

  expect(c.at(3, 1)).toBe(ALONGSIDE_V)
})

/**
 * Where the mark between two overlapping phases should stand: halfway down what
 * the two of them occupy between them, in the gutter the later one is fed at.
 */
function midOf(
  view: ReturnType<typeof layout>,
  earlier: string,
  later: string,
  orientation: 'horizontal' | 'vertical',
) {
  const left = view.lanes.find(lane => lane.phase === earlier)
  const right = view.lanes.find(lane => lane.phase === later)
  const along = (p: { x: number; y: number }) => (orientation === 'horizontal' ? p.y : p.x)
  const ports = [
    ...(left?.nodes ?? []).map(n => along(exitOf(n, orientation))),
    ...(right?.nodes ?? []).map(n => along(entryOf(n, orientation))),
  ]

  return {
    at: Math.round((Math.min(...ports) + Math.max(...ports)) / 2),
    busAt: right?.busAt ?? -1,
  }
}

test('the mark stands against the cards it is about, halfway between their ports', () => {
  useTheme('tokyo-night')

  const { rows, view } = drawn(alongside(), 150, 20, 'horizontal')
  const { at, busAt } = midOf(view, 'Review', 'Scan', 'horizontal')

  // Both the row and the column: a mark in the right gutter but at the top of
  // it, with the cards it is about at the bottom, reads as a mark about
  // something else. The column alone was all the drawing was held to.
  expect(rows[at]?.[busAt]).toBe('═')
  expect(rows.filter(row => row.includes('═'))).toHaveLength(1)
})

test('down the pane the mark stands halfway along them, not at the gutter’s end', () => {
  useTheme('tokyo-night')

  const { rows, view } = drawn(alongside(), 110, 40, 'vertical')
  const { at, busAt } = midOf(view, 'Review', 'Scan', 'vertical')

  expect(rows[busAt]?.[at]).toBe('║')
  expect(rows.filter(row => row.includes('║'))).toHaveLength(1)
})

test('a phase that has run beside one that has not is marked with nothing at all', () => {
  useTheme('tokyo-night')

  // `Review` was declared and never entered, so it has no agents and no ports.
  // Nothing of it overlapped anything, and the halfway point between no ports
  // and some is not a cell: the span comes back empty and the midpoint is not a
  // number, which is a mark drawn at an address the pane cannot answer for.
  const run = runOf('gates', ['Commit', 'Review', 'Scan'], [
    agentOf('c1', 'commit:tests', 'Commit', 0, 4_000),
    agentOf('s1', 'scan:security', 'Scan', 5_200, 4_000),
  ])

  const { rows } = drawn(run, 150, 20, 'horizontal')

  expect(rows.join('\n')).not.toContain('═')
  expect(rows.join('\n')).not.toContain('║')
  // And the run is still drawn: a guard that returned early out of the whole
  // gutter would take the phase after it with it.
  expect(rows.join('\n')).toContain('security')
})

/** A band of two on a pane too narrow to hold one of its cards whole. */
function offPane(): RunState {
  return runOf('audit', ['Survey', 'Review'], [
    agentOf('s1', 'survey:paint', 'Survey', 0, 4_000),
    agentOf('s2', 'survey:layout', 'Survey', 0, 4_000),
    agentOf('r1', 'review:paint', 'Review', 5_000, 4_000),
  ])
}

test('a barrier on a pane narrower than one card reaches the card it feeds, and runs off the edge to the one it cannot show', () => {
  // The pane this is about used to be a flat list: a band that could not stand
  // one card as a card was drawn as rows instead, and no barrier was drawn at
  // all. A card is the same width at every size of pane now, so the band runs
  // past the edge and the barrier under it runs past the edge with it — which
  // is the one wire in the drawing with an end the pane cannot show.
  const { rows, view } = drawn(offPane(), 26, 30, 'vertical')
  const gather = view.lanes[0]
  const next = view.lanes[1]

  expect(gather.nodes[0].w).toBeGreaterThan(26)
  expect(gather.nodes.length).toBe(2)

  const port = exitOf(gather.nodes[0], 'vertical')
  const entry = entryOf(next.nodes[0], 'vertical')
  const spine = rows[next.busAt] as string

  // The point the wire leaves the card it can show is marked, as it is at
  // every other size of pane.
  expect((rows[port.y] as string)[port.x]).toBe(PORT)

  // The card taps the spine at a fork, not at a crossing: the barrier goes on
  // past it to the card off the edge, which is one line becoming two.
  expect(FORKS).toContain(spine[port.x])
  expect(spine[port.x]).not.toBe(CROSS)

  // And it goes on to the last cell the pane has, rather than stopping in the
  // blank halfway: an arm that ended mid-body would say the barrier ended
  // there, when what it reaches is a card the reader scrolls sideways to.
  for (let x = port.x + 1; x < 25; x++) {
    expect(spine[x]).toBe('─')
  }

  // The arm down out of the spine ends in an arrowhead against the card below.
  expect((rows[next.nodes[0].y - 1] as string)[entry.x]).toBe(ARROW_DOWN)
})
