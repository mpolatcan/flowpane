/**
 * A run that loops, drawn as one row per piece of work.
 *
 * The pane's model was a run of unique phases and a phase of a bag of agents,
 * which a workflow that rewinds breaks: `Develop` is entered four times, so the
 * band held four agents named `Develop` in a column, indistinguishable from one
 * another, and a run of seventy-eight agents wanted seventy-eight rows in a
 * pane that has thirty. The fold puts the attempts on one row and marks them,
 * so the row says both what the work was and how it went each time it was done.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import type { AgentRow, RunState } from '../hooks/journal'
import { paint, runName } from '../hooks/paint'
import { foldedLanes } from '../hooks/shape'

const STARTED = 1_700_000_000_000

let at = 0

function agentOf(phase: string, label: string, state: AgentRow['state'] = 'done'): AgentRow {
  at += 1_000

  return {
    agentId: `${phase}-${label}-${at}`,
    label,
    phase,
    state,
    startedMs: STARTED + at,
    endedMs: state === 'running' ? undefined : STARTED + at + 500,
    tools: [],
    tokens: 4_000,
  }
}

/** A run built from the order its agents actually started in. */
function runOf(agents: AgentRow[], phases?: string[]): RunState {
  return {
    runId: 'wf_test',
    name: 'loop',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_test',
    runFile: '/session/workflows/wf_test.json',
    startedMs: STARTED,
    status: 'done',
    phases: phases ?? [...new Set(agents.map(a => a.phase))],
    agents,
    consumed: 0,
  }
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

test('a phase entered three times draws one row with three marks on it', () => {
  at = 0

  const run = runOf([
    agentOf('Develop', 'Develop'),
    agentOf('Verify', 'Verify'),
    agentOf('Develop', 'Develop'),
    agentOf('Verify', 'Verify'),
    agentOf('Develop', 'Develop'),
    agentOf('Verify', 'Verify', 'failed'),
  ])

  const lanes = foldedLanes(run)

  expect(lanes.map(lane => lane.phase)).toEqual(['Develop', 'Verify'])

  for (const lane of lanes) {
    expect(lane.entries).toBe(3)
    expect(lane.folds).toHaveLength(1)
    expect(lane.folds[0].passes.map(pass => pass.index)).toEqual([1, 2, 3])
  }

  // The row carries the figures of the pass that decided the phase: the one
  // that failed, or failing that the last one to land. A row averaging three
  // attempts says nothing about any of them.
  expect(lanes[1].folds[0].agent.state).toBe('failed')
})

test('two agents of one name running at once keep a row each', () => {
  at = 0

  const first = agentOf('Lint', 'Lint')
  const second = { ...agentOf('Lint', 'Lint'), startedMs: first.startedMs }

  const lanes = foldedLanes(runOf([first, second]))

  // A fan-out that reuses a name is two pieces of work, not one done twice. The
  // test is the clock: a pass begins after the pass before it ended, and these
  // two began together.
  expect(lanes[0].folds).toHaveLength(2)
})

test('a nested workflow is one row saying how many agents ran inside it', () => {
  at = 0

  const run = runOf([
    agentOf('▸ code-review', 'plan'),
    agentOf('▸ code-review', 'review:bugs'),
    agentOf('▸ code-review', 'verify'),
  ])

  const [lane] = foldedLanes(run)

  expect(lane.nested).toBe(true)
  expect(lane.folds).toHaveLength(1)
  expect(lane.folds[0].label).toBe('code-review')
  expect(lane.folds[0].inside?.agents).toBe(3)

  const canvas = new Canvas(110, 20)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: -1, orientation: 'vertical' })

  const text = rowsOf(canvas).join('\n')

  // The row is named after the run, not after whichever of its agents the row's
  // figures came from: `plan` on a band called `code-review` reads as the
  // nested run having done one thing.
  expect(text).toContain('code-review')
  expect(text).toContain('3 agents')
  expect(text).not.toContain('review:bugs')
})

