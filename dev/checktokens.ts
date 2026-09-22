/**
 * Holds the figure a node shows while an agent runs to the one the engine puts
 * on the same agent when the run ends.
 *
 * The pane learns an agent's spend twice: live, from the `usage` on every model
 * request `turn.step` streams past it, and once at the end from the run
 * summary's own per-agent `tokens`. The two have to land on the same number, or
 * a reader watching a node climb sees it jump when the run finishes.
 *
 * They did not. The live figure added the four usage counts of every request
 * together, which counts the same cached context once per request: an agent
 * that made eleven requests over a twenty-thousand-token context read
 * `∑ 224k` against the engine's `21.3k`.
 *
 * This replays every transcript on disk through the real path — `contextOfUsage`
 * and `noteStep`, the two functions the hook calls — and compares what the pane
 * would have shown against what the summary says. The whole machine rather than
 * this project's own runs: the cases that matter are rare, and a corpus of
 * thirty runs holds none of them.
 *
 *   bun dev/checktokens.ts          # this project's runs
 *   bun dev/checktokens.ts --all    # every run on this machine
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { contextOfUsage, noteStep, runFileOf, type RunState } from '../hooks/journal'
import { runDirs } from './load'

/** How far out a figure has to be before it is worth a reader's attention. */
const LOOSE = 0.05

/** Every run directory on the machine, not only this project's. */
function everyRun(): string[] {
  const projects = join(process.env.HOME ?? '', '.claude/projects')

  if (!existsSync(projects)) {
    return []
  }

  return readdirSync(projects).flatMap(project => {
    const root = join(projects, project)
    let sessions: string[] = []

    try {
      sessions = readdirSync(root)
    } catch {
      return []
    }

    return sessions.flatMap(id => {
      const at = join(root, id, 'subagents/workflows')

      if (!existsSync(at)) {
        return []
      }

      try {
        return readdirSync(at).filter(d => d.startsWith('wf_')).map(d => join(at, d))
      } catch {
        return []
      }
    })
  })
}

const dirs = process.argv.includes('--all') ? everyRun() : runDirs()
const offs: number[] = []
const loose: string[] = []
let agents = 0
let runs = 0

for (const dir of dirs) {
  const runId = dir.split('/').pop() ?? 'wf'
  const file = runFileOf(dir, runId)

  if (!existsSync(file)) {
    continue
  }

  let summary: { workflowProgress?: { type?: string; agentId?: string; label?: string; tokens?: number }[] }

  try {
    summary = JSON.parse(await Bun.file(file).text())
  } catch {
    continue
  }

  const rows = (summary.workflowProgress ?? []).filter(
    row => row.type === 'workflow_agent' && typeof row.tokens === 'number' && row.agentId,
  )

  if (rows.length === 0) {
    continue
  }

  runs++

  for (const row of rows) {
    const transcript = join(dir, `agent-${row.agentId}.jsonl`)

    if (!existsSync(transcript)) {
      continue
    }

    // One agent, fed the way the `turn.step` hook feeds it.
    const run: RunState = {
      runId,
      name: runId,
      summary: '',
      transcriptDir: dir,
      runFile: file,
      startedMs: 0,
      status: 'running',
      phases: [],
      consumed: 0,
      agents: [
        {
          agentId: row.agentId as string,
          label: row.label ?? '',
          phase: 'phase',
          state: 'running',
          startedMs: 0,
          tools: [],
        },
      ],
    }

    let seen = 0

    for (const line of (await Bun.file(transcript).text()).split('\n')) {
      if (!line.trim()) {
        continue
      }

      let record: { message?: { usage?: Record<string, number> } }

      try {
        record = JSON.parse(line)
      } catch {
        continue
      }

      const usage = record.message?.usage

      if (!usage) {
        continue
      }

      seen++
      noteStep(run, row.agentId as string, 0, { kind: 'start' })
      noteStep(run, row.agentId as string, 0, {
        kind: 'stop',
        tokens: contextOfUsage(usage),
        output: usage.output_tokens,
      })
    }

    if (seen === 0) {
      continue
    }

    agents++

    const engine = row.tokens as number
    const live = run.agents[0].liveTokens ?? 0
    const off = Math.abs(engine - live) / Math.max(1, engine)

    offs.push(off)

    if (off > LOOSE) {
      loose.push(
        `${runId} ${row.label}: engine ${engine}  pane ${live}  ${(100 * off).toFixed(1)}% out`,
      )
    }
  }
}

offs.sort((a, b) => a - b)

const at = (p: number) => `${(100 * (offs[Math.floor(p * (offs.length - 1))] ?? 0)).toFixed(2)}%`

console.log(`${agents} agents over ${runs} runs with a summary to check against`)
console.log(`live against the summary: p50 ${at(0.5)}  p95 ${at(0.95)}  worst ${at(1)}`)
console.log(`more than ${100 * LOOSE}% out: ${loose.length}`)

// The ones that are out are all retries: the engine's figure for an agent it
// ran twice covers both tries and the transcript keeps only the last. They are
// listed rather than counted, so a new kind of miss is not lost among them.
for (const line of loose) {
  console.log(`  ${line}`)
}
