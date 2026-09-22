/**
 * The geometry every layout owes a reader: sections of one size, with their
 * nodes in the middle of them.
 *
 * A band used to take the height its own cards needed, so a phase of five
 * agents and a phase of one were the same three rows deep and the leftover
 * pooled under the last band. The wires leaving a band's cards then crossed the
 * rule opening the band below in the row they left in.
 *
 * Also checks what the pane does when it cannot afford a section each: the
 * phases nothing has entered give theirs up, and are named rather than dropped.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import type { AgentRow, RunState } from '../hooks/journal'
import { CARD_H, extentOf, layout, resolveOrientation, scrolled } from '../hooks/layout'
import { paint } from '../hooks/paint'

const STARTED = 1_700_000_000_000
/** The gutter between two columns, which is the widest a cut edge may leave. */
const GUTTER_MAX = 7

function agentsOf(phase: string, names: string[]): AgentRow[] {
  return names.map((name, i) => ({
    agentId: `${phase}-${i}`,
    label: `${phase.toLowerCase()}:${name}`,
    phase,
    state: 'done' as const,
    startedMs: STARTED,
    endedMs: STARTED + 5_000,
    tools: [],
  }))
}

function runOf(lanes: [string, string[]][]): RunState {
  return {
    runId: 'wf_test',
    name: 'audit',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_test',
    runFile: '/session/workflows/wf_test.json',
    startedMs: STARTED,
    status: 'running',
    phases: lanes.map(([phase]) => phase),
    agents: lanes.flatMap(([phase, names]) => agentsOf(phase, names)),
    consumed: 0,
  }
}

const RUN = runOf([
  ['Survey', ['paint', 'layout', 'journal', 'README', 'plugin']],
  ['Review', ['paint', 'layout', 'journal', 'plugin']],
  ['Check', ['README']],
])

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

test('every band is the same depth, whatever ran in it', () => {
  const view = layout(RUN, 110, 34, 'vertical')

  expect(view.orientation).toBe('vertical')

  const rules = view.lanes.map(lane => lane.captionRow ?? -1)
  const bands = rules.slice(1).map((row, i) => row - rules[i])

  expect(bands.every(band => band === bands[0])).toBe(true)
  expect(bands[0]).toBeGreaterThanOrEqual(CARD_H + 3)
})

test('a band keeps its cards clear of the rule above and the rule below', () => {
  const view = layout(RUN, 110, 34, 'vertical')

  for (const lane of view.lanes) {
    const rule = lane.captionRow ?? 0
    const card = lane.nodes[0]

    // The rows the wires into the band need: one to gather on, one for the
    // arrowheads. Without them a wire is drawn along the rule rather than
    // across it.
    expect(card.y - rule).toBeGreaterThanOrEqual(3)
    expect(lane.nodes.every(n => n.y === card.y)).toBe(true)
  }
})

test('a band stands its node in the middle, with room either side of it', () => {
  const view = layout(RUN, 110, 34, 'vertical')

  expect(view.orientation).toBe('vertical')
  expect(view.density).toBe('card')

  const rules = view.lanes.map(lane => lane.captionRow ?? 0)

  for (const [place, lane] of view.lanes.entries()) {
    const card = lane.nodes[0]!
    const rule = rules[place]!
    // The band runs to the rule opening the band below it, and the last band to
    // the foot of the drawing — one band deeper than the last rule.
    const next = rules[place + 1] ?? rule + (rules[1]! - rules[0]!)
    const above = card.y - rule - 1
    const below = next - (card.y + card.h)

    // Three rows above — one the wires arriving gather on, one the arrowheads
    // land on, and between them the row a card fed from further back writes
    // that phase's name on — and two below: the row a card's own exit points
    // stand on, and one of air. A band that stopped at its card put all of its
    // room above, which stood every node in the drawing hard against the line
    // under it and left the exit point to land on that line, where the caption
    // clears its own cells and rubs the point out.
    expect(above).toBeGreaterThanOrEqual(3)
    expect(below).toBeGreaterThanOrEqual(2)
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1)
  }
})

test('a band keeps the row its cards name what fed them on clear of the arrowheads', () => {
  // The row against a card is the one the arrowheads land on, and an arrowhead
  // stands in the middle of it — so a label written there had half a card's
  // width, gave up its word for its name, and on a narrow pane said nothing at
  // all. The band keeps the row above that one for it, the bundle every wire
  // turns on stays above them both, and the wire running between gives way for
  // the label the way it gives way for a band's own caption.
  const view = layout(RUN, 110, 34, 'vertical')

  for (const lane of view.lanes) {
    const card = lane.nodes[0]!

    // The bundle is clear of the label's row and of the arrowheads' row under it.
    expect(lane.busAt).toBeLessThanOrEqual(card.y - 3)
    // And the band's own rule is clear of the bundle.
    expect(lane.captionRow ?? 0).toBeLessThan(lane.busAt)
  }
})