test('a nested run unfolds on its own mark, and folds back on the same one', () => {
  at = 0

  const phase = '\u25b8 code-review'
  const run = runOf([
    agentOf(phase, 'plan'),
    agentOf(phase, 'review:bugs'),
    agentOf(phase, 'verify'),
  ])

  const canvas = new Canvas(110, 20)
  const shut = paint(canvas, run, { nowMs: STARTED + 20_000, tick: -1, orientation: 'vertical' })

  // The press is on the ▸ the band's name already opens with: a run of
  // twenty-three agents drawn as one row has to have a way in, and the mark is
  // where a reader looking for one already is.
  expect(shut.hotspots.some(spot => spot.agentId === `@band:${phase}`)).toBe(true)

  const open = new Canvas(110, 20)

  paint(open, run, { nowMs: STARTED + 20_000, tick: -1, orientation: 'vertical', opened: [phase] })

  const rows = rowsOf(open)
  const text = rows.join('\n')

  // Opened, it is the phase every other phase is.
  expect(text).toContain('review:bugs')

  // The row that stood for the whole run is gone — it is the agents now — and
  // the count it carried moves to the handle on the rule, where it is the way
  // back rather than the way in.
  expect(rows.some(row => row.includes('\u2570') && row.includes('3 agents'))).toBe(false)
  expect(rows.some(row => row.includes('\u25be code-review') && row.includes('\u25be 3 agents'))).toBe(true)
})

test('the count of what is inside is the way in, in every layout', () => {
  at = 0

  const phase = '\u25b8 code-review'
  const run = runOf([
    agentOf(phase, 'plan'),
    agentOf(phase, 'review:bugs'),
    agentOf(phase, 'verify'),
  ])

  for (const orientation of ['horizontal', 'vertical'] as const) {
    const canvas = new Canvas(110, 24)
    const shut = paint(canvas, run, { nowMs: STARTED + 20_000, tick: -1, orientation })
    const rows = rowsOf(canvas)
    const spot = shut.hotspots.find(
      s => s.agentId === `@band:${phase}` && rows[s.y]?.slice(s.x, s.x + s.w).includes('agents'),
    )

    // The card is where a reader looking at a run of three agents already is,
    // and the count is the only thing on it that is about those three. The way
    // in used to be one cell on the band's rule and nowhere else, so a card
    // that said `3 agents` named them without saying they could be reached.
    expect(spot).toBeDefined()
    expect(rows[spot?.y ?? 0]?.slice(spot?.x ?? 0, (spot?.x ?? 0) + (spot?.w ?? 0))).toContain('3 agents')

    // It opens with the mark the band's rule opens with, so the two controls
    // are one word rather than two.
    expect(rows[spot?.y ?? 0]?.slice(spot?.x ?? 0, (spot?.x ?? 0) + (spot?.w ?? 0)).trim()[0]).toBe('\u25b8')
  }
})


/**
 * A run long enough to be drawn as the flat list, with a nested run in it.
 *
 * The list is where a nested run needs telling apart: a band of thirteen child
 * rows drifts away from the rule that named it as the reader scrolls, and a
 * band drawn as cards never does, because it is one row high.
 */
function runWithNested(phase: string, inside: string[], phases = 9): RunState {
  at = 0

  const agents = [
    ...Array.from({ length: phases }, (_, i) => agentOf(`Phase ${i + 1}`, `step ${i + 1}`)),
    ...inside.map(label => agentOf(phase, label)),
    agentOf('Ship', 'Ship'),
  ]

  return runOf(agents)
}

test('a nested run a reader opened is drawn in a gutter of its own', () => {
  const phase = '\u25b8 code-review:ai-review'
  const run = runWithNested(phase, ['plan', 'review', 'verify'])
  // Narrow, because that is where the list is drawn: a band of three agents
  // needs forty columns before boxes carry a name, and under that the pane
  // gives each agent a row instead.
  const canvas = new Canvas(36, 30)

  paint(canvas, run, { nowMs: STARTED + 40_000, tick: -1, orientation: 'vertical', opened: [phase] })

  const rows = rowsOf(canvas)
  const find = (text: string) => rows.findIndex(row => row.includes(text))

  // The child's rows stand one step in, behind the dashed gutter — the same
  // double dash the phases still ahead are drawn in, which on this pane already
  // means *not part of the run proper*.
  for (const label of ['plan', 'review', 'verify']) {
    expect(rows[find(` ${label} `)]).toContain('\u254e')
  }

  // A row of the calling run's own does not.
  expect(rows[find(' step 3 ')]).not.toContain('\u254e')

  // And the gutter closes on what the whole of the nested run came to, so
  // folding it away again loses no figure that was on the pane while it was open.
  const foot = find('3 agents')

  expect(foot).toBeGreaterThan(find(' verify '))
  expect(rows[foot]).toContain('\u2570\u254c')
})

