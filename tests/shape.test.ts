/**
 * The decisions the run's shape turns on, read back off `shape.ts` itself.
 *
 * Everything under `tests/` up to here reaches these rules through a canvas:
 * a run is painted and the cells are asked what happened. That reads the
 * drawing well and the reasoning badly — a fixture written by hand declares its
 * phases in the order its agents enter them, gives every agent the same spend
 * and finishes all of them, so the lane sort, the failure-first mark, the
 * unfinished guard and the sum of a folded row all agree with a simpler rule
 * that is wrong. These are the cases where the simpler rule parts company with
 * the real one.
 */

import { expect, test } from 'claude-code/testing'

import type { AgentRow, RunState } from '../hooks/journal'
import { foldedLanes, lanesOf, orderedLanes, passesFor, skipsOf, sourcesOf, tiesOf } from '../hooks/shape'

const STARTED = 1_700_000_000_000

/** The marker a workflow engine puts in front of a nested run's phase name. */
const NESTED = '▸ '

/** What joins a nested run's phase to the number of a step folded inside it. */
const STEP_SHUT = '\u0000'

let at = 0

function agentOf(phase: string, label: string, extra: Partial<AgentRow> = {}): AgentRow {
  at += 1_000

  return {
    agentId: `${label}-${at}`,
    label,
    phase,
    state: 'done',
    startedMs: STARTED + at,
    endedMs: STARTED + at + 500,
    tools: [],
    ...extra,
  }
}

/** An agent with its clock stated outright, for the cases the clock decides. */
function clocked(phase: string, label: string, from: number, to?: number, extra: Partial<AgentRow> = {}): AgentRow {
  return {
    agentId: `${label}-${from}`,
    label,
    phase,
    state: to === undefined ? 'running' : 'done',
    startedMs: STARTED + from,
    endedMs: to === undefined ? undefined : STARTED + to,
    tools: [],
    ...extra,
  }
}

function runOf(agents: AgentRow[], phases?: string[]): RunState {
  return {
    runId: 'wf_shape',
    name: 'shape',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_shape',
    runFile: '/session/workflows/wf_shape.json',
    startedMs: STARTED,
    status: 'running',
    phases: phases ?? [...new Set(agents.map(a => a.phase))],
    agents,
    consumed: 0,
  } as RunState
}

test('a phase stands where its agents entered it, not where the script declared it', () => {
  // Declared panel-first, entered feedback-first. Sorted by the declared index
  // the panel takes lane 0 and the run reads as though it reviewed before it
  // had anything to review — which is the drawing this sort replaced.
  const run = runOf(
    [agentOf('Run Feedback', 'gather'), agentOf(`${NESTED}review-panel`, 'claim')],
    [`${NESTED}review-panel`, 'Run Feedback'],
  )

  expect(lanesOf(run).map(lane => lane.phase)).toEqual(['Run Feedback', `${NESTED}review-panel`])
})

test('the mark a folded trip carries is the agent that failed, not the one that closed', () => {
  const phase = `${NESTED}code-review`
  const run = runOf([
    clocked(phase, 'claim', 0, 1_000),
    clocked(phase, 'bugs', 1_000, 2_000, { state: 'failed' }),
    clocked(phase, 'write', 2_000, 3_000),
  ])

  const [fold] = foldedLanes(run)[0].folds

  // One agent of the trip failing is the trip failing — that is what the
  // calling workflow does with it, so it is what the one mark has to say.
  expect(fold.passes[0].agent.label).toBe('bugs')
})

test('a folded trip still running carries no end', () => {
  const phase = `${NESTED}code-review`
  const run = runOf([clocked(phase, 'claim', 0, 1_000), clocked(phase, 'bugs', 1_000)])

  const [fold] = foldedLanes(run)[0].folds

  // Closed off at the last end anyone reported, the row reads finished and the
  // timeline draws a bar that stops while the sub-run is still working.
  expect(fold.agent.endedMs).toBeUndefined()
})

test('a folded trip reports what every agent in it spent', () => {
  const phase = `${NESTED}code-review`
  const run = runOf([
    clocked(phase, 'claim', 0, 1_000, { tokens: 4_000 }),
    clocked(phase, 'bugs', 1_000, 2_000, { tokens: 5_000 }),
    clocked(phase, 'write', 2_000, 3_000, { tokens: 6_000 }),
  ])

  const [fold] = foldedLanes(run)[0].folds

  expect(fold.agent.tokens).toBe(15_000)
})