test('across, every column is the same size and the nodes centre in the body', () => {
  const view = layout(RUN, 150, 32, 'horizontal')

  expect(view.orientation).toBe('horizontal')
  expect(new Set(view.lanes.map(l => l.w)).size).toBe(1)
  expect(new Set(view.lanes.map(l => l.h)).size).toBe(1)

  // Each lane's own block centres on the tallest lane's, so a fan-out reads as
  // a fan rather than as a column of nodes with a ragged edge.
  const middles = view.lanes.map(lane => {
    const top = Math.min(...lane.nodes.map(n => n.y))
    const bottom = Math.max(...lane.nodes.map(n => n.y + n.h))

    return top + (bottom - top) / 2
  })

  expect(Math.max(...middles) - Math.min(...middles)).toBeLessThanOrEqual(1)
})

test('a phase the pane cannot fit is named, not dropped in silence', () => {
  const run = runOf([
    ['Survey', ['paint', 'layout', 'journal', 'README', 'plugin']],
    ['Review', ['paint', 'layout', 'journal', 'plugin']],
    ['Check', ['README']],
    ['Verify', []],
    ['Escalate', []],
    ['Report', []],
  ])

  const view = layout(run, 110, 34, 'vertical')

  expect(view.lanes.map(l => l.phase)).toEqual(['Survey', 'Review', 'Check'])
  expect(view.pending).toEqual(['Verify', 'Escalate', 'Report'])

  // And a pane with room to spare names them all the same. A section is a rule
  // and the nodes under it; a phase with no agents has no nodes, so a section
  // of its own is a rule with blank rows under it — three of those down a tall
  // pane read as three bands that failed to draw rather than as the rest of the
  // run. One list of them says it once.
  const roomy = layout(run, 110, 60, 'vertical')

  expect(roomy.pending).toEqual(['Verify', 'Escalate', 'Report'])
  expect(roomy.lanes.map(l => l.phase)).toEqual(['Survey', 'Review', 'Check'])
})

test('a phase the run passed over keeps its section, and draws the same row in it', () => {
  const run: RunState = {
    ...runOf([
      ['Survey', ['paint', 'layout']],
      ['Review', ['paint']],
      ['Escalate', []],
      ['Report', ['final']],
    ]),
    plan: [
      { title: 'Escalate', detail: 'only what survived as blocking', model: 'opus' },
      { title: 'Report', detail: 'one agent joins the verdicts', model: 'opus' },
    ],
  }

  // Later phases ran, so this one cannot go to the foot: named down there it
  // would stand after work it came before.
  const view = layout(run, 96, 40, 'vertical')

  expect(view.pending).toEqual([])
  expect(view.lanes.map(l => l.phase)).toEqual(['Survey', 'Review', 'Escalate', 'Report'])

  const ghost = view.lanes.find(l => l.phase === 'Escalate')?.ghost

  // One row, not a card. A card carries four facts and a phase that never ran
  // has three, so its fourth side went round blank cells — and the strip and
  // the foot band were drawing rows for the same thing at the same time.
  expect(ghost?.h).toBe(1)

  const canvas = new Canvas(96, 40)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'vertical' })

  const lines = rowsOf(canvas)
  const at = lines.findIndex(line => line.includes('\u258c') && line.includes('Escalate'))

  expect(at).toBeGreaterThan(0)
  expect(lines[at]).toContain('only what survived as blocking')
  expect(lines[at]).toContain('Opus')
  expect(lines.every(line => !line.includes('\u256d\u254c'))).toBe(true)

  // Centred in the band it owns, the way the band centres what it holds.
  const rule = lines.findIndex(line => line.includes('Escalate '))
  const next = lines.findIndex((line, y) => y > at && /Report/.test(line))

  expect(at - rule).toBeGreaterThan(1)
  expect(Math.abs((at - rule - 1) - (next - at - 1))).toBeLessThanOrEqual(1)
})