test('a nested run says whether it is open', () => {
  const phase = '\u25b8 code-review:ai-review'
  // Two phases either side of it, so the whole run is on the pane at once and
  // the mark can be read in both states without scrolling to it.
  const run = runWithNested(phase, ['plan', 'review', 'verify'], 2)
  const shut = new Canvas(40, 30)
  const open = new Canvas(40, 30)

  paint(shut, run, { nowMs: STARTED + 40_000, tick: -1, orientation: 'vertical' })
  paint(open, run, { nowMs: STARTED + 40_000, tick: -1, orientation: 'vertical', opened: [phase] })

  // The mark is the press that opens the run, so once it is open it has to stop
  // saying *press me to open*: a reader who has opened two of three nested runs
  // can see which two.
  expect(rowsOf(shut).join('\n')).toContain('\u25b8 code-review:ai-review')
  expect(rowsOf(open).join('\n')).toContain('\u25be code-review:ai-review')

  // Folded back, the gutter goes with it.
  expect(rowsOf(shut).join('\n')).not.toContain('\u254e')
})

test('a name that says itself twice is drawn once', () => {
  // The pipeline runs both of these. The second word of each is the first one
  // again, and a name written twice is a name a reader reads twice and learns
  // nothing by — so it goes at every width, not only when the cells run short.
  expect(runName('test-coverage:test-coverage', 60)).toBe('test-coverage')
  expect(runName('security-reviewer:security-review', 60)).toBe('security-reviewer')

  // A name with two halves that say different things keeps both.
  expect(runName('code-review:ai-review-agentic', 60)).toBe('code-review:ai-review-agentic')

  // The marker the engine writes in front of a nested run's name is not part of
  // the name, and is not spent on either half.
  expect(runName('\u25b8 test-coverage:test-coverage', 60)).toBe('\u25b8 test-coverage')
})

test('a name short of room gives up its plugin before its workflow', () => {
  // Cut from the right, `code-review:ai-review-age…` and
  // `code-review:ai-review-quick…` are two runs a reader cannot tell apart. The
  // plugin half is the one repeated wherever that plugin appears, and the one a
  // reader can infer from what is left.
  expect(runName('code-review:ai-review-agentic', 20)).toBe('ai-review-agentic')

  // Room for neither half whole: the workflow half is the one that is cut.
  expect(runName('code-review:ai-review-agentic', 10)).toBe('ai-review\u2026')
})

/** A run of `count` phases, one agent each, taller than any pane in this file. */
function tallRun(count: number): RunState {
  at = 0

  return runOf(
    Array.from({ length: count }, (_, i) => agentOf(`Phase ${i + 1}`, `step ${i + 1}`)),
  )
}

test('a drawing taller than the pane gets a rail instead of a count of what is missing', () => {
  const run = tallRun(20)
  const canvas = new Canvas(110, 20)
  const drawn = paint(canvas, run, { nowMs: STARTED + 20_000, tick: -1, orientation: 'vertical' })
  const rows = rowsOf(canvas)

  // `… 38 more` was a number a reader could read and not act on. A rail is the
  // same fact told as a place, and the place can be moved.
  expect(rows.join('\n')).not.toContain('more')
  expect(drawn.body?.spanY).toBeGreaterThan(0)
  expect(drawn.hotspots.some(spot => spot.agentId === 'body-down')).toBe(true)

  // Nothing to scroll back to yet, so the up arrow is drawn dead rather than
  // offered.
  expect(drawn.hotspots.some(spot => spot.agentId === 'body-up')).toBe(false)
})

test('scrolling the body moves the drawing and leaves the header where it was', () => {
  const run = tallRun(20)

  const frame = (y: number) => {
    const canvas = new Canvas(110, 20)
    const drawn = paint(canvas, run, {
      nowMs: STARTED + 20_000,
      tick: -1,
      orientation: 'vertical',
      bodyScroll: { x: 0, y },
    })

    return { rows: rowsOf(canvas), drawn }
  }

  const top = frame(0)
  const down = frame(8)

  // The header is the pane's own furniture and does not belong to the drawing:
  // which run, how far along, what it has spent.
  for (let y = 0; y < top.drawn.view!.headerRows - 1; y++) {
    expect(down.rows[y]).toBe(top.rows[y] as string)
  }

  // And the drawing has moved: the first phase is off the top, the last is on.
  expect(top.rows.join('\n')).toContain('Phase 1 ')
  expect(down.rows.join('\n')).not.toContain('Phase 1 ')
  expect(down.drawn.hotspots.some(spot => spot.agentId === 'body-up')).toBe(true)
})