test('an opened nested run takes its steps from the fullest trip, not the first', () => {
  const phase = `${NESTED}code-review`
  const run = runOf([
    // A thin first trip: a claim and a write, nothing at once.
    clocked(phase, 'claim', 0, 1_000),
    clocked(phase, 'write', 1_000, 2_000),
    // The calling run's own work, which is what splits the two trips.
    clocked('Develop', 'patch', 2_000, 3_000),
    // A full second trip: the same claim and write with two reviewers between
    // them, run side by side.
    clocked(phase, 'claim', 3_000, 4_000),
    clocked(phase, 'bugs', 4_000, 6_000),
    clocked(phase, 'perf', 4_000, 6_000),
    clocked(phase, 'write', 6_000, 7_000),
  ])

  // The run opened, and every step in it folded.
  const opened = new Set([phase, ...[0, 1, 2, 3].map(step => `${phase}${STEP_SHUT}${step}`)])
  const folds = foldedLanes(run, opened)[0].folds

  // Read off the thin trip the two reviewers belong to no step of it, so each
  // stands alone and nothing says they ran at once.
  expect(folds.map(fold => fold.label)).toEqual(['claim', 'write', '2 at once'])
})

test('a phase feeding one node twice is named once above it', () => {
  const bugs = 'The login handler drops the session cookie whenever a retry lands.'
  const perf = 'The token refresh path renews the access token and never the refresh one.'

  const run = runOf([
    clocked('Review', 'bugs', 0, 1_000, { result: bugs }),
    clocked('Review', 'perf', 0, 1_000, { result: perf }),
    clocked('Plan', 'order', 1_000, 2_000),
    clocked('Revise', 'patch', 2_000, 3_000, { prompt: `Fix both. ${bugs} ${perf}` }),
  ])

  const skip = skipsOf(run).find(s => s.toLane - s.fromLane === 2)

  // Two separate carries over the same pair of lanes, into the same node.
  expect(skip?.edges.filter(e => e.toId === 'patch-2000').length).toBe(2)

  // One line of provenance, not the same word twice.
  expect(sourcesOf(run).get('patch-2000')).toEqual(['Review'])
})

/**
 * A lane's rows are ordered by what fed what, and a phase the run looped
 * through is where that parts company with the order the rows appeared in.
 *
 * A row stands for a piece of work rather than for an agent, so a gate the run
 * ran twice is one row — and the row's own figures are its latest pass, which
 * is the pass the work after it was fed by.
 */
test('a lane puts the row that fed another above it, whichever appeared first', () => {
  const found = 'The refresh path renews the access token and never the refresh one, so a session lapses at an hour.'

  const run = runOf([
    clocked('Review', 'review:auth', 0, 500),
    // The gate ran, refused, and ran again once the fix had landed. Both passes
    // are one row, and the row appeared before the fix did.
    clocked('Fix', 'gate:auth', 1_000, 3_000),
    clocked('Fix', 'fix:auth', 2_000, 4_000, { result: found }),
    clocked('Fix', 'gate:auth', 5_000, 6_000, { prompt: `Check the fix. ${found}` }),
  ])

  const lane = orderedLanes(run)[1]

  // The fix fed the gate's second pass, so the fix belongs above the gate:
  // that is the wire the lane is ordered to keep straight. Ordered by the row
  // that appeared first instead, the hop between them runs backwards up the
  // column, over the very node it started at.
  expect(lane.folds.map(fold => fold.label)).toEqual(['fix:auth', 'gate:auth'])
})

test('a node fed by a proven edge and a guessed one takes the proven source', () => {
  const ties = tiesOf(
    [clocked('Check', 'patch', 2_000, 3_000)],
    new Map([
      ['draft-0', 0],
      ['critique-1000', 1],
    ]),
    // The guessed edge first, which is the order a caller that appended its
    // hints as it found them would hand them over.
    [
      { fromId: 'draft-0', toId: 'patch-2000' },
      { fromId: 'critique-1000', toId: 'patch-2000', confirmed: true },
    ],
  )

  // Only one of the two can place the node in a row, and a label convention is
  // a hint while a quoted answer is a record. Taking whichever arrived first
  // puts the node against a source the text says did not feed it.
  expect(ties.above.get('patch-2000')).toBe('critique-1000')
})