test('the phases it could not fit open a band of their own at the foot', () => {
  const run = runOf([
    ['Survey', ['paint', 'layout', 'journal', 'README', 'plugin']],
    ['Review', ['paint', 'layout', 'journal', 'plugin']],
    ['Check', ['README']],
    ['Verify', []],
    ['Escalate', []],
    ['Report', []],
  ])
  const canvas = new Canvas(110, 34)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'vertical' })

  const lines = rowsOf(canvas)
  const at = lines.findIndex(line => /^\u254c+ Ahead \u254c+$/.test(line.trimEnd()))

  // The same device every band it did draw opens with — the name set into its
  // own rule — dashed rather than drawn, because nothing has run in it yet.
  expect(at).toBeGreaterThan(0)

  expect(lines.join('\n')).not.toContain('\u22ef')

  // A row each, in the order they will run, and each one the same one-row node
  // the pane draws an agent with: the state rule down its left edge, the mark
  // column after it, the name where a name goes. A run of names with arrows
  // between them was the one thing on the pane that was not a node, so the
  // phases that never ran were the only part of the drawing a reader had to
  // learn a second shape for.
  const rows = ['Verify', 'Escalate', 'Report'].map((phase, i) => {
    const row = lines[at + 1 + i] ?? ''

    expect(row).toContain(phase)

    return row
  })

  for (const row of rows) {
    expect(row.trimStart().startsWith('\u258c')).toBe(true)
  }

  // Still one band for all of them, not a band each.
  expect(lines.filter(line => /^\u254c+ Ahead \u254c+$/.test(line.trimEnd())).length).toBe(1)

  // Nothing under it but blank rows: the band is the drawing's last section.
  expect(at + 1).toBeLessThan(lines.length - 1)
  expect(lines.slice(at + 4).every(line => line.trim() === '')).toBe(true)

  // And centred in what the drawing left, not held against either end of it.
  // Against the pane's own bottom edge the band read as the seat's furniture;
  // against the last node the same blank rows simply moved underneath it.
  const above = at - 1 - lines.findLastIndex((line, y) => y < at && line.trim() !== '')
  const below = lines.length - (at + 4)

  expect(above).toBeGreaterThan(0)
  expect(Math.abs(above - below)).toBeLessThanOrEqual(2)
})

test('a pane with no rows to spare names them in one rule instead', () => {
  const run = runOf([
    ['Survey', ['paint', 'layout']],
    ['Verify', []],
    ['Escalate', []],
  ])
  const canvas = new Canvas(90, 10)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'vertical' })

  const lines = rowsOf(canvas)
  const row = lines.find(line => /^\u254c+ .+ \u254c+$/.test(line)) ?? ''

  // The band costs two rows, and a short pane has not got two to give. The
  // names go into the rule rather than off the pane, and the caption — the one
  // part of it a reader can do without — gives them the room.
  expect(row).toContain('Verify \u25b8 Escalate')
  expect(lines.every(line => !line.includes('Ahead'))).toBe(true)

  // The agents keep their rows through all of it: what the run has done is
  // never given up to say what it has not.
  expect(lines.join('\n')).toContain('paint')
  expect(lines.join('\n')).toContain('layout')
})

test('down a timeline the phases still ahead take one band, not an empty band each', () => {
  const run = runOf([
    ['Survey', ['paint', 'layout']],
    ['Verify', []],
    ['Escalate', []],
    ['Report', []],
  ])
  const canvas = new Canvas(96, 24)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'timeline' })

  const lines = rowsOf(canvas)

  // One section carrying all three, and no band of its own for any of them: a
  // rule with an empty row under it reads as a band that failed to draw.
  const named = lines.filter(line => /Verify|Escalate|Report/.test(line))

  expect(named.length).toBe(3)

  // The same device the other layouts use, drawn the same way: one caption set
  // into a dashed rule, and a node row for each phase under it.
  const at = lines.indexOf(named[0] as string)

  expect(lines[at - 1]?.trimEnd()).toMatch(/^\u254c+ Ahead \u254c+$/)
  expect(lines.filter(line => /^\u254c+ Ahead \u254c+$/.test(line.trimEnd())).length).toBe(1)
  expect(lines.slice(at, at + 3)).toEqual(named)

  // The rows it takes come off the bars, not out from under them: no bar is
  // drawn on a row the band owns.
  expect(lines.slice(at - 1).every(line => !/[\u2588\u2592]/.test(line))).toBe(true)

  // And what happened to each agent is a word in its own column, not a weight
  // of block a reader has to compare against the row above.
  expect(lines.join('\n')).toMatch(/done\s+\d/)
})