test('a node scrolled off the top takes no press', () => {
  const run = tallRun(20)
  const canvas = new Canvas(110, 20)
  const drawn = paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: -1,
    orientation: 'vertical',
    bodyScroll: { x: 0, y: 8 },
  })

  // The painter still builds a hotspot for every node it lays out. One that
  // drew nothing would otherwise leave a press target on the header row above
  // it, and open an agent the reader cannot see.
  const first = run.agents[0].agentId

  expect(drawn.hotspots.some(spot => spot.agentId === first)).toBe(false)
  expect(drawn.hotspots.every(spot => spot.y >= 0 && spot.y < canvas.rows)).toBe(true)
})

test('the phases the run went round on are tied together by a rail', () => {
  at = 0

  // Once, three times, once, three times, once: a body that repeated with a
  // phase inside it that did not, and a phase either end that stands outside.
  const run = runOf([
    // Four agents in a phase of its own, so a narrow pane cannot give a band
    // boxes wide enough to name and draws the list, which is where the rail is.
    agentOf('Gather', 'alpha'),
    agentOf('Gather', 'beta'),
    agentOf('Gather', 'gamma'),
    agentOf('Gather', 'delta'),
    agentOf('Setup', 'Setup'),
    agentOf('Develop', 'Develop'),
    agentOf('Revise', 'Revise'),
    agentOf('Publish', 'Publish'),
    agentOf('Develop', 'Develop'),
    agentOf('Publish', 'Publish'),
    agentOf('Develop', 'Develop'),
    agentOf('Publish', 'Publish'),
    agentOf('Report', 'Report'),
  ])

  const canvas = new Canvas(46, 26)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: -1, orientation: 'vertical' })

  const rows = rowsOf(canvas)
  const find = (text: string) => rows.findIndex(row => row.includes(text))

  // The head points into the row control came back to, and the foot closes on
  // the last row it ran before going back. Between them the rail passes every
  // band, so a phase that ran once inside the loop is shown to be inside it.
  expect(rows[find('▌✔ Develop')].slice(0, 2)).toBe('╭▸')
  expect(rows[find('▌✔ Publish')].slice(0, 2)).toBe('╰─')
  expect(rows[find(' Revise ')].slice(0, 1)).toBe('├')

  // The phases at the ends ran once and are outside it: their rows start on the
  // gutter the list layout keeps, with nothing in it.
  expect(rows[find('▌✔ Setup')].slice(0, 2)).toBe('  ')
  expect(rows[find('▌✔ Report')].slice(0, 2)).toBe('  ')
})

test('a run that went round nowhere draws no rail', () => {
  at = 0

  const run = runOf([agentOf('Setup', 'Setup'), agentOf('Develop', 'Develop')])
  const canvas = new Canvas(46, 26)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: -1, orientation: 'vertical' })

  // A rail is what a rewind looks like. A run that never rewound has none, and
  // the gutter stays empty rather than carrying a line that means nothing.
  expect(rowsOf(canvas).every(row => !row.startsWith('╭') && !row.startsWith('╰'))).toBe(true)
})

/** The same run, still going, with the phase named in `atPhase` at work. */
function liveRun(count: number, atPhase: number): RunState {
  at = 0

  const agents = Array.from({ length: count }, (_, i) =>
    agentOf(`Phase ${i + 1}`, `step ${i + 1}`, i + 1 === atPhase ? 'running' : 'done'),
  )

  return { ...runOf(agents.slice(0, atPhase)), status: 'running' }
}

test('a live run opens on the phase it is working in', () => {
  const canvas = new Canvas(110, 18)

  paint(canvas, liveRun(20, 14), { nowMs: STARTED + 20_000, tick: 0, orientation: 'vertical' })

  const shown = rowsOf(canvas).join('\n')

  // The window is on the work. Opening at the first phase showed a reader a
  // phase that finished an hour ago while the agent actually running was off
  // the drawing — the present was the one thing the pane would not show.
  expect(shown).toContain('step 14')
  expect(shown).not.toContain('step 1 ')
})

test('a finished run opens at its start', () => {
  const canvas = new Canvas(110, 18)

  paint(canvas, tallRun(20), { nowMs: STARTED + 20_000, tick: -1, orientation: 'vertical' })

  // Following is a live-run behaviour. A run that is over has no front to
  // follow, and a reader coming to it reads it from the beginning.
  expect(rowsOf(canvas).join('\n')).toContain('step 1 ')
})

