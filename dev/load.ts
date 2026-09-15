/**
 * The runs the developer tools draw: one replayed from a real transcript
 * directory, or a synthetic one shaped like the canonical pipeline.
 *
 * `preview.ts` and `shot.ts` both need a `RunState` built the way the plugin
 * builds one — journal first, summary over it, then each agent's own
 * transcript for the prompt, the answer and the calls — and a second reader
 * that drifted from this one would show a drawing no session ever draws.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  applyJournal,
  applyRunFile,
  noteToolCall,
  phasesOfScript,
  readAgentMeta,
  readAgentTranscript,
  runFileOf,
  type RunState,
  type RunStatus,
} from '../hooks/journal'

import type { RunEntry } from '../hooks/paint'

export function emptyRun(name: string, phases: string[]): RunState {
  return {
    runId: 'wf_preview',
    name,
    summary: '',
    transcriptDir: '',
    runFile: '',
    startedMs: 0,
    status: 'running',
    phases,
    agents: [],
    consumed: 0,
  }
}

/**
 * A run shaped like the canonical review/verify pipeline, for the synthetic
 * view. `hushed` turns the thinking agent into one nothing has been heard from
 * for most of a minute, which is what the quiet warning is for.
 */
export function syntheticRun(atMs: number, hushed = false): RunState {
  const run = emptyRun('review-changes', ['Review', 'Verify', 'Report'])

  const MODELS: Record<string, string> = {
    Review: 'claude-sonnet-5',
    Verify: 'claude-haiku-4-5-20251001',
    Report: 'claude-opus-5[1m]',
  }

  const add = (
    label: string,
    phase: string,
    startedMs: number,
    tookMs: number | null,
    result?: string,
    failed = false,
  ) => {
    const ended = tookMs === null ? undefined : startedMs + tookMs

    if (startedMs > atMs) {
      return
    }

    run.agents.push({
      agentId: label,
      label,
      phase,
      state: ended !== undefined && ended <= atMs ? (failed ? 'failed' : 'done') : 'running',
      startedMs,
      endedMs: ended !== undefined && ended <= atMs ? ended : undefined,
      resultPreview: ended !== undefined && ended <= atMs ? result : undefined,
      tokens: ended !== undefined && ended <= atMs ? 14_000 + label.length * 900 : undefined,
      model: MODELS[phase],
      tools: [],
    })
  }

  add('review:bugs', 'Review', 0, 5200, '3 findings')
  add('review:perf', 'Review', 0, 7100, '1 finding')
  add('review:tests', 'Review', 0, 3900, 'no findings')
  add('verify:bugs', 'Verify', 5300, 4200, 'confirmed 2/3')
  add('verify:perf', 'Verify', 7200, null)
  add('verify:tests', 'Verify', 4000, 2600, 'nothing to verify', true)
  add('report', 'Report', 11_600, null)

  run.startedMs = 0
  run.defaultModel = 'claude-opus-5[1m]'

  // What the hook chain adds to a live run: a request streaming, its cost so
  // far, a tool under way, and one agent that has gone quiet.
  for (const agent of run.agents) {
    if (agent.state !== 'running') {
      continue
    }

    agent.steps = 2
    agent.liveTokens = 9_400 + agent.label.length * 300
    agent.activeMs = agent.startedMs

    if (agent.label === 'verify:perf') {
      agent.isThinking = true
      agent.saying = 'The hot path allocates a new array per request; the fix is to hoist'
    }

    if (agent.label === 'verify:bugs') {
      noteToolCall(run, agent.agentId, 'Read', atMs, true)
    }
  }

  // The detail dialog's call list, on the agents that have landed.
  for (const agent of run.agents) {
    if (agent.state === 'running') {
      continue
    }

    agent.steps = 3
    agent.calls = [
      { id: 'c1', name: 'Grep', input: 'TODO|FIXME src/', startedMs: agent.startedMs + 200, endedMs: agent.startedMs + 350, step: 1, stepTokens: 4200, result: '12 matches in 4 files' },
      { id: 'c2', name: 'Read', input: 'src/server/handler.ts', startedMs: agent.startedMs + 400, endedMs: agent.startedMs + 480, step: 2, stepTokens: 6100, result: 'export async function handle(req) {' },
      { id: 'c3', name: 'Bash', input: 'bun test src/server', startedMs: agent.startedMs + 900, endedMs: agent.startedMs + 2600, step: 2, stepTokens: 6100, result: '3 pass, 1 fail', isError: agent.state === 'failed' },
      { id: 'c4', name: 'Read', input: 'src/server/routes.ts', startedMs: agent.startedMs + 2700, endedMs: agent.startedMs + 2750, step: 3, stepTokens: 8800, result: 'const routes = [' },
    ]
    agent.prompt = `Review the recent changes under src/server for ${agent.label.split(':')[1] ?? 'issues'}. Report each finding with file and line, and say how confident you are.`
  }

  const quiet = run.agents.find(a => a.label === 'verify:perf')

  if (quiet && quiet.state === 'running' && hushed) {
    quiet.isThinking = false
    quiet.saying = undefined
    quiet.startedMs = atMs - 50_000
    quiet.activeMs = quiet.startedMs
  }

  return run
}