test('across, a phase stands in the middle of the section it owns', () => {
  const view = layout(RUN, 150, 32, 'horizontal')
  const edges = view.lanes.map(lane => lane.edgeAt)

  expect(view.orientation).toBe('horizontal')
  expect(edges[0]).toBe(-1)

  view.lanes.forEach((lane, i) => {
    // The pane's own edges close the first and last sections; every other one
    // is closed by the boundary the layout drew.
    const opens = i === 0 ? -1 : edges[i]
    const shuts = i === view.lanes.length - 1 ? 150 : edges[i + 1]
    const left = lane.x - opens - 1
    const right = shuts - (lane.x + lane.w)

    // A name is centred over its cards, so cards centred in their section put
    // the name in the middle of the section too.
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)

    if (i === 0) {
      return
    }

    // The boundary stands clear of the cards either side of it and of the
    // barrier's spine, which is drawn between it and the cards it feeds.
    const before = view.lanes[i - 1]

    expect(lane.edgeAt).toBeGreaterThan(before.x + before.w - 1)
    expect(lane.edgeAt).toBeLessThan(lane.busAt)
    expect(lane.busAt).toBeLessThan(lane.x - 1)
  })
})

test('across, a run of more phases than the pane can name draws fewer of them, wider', () => {
  const run = runOf(
    Array.from({ length: 17 }, (_, i) => [`Phase ${i + 1}`, ['work']] as [string, string[]]),
  )
  const view = layout(run, 110, 30, 'horizontal')

  expect(view.lanes.length).toBe(17)
  expect(view.density).toBe('card')

  // Divided seventeen ways a column was twelve cells, eight of which a card
  // spends on its own frame and mark — so every card on the pane read `Pha…`,
  // and the drawing overran the pane at that width anyway. The columns that
  // are drawn now carry a name; the body scrolls to the rest.
  for (const lane of view.lanes) {
    expect(lane.w).toBeGreaterThanOrEqual(20)
  }

  expect(extentOf(view).w).toBeGreaterThan(110)

  // Cut between two columns rather than through one: a fifth column showing
  // three cells of its frame at the edge is a card a reader can neither read
  // nor tell is there.
  const whole = view.lanes.filter(lane => lane.x >= 0 && lane.x + lane.w <= 110)

  expect(whole.length).toBeGreaterThanOrEqual(3)
  expect(110 - (whole[whole.length - 1].x + whole[whole.length - 1].w)).toBeLessThan(GUTTER_MAX)
})

test('across, a wider pane names more phases rather than fatter ones', () => {
  const run = runOf(
    Array.from({ length: 17 }, (_, i) => [`Phase ${i + 1}`, ['work']] as [string, string[]]),
  )
  const shown = (columns: number) =>
    layout(run, columns, 30, 'horizontal').lanes.filter(lane => lane.x + lane.w <= columns).length

  // The width a column is given stops at what its card can carry, so the room
  // a wider pane brings goes into columns rather than into stroke.
  expect(shown(160)).toBeGreaterThan(shown(110))
  expect(shown(200)).toBeGreaterThan(shown(160))
})

test('a phase whose slice is already legible keeps every phase on the pane', () => {
  const run = runOf([
    ['Survey', ['paint', 'layout', 'journal', 'README', 'plugin']],
    ['Review', ['paint', 'layout', 'journal', 'plugin']],
    ['Check', ['README']],
  ])
  const view = layout(run, 110, 34, 'horizontal')

  // Nineteen cells is a card with eleven of name, which is every label here.
  // Widening it to twenty would have spent a scroll to buy cells nobody asked
  // for, so the pane gives up dividing well below the width it widens to.
  expect(view.lanes.length).toBe(3)
  expect(extentOf(view).w).toBeLessThanOrEqual(110)
})

test('down, a band of more agents than the pane can name wraps into rows of them', () => {
  const eight = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']
  const run = runOf([
    ['Survey', eight],
    ['Review', ['paint', 'layout']],
    ['Check', ['README']],
  ])
  const view = layout(run, 110, 34, 'vertical')

  expect(view.density).toBe('card')

  const nodes = view.lanes.flatMap(lane => lane.nodes)

  for (const node of nodes) {
    expect(node.w).toBeGreaterThanOrEqual(20)
  }

  // The band takes a second row rather than eight slivers on one, and the
  // drawing stays inside the pane it was handed. Eight cards across a hundred
  // and ten columns was thirteen cells each, four of them name, and the tail of
  // the band was off the pane behind a sideways scroll nobody went looking for.
  const survey = view.lanes[0]

  expect(survey.rows).toBe(2)
  expect(new Set(survey.nodes.map(node => node.row)).size).toBe(2)
  expect(extentOf(view).w).toBeLessThanOrEqual(110)

  // A band's nodes stand in the middle of the pane, whether the band wrapped or
  // holds one node. Opened at the left instead, a band of one sat under the
  // first card of the band above it and the drawing read as a left margin with
  // a ragged edge down the rest of the pane.
  for (const lane of view.lanes) {
    const first = lane.nodes[0]
    const last = lane.nodes[lane.nodes.length - 1]
    const right = 110 - (last.x + last.w)

    expect(Math.abs(first.x - right)).toBeLessThanOrEqual(1)
  }
})