test('a reader who scrolls away is left there until the run changes phase', () => {
  const canvas = new Canvas(110, 18)
  const run = liveRun(20, 14)
  const drawn = paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    follow: false,
    bodyScroll: { x: 0, y: 0 },
  })

  // With the following off the pane draws where it is told, front or no front —
  // and still reports the front, which is what says when to take it back.
  expect(rowsOf(canvas).join('\n')).toContain('step 1 ')
  expect(drawn.front).toBe('Phase 14')
})

test('across, a nested run opens on the same mark it does down the pane', () => {
  const phase = '▸ code-review:ai-review'
  const run = runWithNested(phase, ['plan', 'review', 'verify'], 3)
  const canvas = new Canvas(110, 26)
  const shut = paint(canvas, run, { nowMs: STARTED + 40_000, tick: -1, orientation: 'horizontal' })

  // A phase's caption is the one row of it that says what the phase *is*, so a
  // nested run's way in belongs there whichever way the pane is laid out.
  expect(shut.hotspots.some(spot => spot.agentId === `@band:${phase}`)).toBe(true)
  expect(rowsOf(canvas).join('\n')).toContain('▸ ')

  const open = new Canvas(110, 26)

  paint(open, run, { nowMs: STARTED + 40_000, tick: -1, orientation: 'horizontal', opened: [phase] })

  const text = rowsOf(open).join('\n')

  expect(text).toContain('▾ ')
  expect(text).toContain('review')
  expect(text).toContain('verify')
})

test('a nested phase draws its rule dashed, and a phase of this run does not', () => {
  /** How much of the drawing is in the dashed register, at a given layout. */
  const dashes = (run: RunState, orientation: 'horizontal' | 'vertical' | 'timeline') => {
    // Tall enough that the stack stands every band: down the pane a band is its
    // node with two rows of air either side, so a run of four wants more rows
    // than one of four rules and four cards would.
    const canvas = new Canvas(110, 34)

    paint(canvas, run, { nowMs: STARTED + 40_000, tick: -1, orientation })

    return [...rowsOf(canvas).join('')].filter(ch => ch === '╌' || ch === '╍').length
  }

  const nested = runWithNested('▸ code-review:ai-review', ['plan', 'review', 'verify'], 3)
  // The same run with the marker off the phase name, which is the whole of what
  // makes it a nested one.
  const plain = runWithNested('code-review:ai-review', ['plan', 'review', 'verify'], 3)

  for (const orientation of ['horizontal', 'vertical', 'timeline'] as const) {
    // The pane already spends the dashed stroke on work that is not this run's
    // own — the phases it skipped, the strip naming the ones still ahead. A
    // nested run is the third of those, and this run has neither of the others.
    expect(dashes(nested, orientation)).toBeGreaterThan(0)
    expect(dashes(plain, orientation)).toBe(0)
  }
})

/** A run that entered one nested workflow twice, with its own work in between. */
function runEnteredTwice(phase: string): RunState {
  at = 0

  return runOf([
    agentOf('Build', 'Build'),
    agentOf(phase, 'plan'),
    agentOf(phase, 'review'),
    agentOf(phase, 'verify'),
    agentOf('Gate', 'Gate'),
    agentOf(`${phase} #2`, 'plan'),
    agentOf(`${phase} #2`, 'review'),
    agentOf(`${phase} #2`, 'verify'),
    agentOf('Ship', 'Ship'),
  ])
}

test('the timeline stands a shut nested run one bar a trip, not one an agent', () => {
  const phase = '▸ code-review'
  const run = runEnteredTwice(phase)
  const canvas = new Canvas(110, 30)

  paint(canvas, run, { nowMs: STARTED + 40_000, tick: -1, orientation: 'timeline' })

  const rows = rowsOf(canvas)
  const bars = rows.filter(row => row.startsWith(' ✔ code-r'))

  // A run entered twice is two stretches of clock with the calling run's own
  // work in the gap. One bar spanning both would draw over a gap the nested run
  // spent not running; the child's own agents would draw the child's timeline.
  expect(bars).toHaveLength(2)
  expect(rows.some(row => row.includes(' plan'))).toBe(false)
})

test('the timeline opens a nested run into a row an agent, each one pressable', () => {
  const phase = '▸ code-review'
  const run = runEnteredTwice(phase)
  const canvas = new Canvas(110, 30)
  const drawn = paint(canvas, run, {
    nowMs: STARTED + 40_000,
    tick: -1,
    orientation: 'timeline',
    opened: [phase],
  })

  const rows = rowsOf(canvas)

  expect(rows.filter(row => row.includes(' plan'))).toHaveLength(2)
  expect(rows.some(row => row.includes(' ▾ code-review'))).toBe(true)

  // Each of them takes a press of its own, which is what a reader opened the
  // run for: the detail behind one agent of another workflow.
  const inside = run.agents.filter(agent => agent.phase.startsWith(phase))

  for (const agent of inside) {
    expect(drawn.hotspots.some(spot => spot.agentId === agent.agentId)).toBe(true)
  }
})