test('an agent that appears to feed itself is not a chain of one', () => {
  const agents = [clocked('Check', 'lint', 0, 1_000), clocked('Check', 'types', 1_000, 2_000)]
  const ties = tiesOf(agents, new Map(), [{ fromId: 'lint-0', toId: 'lint-0' }])

  // A self-edge is a node standing one step behind itself, which is a step the
  // walk can never take back. Its whole cost is paid in the cycle guard below.
  expect(ties.depth.get('lint-0')).toBe(0)
})

test('a lane whose own edges form a loop still gives every agent a place', () => {
  const agents = [clocked('Check', 'lint', 0, 1_000), clocked('Check', 'types', 1_000, 2_000)]
  const ties = tiesOf(agents, new Map(), [
    { fromId: 'lint-0', toId: 'types-1000' },
    { fromId: 'types-1000', toId: 'lint-0' },
  ])

  // The walk back to the head of a chain follows one edge per step, so a lane
  // of two agents is walked in two — and the bound allows a third, the step
  // that lands on a node the walk has already stood on. That step is the first
  // evidence the lane loops rather than ends, and the guard is what it costs.
  // Unbounded, a pair of edges pointing at each other is a frame that never
  // finishes drawing.
  //
  // The number it stops at is read again: the lane orders its rows by this
  // depth, so where the guard cuts in decides where the looped pair sorts. It
  // has to be a depth the walk reached, which is one past the lane's own
  // length, rather than wherever a tighter bound happened to stop it.
  expect(ties.depth.get('lint-0')).toBe(agents.length + 1)
  expect(ties.depth.get('types-1000')).toBe(agents.length + 1)
})

test('a nested run the script declared and never reached draws no row', () => {
  const phase = `${NESTED}ai-review`
  const run = runOf([clocked('Develop', 'patch', 0, 1_000)], ['Develop', phase])

  const lane = foldedLanes(run)[1]

  // Folded, a nested run is one row standing for a trip through it. A phase the
  // run has not entered has taken no trips, so the row would stand for nothing
  // — made from an empty block it carries no clock, no spend and no state, and
  // the band draws a node saying a sub-run ran and came back blank.
  expect(lane.phase).toBe(phase)
  expect(`${lane.shut ?? false} :: ${lane.folds.length}`).toBe('false :: 0')
})

test('a folded step starts when its earliest agent did, not when its first row did', () => {
  const phase = `${NESTED}code-review`
  const run = runOf([
    // The first trip: a claim, two reviewers at once, a write.
    clocked(phase, 'claim', 0, 1_000),
    clocked(phase, 'bugs', 1_000, 3_000),
    clocked(phase, 'perf', 1_100, 3_000),
    clocked(phase, 'write', 3_000, 4_000),
    // The calling run's own work, which is what splits the two trips.
    clocked('Develop', 'patch', 4_000, 5_000),
    // The second trip, where the two reviewers were dispatched the other way
    // round. They go together either way: a `parallel` starts its agents in a
    // loop and the engine stamps them milliseconds apart, in whatever order the
    // loop reached them.
    clocked(phase, 'claim', 5_000, 6_000),
    clocked(phase, 'perf', 6_000, 8_000),
    clocked(phase, 'bugs', 6_500, 8_000),
    clocked(phase, 'write', 8_000, 9_000),
  ])

  // The run opened, and the step the two reviewers make folded back up.
  const opened = new Set([phase, `${phase}${STEP_SHUT}1`])
  const fold = foldedLanes(run, opened)[0].folds.find(f => f.label === '2 at once')

  // The row stands for both of them, so it runs from the first of them to the
  // last. Rows keep the order their labels first appeared in, which on the
  // second trip is not the order the agents started in — read off the row at
  // the head of the step, the bar begins half a second after the work does.
  expect(fold?.agent.startedMs).toBe(STARTED + 6_000)
  expect(fold?.agent.endedMs).toBe(STARTED + 8_000)
})

test('a node fed from two lanes up is left in arrival order', () => {
  const ties = tiesOf(
    [clocked('Ship', 'release', 4_000, 5_000)],
    // Only the lane directly above is offered a row: the survey that started
    // the run is two lanes up, and has no place in this map.
    new Map([['patch-2000', 0]]),
    [{ fromId: 'survey-0', toId: 'release-4000', confirmed: true }],
  )

  // A source the lane above does not hold is a source no row can be read off.
  // Accepted anyway, the lookup that follows misses and falls back to the top
  // row, which drags the node to the head of its lane and draws its carry
  // across every column the run opened in between.
  expect(ties.above.has('release-4000')).toBe(false)
})