export async function journalRun(dir: string): Promise<RunState> {
  const runId = dir.replace(/\/$/, '').split('/').pop() ?? 'wf'
  const run = emptyRun(runId, [])

  // The directory is the run: a replayed run answers to the same id a live one
  // would, so the menu's entry for the run on screen points back at it.
  run.runId = runId
  run.transcriptDir = dir
  run.runFile = runFileOf(dir, runId)

  // A live session names every phase the moment the run launches, because the
  // launch event carries the script and the script declares them. A replay has
  // no event, so it reads the copy the engine persists beside the run —
  // without this the pane draws only the phases something has already entered,
  // and the phases still ahead are missing rather than pending.
  run.plan = phasesOfScript(await scriptOf(dir, runId))
  run.phases = run.plan.map(step => step.title)

  const journal = await Bun.file(`${dir}/journal.jsonl`).text()
  const now = Date.now()

  applyJournal(run, journal, now)

  const summaryFile = Bun.file(run.runFile)
  const timed = await summaryFile.exists()

  if (timed) {
    applyRunFile(run, await summaryFile.text(), now)
    run.name = runId
  } else {
    run.startedMs = Math.min(...run.agents.map(a => a.startedMs), now)
  }

  // The model comes from the file the engine writes at spawn, the same way the
  // live pane reads it — without this a preview of a run whose summary is not
  // written yet shows no model anywhere, which is the thing to look at.
  for (const agent of run.agents) {
    const meta = Bun.file(`${dir}/agent-${agent.agentId}.meta.json`)

    if (!agent.model && (await meta.exists())) {
      agent.model = readAgentMeta(await meta.text())
    }
  }

  // The detail dialog reads an agent's own transcript for its prompt and answer;
  // the preview does the same so it can be seen without a live session.
  for (const agent of run.agents) {
    const file = Bun.file(`${dir}/agent-${agent.agentId}.jsonl`)

    if (await file.exists()) {
      const read = readAgentTranscript(await file.text())

      // The engine writes the run's summary — the only place its clock lands —
      // when the run ends, so a preview of a run still going has no times at
      // all and every node reads as a fresh start. The agent's own transcript
      // is stamped line by line, which is close enough to when it ran.
      if (!timed) {
        const stamps = stampsOf(await file.text())

        if (stamps.length > 0) {
          agent.startedMs = stamps[0]
          agent.activeMs = stamps[stamps.length - 1]

          if (agent.state !== 'running') {
            agent.endedMs = stamps[stamps.length - 1]
          }
        }
      }

      agent.prompt = read.prompt ?? agent.prompt
      agent.result = read.result ?? agent.result

      if (read.calls.length > 0 && (agent.calls?.length ?? 0) === 0) {
        agent.calls = read.calls
      }

      // Tool calls arrive live from the hook chain; replaying a finished run
      // recovers them from the transcript instead.
      for (const line of (await file.text()).split('\n')) {
        if (!line.includes('"tool_use"')) {
          continue
        }

        try {
          const row = JSON.parse(line)

          for (const part of row?.message?.content ?? []) {
            if (part?.type === 'tool_use' && typeof part.name === 'string') {
              noteToolCall(run, agent.agentId, part.name, now, false)
            }
          }
        } catch {
          // A partial line at the tail of a live transcript.
        }
      }
    }
  }

  if (!timed && run.agents.length > 0) {
    run.startedMs = Math.min(...run.agents.map(a => a.startedMs))
  }

  return run
}

/**
 * The workflow script the engine persisted for a run, or an empty string when
 * it kept none. It sits under the session's `workflows/scripts`, named for the
 * workflow and the run.
 */