test('a timeline taller than the pane gets a rail instead of a count of what is missing', () => {
  const run = tallRun(14)
  const canvas = new Canvas(110, 20)
  const drawn = paint(canvas, run, { nowMs: STARTED + 40_000, tick: -1, orientation: 'timeline' })

  expect(rowsOf(canvas).join('\n')).not.toContain('more')
  expect(drawn.body?.spanY).toBeGreaterThan(0)
  expect(drawn.hotspots.some(spot => spot.agentId === 'body-down')).toBe(true)
})

test('down, a phase of more than one agent forks out of its own rule', () => {
  at = 0

  const run = runOf([
    ...Array.from({ length: 6 }, (_, i) => agentOf(`Phase ${i + 1}`, `step ${i + 1}`)),
    agentOf('Fan', 'alpha'),
    agentOf('Fan', 'beta'),
    agentOf('Fan', 'gamma'),
    agentOf('Ship', 'Ship'),
  ])
  const canvas = new Canvas(36, 30)

  paint(canvas, run, { nowMs: STARTED + 40_000, tick: -1, orientation: 'vertical' })

  const rows = rowsOf(canvas)
  const find = (text: string) => rows.findIndex(row => row.includes(text))

  // The flat list has no room for a barrier or a wire, so three agents that ran
  // at once and three passes that ran in turn were the same three rows in the
  // same order. The stem is the one line it has room for.
  expect(rows[find(' Fan ')]).toContain('┬')
  expect(rows[find(' alpha')]).toContain('├')
  expect(rows[find(' beta')]).toContain('├')
  expect(rows[find(' gamma')]).toContain('╰')

  // A phase that ran a single agent gets none: a fork with one tine says
  // nothing a reader could not already see.
  expect(rows[find(' step 2')]).not.toContain('├')
  expect(rows[find(' step 2')]).not.toContain('╰')
})

/**
 * A nested run that planned, opened three reviewers at once, and wrote up what
 * they found — the shape every review panel in the corpus has, and the one a
 * column of five cards gives no sign of.
 */
function runWithWaves(phase: string): RunState {
  const span = (label: string, from: number, to: number): AgentRow => ({
    agentId: `${label}-${from}`,
    label,
    phase,
    state: 'done',
    startedMs: STARTED + from,
    endedMs: STARTED + to,
    tools: [],
    tokens: 4_000,
  })

  return runOf([
    span('plan', 0, 1_000),
    span('bugs', 2_000, 9_000),
    span('style', 2_100, 8_000),
    span('perf', 2_200, 7_000),
    span('write', 10_000, 11_000),
  ])
}

test('an opened nested run stands every agent it ran', () => {
  const phase = '▸ code-review'
  const run = runWithWaves(phase)
  const canvas = new Canvas(110, 24)

  paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: -1,
    orientation: 'horizontal',
    opened: [phase],
  })

  const all = rowsOf(canvas).join('\n')

  // One press, the whole run. It used to stand the steps and leave the three
  // that ran at once behind a row reading `3 at once`, so opening a run was an
  // answer a reader had to press again to finish.
  expect(all).toContain('plan')
  expect(all).toContain('bugs')
  expect(all).toContain('style')
  expect(all).toContain('perf')
  expect(all).toContain('write')
  expect(all).not.toContain('at once')
})

test('a step folded back stands one row, and says what it holds', () => {
  const phase = '▸ code-review'
  const run = runWithWaves(phase)
  const canvas = new Canvas(110, 24)
  const drawn = paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: -1,
    orientation: 'horizontal',
    opened: [phase, `${phase}\u00001`],
  })
  const rows = rowsOf(canvas)
  const all = rows.join('\n')

  // The three that ran together are one row; the two either side keep their own.
  expect(all).toContain('3 at once')
  expect(all).toContain('plan')
  expect(all).toContain('write')
  expect(all).not.toContain('bugs')

  // And the row says how many are behind it, in the word the run itself used.
  const spot = drawn.hotspots.find(s => s.agentId === `@band:${phase}\u00001`)

  expect(spot).toBeDefined()

  const said = rows[spot?.y ?? 0]?.slice(spot?.x ?? 0, (spot?.x ?? 0) + (spot?.w ?? 0)) ?? ''

  expect(said).toContain('3 agents')
  expect(said[0]).toBe('▸')
})

