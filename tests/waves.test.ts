/**
 * How a phase's agents group into waves, and the tolerance that decides it.
 *
 * The waves are what say whether a phase is a fan, a chain or something in
 * between, and the drawing takes a line into the first wave and a line out of
 * the last on their word. The grouping turns on one number — how much slack two
 * clocks are allowed before they count as consecutive rather than concurrent —
 * so it is pinned from both sides: agents that overlapped are one wave, and
 * agents that merely met at the ends are two.
 */

import { expect, test } from 'claude-code/testing'

import type { AgentRow } from '../hooks/journal'
import { chainOf, wavesOf } from '../hooks/shape'

const STARTED = 1_700_000_000_000

function agentOf(id: string, from: number, ms?: number): AgentRow {
  return {
    agentId: id,
    label: id,
    phase: 'Collect',
    state: ms === undefined ? 'running' : 'done',
    startedMs: STARTED + from,
    endedMs: ms === undefined ? undefined : STARTED + from + ms,
    tools: [],
  }
}

test('two agents started a tenth of a second apart are one wave', () => {
  const waves = wavesOf({ agents: [agentOf('a', 0, 5_000), agentOf('b', 100, 4_900)] })

  // A `parallel` starts its agents in a loop, so two that went together are
  // stamped milliseconds apart rather than at the same instant. Read strictly,
  // the fan they draw becomes a chain of two.
  expect(waves.length).toBe(1)
  expect(waves[0].map(a => a.agentId).join(',')).toBe('a,b')
})

test('an agent that started as the one before it was ending is a wave of its own', () => {
  const waves = wavesOf({ agents: [agentOf('a', 0, 1_000), agentOf('b', 900, 1_000)] })

  // The other side of the same tolerance: an agent that began inside the last
  // breath of the one before it waited on it, and a phase of those is a chain.
  expect(waves.map(w => w.map(a => a.agentId).join(',')).join(' | ')).toBe('a | b')
})

test('an agent still running takes everything started after it into its wave', () => {
  const waves = wavesOf({ agents: [agentOf('a', 0), agentOf('b', 100, 200)] })

  // An agent that has not landed runs to the end of the run as far as anything
  // after it is concerned.
  expect(waves.length).toBe(1)
})

test('agents that ran one after another are one wave each', () => {
  const waves = wavesOf({
    agents: [agentOf('a', 0, 1_000), agentOf('b', 2_000, 1_000), agentOf('c', 4_000, 1_000)],
  })

  expect(waves.map(w => w.length).join(',')).toBe('1,1,1')
})

/**
 * The three answers `chainOf` gives, against the one thing the drawing does
 * with them: a chain is the only shape whose agents pair off one for one, so it
 * is the only shape a hop from each pass to the next can be drawn for.
 */
test('a phase of one agent is not a chain', () => {
  // Neither a chain nor a fan, and nothing to draw a hop between. Read as a
  // chain it would be a wire from an agent to itself.
  expect(chainOf({ agents: [agentOf('a', 0, 1_000)] })).toBeNull()
})

test('agents that ran one after another are a chain, in the order they ran', () => {
  const chain = chainOf({ agents: [agentOf('b', 2_000, 1_000), agentOf('a', 0, 1_000)] })

  // Given in the order the journal happened to list them and returned in the
  // order they ran: the pairing is what the wires are drawn from, so a chain
  // handed back in the wrong order draws the run backwards.
  expect((chain ?? []).map(a => a.agentId).join(',')).toBe('a,b')
})

test('agents that overlapped are not a chain', () => {
  const fan = chainOf({ agents: [agentOf('a', 0, 5_000), agentOf('b', 100, 4_900)] })

  // The other half of the same question. A fan's agents hand work to nobody,
  // and a hop drawn between two of them says one waited on the other.
  expect(fan).toBeNull()
})

test('an agent that started while a longer one was still going joins its wave', () => {
  const waves = wavesOf({
    agents: [agentOf('survey', 0, 10_000), agentOf('quick', 1_000, 1_000), agentOf('late', 3_000, 1_000)],
  })

  // The wave runs to the furthest its agents reach, not to the end of whichever
  // of them landed last. A short agent inside a long one lands first, and a
  // wave closed at that end calls everything after it a second wave — so a
  // phase where one agent ran for a minute and three others came and went
  // inside that minute drew four waves, with a gutter of wire between each.
  expect(waves.length).toBe(1)
  expect(waves[0].map(a => a.agentId).join(',')).toBe('survey,quick,late')
})
