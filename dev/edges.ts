/**
 * The graph the pane derives for a finished run, as text.
 *
 * Nothing records a workflow's edges, so the pane reads them off the agents'
 * own answers and, where that comes up empty, off their labels. This prints
 * what it concluded and how it concluded it — which is the only way to check
 * an inference against a run you remember.
 *
 *   bun dev/edges.ts ~/.claude/projects/<project>/<session>/subagents/workflows/<runId>
 */

import {
  applyJournal,
  applyRunFile,
  readAgentTranscript,
  runFileOf,
  type RunState,
} from '../hooks/journal'
import { carriesOf, edgesOf, flowsOf, follows, isPipelineLike, lanesOf, passesOf, skipsOf } from '../hooks/shape'

const dir = process.argv[2]

if (!dir) {
  console.error('usage: bun dev/edges.ts <transcript dir>')
  process.exit(1)
}

const runId = dir.replace(/\/$/, '').split('/').pop() ?? 'wf'
const run = {
  runId,
  name: runId,
  status: 'running',
  agents: [],
  phases: [],
  startedMs: 0,
  logs: [],
} as unknown as RunState

run.transcriptDir = dir
run.runFile = runFileOf(dir, runId)

const now = Date.now()

applyJournal(run, await Bun.file(`${dir}/journal.jsonl`).text(), now)

const summary = Bun.file(run.runFile)

if (await summary.exists()) {
  applyRunFile(run, await summary.text(), now)
}

// The proven edges are read off the prompts and the answers, which live in the
// agents' own transcripts rather than in the journal.
for (const agent of run.agents) {
  const file = Bun.file(`${dir}/agent-${agent.agentId}.jsonl`)

  if (await file.exists()) {
    const read = readAgentTranscript(await file.text())

    agent.prompt = read.prompt ?? agent.prompt
    agent.result = read.result ?? agent.result
  }
}

const labelOf = new Map(run.agents.map(a => [a.agentId, a.label]))
const name = (id: string) => labelOf.get(id) ?? id
const lanes = lanesOf(run)

console.log(`${runId}  ${run.agents.length} agents in ${lanes.length} phases\n`)

lanes.forEach((lane, index) => {
  console.log(`${String(index).padStart(2)} ${lane.phase.padEnd(12)} ${lane.agents.map(a => a.label).join('  ')}`)
})

const flows = flowsOf(run)

console.log(`\nproven by the text  ${flows.length}`)

for (const e of flows) {
  console.log(`   ${name(e.fromId)} -> ${name(e.toId)}`)
}

const carries = carriesOf(run)

console.log(`\nread off the labels  ${carries.length}`)

for (const e of carries) {
  console.log(`   ${name(e.fromId)} -> ${name(e.toId)}`)
}

const drawn = edgesOf(run)

console.log(`\ndrawn  ${drawn.length}  (the rest are covered by a longer path)`)

for (const e of drawn) {
  console.log(`   ${e.confirmed ? 'solid ' : 'dashed'}  ${name(e.fromId)} -> ${name(e.toId)}`)
}

console.log('\nbarriers')

for (let i = 1; i < lanes.length; i++) {
  const after = follows(lanes[i - 1], lanes[i])
  const carried = isPipelineLike(lanes[i - 1], lanes[i], drawn)

  const empty = lanes[i - 1].agents.length === 0 || lanes[i].agents.length === 0

  console.log(
    `   ${lanes[i - 1].phase} -> ${lanes[i].phase}  ${
      empty
        ? 'a phase with no agents, nothing to join'
        : !after
          ? 'ran alongside, no barrier'
          : carried
            ? 'every crossing named'
            : 'drawn as a bus'
    }`,
  )
}

for (const skip of skipsOf(run)) {
  console.log(`   ${lanes[skip.fromLane]?.phase} -> ${lanes[skip.toLane]?.phase}  ${skip.count} skipping a lane`)
}

const passes = passesOf(run)

if (passes.size > 0) {
  console.log('\npasses')

  for (const lane of lanes) {
    const looped = lane.agents.filter(a => passes.has(a.agentId))

    if (looped.length > 0) {
      console.log(
        `   ${lane.phase}  ${looped
          .map(a => `${a.label} ${passes.get(a.agentId)?.index}/${passes.get(a.agentId)?.total}`)
          .join('  ')}`,
      )
    }
  }
} else {
  console.log('\npasses  none: no phase did the same piece of work twice')
}