test('a phase of the calling run keeps every agent it fanned out to', () => {
  const run = runWithWaves('Review')
  const canvas = new Canvas(110, 24)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: -1, orientation: 'horizontal' })

  const all = rowsOf(canvas).join('\n')

  // The steps are for a run drawn inside another one. A phase of this run that
  // opened three agents at once is three cards, because three cards is what the
  // graph is for.
  expect(all).toContain('bugs')
  expect(all).not.toContain('at once')
})

test('a nested run carries one handle, the same shape open and shut', () => {
  const phase = '\u25b8 code-review:ai-review'
  const run = runWithNested(phase, ['plan', 'review', 'verify'], 2)

  const ruleOf = (opened: string[], columns = 60) => {
    const canvas = new Canvas(columns, 30)
    const drawn = paint(canvas, run, {
      nowMs: STARTED + 40_000,
      tick: -1,
      orientation: 'vertical',
      opened,
    })
    const rows = rowsOf(canvas)
    const spot = drawn.hotspots.find(
      s => s.agentId === `@band:${phase}` && rows[s.y]?.slice(s.x, s.x + s.w).includes('agents'),
    )

    return { rows, spot, rule: rows[spot?.y ?? 0] ?? '' }
  }

  const shut = ruleOf([])
  const open = ruleOf([phase])

  // One control, both states, and only its mark differs. It used to be a mark
  // shut and the word `collapse` open, so the control changed shape the first
  // time a reader used it — and a verb arrived in a rule that otherwise holds
  // nothing but marks, names and counts.
  expect(shut.rule).toContain('\u25b8 3 agents')
  expect(open.rule).toContain('\u25be 3 agents')
  expect(shut.rows.join('\n')).not.toContain('collapse')
  expect(open.rows.join('\n')).not.toContain('collapse')
  expect(shut.spot?.w).toBe(open.spot?.w)

  // And it is the only place it is said. The card standing for the run used to
  // carry the same count on its own bottom edge, as a second way in — but that
  // edge is where every card says its model, and a card still working says what
  // it is doing there instead, so the count displaced one fact and was displaced
  // by the other. The band's caption is a rule with nothing else on it.
  expect(shut.rows.some(row => row.includes('\u2570') && row.includes('\u25b8 3 agents'))).toBe(false)
  expect(open.rows.some(row => row.includes('\u2570') && row.includes('agents'))).toBe(false)

  // The handle stands clear of the caption, with the rule showing between them.
  // Set hard against the count it read as a fourth field of the caption, and
  // the run's own name lost the comparison.
  //
  // A card's exit point may fall in that stretch of rule — this rule is the row
  // under a card — and it stays where it is, the way it does anywhere else a
  // wire crosses a rule. The wires this rule carries are normalised to its own
  // stroke here, because what is being read is the caption and its handle, not
  // what crosses them.
  const showing = open.rule.replace(/[\u2022\u2502\u2506]/g, '\u254c')

  expect(showing).toContain('\u25be code-review:ai-review 3/3')
  expect(showing).toContain('\u25be 3 agents')

  // The run's own name comes first and what follows it trails off its right, and
  // the whole of it — name, count and handle — is what gets centred, so the rule
  // comes out the same length on both sides of the group.
  const name = '\u25be code-review:ai-review'

  for (const rule of [open.rule, ruleOf([phase], 100).rule]) {
    const at = rule.indexOf(name)

    expect(at).toBeGreaterThanOrEqual(0)
    expect(rule.indexOf('\u25be 3 agents')).toBeGreaterThan(at)
    // Whatever crosses the rule here, the caption is whole and unbroken: it
    // clears the cells it stands in, and the wire gives way for the one row it
    // would share. The caption used to give way instead, opening a gap for the
    // wire to land in, which moved the name off the middle by the width of the
    // gap and by a different amount on every band.
    expect(rule).toContain(`${name} 3/3`)

    // Equal rule either side of the group. That is the one measurement a
    // centred title has, and counting the handle as part of what gets centred
    // is what makes it come out equal: left out, the name sat where it would
    // have sat alone and the handle hung off its right, which left a shorter
    // run of rule on that side.
    const tail = rule.indexOf('\u25be 3 agents') + '\u25be 3 agents'.length
    const strokes = (text: string) => (text.match(/[\u2501\u2500\u254d\u254c]/g) ?? []).length

    // Counted as stroke rather than as cells, because a stack taller than the
    // body puts a scroll rail over the last two columns of this row and those
    // are not rule a reader is measuring.
    expect(Math.abs(strokes(rule.slice(0, at - 1)) - strokes(rule.slice(tail + 1)))).toBeLessThanOrEqual(1)
  }
})

