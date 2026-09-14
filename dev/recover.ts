/**
 * Checks the run-recovery walk outside Claude Code: given a session id, find the
 * runs the way `recoverRuns` does, and report what it would rebuild.
 *
 *   bun dev/recover.ts <sessionId>
 */

import { applyJournal, applyRunFile, runFileOf, type RunState } from '../hooks/journal'

const sessionId = process.argv[2]
const home = process.env.HOME
const projects = `${home}/.claude/projects`
const runs: RunState[] = []

for (const entry of await Array.fromAsync(new Bun.Glob('*').scan({ cwd: projects, onlyFiles: false }))) {
  const base = `${projects}/${entry}/${sessionId}`
  const dir = `${base}/workflows`

  if (!(await Bun.file(`${dir}`).exists()) && !(await Bun.file(`${dir}/.`).exists())) {
    // Bun.file on a directory is unreliable; try listing instead.
  }

  let names: string[] = []

  try {
    names = await Array.fromAsync(new Bun.Glob('*.json').scan({ cwd: dir }))
  } catch {
    continue
  }

  for (const name of names) {
    const runId = name.replace(/\.json$/, '')
    const run: RunState = {
      runId,
      name: runId,
      summary: '',
      transcriptDir: `${base}/subagents/workflows/${runId}`,
      runFile: `${dir}/${name}`,
      startedMs: 0,
      status: 'running',
      phases: [],
      agents: [],
      consumed: 0,
    }

    const text = await Bun.file(run.runFile).text()

    applyRunFile(run, text, Date.now())
    run.name = JSON.parse(text).workflowName ?? runId

    const journal = Bun.file(`${run.transcriptDir}/journal.jsonl`)

    if (await journal.exists()) {
      applyJournal(run, await journal.text(), Date.now())
    }

    runs.push(run)
  }

  if (names.length > 0) {
    break
  }
}

runs.sort((a, b) => a.startedMs - b.startedMs)

// The plugin brings back only what is still running; the rest is listed here
// so the walk itself can be checked, marked as what the plugin would skip.
for (const run of runs) {
  const landed = run.agents.filter(a => a.state === 'done' || a.state === 'failed').length

  console.log(
    `${run.status === 'running' ? 'recover' : 'skip   '}  ${run.name.padEnd(16)} ${run.runId}  ${run.status.padEnd(9)} ${landed}/${run.agents.length} agents`,
  )
}

const live = runs.filter(r => r.status === 'running').length

console.log(`\n${live} running run(s) would be recovered; ${runs.length - live} finished or stopped, left alone`)
