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

  return [...flows, ...carriesOf(run).filter(c => !proven.has(`${c.fromId}>${c.toId}`))]
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
    // A node may be fed from several lanes back; only the lane directly above
    // can place it in a row, and a proven edge outranks a guessed one.
    const sourceOf = new Map<string, string>()

    for (const e of [...edges].sort((a, b) => Number(!!b.confirmed) - Number(!!a.confirmed))) {
      if (above.has(e.fromId) && !sourceOf.has(e.toId)) {
        sourceOf.set(e.toId, e.fromId)
      }
    }

    const rankOf = (a: AgentRow) => {
      const source = sourceOf.get(a.agentId)
      const row = source === undefined ? undefined : above.get(source)

      // Carried nodes take their source's row; the rest sit below, in the order
      // they arrived, so an added agent never reshuffles the ones above it.
      return row === undefined
        ? lanes[i - 1].agents.length + (arrival.get(a.agentId) ?? 0)
        : row
    }

    lanes[i].agents = [...lanes[i].agents].sort((a, b) => rankOf(a) - rankOf(b))
  }

  return lanes
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

/**
 * Pairs each agent of a lane with one of the lane before it, where their
 * labels share a token that is unique to that pair.
 *
 * A token shared by several agents on either side says nothing (every row of a
 * `review:*` lane shares `review`), so only tokens appearing once per side are
 * evidence, and only a pair that agrees on such a token carries.
 */
export function carriesOf(run: RunState): Carry[] {
  const lanes = lanesOf(run)
  const carries: Carry[] = []

  for (let i = 1; i < lanes.length; i++) {
    const from = lanes[i - 1].agents
    const to = lanes[i].agents

    if (from.length === 0 || to.length === 0) {
      continue
    }

    const countIn = (agents: AgentRow[]) => {
      const counts = new Map<string, number>()

      for (const a of agents) {
        for (const t of new Set(tokensOf(a.label))) {
          counts.set(t, (counts.get(t) ?? 0) + 1)
        }
      }

      return counts
    }

    const fromCounts = countIn(from)
    const toCounts = countIn(to)
    const taken = new Set<string>()

    for (const target of to) {
      const match = tokensOf(target.label).find(
        t => fromCounts.get(t) === 1 && toCounts.get(t) === 1,
      )

      if (!match) {
        continue
      }

      const source = from.find(a => tokensOf(a.label).includes(match))

      if (!source || taken.has(source.agentId)) {
        continue
      }

      taken.add(source.agentId)
      carries.push({ fromId: source.agentId, toId: target.agentId })
    }
  }

  return carries
}

/**
 * True when every agent of the lane before it carries into the next one, which
 * is the shape `pipeline()` makes: the barrier is real but every crossing of it
 * is accounted for, so the bus can step back and let the carries draw.
 */
export function isPipelineLike(
  lane: { agents: AgentRow[] },
  next: { agents: AgentRow[] },
  carries: Carry[],
): boolean {
  if (lane.agents.length < 2 || next.agents.length < 2) {
    return false
  }

  const crossing = carries.filter(c =>
    lane.agents.some(a => a.agentId === c.fromId) &&
    next.agents.some(a => a.agentId === c.toId),
  )

  return crossing.length === Math.min(lane.agents.length, next.agents.length)
}
