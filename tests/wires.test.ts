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

import { Canvas } from '../hooks/canvas'
import type { AgentRow, RunState } from '../hooks/journal'
import { layout } from '../hooks/layout'
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
/** Where the rule a band is named on gives way to a wire crossing it. */
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

function drawn(run: RunState, columns: number, rows: number, orientation: 'flow' | 'stack') {
  const canvas = new Canvas(columns, rows)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation })

  return { canvas, rows: rowsOf(canvas), view: layout(run, columns, rows, orientation, 0) }
}

test('a phase its agents ran one at a time is entered at its head', () => {
  const { rows, view } = drawn(chained(), 96, 34, 'stack')
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
  const { rows, view } = drawn(chained(), 96, 34, 'stack')
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

test('a phase its agents ran at once is fed into every one of them', () => {
  const { rows, view } = drawn(fanned(), 96, 34, 'stack')
  const review = view.lanes.find(l => l.phase === 'Review')
  const cardY = review?.nodes[0]?.y ?? 0

  // Whatever the phase above produced was there for all three at once, and the
  // drawing says so with an arrow into each.
  expect(columnsOf(rows[cardY - 1] ?? '', [ARROW_DOWN]).length).toBe(3)
  expect(columnsOf(rows[cardY + 1] ?? '', [ARROW_RIGHT]).length).toBe(0)
})

test('the carries that change row all turn in one column', () => {
  const { rows, view } = drawn(fannedOut(), 120, 34, 'flow')
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
  const { rows, view } = drawn(fannedOut(), 120, 34, 'stack')
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


test("a band's name stands clear of the wires crossing its rule", () => {
  const { rows, view } = drawn(abreast(), 120, 34, 'stack')
  const draft = view.lanes.find(l => l.phase === 'Draft')
  const y = draft?.captionRow ?? -1

  expect(y).toBeGreaterThan(0)

  const rule = rows[y] as string
  const crossings = columnsOf(rows[y - 1] as string, [LINE_V, DASH_V])

  expect(crossings.length).toBe(3)

  // The rule gives way to each of them with an arc, and the name gives way to
  // the arcs. Set into the middle of the rule the name cleared the middle one,
  // and the wire above the rule and the wire below it stopped dead against a
  // word with nothing to say they were one line.
  for (const x of crossings) {
    expect(rule[x]).toBe(HOP)
  }

  // The name is still on the rule, whole, and still as near the middle as the
  // wires leave room for.
  const at = rule.indexOf('Draft')

  expect(at).toBeGreaterThan(0)
  expect(Math.abs(at - Math.floor((120 - 'Draft 3/3'.length) / 2))).toBeLessThanOrEqual(10)
})

test('a name too long for its card stops before the point the wire leaves by', () => {
  const { rows, view } = drawn(fannedOut(), 26, 12, 'flow')
  const from = view.lanes[0]

  expect(from?.nodes.length).toBeGreaterThan(0)

  // A row this narrow cuts every name, and the mark that says a name was cut
  // used to be written past the width it was cut to — over the one cell that
  // says which card the wire belongs to.
  for (const node of from?.nodes ?? []) {
    const row = rows[node.y] as string

    expect(row[node.x + node.w]).toBe(PORT)
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
