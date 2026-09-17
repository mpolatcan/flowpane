/**
 * What the pane knows about a run's *shape* — which agent feeds which.
 *
 * Nothing records a workflow's edges. The journal names an agent's label and
 * phase and nothing else, and the run summary adds numbers, not dependencies.
 * So the graph is derived, and it is drawn in two registers so the difference
 * stays visible:
 *
 * - a **barrier** between consecutive phases, which is a fact: `phase('Merge')`
 *   runs after everything the script awaited in `Collect`, and every agent of
 *   the later phase is downstream of every agent of the earlier one;
 * - a **carry**, an inferred one-to-one edge across that barrier, read off the
 *   labels of a `pipeline()` (`review:bugs` feeding `verify:bugs`). Drawn
 *   dimmed and dashed, because a label convention is a hint, not a record.
 */

import type { AgentRow, RunState } from './journal'

export type Carry = {
  fromId: string
  toId: string
  /** True when the text itself proves it: drawn solid rather than dashed. */
  confirmed?: boolean
}

/**
 * Cells of an answer long enough that finding them in a prompt is evidence and
 * not coincidence. Two sentences of boilerplate can collide; forty-eight
 * characters of one agent's actual output do not.
 */
const WINDOW = 48

function flattened(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Edges read off the text rather than off the names: a workflow passes a result
 * along by putting it in the next agent's prompt, so an agent whose answer
 * appears verbatim in another's prompt *did* feed it. That is a record, not a
 * convention, which is why these draw solid.
 *
 * Both sides come from the run summary the pane already reads — `promptPreview`
 * and `resultPreview` — so this costs no file the pane was not opening anyway.
 * They are capped around four hundred characters, so a prompt that quotes its
 * source late (an agent joining five others' work) may hide the overlap past
 * the cap and go unfound. Unfound is the safe way to be wrong here: the label
 * carry is still drawn, dashed, and says the same thing more weakly.
 */
export function flowsOf(run: RunState): Carry[] {
  const answers = run.agents
    .map(a => ({ agent: a, text: flattened(a.result ?? a.resultPreview) }))
    .filter(a => a.text.length >= WINDOW)

  if (answers.length === 0) {
    return []
  }

  const flows: Carry[] = []

  for (const target of run.agents) {
    const prompt = flattened(target.prompt)

    if (prompt.length < WINDOW) {
      continue
    }

    for (const { agent, text } of answers) {
      // Nothing feeds itself, and nothing that started later can have.
      if (agent.agentId === target.agentId || agent.startedMs > target.startedMs) {
        continue
      }

      // Windows along the answer, not just its opening: a prompt often quotes
      // one part of what it was given — the weakness out of a critique, not the
      // score in front of it — so a match can sit anywhere in the text.
      let carried = false

      for (let at = 0; at + WINDOW <= text.length && !carried; at += 24) {
        carried = prompt.includes(text.slice(at, at + WINDOW))
      }

      if (carried) {
        flows.push({ fromId: agent.agentId, toId: target.agentId, confirmed: true })
      }
    }
  }

  return flows
}

/**
 * Every edge the pane will draw: the ones the text proves, then the ones the
 * labels suggest for the pairs it did not.
 */
/**
 * The last answer `edgesOf` gave, against the run and the state it gave it for.
 *
 * Matching every answer against every prompt is cheap once and wasteful sixty
 * times a second, and the graph asks for it twice a frame — once to order the
 * lanes, once to draw them. The stamp changes whenever an agent arrives or its
 * text grows, which is exactly when the edges can have changed.
 */
let memo: { run: RunState; stamp: string; edges: Carry[] } | null = null

function stampOf(run: RunState): string {
  let stamp = ''

  for (const a of run.agents) {
    stamp += `${a.agentId}:${(a.result ?? a.resultPreview ?? '').length}:${(a.prompt ?? '').length};`
  }

  return stamp
}

export function edgesOf(run: RunState): Carry[] {
  const stamp = stampOf(run)

  if (memo && memo.run === run && memo.stamp === stamp) {
    return memo.edges
  }

  const edges = computeEdges(run)

  memo = { run, stamp, edges }

  return edges
}

function computeEdges(run: RunState): Carry[] {
  const flows = flowsOf(run)
  // Only the same pair is a duplicate. An agent fed by two others really has
  // two edges — a revision takes both the draft and the critique of it — and
  // dropping the second because the first was proven would hide a dependency,
  // as well as the ordering signal the lane sort reads off it.
  const proven = new Set(flows.map(f => `${f.fromId}>${f.toId}`))
  const found = [...flows, ...carriesOf(run).filter(c => !proven.has(`${c.fromId}>${c.toId}`))]
  const drawn = new Set(found.map(e => `${e.fromId}>${e.toId}`))

  return thinned([...found, ...repeatsOf(run, found).filter(e => !drawn.has(`${e.fromId}>${e.toId}`))])
}

/**
 * The hops a loop makes inside one phase.
 *
 * A phase that keeps going at one piece of work until a pass comes back empty
 * spawns an agent per pass, and every one of them traces back to the same
 * source in the phase before. Read literally that is a fan-out: one node with
 * three lines leaving it, two of which have to cross the columns between. Read
 * as what it is — a loop — it is a chain, where each pass is fed by the one
 * before it and only the first is fed from outside. Drawn that way the crossing
 * lines become a step between neighbours, and the reduction drops the bare
 * edges the chain now accounts for.
 *
 * Passes that overlap in time are not a loop. Three lenses opened at once are a
 * fan-out and stay one, since nothing the second did could have been asked for
 * by the first.
 */
function repeatsOf(run: RunState, edges: Carry[]): Carry[] {
  const lanes = lanesOf(run)
  const hops: Carry[] = []

  for (let i = 1; i < lanes.length; i++) {
    const above = new Set(lanes[i - 1].agents.map(a => a.agentId))
    const here = new Map(lanes[i].agents.map(a => [a.agentId, a]))
    const groups = new Map<string, AgentRow[]>()

    for (const e of edges) {
      const target = here.get(e.toId)

      if (!above.has(e.fromId) || target === undefined) {
        continue
      }

      groups.set(e.fromId, [...(groups.get(e.fromId) ?? []), target])
    }

    for (const group of groups.values()) {
      const order = [...new Set(group)].sort((a, b) => a.startedMs - b.startedMs)

      if (order.length < 2 || !inSequence(order)) {
        continue
      }

      for (let pass = 1; pass < order.length; pass++) {
        hops.push({ fromId: order[pass - 1].agentId, toId: order[pass].agentId })
      }
    }
  }

  return hops
}

/**
 * Drops every edge a longer path already accounts for — the transitive
 * reduction of the carry graph.
 *
 * A workflow passes the same text down a chain, so a run whose fourth stage
 * quotes what its second produced yields both `2→3→4` and a bare `2→4`. Every
 * one of those bare edges has a lane of nodes in its way and has to be routed
 * around them, and it says nothing the two hops either side of it did not
 * already say. The drawing keeps the hops and drops the shortcut.
 *
 * The edges run forward in time (`flowsOf` refuses a source that started later,
 * `carriesOf` only pairs a lane with the one before it), so the walk cannot
 * loop.
 */
function thinned(edges: Carry[]): Carry[] {
  const out = new Map<string, Carry[]>()

  for (const e of edges) {
    out.set(e.fromId, [...(out.get(e.fromId) ?? []), e])
  }

  /** True when `target` is reachable from `from` over edges this strong. */
  const reaches = (from: string, target: string, confirmed: boolean, seen: Set<string>): boolean => {
    if (from === target) {
      return true
    }

    if (seen.has(from)) {
      return false
    }

    seen.add(from)

    return (out.get(from) ?? [])
      .filter(e => !confirmed || e.confirmed === true)
      .some(e => reaches(e.toId, target, confirmed, seen))
  }

  // A proven edge is only dropped for a path that is proven the whole way: a
  // guessed hop standing in for a recorded one would trade a fact for a hint.
  return edges.filter(
    e =>
      !(out.get(e.fromId) ?? [])
        .filter(step => step.toId !== e.toId && (e.confirmed !== true || step.confirmed === true))
        .some(step => reaches(step.toId, e.toId, e.confirmed === true, new Set())),
  )
}

/**
 * The run's agents grouped by phase, each lane ordered so a carry runs straight
 * across.
 *
 * An agent's place in the journal is when it started, not what it follows, so a
 * lane left in that order sends its carries diagonally across each other. Each
 * lane after the first is therefore sorted by where its source sits in the lane
 * before it — the barycentre step of a layered graph drawing, with one parent
 * per node it is just a sort. A node with no carry keeps its arrival order,
 * after the ones that have one.
 */
export function orderedLanes(run: RunState, opened?: Set<string>): FoldedLane[] {
  const lanes = foldedLanes(run, opened)
  const edges = edgesOf(run)

  for (let i = 1; i < lanes.length; i++) {
    // The rows are folds, so the sort is over the agent each fold stands for.
    // A fold's other passes ran in other trips round the loop and have no place
    // of their own in a lane that draws each piece of work once.
    const above = new Map(lanes[i - 1].folds.map((f, index) => [f.agent.agentId, index]))
    const arrival = new Map(lanes[i].folds.map((f, index) => [f.agent.agentId, index]))
    const ties = tiesOf(
      lanes[i].folds.map(f => f.agent),
      above,
      edges,
    )

    const rankOf = (a: AgentRow) => {
      const row = ties.above.get(a.agentId)

      // Carried nodes take their source's row; the rest sit below, in the order
      // they arrived, so an added agent never reshuffles the ones above it.
      return row === undefined ? lanes[i - 1].folds.length + (arrival.get(a.agentId) ?? 0) : (above.get(row) ?? 0)
    }

    lanes[i].folds = [...lanes[i].folds].sort(
      (x, y) =>
        rankOf(x.agent) - rankOf(y.agent) ||
        (ties.depth.get(x.agent.agentId) ?? 0) - (ties.depth.get(y.agent.agentId) ?? 0) ||
        (arrival.get(x.agent.agentId) ?? 0) - (arrival.get(y.agent.agentId) ?? 0),
    )
  }

  return lanes
}

/**
 * What each agent of one lane follows: the agent in the lane above it was fed
 * from, and how many steps inside its own lane it stands from the first of its
 * chain.
 *
 * A second pass over the same file is fed by the first pass, not by the survey
 * that started them — an edge inside one lane. Left out, that pass had no
 * source in the lane above, went to the end of the lane, and drew its carry
 * diagonally across every column between.
 *
 * Exported for the sake of three guards that no run can reach. The edges
 * `edgesOf` hands it are proven-first, never self-referential and always
 * forward in time, so a fixture built out of a run cannot ask this what it does
 * with a guessed edge that arrives before a proven one, with an agent that
 * feeds itself, or with a cycle. The guards are here because the argument is a
 * list of edges rather than a run, and the only way to hold them to their word
 * is to hand them such a list.
 */
export function tiesOf(
  agents: AgentRow[],
  above: Map<string, number>,
  edges: Carry[],
): { above: Map<string, string>; depth: Map<string, number> } {
  const here = new Set(agents.map(a => a.agentId))
  // A proven edge outranks a guessed one, and only the lane directly above can
  // place a node in a row.
  const sorted = [...edges].sort((a, b) => Number(!!b.confirmed) - Number(!!a.confirmed))
  const fromAbove = new Map<string, string>()
  const fromHere = new Map<string, string>()

  for (const e of sorted) {
    if (above.has(e.fromId) && !fromAbove.has(e.toId)) {
      fromAbove.set(e.toId, e.fromId)
    }

    if (here.has(e.fromId) && here.has(e.toId) && e.fromId !== e.toId && !fromHere.has(e.toId)) {
      fromHere.set(e.toId, e.fromId)
    }
  }

  const source = new Map<string, string>()
  const depth = new Map<string, number>()

  for (const agent of agents) {
    let at = agent.agentId
    let steps = 0

    // Walk back through the lane's own chain to the pass that began it, which
    // is the one the lane above fed. A cycle cannot outlast the lane's length.
    while (fromHere.has(at) && steps <= agents.length) {
      at = fromHere.get(at) as string
      steps++
    }

    depth.set(agent.agentId, steps)

    const root = fromAbove.get(at)

    if (root !== undefined) {
      source.set(agent.agentId, root)
    }
  }

  return { above: source, depth }
}

/** Where an agent stands in its phase's repeats of one piece of work. */
export type Pass = {
  /** 1 for the first go at it. */
  index: number
  /** How many goes there were in all. */
  total: number
}

/**
 * The repeats a run's phases made, one entry per agent that is part of one.
 *
 * A loop shows from outside as one phase entered again: the pipeline reaches its
 * last gate, the gate refuses, and the run goes back to `Develop` and comes
 * down the same phases a second time. Which agents are repeats of each other is
 * read off `foldedLanes` — same phase, same label, different entry — so it is a
 * record of what the run did rather than a reading of what the labels imply.
 *
 * Running side by side disqualifies them, and falls out of the same rule: two
 * agents of one label inside a single entry are a fan-out that reuses a name,
 * and `foldsOf` gives them a row each. Three lenses opened at once are three
 * different things done once, not one thing done three times.
 */
export function passesOf(run: RunState): Map<string, Pass> {
  const passes = new Map<string, Pass>()

  for (const lane of foldedLanes(run)) {
    for (const fold of lane.folds) {
      if (fold.passes.length < 2) {
        continue
      }

      fold.passes.forEach((pass, at) => passes.set(pass.agent.agentId, { index: at + 1, total: fold.passes.length }))
    }
  }

  return passes
}

/**
 * A phase's agents grouped into the waves they ran in: each wave the agents
 * that overlapped, the waves in the order they went.
 *
 * Agents of a phase that overlap are a fan: whatever the phase before produced
 * was there for all of them at once, and a line from each source into each of
 * them is the truth about how the work reached them. Agents that ran one after
 * another are a chain. The second could not have begun until the first had
 * landed, so what it was given includes what the first answered, and a drawing
 * that feeds every one of them from the phase above says the phase started them
 * together — which the two clocks on their own cards disprove.
 *
 * Real phases are rarely either. A nested run opened out into the phase that
 * called it is a dozen agents that planned, then fanned out, then gathered:
 * three waves, not one fan and not a chain of twelve. Read as a fan it takes a
 * line from the phase above into all twelve and a line out of all twelve into
 * the phase below — twenty-four wires through two gutters, saying that the
 * calling phase started twelve agents at once and that the phase after waited
 * on each of them, neither of which happened. Read as waves it takes a line
 * into the first wave and a line out of the last, which is what did happen.
 *
 * A single wave is a fan and a phase of waves of one is a chain, so nothing
 * needs to ask which of the three a phase is: the waves say it.
 */
export function wavesOf(lane: { agents: AgentRow[] }): AgentRow[][] {
  const SLACK = 250
  const order = [...lane.agents].sort((a, b) => a.startedMs - b.startedMs)
  const waves: AgentRow[][] = []
  // The furthest the wave being built runs to. An agent still working runs to
  // the end of the run as far as anything after it is concerned, so everything
  // that started while it was going belongs to its wave.
  let until = -Infinity

  for (const agent of order) {
    const wave = waves[waves.length - 1]

    if (wave === undefined || agent.startedMs + SLACK >= until) {
      waves.push([agent])
      until = agent.endedMs ?? Infinity
      continue
    }

    wave.push(agent)
    until = Math.max(until, agent.endedMs ?? Infinity)
  }

  return waves
}

/**
 * A phase's agents in the order they ran, where they ran one at a time — and
 * nothing where any two of them overlapped.
 *
 * The degenerate shape of {@link wavesOf}: every wave one agent. It is worth a
 * name of its own because a chain is the one shape whose agents hand work to
 * each other one for one, so the hop from each pass to the next can be drawn as
 * a wire. Between waves of several there is no such pairing to draw.
 *
 * Nothing for a phase of one, which is neither a chain nor a fan.
 */
export function chainOf(lane: { agents: AgentRow[] }): AgentRow[] | null {
  const waves = wavesOf(lane)

  return waves.length > 1 && waves.every(wave => wave.length === 1) ? waves.map(wave => wave[0]) : null
}

/** True where each agent started only once the one before it had landed. */
function inSequence(order: AgentRow[]): boolean {
  const SLACK = 250

  for (let i = 1; i < order.length; i++) {
    const before = order[i - 1].endedMs

    if (before === undefined || order[i].startedMs + SLACK < before) {
      return false
    }
  }

  return true
}

/**
 * An edge that skips a lane, with every other edge between the same two phases
 * folded into it.
 *
 * Such an edge has a whole band of nodes in its way and cannot be drawn where
 * it belongs. Bundling is what keeps it affordable: five topics carrying their
 * revision past the measuring step are one fact about the run, drawn once.
 */
export type Skip = {
  fromLane: number
  toLane: number
  count: number
  /**
   * The edges the bundle stands for, so a rail can be hung off one of them
   * rather than off the lanes as a whole. Two phases that ran side by side have
   * no barrier between them and so no bus for a rail to land anywhere on;
   * landing on the lane's nearest node then names a source that has nothing to
   * do with what the rail carries.
   */
  edges: Carry[]
  /** True only when every edge in the bundle is one the text proved. */
  confirmed: boolean
}

/**
 * True when the later lane really runs after the earlier one — every agent of
 * it started after the last agent of the earlier one landed.
 *
 * Lane order is the order the phases were declared, which is not the order they
 * ran in. A `pipeline()` that branches opens `Review` and `Check` at the same
 * moment on different files; drawing a barrier between them because one is
 * declared after the other says the second waited for the first, and a reader
 * who can see both started at thirteen seconds knows that is false.
 *
 * An earlier lane still running fails the test, which is the answer that keeps
 * the drawing honest while the run is in flight and does not change once it
 * finishes.
 */
export function follows(
  earlier: { agents: AgentRow[] },
  later: { agents: AgentRow[] },
): boolean {
  if (earlier.agents.length === 0 || later.agents.length === 0) {
    return false
  }

  // A phase that opens the instant the one before it closes still followed it.
  const SLACK = 250

  let last = 0

  for (const agent of earlier.agents) {
    if (agent.endedMs === undefined) {
      return false
    }

    last = Math.max(last, agent.endedMs)
  }

  return later.agents.every(a => a.startedMs + SLACK >= last)
}

/**
 * For every node fed from further back than the band above it, the phases that
 * fed it, in the order the run entered them.
 *
 * A node fed from two phases back and from four names both: which of them a
 * reader wants is the question they arrived with, and the pane cannot guess it.
 *
 * The phase is named by its place in the run rather than by its place in the
 * picture. The drawing holds only the phases it could fit, so taken as a place
 * every skip in a run with one phase left out named the phase one along.
 *
 * Named, not keyed: a nested run's phase name arrives with the engine's `\u25b8`
 * on the front, and `\u25b8` is this pane's press-to-unfold mark everywhere else a
 * reader meets it. Left on, a card fed from a nested run read `\u25b8 ai-review`
 * beside it, which is a control a reader cannot press — the mark belongs to the
 * band's own caption, where the press is. The dialog's title strips it for the
 * same reason.
 */
export function sourcesOf(run: RunState): Map<string, string[]> {
  const lanes = lanesOf(run)
  const out = new Map<string, string[]>()

  for (const skip of skipsOf(run)) {
    const named = lanes[skip.fromLane]?.phase
    const phase = named?.startsWith(NESTED) ? named.slice(NESTED.length) : named

    if (phase === undefined) {
      continue
    }

    for (const edge of skip.edges) {
      const held = out.get(edge.toId) ?? []

      if (!held.includes(phase)) {
        out.set(edge.toId, [...held, phase])
      }
    }
  }

  return out
}

/** The run's lane-skipping edges, bundled by the pair of phases they join. */
export function skipsOf(run: RunState): Skip[] {
  const lanes = lanesOf(run)
  const laneOf = new Map<string, number>()

  lanes.forEach((lane, index) => {
    for (const agent of lane.agents) {
      laneOf.set(agent.agentId, index)
    }
  })

  const bundles = new Map<string, Skip>()

  for (const edge of edgesOf(run)) {
    const fromLane = laneOf.get(edge.fromId)
    const toLane = laneOf.get(edge.toId)

    if (fromLane === undefined || toLane === undefined || toLane - fromLane <= 1) {
      continue
    }

    const held = bundles.get(`${fromLane}>${toLane}`)

    if (held) {
      held.count++
      held.edges.push(edge)
      held.confirmed = held.confirmed && edge.confirmed === true
    } else {
      bundles.set(`${fromLane}>${toLane}`, {
        fromLane,
        toLane,
        count: 1,
        edges: [edge],
        confirmed: edge.confirmed === true,
      })
    }
  }

  return [...bundles.values()]
}

/**
 * A phase's name without the marker the engine hangs on a re-entry.
 *
 * A workflow that runs a nested one three times writes three phases —
 * `▸ code-review:ai-review-agentic`, then the same with ` #2` and ` #3`. They
 * are one phase entered three times, not three phases, and drawn as three the
 * pane said a run had fifty steps where it had sixteen and put the third trip
 * round the loop in its own band at the bottom of the drawing, after the phase
 * the run actually finished in.
 */
export function phaseKeyOf(phase: string): string {
  return phase.replace(/ #\d+$/, '')
}

/**
 * The run's agents grouped by phase, in the order the run went through them.
 *
 * The script's own `meta.phases` is a *declaration*, and a workflow that rewinds
 * does not follow it: the loop's second trip re-enters `Develop` long after the
 * script's list has moved past it, and a nested run announces phases the list
 * never held at all. Ordered as declared, the pane put the three phases of the
 * review panel below `Run Feedback` — after the phase the run ended in — and a
 * reader following the drawing down the page read the run out of order.
 *
 * So a phase the run entered is placed by when it was first entered, and one it
 * declared but never reached keeps its declared place: behind whichever entered
 * phase it was declared after. That is the only position a phase with no clock
 * of its own can be given, and it is the one the script promised.
 */
export function lanesOf(run: RunState): { phase: string; agents: AgentRow[] }[] {
  const first = new Map<string, number>()

  for (const agent of run.agents) {
    const key = phaseKeyOf(agent.phase)
    const at = first.get(key)

    if (at === undefined || agent.startedMs < at) {
      first.set(key, agent.startedMs)
    }
  }

  const seen = new Set<string>()
  const lanes: { phase: string; agents: AgentRow[]; at: number }[] = []
  let behind = 0

  const push = (phase: string, declared: boolean) => {
    const key = phaseKeyOf(phase)

    if (seen.has(key)) {
      return
    }

    const at = first.get(key)

    if (at !== undefined) {
      behind = at
    }

    seen.add(key)
    lanes.push({
      phase: key,
      agents: run.agents.filter(a => phaseKeyOf(a.phase) === key),
      // A phase nothing entered stands at the same moment as the one it was
      // declared behind, and the declared order breaks the tie. Nudging it a
      // fraction later instead put it after every phase that started in the
      // same millisecond, which is every phase of a run replayed from a file.
      at: at ?? behind,
    })

    void declared
  }

  run.phases.forEach(phase => push(phase, true))
  run.agents.forEach(a => push(a.phase, false))

  // A phase the script declared but no agent ever entered still draws, so a
  // run in flight shows what is still ahead of it.
  return lanes
    .map((lane, index) => ({ lane, index }))
    .sort((a, b) => a.lane.at - b.lane.at || a.index - b.index)
    .map(({ lane }) => ({ phase: lane.phase, agents: lane.agents }))
}

/**
 * Each time the run was in a phase, in the order it entered them.
 *
 * A workflow that rewinds comes back to a phase it has already been through, so
 * the agents of one phase arrive in blocks: everything `Develop` ran the first
 * time, then the phases after it, then `Develop` again. Reading the blocks off
 * the order the journal announced the agents in is a *record* of how many times
 * the run entered each phase — the same standing a barrier has, and a stronger
 * one than any reading of the labels — which is why the passes a node shows are
 * counted here rather than inferred.
 *
 * Agents of two phases that overlap in time still fall in the block of whichever
 * phase was announced around them. That is what a workflow does when a phase
 * starts before the one before it has finished landing, and the block it makes
 * is still the entry both of them belong to.
 */
export function entriesOf(run: RunState): Map<string, AgentRow[][]> {
  const order = [...run.agents].sort((a, b) => a.startedMs - b.startedMs)
  const entries = new Map<string, AgentRow[][]>()
  let last: string | null = null

  for (const agent of order) {
    const key = phaseKeyOf(agent.phase)
    const blocks = entries.get(key) ?? []

    if (key !== last || blocks.length === 0) {
      blocks.push([])
    }

    blocks[blocks.length - 1].push(agent)
    entries.set(key, blocks)
    last = key
  }

  return entries
}

/** One agent of a fold, and which entry into the phase it belongs to. */
export type FoldPass = {
  /** 1 for the run's first trip through this phase. */
  index: number
  agent: AgentRow
}

/**
 * One piece of a phase's work, and every time the run did it.
 *
 * A phase entered three times with one agent in it each time is one thing that
 * happened three times, not three things — and drawn as three rows carrying the
 * same word, a reader could not tell which `Develop` was which except by its
 * clock. Folded, it is one row with a mark per pass, and the marks say at a
 * glance which trip failed.
 */
export type Fold = {
  label: string
  /** The pass whose figures the row carries: the last one to have started. */
  agent: AgentRow
  /** Every pass, in entry order. One entry where the work ran once. */
  passes: FoldPass[]
  /**
   * What is behind the row, where the row stands for a whole nested run: how
   * many agents it had in all, and the phase to unfold to see them. A row that
   * hides thirteen agents has to say that it does, or it reads as one agent
   * that was slow — and saying it is where the reader will press to look, so
   * the count carries the phase name the press needs.
   */
  inside?: { agents: number; phase: string; alone?: boolean }
}

/** A phase, folded: its passes counted, its repeated work on one row each. */
export type FoldedLane = {
  phase: string
  index: number
  /** How many times the run entered this phase. */
  entries: number
  folds: Fold[]
  /** Every agent of the phase, whatever the folds show. */
  agents: AgentRow[]
  /** True for a phase that is itself a nested workflow run. */
  nested: boolean
  /** True where the whole phase is drawn as one row, its labels not shown. */
  shut?: boolean
  /**
   * A shut nested run as one made-up row per trip through it.
   *
   * The layouts that draw structure fold a nested run into a single node with a
   * mark per pass, because what they are drawing is where the work sits in the
   * graph. A timeline is drawing *when*, and a run entered three times is three
   * separate stretches of clock with the calling run's own work in the gaps —
   * so one row spanning the first start to the last end would draw a bar over
   * an hour the nested run spent not running.
   */
  spans?: AgentRow[]
}

/** The marker a workflow engine puts in front of a nested run's phase name. */
const NESTED = '\u25b8 '

/**
 * What joins a nested run's name to the number of a step inside it, in the key
 * a press on that step folds and unfolds.
 *
 * The keys a reader has opened are one set, holding both phase names and step
 * keys, so a step key must be a string no phase name can be. A phase name is
 * whatever the workflow called it and the engine already writes `#2` and `#3`
 * on the end of one for the second and third trip through it, so `#` is the one
 * separator that could collide. A null joins them instead: it is in no name any
 * engine writes, and the key is never drawn — it goes into a press and nowhere
 * else.
 *
 * A step key in the set means that step is *folded*, which is the opposite of
 * what a phase name in the same set means. Opening the run used to open only
 * its steps' headings: a reader who pressed `▸` on a fourteen-agent panel got
 * six rows reading `6 at once`, and had to press six more times to see the
 * panel. Opening is one press now — the whole run — and the step keys record
 * the folding a reader has done since, which is the rarer thing to want and so
 * the one worth spending a key on.
 */
const STEP_SHUT = '\u0000'

/**
 * The run as rows: one per piece of work rather than one per agent.
 *
 * `opened` names the nested phases a reader has asked to see inside. A nested
 * workflow is a run of its own — the agentic review panel is fourteen agents
 * with their own fan-out and their own passes — and inlining all of it put
 * another workflow's structure in the middle of this one's, three times over.
 * Shut, it is one row that says how many agents and what they cost; opened, it
 * is the same phase every other phase is.
 */
export function foldedLanes(run: RunState, opened: Set<string> = new Set()): FoldedLane[] {
  const entries = entriesOf(run)

  return lanesOf(run).map((lane, index) => {
    const blocks = entries.get(lane.phase) ?? []
    const nested = lane.phase.startsWith(NESTED)
    const shut = nested && !opened.has(lane.phase) && lane.agents.length > 0
    const base = {
      phase: lane.phase,
      index,
      entries: blocks.length,
      agents: lane.agents,
      nested,
    }

    if (shut) {
      // One row for the whole nested run, with a mark for each time the run
      // entered it. What stands for a pass is the agent that decided it: the
      // last to land, since a sub-run that failed fails at its end.
      const name = lane.phase.slice(NESTED.length)

      return {
        ...base,
        shut: true,
        folds: [
          {
            label: name,
            agent: wholeOf(name, blocks[blocks.length - 1] ?? lane.agents),
            passes: blocks.map((block, at) => ({ index: at + 1, agent: decidedBy(block) })),
            inside: { agents: lane.agents.length, phase: lane.phase },
          },
        ],
        spans: (blocks.length > 0 ? blocks : [lane.agents]).map(block => wholeOf(name, block)),
      }
    }

    const folds = foldsOf(blocks)

    return { ...base, folds: nested ? steppedFolds(lane.phase, blocks, folds, opened) : folds }
  })
}

/**
 * An opened nested run's rows grouped into the steps it took, with a step of
 * several rows standing as one until a reader asks to see inside it.
 *
 * A nested run opened out is the only place in the drawing where one phase
 * holds another workflow's whole shape. The review panel is a claim, a context
 * pass, six reviewers at once, a synthesis and two writes — six steps — and
 * drawn as twelve cards down one column it is twelve things in a row, with
 * nothing saying that six of them happened at the same time. The reader has to
 * read twelve clocks to find that out, and the column is twice as tall as the
 * run it is drawing.
 *
 * So a step of several rows can stand as one row saying how many, and the way
 * inside is the way inside a nested run: the count, pressed. It is the same
 * device one level down, which is the point — a reader who has already opened
 * the run knows what `▸ 6 agents` does.
 *
 * It starts opened, though, and `shut` names the steps a reader has folded
 * since. Starting folded made opening a nested run a partial answer: the press
 * that said *show me this run* produced six rows reading `6 at once` and six
 * more presses between the reader and the run. The fold is for a reader who has
 * seen the run and wants one wide step out of the way, which is a thing they do
 * after looking, not before.
 *
 * Only inside a nested run. A phase of the calling run that fanned out to six
 * agents is six cards because six cards is what the graph is *for*; folding
 * them would leave a drawing of a workflow with no work in it.
 */
function steppedFolds(phase: string, blocks: AgentRow[][], folds: Fold[], shut: Set<string>): Fold[] {
  // The trip that did the most is the one that shows the run's shape. Trips are
  // not alike — a second trip that found nothing to do is a claim, a context
  // pass and a write — so the waves of any one of them would call some other
  // trip's work a step it was never part of. Read off the fullest trip, a row
  // that trip never ran belongs to no step and stands on its own, which is the
  // one thing that is true about it whatever the rest of the run did.
  const spine = blocks.reduce((best, block) => (block.length > best.length ? block : best), [] as AgentRow[])
  const step = new Map<string, number>()

  wavesOf({ agents: spine }).forEach((wave, at) => {
    for (const agent of wave) {
      if (!step.has(agent.label)) {
        step.set(agent.label, at)
      }
    }
  })

  const groups: Fold[][] = []
  let last: number | undefined

  for (const fold of folds) {
    const at = step.get(fold.label)

    if (groups.length === 0 || at === undefined || at !== last) {
      groups.push([])
    }

    groups[groups.length - 1].push(fold)
    last = at
  }

  return groups.flatMap((group, at) => {
    const key = `${phase}${STEP_SHUT}${at}`

    if (group.length < 2 || !shut.has(key)) {
      return group
    }

    // Every agent behind the step, over every trip — the number the row has to
    // say, since that is what a press on it brings into view.
    const behind = group.flatMap(fold => fold.passes.map(pass => pass.agent))
    // The count is of the work, not of the agents: six reviewers run three
    // times over is six things that happened at once, not eighteen. The agents
    // are counted under it, where a nested run counts its own.
    const label = `${group.length} at once`
    const trips = new Map<number, AgentRow[]>()

    for (const fold of group) {
      for (const pass of fold.passes) {
        trips.set(pass.index, [...(trips.get(pass.index) ?? []), pass.agent])
      }
    }

    const passes = [...trips.entries()].sort(([one], [two]) => one - two)
    // The figures are one trip's, the way every folded row's are: the last trip
    // through, since that is the state the run finished in. Read off all three
    // at once the clock would run from the first trip's start to the last one's
    // end — three quarters of an hour for six agents that took a minute, most
    // of it the calling run doing something else entirely.
    const latest = passes[passes.length - 1]?.[1] ?? behind

    return [
      {
        label,
        agent: wholeOf(label, latest),
        passes: passes.map(([index, block]) => ({ index, agent: decidedBy(block) })),
        inside: { agents: behind.length, phase: key, alone: true },
      },
    ]
  })
}

/**
 * One block of a nested run as a single agent: the span it took, what it spent
 * in all, and the state it came back in.
 *
 * It is a made-up row, and it says so by carrying the workflow's name rather
 * than any agent's. Its id is the id of the agent that decided the block, so
 * pressing it opens that agent's own detail — the one a reader wants when a
 * sub-run comes back red — and every wire drawn to the block lands on it.
 *
 * Made rather than aggregated at the drawing: a clock, a spend and a model tag
 * are read off an `AgentRow` by four different parts of the painter, and a row
 * that had to be special-cased in each of them would be a row that agrees with
 * the ones around it in three places out of four.
 */
function wholeOf(label: string, block: AgentRow[]): AgentRow {
  const decided = decidedBy(block)
  const ended = block.every(a => a.endedMs !== undefined)

  return {
    ...decided,
    label,
    tools: [],
    startedMs: Math.min(...block.map(a => a.startedMs)),
    ...(ended ? { endedMs: Math.max(...block.map(a => a.endedMs ?? a.startedMs)) } : { endedMs: undefined }),
    ...(spentIn(block) === undefined ? {} : { tokens: spentIn(block) }),
    liveTokens: undefined,
    calls: undefined,
    resultPreview: undefined,
    result: undefined,
    prompt: undefined,
  }
}

/** What a set of agents spent in all, where any of them has said. */
function spentIn(agents: AgentRow[]): number | undefined {
  const known = agents.map(a => a.tokens ?? a.liveTokens).filter((n): n is number => n !== undefined)

  return known.length > 0 ? known.reduce((sum, n) => sum + n, 0) : undefined
}

/**
 * The agent a block of work is judged by: the one that failed, or the last to
 * land.
 *
 * A nested run drawn as one mark has to say whether that trip through it came
 * back clean, and one agent of fourteen failing is the whole trip failing —
 * that is what the outer workflow does with it. So a failure anywhere in the
 * block is what the mark reports, and a block that came back clean reports the
 * agent that closed it.
 */
function decidedBy(block: AgentRow[]): AgentRow {
  const failed = block.find(a => a.state === 'failed')

  if (failed) {
    return failed
  }

  const running = block.find(a => a.state === 'running')

  return running ?? [...block].sort((a, b) => (a.endedMs ?? a.startedMs) - (b.endedMs ?? b.startedMs)).pop() ?? block[0]
}

/**
 * A phase's blocks folded by label: one row per piece of work, in the order the
 * work first appeared.
 *
 * Two agents of one label inside a single entry are two different things that
 * happened at once — a fan-out that reuses a name — and they stay two rows. It
 * is across entries that a shared label means a repeat, because an entry is a
 * trip round the loop and the trip is what repeated.
 */
function foldsOf(blocks: AgentRow[][]): Fold[] {
  const folds = new Map<string, Fold>()

  for (const block of blocks) {
    const taken = new Map<string, Fold[]>()

    for (const agent of [...block].sort((a, b) => a.startedMs - b.startedMs)) {
      const open = taken.get(agent.label) ?? []
      // Inside one entry a label can mean two different things. A gate that
      // failed and was run again is the same work a second time and joins the
      // row it repeats; two agents of one name running side by side are a
      // fan-out that reuses the name, and each takes a row of its own. What
      // tells them apart is the clock: a repeat cannot have begun until the
      // thing it repeats had landed.
      const after = open.find(f => started(f.agent, agent))

      if (after) {
        after.passes.push({ index: after.passes.length + 1, agent })
        after.agent = agent

        continue
      }

      const fold = folds.get(`${agent.label}\u0000${open.length}`)

      if (fold) {
        fold.passes.push({ index: fold.passes.length + 1, agent })
        fold.agent = agent
        open.push(fold)
      } else {
        const made = { label: agent.label, agent, passes: [{ index: 1, agent }] }

        folds.set(`${agent.label}\u0000${open.length}`, made)
        open.push(made)
      }

      taken.set(agent.label, open)
    }
  }

  return [...folds.values()]
}

/** True where the second agent could only have begun once the first had landed. */
function started(before: AgentRow, after: AgentRow): boolean {
  const SLACK = 250

  return before.endedMs !== undefined && after.startedMs + SLACK >= before.endedMs
}

/** The tokens of a label, split on the separators workflow labels use. */
function tokensOf(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[:/\-_\s.]+/)
    .filter(t => t.length > 1)
}

/** How many agents of a lane carry each label token. */
function countIn(agents: AgentRow[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const a of agents) {
    for (const t of new Set(tokensOf(a.label))) {
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }

  return counts
}

/**
 * Pairs each agent with the one that named it — the agent of an earlier lane
 * whose label shares a token no other agent of that lane has.
 *
 * Uniqueness is asked of the source only. One agent feeding several is the
 * ordinary shape of a run: a `pipeline()` stage that opens three lenses on one
 * file writes `review:paint:correctness`, `review:paint:edges` and
 * `review:paint:drift`, and all three do come from `survey:paint`. Asking the
 * target side to be unique too refused every one of those, which left the lane
 * where the work fans out — the lane a reader most wants explained — with no
 * edges at all.
 *
 * The search walks back a lane at a time and stops at the first lane that has
 * anything to say about the target:
 *
 * - one agent holds the token: that is the source, and the edge is drawn;
 * - several hold it: the source is in this lane and the labels cannot say
 *   which, so nothing is drawn. The barrier between the phases already says
 *   the weaker thing that is still true;
 * - none hold it: keep walking. A `pipeline()` that branches sends one file to
 *   `Review` and another to `Check`, so the lane a node follows is not always
 *   the lane in front of it.
 */
export function carriesOf(run: RunState): Carry[] {
  const lanes = lanesOf(run)
  const carries: Carry[] = []

  for (let i = 1; i < lanes.length; i++) {
    for (const target of lanes[i].agents) {
      const tokens = tokensOf(target.label)

      for (let j = i - 1; j >= 0; j--) {
        const from = lanes[j].agents

        if (from.length === 0) {
          continue
        }

        const counts = countIn(from)
        const match = tokens.find(t => (counts.get(t) ?? 0) > 0)

        if (match === undefined) {
          continue
        }

        const source = counts.get(match) === 1
          ? from.find(a => tokensOf(a.label).includes(match))
          : undefined

        if (source) {
          carries.push({ fromId: source.agentId, toId: target.agentId })
        }

        break
      }
    }
  }

  return carries
}

/**
 * True when the carries between two lanes account for the barrier between them,
 * which is the shape `pipeline()` makes: every agent of the later lane has a
 * named source in the earlier one, and every agent of the earlier one feeds
 * something. Nothing crosses unexplained, so the bus can step back and let the
 * carries draw.
 *
 * Counting edges instead of covering both sides got this wrong as soon as a
 * stage fanned out: three lenses on each of five files is fifteen carries over
 * five sources, which is fully accounted for and not equal to either count.
 */
export function isPipelineLike(
  lane: { agents: AgentRow[] },
  next: { agents: AgentRow[] },
  carries: Carry[],
): boolean {
  if (lane.agents.length < 2 || next.agents.length < 2) {
    return false
  }

  const sources = new Set<string>()
  const targets = new Set<string>()

  for (const c of carries) {
    if (
      lane.agents.some(a => a.agentId === c.fromId) &&
      next.agents.some(a => a.agentId === c.toId)
    ) {
      sources.add(c.fromId)
      targets.add(c.toId)
    }
  }

  return sources.size === lane.agents.length && targets.size === next.agents.length
}