test('the mark that folds a nested run back is wider than the mark', () => {
  const phase = '▸ code-review:ai-review'
  const run = runWithNested(phase, ['plan', 'review', 'verify'], 2)
  const canvas = new Canvas(60, 30)
  const drawn = paint(canvas, run, {
    nowMs: STARTED + 40_000,
    tick: -1,
    orientation: 'vertical',
    opened: [phase],
  })

  const rows = rowsOf(canvas)
  const mark = drawn.hotspots.find(
    spot => spot.agentId === `@band:${phase}` && rows[spot.y]?.slice(spot.x, spot.x + spot.w).includes('▾'),
  )

  // One cell on a rule a hundred and ten cells wide is a target a reader hits
  // by luck. The cell either side of the mark is blank — the rule is cleared
  // for the caption — so widening the press costs nothing and asks less.
  expect(mark).toBeDefined()
  expect(mark?.w).toBeGreaterThan(1)
})

test('the gutter an opened nested run stands in is two cells wide', () => {
  const phase = '\u25b8 code-review:ai-review'
  const run = runWithNested(phase, ['plan', 'review', 'verify'])
  const canvas = new Canvas(36, 30)

  paint(canvas, run, { nowMs: STARTED + 40_000, tick: -1, orientation: 'vertical', opened: [phase] })

  const rows = rowsOf(canvas)
  const startOf = (label: string) => rows[rows.findIndex(row => row.includes(` ${label} `))].indexOf('\u258c')

  // Two is what a step in has to be: one cell carries the dashed gutter and
  // nothing else, and a second is the air that keeps the gutter off the card.
  // A wider step spends the only columns a narrow pane has on emptiness, and a
  // narrower one draws the gutter against the card's own edge.
  expect(startOf('plan') - startOf('step 1')).toBe(2)
})

test('the two cells an opened nested run is stood in carry the gutter and nothing else', () => {
  const phase = '\u25b8 code-review:ai-review'
  const run = runWithNested(phase, ['plan', 'review', 'verify'])
  const canvas = new Canvas(36, 30)

  paint(canvas, run, { nowMs: STARTED + 40_000, tick: -1, orientation: 'vertical', opened: [phase] })

  const rows = rowsOf(canvas)
  const row = rows[rows.findIndex(r => r.includes(' plan '))]
  const from = rows[rows.findIndex(r => r.includes(' step 1 '))].indexOf('\u258c')

  expect(row.slice(from, from + 2)).toBe('\u254e\u251c')
})

test('a drawing far longer than its rail still has a thumb to look at', () => {
  at = 0

  const run = runOf(Array.from({ length: 600 }, (_, i) => agentOf(`Phase ${i + 1}`, `step ${i + 1}`)))
  const canvas = new Canvas(40, 20)

  paint(canvas, run, { nowMs: STARTED + 40_000, tick: -1, orientation: 'vertical' })

  const rows = rowsOf(canvas)
  const railX = (rows.find(row => row.includes('\u25b4')) ?? '').indexOf('\u25b4')
  const thumb = rows.filter(row => row[railX] === '\u2588').length

  // At this ratio the share of the drawing on the pane rounds to nothing, and
  // the rail is drawn as a track with no thumb in it: a control saying where
  // the reader is, with the one mark that says it missing.
  expect(railX).toBeGreaterThan(0)
  expect(thumb).toBeGreaterThan(0)
})

test('a thumb says how much of the drawing is on the pane', () => {
  const thumbFor = (agents: number): number => {
    at = 0

    const run = runOf(Array.from({ length: agents }, (_, i) => agentOf(`Phase ${i + 1}`, `step ${i + 1}`)))
    const canvas = new Canvas(40, 20)

    paint(canvas, run, { nowMs: STARTED + 40_000, tick: -1, orientation: 'vertical' })

    const rows = rowsOf(canvas)
    const railX = (rows.find(row => row.includes('\u25b4')) ?? '').indexOf('\u25b4')

    return rows.filter(row => row[railX] === '\u2588').length
  }

  // The floor of one cell is a floor, not the whole rule: a run barely longer
  // than the pane has most of itself on it, and the thumb has to say so.
  expect(thumbFor(6)).toBeGreaterThan(thumbFor(600))
})