test('across, the phases still ahead take a strip at the end, not a row under it', () => {
  const run = runOf([
    ['Survey', ['paint', 'layout', 'journal', 'README', 'plugin']],
    ['Review', ['paint', 'layout', 'journal', 'plugin']],
    ['Check', ['README']],
    ['Verify', []],
    ['Escalate', []],
    ['Report', []],
  ])

  const view = layout(run, 150, 32, 'horizontal')
  const last = view.lanes[view.lanes.length - 1]

  expect(view.pending).toEqual(['Verify', 'Escalate', 'Report'])
  expect(view.ahead?.x).toBeGreaterThanOrEqual(last.x + last.w)

  // The drawing keeps the row the rule under it used to take: a run with three
  // phases ahead of it is as deep as the same run with none declared.
  expect(view.lanes[0].h).toBe(layout(RUN, 150, 32, 'horizontal').lanes[0].h)

  const canvas = new Canvas(150, 32)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'horizontal' })

  const lines: string[] = []

  for (let y = 0; y < canvas.rows; y++) {
    let line = ''

    for (let x = 0; x < canvas.columns; x++) {
      line += String.fromCodePoint(canvas.at(x, y) || 0x20)
    }

    lines.push(line)
  }

  const strip = lines.map(line => line.slice(view.ahead?.x ?? 0)).join('\n')

  expect(strip).toContain('Ahead')
  expect(strip).toContain('Verify')
  expect(strip).toContain('Escalate')
  expect(strip).toContain('Report')
  // And nothing is left under the drawing to say it.
  expect(lines[lines.length - 1]).not.toContain('Verify')

  // The list sits in the middle of the strip, not at the head of it. Held under
  // the boundary the caption sits on, three names stood at the top of a column
  // as deep as the drawing beside them, which read as a section that had run
  // out rather than one holding the phases still to come.
  const column = lines.map(line => line.slice(view.ahead?.x ?? 0))
  const head = column.findIndex(row => row.includes('Verify'))
  const tail = column.findLastIndex(row => row.includes('Report'))
  const foot = Math.max(...view.lanes.map(l => Math.max(l.y + l.h, ...l.nodes.map(n => n.y + n.h))))
  const above = head - (view.headerRows + 1)
  const below = foot - tail - 1

  expect(above).toBeGreaterThan(0)
  expect(Math.abs(above - below)).toBeLessThanOrEqual(1)
})

test('down the pane, a run too tall for cards keeps its cards and scrolls to the rest', () => {
  const run = runOf([
    ['Gather', ['rivers', 'mountains', 'deserts', 'reefs', 'forests']],
    ['Draft', ['rivers', 'mountains', 'deserts', 'reefs', 'forests']],
    ['Critique', ['rivers', 'mountains', 'deserts', 'reefs', 'forests']],
    ['Revise', ['rivers', 'mountains', 'deserts', 'reefs', 'forests']],
    ['Measure', ['rivers', 'mountains', 'deserts', 'reefs', 'forests']],
    ['Assemble', ['joined']],
  ])

  const view = layout(run, 110, 34, 'vertical')
  const reach = extentOf(view)

  // Six bands divided into a body of twenty-eight used to leave four rows each,
  // which cannot hold a card — so every node in the drawing became a row, and
  // the same run laid out across kept its cards and scrolled sideways to the
  // rest. One run on one seat was a graph under one setting and a table under
  // the other.
  //
  // The height keeps the bargain the width keeps: the bands take the depth
  // their cards need, the drawing runs past the foot, and the body scrolls.
  expect(view.density).toBe('card')
  expect(view.list).toBeUndefined()
  expect(view.lanes.length).toBe(6)
  expect(reach.h).toBeGreaterThan(34)

  const canvas = new Canvas(110, 34)
  const drawn = paint(canvas, run, {
    nowMs: STARTED + 20_000, tick: 0, orientation: 'vertical', follow: false,
  })

  // What does not fit is a place to scroll to, not a count of what is missing.
  expect(drawn.body?.spanY ?? 0).toBeGreaterThan(0)
  expect(rowsOf(canvas).join('\n')).not.toContain('more')

  // And the wires are drawn, which is what the flat list gives up: arrowheads
  // where they land, and a stroke down from every phase to the one under it —
  // solid where the text proved the edge, dashed where only the labels suggest
  // it, which is what these are.
  const lines = rowsOf(canvas)

  expect(lines.join('\n')).toContain('\u25be')
  expect(lines.filter(line => /[\u2502\u2506]/.test(line)).length).toBeGreaterThan(4)

  // The last phase is past the foot of the pane, and scrolling reaches it.
  const scrolled = new Canvas(110, 34)

  paint(scrolled, run, {
    nowMs: STARTED + 20_000, tick: 0, orientation: 'vertical', follow: false,
    bodyScroll: { x: 0, y: drawn.body?.spanY ?? 0 },
  })

  expect(rowsOf(scrolled).join('\n')).toContain('joined')
})