test('the first edge into a node keeps its place in the lane chain', () => {
  const agents = [
    clocked('Fix', 'draft', 0, 1_000),
    clocked('Fix', 'critique', 1_000, 2_000),
    clocked('Fix', 'patch', 2_000, 3_000),
  ]

  const ties = tiesOf(agents, new Map(), [
    // The guessed edge first, as a caller appending its hints as it finds them
    // hands them over. The sort puts it last; taking the last edge into a node
    // puts it back in front.
    { fromId: 'draft-0', toId: 'patch-2000' },
    { fromId: 'draft-0', toId: 'critique-1000', confirmed: true },
    { fromId: 'critique-1000', toId: 'patch-2000', confirmed: true },
  ])

  // The patch answered the critique, which answered the draft: two steps from
  // the head of the chain. Read off the guessed edge instead it stands one step
  // back, and the lane draws it beside the critique rather than after it.
  expect(ties.depth.get('patch-2000')).toBe(2)
})

test('a folded step ends when its latest agent did, not when its last row did', () => {
  const phase = `${NESTED}code-review`
  const run = runOf([
    // The first trip: a claim, two reviewers at once, a write.
    clocked(phase, 'claim', 0, 1_000),
    clocked(phase, 'bugs', 1_000, 3_000),
    clocked(phase, 'perf', 1_100, 3_000),
    clocked(phase, 'write', 3_000, 4_000),
    // The calling run's own work, which is what splits the two trips.
    clocked('Develop', 'patch', 4_000, 5_000),
    // The second trip, where the performance pass came back in a second and the
    // bug pass ran on for another one and a half.
    clocked(phase, 'claim', 5_000, 6_000),
    clocked(phase, 'perf', 6_000, 7_000),
    clocked(phase, 'bugs', 6_500, 8_000),
    clocked(phase, 'write', 8_000, 9_000),
  ])

  // The run opened, and the step the two reviewers make folded back up.
  const opened = new Set([phase, `${phase}${STEP_SHUT}1`])
  const fold = foldedLanes(run, opened)[0].folds.find(f => f.label === '2 at once')

  // The row stands for both of them, so it runs to the last of them. Rows keep
  // the order their labels first appeared in, and on this trip the row that
  // comes last is the one that finished first — read off that row, the bar ends
  // a second before the work it draws does, and the write below it starts after
  // the step it waited on has already been painted as over.
  expect(fold?.agent.endedMs).toBe(STARTED + 8_000)
})

test('the trips a card inside a shut nested run took are found without opening it', () => {
  const phase = `${NESTED}code-review`
  const run = runOf([
    // The panel, run once.
    clocked(phase, 'claim', 0, 1_000),
    clocked(phase, 'write', 1_000, 2_000),
    // The calling run's own work, which is what splits the two trips.
    clocked('Develop', 'patch', 2_000, 3_000),
    // And run again over the patch.
    clocked(phase, 'claim', 3_000, 4_000),
    clocked(phase, 'write', 4_000, 5_000),
  ])

  // Nothing opened, which is how the drawing stands until a reader presses the
  // run: one row for the whole panel.
  expect(foldedLanes(run)[0].folds.length).toBe(1)

  const trips = passesFor(run, 'claim-3000')

  // The dialog's question is a different one from the drawing's. A reader who
  // opened the second claim wants the first, and the agent is reachable whether
  // or not the run it sits in is drawn open — the row opens a list and a row of
  // that list opens the agent — so the trips are read with every nested run
  // unfolded, whatever the drawing has open behind the dialog.
  expect(trips.map(pass => pass.index)).toEqual([1, 2])
  expect(trips.map(pass => pass.agent.agentId)).toEqual(['claim-0', 'claim-3000'])
})

test('a card inside a nested run the run entered once has no trips to offer', () => {
  const phase = `${NESTED}code-review`
  const run = runOf([clocked(phase, 'claim', 0, 1_000), clocked(phase, 'write', 1_000, 2_000)])

  // The strip answers *which trip*, and work done once poses no such question.
  expect(passesFor(run, 'claim-0')).toEqual([])
})
