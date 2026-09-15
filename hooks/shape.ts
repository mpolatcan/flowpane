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
export function orderedLanes(run: RunState): { phase: string; agents: AgentRow[] }[] {
  const lanes = lanesOf(run)
  const edges = edgesOf(run)

  for (let i = 1; i < lanes.length; i++) {
    const above = new Map(lanes[i - 1].agents.map((a, index) => [a.agentId, index]))
    const arrival = new Map(lanes[i].agents.map((a, index) => [a.agentId, index]))
    const ties = tiesOf(lanes[i].agents, above, edges)

    const rankOf = (a: AgentRow) => {
      const row = ties.above.get(a.agentId)

      // Carried nodes take their source's row; the rest sit below, in the order
      // they arrived, so an added agent never reshuffles the ones above it.
      return row === undefined
        ? lanes[i - 1].agents.length + (arrival.get(a.agentId) ?? 0)
        : (above.get(row) ?? 0)
    }

    lanes[i].agents = [...lanes[i].agents].sort(
      (a, b) =>
        rankOf(a) - rankOf(b) ||
        (ties.depth.get(a.agentId) ?? 0) - (ties.depth.get(b.agentId) ?? 0) ||
        (arrival.get(a.agentId) ?? 0) - (arrival.get(b.agentId) ?? 0),
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
 */
function tiesOf(
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
 * A loop shows from outside as several agents of one phase doing the same piece
 * of work: the audit's review phase opens a fresh lens on one file until a pass
 * comes back empty, and each pass is its own agent. They are recognised by what
 * fed them — agents of one phase that trace back to the same source, either
 * through an edge inside the phase or from the same agent in the phase above.
 *
 * Running side by side disqualifies them. Three lenses opened at once are a
 * fan-out, not a loop, and calling them passes would say the run did the same
 * work three times when it did three different things once. A loop's passes are
 * sequential by construction: the next one is what the last one's answer asked
 * for.
 */
export function passesOf(run: RunState): Map<string, Pass> {
  const lanes = orderedLanes(run)
  const edges = edgesOf(run)
  const passes = new Map<string, Pass>()

  for (let i = 0; i < lanes.length; i++) {
    const above = new Map((lanes[i - 1]?.agents ?? []).map((a, index) => [a.agentId, index]))
    const ties = tiesOf(lanes[i].agents, above, edges)
    const groups = new Map<string, AgentRow[]>()

    for (const agent of lanes[i].agents) {
      const key = ties.above.get(agent.agentId) ?? `self:${agent.agentId}`

      groups.set(key, [...(groups.get(key) ?? []), agent])
    }

    for (const group of groups.values()) {
      const order = [...group].sort((a, b) => a.startedMs - b.startedMs)

      if (order.length < 2 || !inSequence(order)) {
        continue
      }

      order.forEach((agent, index) => passes.set(agent.agentId, { index: index + 1, total: order.length }))
    }
  }

  return passes
}

/**
 * A phase's agents in the order they ran, where they ran one at a time — and
 * nothing where they overlapped.
 *
 * Agents of a phase that overlap are a fan: whatever the phase before produced
 * was there for all of them at once, and a line from each source into each of
 * them is the truth about how the work reached them. Agents that ran one after
 * another are a chain. The second could not have begun until the first had
 * landed, so what it was given includes what the first answered, and a drawing
 * that feeds every one of them from the phase above says the phase started them
 * together — which the two clocks on their own cards disprove.
 *
 * Nothing for a phase of one, which is neither.
 */
export function chainOf(lane: { agents: AgentRow[] }): AgentRow[] | null {
  if (lane.agents.length < 2) {
    return null
  }

  const order = [...lane.agents].sort((a, b) => a.startedMs - b.startedMs)

  return inSequence(order) ? order : null
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

/** The run's agents grouped by phase, in the phase order the run reports. */
export function lanesOf(run: RunState): { phase: string; agents: AgentRow[] }[] {
  const order = run.phases.length > 0 ? run.phases : []
  const seen = new Set<string>()
  const lanes: { phase: string; agents: AgentRow[] }[] = []

  const push = (phase: string) => {
    if (seen.has(phase)) {
      return
    }

    seen.add(phase)
    lanes.push({ phase, agents: run.agents.filter(a => a.phase === phase) })
  }

  order.forEach(push)
  run.agents.forEach(a => push(a.phase))

  // A phase the script declared but no agent ever entered still draws, so a
  // run in flight shows what is still ahead of it.
  return lanes
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