test('across, a lane too tall for the pane keeps its cards and scrolls to the rest', () => {
  const run = runOf([
    ['Gather', ['rivers', 'reefs']],
    ['Draft', ['rivers', 'reefs', 'dunes', 'forests', 'ridges', 'marshes', 'lochs', 'fens',
               'cliffs', 'steppes', 'atolls', 'moors']],
    ['Assemble', ['joined']],
  ])

  const view = layout(run, 110, 30, 'horizontal')
  const reach = extentOf(view)

  // One lane of twelve used to turn every card in the drawing into a row, so a
  // fan-out cost the reader the frames, the models and the clocks on the phases
  // either side of it. The width has never made that trade — past the point
  // where a column can carry a name the columns take the width they need and
  // the body scrolls sideways — and the height does not make it either.
  expect(view.density).toBe('card')
  expect(reach.h).toBeGreaterThan(30)

  const canvas = new Canvas(110, 30)
  const drawn = paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'horizontal', follow: false })

  // What does not fit is a place to scroll to, not a count of what is missing.
  expect(drawn.body?.spanY ?? 0).toBeGreaterThan(0)
  expect(rowsOf(canvas).join('\n')).not.toContain('more')

  // The phase names are column heads, and a column head does not scroll: a card
  // carried far enough up used to land on the row they are written on.
  const heads = (canvas: Canvas) => rowsOf(canvas)[view.headerRows - 2] ?? ''
  const scrolled = new Canvas(110, 30)

  paint(scrolled, run, {
    nowMs: STARTED + 20_000, tick: 0, orientation: 'horizontal', follow: false,
    bodyScroll: { x: 0, y: drawn.body?.spanY ?? 0 },
  })

  expect(heads(scrolled)).toBe(heads(canvas))
  expect(heads(scrolled)).toContain('Draft')
})

test('across, a pane too short for two cards falls back to a row each', () => {
  const run = runOf([
    ['Gather', ['rivers', 'reefs']],
    ['Draft', ['rivers', 'reefs', 'dunes', 'forests', 'ridges', 'marshes']],
    ['Assemble', ['joined']],
  ])

  // Two cards and the gap between them is what it takes to have anything to
  // scroll between. Below that a card and a sliver of the next says less than
  // six rows do.
  expect(layout(run, 110, 8, 'horizontal').density).toBe('row')
  // And two of them is enough to keep them.
  expect(layout(run, 110, 14, 'horizontal').density).toBe('card')
})

test('a band too short even for a row falls to the list, which says so', () => {
  const run = runOf([
    ['Survey', ['paint', 'layout', 'journal', 'README', 'plugin']],
    ['Review', ['paint', 'layout', 'journal', 'plugin']],
    ['Check', ['README']],
  ])

  // Thirty-six columns stands one row of a legible width and no more, so a
  // band has nothing to wrap into: one node a row is the list with a frame
  // drawn round each row, and the list is the honest drawing of that pane.
  const view = layout(run, 36, 20, 'vertical')

  expect(view.density).toBe('row')
  expect(view.list).toBe(true)

  const canvas = new Canvas(36, 20)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'vertical' })

  // The order down the page is what says what fed what, so nothing is drawn
  // between the rows.
  expect(rowsOf(canvas).join('\n')).not.toContain('\u25be')
})

test('a column too narrow to close a card draws rows instead', () => {
  const six = runOf([
    ['Gather', ['rivers', 'reefs']],
    ['Draft', ['rivers', 'reefs']],
    ['Critique', ['rivers', 'reefs']],
    ['Revise', ['rivers', 'reefs']],
    ['Measure', ['rivers', 'reefs']],
    ['Assemble', ['join']],
  ])
  // Room enough down the pane for cards, and nothing like enough across it:
  // six phases and their gutters in twenty columns.
  const tight = layout(six, 20, 28, 'horizontal')

  expect(tight.density).toBe('row')
  expect(Math.max(...tight.lanes.map(l => l.w))).toBeLessThan(8)

  const canvas = new Canvas(20, 28)

  paint(canvas, six, { nowMs: STARTED + 20_000, tick: 0, orientation: 'horizontal' })

  // A card that narrow was drawn with its name over its own top-right corner,
  // so the box had three sides and the name stood outside it.
  expect(rowsOf(canvas).some(row => row.includes('╭'))).toBe(false)

  // Wide enough for a card, and the card closes.
  const roomy = layout(six, 120, 28, 'horizontal')

  expect(roomy.density).toBe('card')
  expect(Math.min(...roomy.lanes.map(l => l.w))).toBeGreaterThanOrEqual(8)
})