async function scriptOf(dir: string, runId: string): Promise<string> {
  const session = dir.replace(/\/$/, '').split('/').slice(0, -3).join('/')
  const scripts = `${session}/workflows/scripts`

  try {
    for (const entry of new Bun.Glob(`*${runId}.js`).scanSync({ cwd: scripts, onlyFiles: true })) {
      return await Bun.file(`${scripts}/${entry}`).text()
    }
  } catch {
    // No scripts directory: an older run, or one the engine kept nothing for.
  }

  return ''
}

/** Every timestamp in an agent's transcript, in milliseconds, in order. */
function stampsOf(text: string): number[] {
  const stamps: number[] = []

  for (const line of text.split('\n')) {
    const found = /"timestamp":"([^"]+)"/.exec(line)
    const at = found ? Date.parse(found[1]) : NaN

    if (!Number.isNaN(at)) {
      stamps.push(at)
    }
  }

  return stamps.sort((a, b) => a - b)
}

/**
 * The runs the menu lists. A preview holds one run, so the others are the
 * transcript directories beside it — read far enough to carry the state and
 * the clock the menu groups and orders by, since a menu drawn from names
 * alone shows none of what the menu is for.
 */
export function siblingRuns(dir: string | undefined, runId: string, name: string): RunEntry[] {
  const here: RunEntry = {
    id: runId,
    mark: '\u25b8',
    name,
    tally: '4/6',
    status: 'running',
    startedMs: Date.now() - 90_000,
  }

  if (!dir) {
    return [
      here,
      {
        id: 'wf_other',
        mark: '\u2714',
        name: 'demo',
        tally: '26/26',
        status: 'completed',
        startedMs: Date.now() - 3_600_000,
      },
    ]
  }

  const parent = dir.replace(/\/$/, '').split('/').slice(0, -1).join('/')
  const session = dir.replace(/\/$/, '').split('/').slice(0, -3).join('/')
  const others = [...new Bun.Glob('wf_*').scanSync({ cwd: parent, onlyFiles: false })]
    .filter(entry => !dir.endsWith(entry))
    .sort()
    .map(entry => summarised(entry, `${session}/workflows/${entry}.json`))

  return [here, ...others]
}

/** One sibling run out of the summary the engine wrote for it. */
function summarised(runId: string, file: string): RunEntry {
  const entry: RunEntry = {
    id: runId,
    mark: '\u2298',
    name: runId,
    tally: '0/0',
    status: 'stopped',
    startedMs: 0,
  }

  try {
    const summary = JSON.parse(readFileSync(file, 'utf8')) as {
      status?: string
      workflowName?: string
      startTime?: number
      agentCount?: number
      workflowProgress?: { state?: string }[]
    }

    entry.status =
      summary.status === 'completed'
        ? 'completed'
        : summary.status === 'killed' || summary.status === 'aborted'
          ? 'stopped'
          : summary.status === 'failed' || summary.status === 'error'
            ? 'failed'
            : 'running'
    entry.mark = MARKS[entry.status]
    entry.name = summary.workflowName ?? runId
    entry.startedMs = summary.startTime ?? 0

    const rows = summary.workflowProgress ?? []
    const landed = rows.filter(r => r.state === 'completed' || r.state === 'done' || r.state === 'failed').length

    entry.tally = `${landed}/${summary.agentCount ?? rows.length}`
  } catch {
    // A run the engine wrote no summary for, or one still being written.
  }

  return entry
}

const MARKS: Record<RunStatus, string> = {
  running: '\u25b8',
  completed: '\u2714',
  failed: '\u2716',
  stopped: '\u2298',
}

/**
 * Every run this project has on disk, newest session first.
 *
 * The tools that sweep the whole corpus — `audit.ts`, `lines.ts` — used to name
 * one session directory of one machine, so on any other clone they read nothing
 * and reported that nothing was wrong. Claude Code files a session under the
 * working directory it was started in, with every character that is not a
 * letter or a digit turned into a dash, so the directory can be derived rather
 * than written down.
 *
 * `FLOWPANE_RUNS` overrides it, for a corpus copied from somewhere else.
 */
export function runDirs(): string[] {
  const named = process.env.FLOWPANE_RUNS

  if (named) {
    return existsSync(named)
      ? readdirSync(named).filter(d => d.startsWith('wf_')).map(d => join(named, d))
      : []
  }

  const project = join(homedir(), '.claude/projects', process.cwd().replace(/[^A-Za-z0-9]/g, '-'))

  if (!existsSync(project)) {
    return []
  }

  const sessions = readdirSync(project)
    .map(id => join(project, id, 'subagents/workflows'))
    .filter(dir => existsSync(dir))

  return sessions.flatMap(dir => readdirSync(dir).filter(d => d.startsWith('wf_')).map(d => join(dir, d)))
}
