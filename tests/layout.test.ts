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
import { CARD_H, layout } from '../hooks/layout'
import { paint } from '../hooks/paint'

const STARTED = 1_700_000_000_000

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
  const view = layout(RUN, 110, 34, 'stack')

  expect(view.orientation).toBe('stack')

  const rules = view.lanes.map(lane => lane.captionRow ?? -1)
  const bands = rules.slice(1).map((row, i) => row - rules[i])

  expect(bands.every(band => band === bands[0])).toBe(true)
  expect(bands[0]).toBeGreaterThanOrEqual(CARD_H + 3)
})

test('a band keeps its cards clear of the rule above and the rule below', () => {
  const view = layout(RUN, 110, 34, 'stack')

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

test('across, every column is the same size and the nodes centre in the body', () => {
  const view = layout(RUN, 150, 32, 'flow')

  expect(view.orientation).toBe('flow')
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

  const view = layout(run, 110, 34, 'stack')

  expect(view.lanes.map(l => l.phase)).toEqual(['Survey', 'Review', 'Check'])
  expect(view.pending).toEqual(['Verify', 'Escalate', 'Report'])

  // And a pane with room to spare names them all the same. A section is a rule
  // and the nodes under it; a phase with no agents has no nodes, so a section
  // of its own is a rule with blank rows under it — three of those down a tall
  // pane read as three bands that failed to draw rather than as the rest of the
  // run. One list of them says it once.
  const roomy = layout(run, 110, 60, 'stack')

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
  const view = layout(run, 96, 40, 'stack')

  expect(view.pending).toEqual([])
  expect(view.lanes.map(l => l.phase)).toEqual(['Survey', 'Review', 'Escalate', 'Report'])

  const ghost = view.lanes.find(l => l.phase === 'Escalate')?.ghost

  // One row, not a card. A card carries four facts and a phase that never ran
  // has three, so its fourth side went round blank cells — and the strip and
  // the foot band were drawing rows for the same thing at the same time.
  expect(ghost?.h).toBe(1)

  const canvas = new Canvas(96, 40)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'stack' })

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

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'stack' })

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

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'stack' })

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

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'time' })

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
  const view = layout(RUN, 150, 32, 'flow')
  const edges = view.lanes.map(lane => lane.edgeAt)

  expect(view.orientation).toBe('flow')
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

test('across, the phases still ahead take a strip at the end, not a row under it', () => {
  const run = runOf([
    ['Survey', ['paint', 'layout', 'journal', 'README', 'plugin']],
    ['Review', ['paint', 'layout', 'journal', 'plugin']],
    ['Check', ['README']],
    ['Verify', []],
    ['Escalate', []],
    ['Report', []],
  ])

  const view = layout(run, 150, 32, 'flow')
  const last = view.lanes[view.lanes.length - 1]

  expect(view.pending).toEqual(['Verify', 'Escalate', 'Report'])
  expect(view.ahead?.x).toBeGreaterThanOrEqual(last.x + last.w)

  // The drawing keeps the row the rule under it used to take: a run with three
  // phases ahead of it is as deep as the same run with none declared.
  expect(view.lanes[0].h).toBe(layout(RUN, 150, 32, 'flow').lanes[0].h)

  const canvas = new Canvas(150, 32)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'flow' })

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

test('down the pane, a run too tall for cards keeps its wires', () => {
  const run = runOf([
    ['Gather', ['rivers', 'mountains', 'deserts', 'reefs', 'forests']],
    ['Draft', ['rivers', 'mountains', 'deserts', 'reefs', 'forests']],
    ['Critique', ['rivers', 'mountains', 'deserts', 'reefs', 'forests']],
    ['Revise', ['rivers', 'mountains', 'deserts', 'reefs', 'forests']],
    ['Measure', ['rivers', 'mountains', 'deserts', 'reefs', 'forests']],
    ['Assemble', ['joined']],
  ])

  const view = layout(run, 110, 34, 'stack')

  // A band of four rows cannot hold a card, so the node becomes one row — the
  // step the phases-across layout has always taken. What it must not do is fall
  // straight to the flat list, which draws no edges at all: the same run under
  // `flow` on the same seat keeps every wire, and a pane whose lines appear and
  // disappear with the setting reads as two different drawings of one run.
  expect(view.density).toBe('row')
  expect(view.list).toBeUndefined()
  expect(view.lanes.length).toBe(6)

  const canvas = new Canvas(110, 34)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'stack' })

  const lines = rowsOf(canvas)
  const text = lines.join('\n')

  // Arrowheads where the wires land, and a stroke running down from every phase
  // to the one under it — solid where the text proved the edge, dashed where
  // only the labels suggest it, which is what these are.
  expect(text).toContain('\u25be')
  expect(lines.filter(line => /[\u2502\u2506]/.test(line)).length).toBeGreaterThan(4)

  // And the whole run drawn: a list of twenty-six rows did not fit and said so.
  expect(text).not.toContain('more')
  expect(text).toContain('joined')
})

test('a band too short even for a row falls to the list, which says so', () => {
  const run = runOf([
    ['Survey', ['paint', 'layout', 'journal', 'README', 'plugin']],
    ['Review', ['paint', 'layout', 'journal', 'plugin']],
    ['Check', ['README']],
  ])

  const view = layout(run, 60, 20, 'stack')

  expect(view.density).toBe('row')
  expect(view.list).toBe(true)

  const canvas = new Canvas(60, 20)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'stack' })

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
  const tight = layout(six, 20, 28, 'flow')

  expect(tight.density).toBe('row')
  expect(Math.max(...tight.lanes.map(l => l.w))).toBeLessThan(8)

  const canvas = new Canvas(20, 28)

  paint(canvas, six, { nowMs: STARTED + 20_000, tick: 0, orientation: 'flow' })

  // A card that narrow was drawn with its name over its own top-right corner,
  // so the box had three sides and the name stood outside it.
  expect(rowsOf(canvas).some(row => row.includes('╭'))).toBe(false)

  // Wide enough for a card, and the card closes.
  const roomy = layout(six, 120, 28, 'flow')

  expect(roomy.density).toBe('card')
  expect(Math.min(...roomy.lanes.map(l => l.w))).toBeGreaterThanOrEqual(8)
})