/**
 * One agent a phase, each begun once the one before it landed, and no two of
 * them named after the same thing — so nothing infers a carry and the phases
 * are joined by the barrier, which is the line drawn on a band's own spine.
 */
function handedOn(phases: string[]): RunState {
  const agents = phases.map((phase, i) => ({
    agentId: `${phase}-0`,
    label: phase.toLowerCase(),
    phase,
    state: 'done' as const,
    startedMs: STARTED + i * 6_000,
    endedMs: STARTED + i * 6_000 + 5_000,
    tools: [],
  }))

  return {
    runId: 'wf_test',
    name: 'audit',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_test',
    runFile: '/session/workflows/wf_test.json',
    startedMs: STARTED,
    status: 'running',
    phases,
    agents,
    consumed: 0,
  }
}

test('down the pane, a band scrolled away takes its spine with it', () => {
  const run = handedOn(['Gather', 'Draft', 'Critique', 'Revise', 'Measure', 'Assemble'])
  const down = layout(run, 70, 30, 'vertical')
  const across = layout(run, 130, 30, 'horizontal')

  // The spine every wire into a band turns on is a column across the pane and a
  // row down it, so which way it moves with the drawing is which way the
  // drawing runs. Moved by the sideways scroll in both, a band scrolled down
  // the pane kept its spine on the row it was laid out at while its cards went
  // with the scroll — and the wire between them ran from a card at the top of
  // the drawing to a spine forty rows below it, through every card in between.
  // Nothing caught it while the stacked layout could not scroll at all.
  // A lane with no bus of its own keeps its -1 whichever way the drawing moves.
  const moved = (view: ReturnType<typeof layout>, by: number) =>
    view.lanes.map(lane => (lane.busAt < 0 ? lane.busAt : lane.busAt + by))

  expect(scrolled(down, 0, -8).lanes.map(lane => lane.busAt)).toEqual(moved(down, -8))
  expect(scrolled(down, -4, 0).lanes.map(lane => lane.busAt)).toEqual(moved(down, 0))

  // Across, it is the column, and the sideways scroll is the one that moves it.
  expect(scrolled(across, -6, 0).lanes.map(lane => lane.busAt)).toEqual(moved(across, -6))
  expect(scrolled(across, 0, -6).lanes.map(lane => lane.busAt)).toEqual(moved(across, 0))
})

/** A run whose agents took visibly different times, spread across five minutes. */
function traced(): RunState {
  const at = (label: string, from: number, ms: number): AgentRow => ({
    agentId: label,
    label,
    phase: label.split(':')[0] as string,
    state: 'done',
    startedMs: STARTED + from,
    endedMs: STARTED + from + ms,
    tools: [],
    tokens: 12_000,
    result: 'done',
  })

  const agents = [
    at('gather:rivers', 0, 40_000),
    at('gather:reefs', 1_000, 90_000),
    at('draft:rivers', 95_000, 1_000),
    at('draft:reefs', 96_000, 120_000),
    at('review:whole', 220_000, 60_000),
  ]

  return {
    runId: 'wf_test',
    name: 'atlas',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_test',
    runFile: '/session/workflows/wf_test.json',
    startedMs: STARTED,
    endedMs: STARTED + 280_000,
    status: 'completed',
    phases: ['gather', 'draft', 'review'],
    agents,
    consumed: 60_000,
  }
}

test('the timeline rules a time axis, and carries its ticks down the rows', () => {
  const run = traced()
  const canvas = new Canvas(110, 24)

  paint(canvas, run, { nowMs: STARTED + 280_000, tick: -1, orientation: 'timeline', follow: false })

  const rows = rowsOf(canvas)
  const ruler = rows.findIndex(row => row.includes('┬0s'))

  // A bar scaled to the run's own span says how long the agent took and nothing
  // about when it ran, which is half of what a trace is opened to answer. The
  // ruler is the other half: a round step of time between ticks, each one named.
  expect(ruler).toBeGreaterThan(0)
  expect((rows[ruler] ?? '').split('┬').length).toBeGreaterThan(2)

  const tick = (rows[ruler] ?? '').lastIndexOf('┬')

  // And the tick carried down the rows, in the cells no bar claimed: otherwise
  // a bar is read against the scale by looking straight up at it, and across
  // thirty rows of a trace the row is lost by the time the eye is back.
  expect(rows.slice(ruler + 1).some(row => row[tick] === '┆')).toBe(true)
})

test('a timeline too fine for the pane scrolls sideways along its own scale', () => {
  const run = traced()
  const canvas = new Canvas(110, 24)
  const drawn = paint(canvas, run, {
    nowMs: STARTED + 280_000, tick: -1, orientation: 'timeline', follow: false,
  })

  // Squeezed into whatever the pane had left, an agent that took a second and
  // one that took two minutes were the same two cells. The axis takes the cells
  // the run needs instead, and the body scrolls to the rest of it.
  expect(drawn.body?.spanX ?? 0).toBeGreaterThan(0)
  expect(rowsOf(canvas)[canvas.rows - 1]).toContain('▸')

  const moved = new Canvas(110, 24)

  paint(moved, run, {
    nowMs: STARTED + 280_000, tick: -1, orientation: 'timeline', follow: false,
    bodyScroll: { x: drawn.body?.spanX ?? 0, y: 0 },
  })

  // The scale is fixed, so scrolling moves the window along it rather than
  // redrawing the run at a new size: the ruler says a later time than it did.
  const originOf = (c: Canvas) => rowsOf(c).findIndex(row => row.includes('┬0s'))

  expect(originOf(canvas)).toBeGreaterThan(0)
  expect(originOf(moved)).toBe(-1)
})

/**
 * What a node spends on itself before a letter of its name is drawn, and the
 * fewest cells of name the pane will divide itself down to.
 *
 * Named here rather than read off `layout.ts`, because the point of the test is
 * that the two hold: a rule stated once and checked against itself is not
 * checked at all.
 */
const ROW_SPEND = 5
const NAME_MIN = 8

test('a column the pane cannot give eight cells of a name takes the width it needs', () => {
  const widthOf = (columns: number) => layout(RUN, columns, 12, 'horizontal').lanes[0].w

  // Three phases across fifty-two columns get eleven or twelve cells each once
  // the gutters are paid, and a row spends five of them on its state rule, its
  // mark and the air between. Six cells of name cannot tell `Preflig…` from
  // `Pre-comm…`, so the pane stops dividing itself between the phases: the
  // columns take the width they need, the drawing runs past the pane's edge,
  // and the body scrolls to the rest.
  const kept = [47, 50, 52].map(columns => `${columns}: ${widthOf(columns) - ROW_SPEND >= NAME_MIN}`)

  expect(kept.join(', ')).toBe('47: true, 50: true, 52: true')

  // And the threshold is visible from outside: one column wider the share is
  // worth having, the pane divides itself again, and every column gets
  // narrower as the pane gets wider.
  expect(widthOf(53)).toBeLessThan(widthOf(52))
})

test('a pane as tall as it is wide reads downward, even where the phases would fit across', () => {
  // The width is only half the question. Three phases need fifty-seven cells to
  // get a legible column each, and a seat of sixty gives them that — but a
  // drawing laid out across a seat no wider than it is tall is three short
  // columns with the whole depth of the pane left blank under them.
  expect(resolveOrientation('auto', 60, 40, 3)).toBe('vertical')
  expect(resolveOrientation('auto', 100, 40, 3)).toBe('horizontal')
})

test('a pane too short to stand one band draws the run as a list', () => {
  // A band is a rule with its node clear of it, the row above for the wires to
  // gather on and the row below for the node's own exit points. A body that
  // cannot hold those draws every wire through the rule itself, so the pane
  // says more as a list of rows with no edges drawn between them.
  expect(layout(RUN, 90, 7, 'vertical').list).toBe(true)

  // One row more and the band fits, which is the whole of the difference.
  expect(layout(RUN, 90, 8, 'vertical').list ?? false).toBe(false)
})

test('a phase the run never reached stands its row in the middle of the band', () => {
  const run = runOf([
    ['Survey', ['paint', 'layout']],
    ['Review', ['paint']],
    ['Escalate', []],
    ['Report', ['final']],
  ])

  const view = layout(run, 96, 40, 'vertical')
  const ghost = view.lanes.find(l => l.phase === 'Escalate')?.ghost

  // The row takes its own width rather than the lane's — a band with one node
  // in it cut to what divides the widest band said `⊘ Veri…` with sixty columns
  // spare either side — and a width of its own has to be placed. Held against
  // the left edge it reads as a row of some other list, and every band around
  // it centres what it holds.
  expect(ghost?.x).toBe(Math.floor((96 - (ghost?.w ?? 0)) / 2))
  expect(ghost?.x).toBeGreaterThan(1)
})
