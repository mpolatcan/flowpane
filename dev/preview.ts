/**
 * Draws the pane outside Claude Code, so the visuals can be iterated on without
 * an interactive session: it builds a run (synthetic, or replayed from a real
 * `journal.jsonl`), paints it, and decodes the cells back to truecolor ANSI.
 *
 *   bun dev/preview.ts                       one frame of a synthetic run
 *   bun dev/preview.ts --animate             the run playing out
 *   bun dev/preview.ts --journal <dir>       a real run's transcript directory
 *   bun dev/preview.ts --cols 120 --rows 30
 *   bun dev/preview.ts --orientation time    the timeline instead of the graph
 *   bun dev/preview.ts --quiet               with one agent gone quiet
 *   bun dev/preview.ts --select verify:perf  with that agent's detail strip open
 *   bun dev/preview.ts --no-backdrop         on the terminal's own ground
 */

import { Canvas, DEFAULT_COLOR, rgb } from '../hooks/canvas'
import {
  applyJournal,
  applyRunFile,
  noteToolCall,
  readAgentTranscript,
  runFileOf,
  type RunState,
} from '../hooks/journal'
import { paint } from '../hooks/paint'

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)

  return i === -1 ? fallback : process.argv[i + 1] ?? fallback
}

const has = (name: string) => process.argv.includes(`--${name}`)

const columns = Number(arg('cols', '110'))
const rows = Number(arg('rows', '30'))

/** Decodes a canvas back to ANSI, one line per row. */
function toAnsi(canvas: Canvas): string {
  const words = new Uint32Array(
    Uint8Array.from(Buffer.from(canvas.encode(), 'base64')).buffer,
  )

  const color = (value: number, layer: 38 | 48) =>
    value === DEFAULT_COLOR
      ? `\x1b[${layer + 1}m`
      : `\x1b[${layer};2;${(value >> 16) & 0xff};${(value >> 8) & 0xff};${value & 0xff}m`

  const lines: string[] = []

  for (let y = 0; y < canvas.rows; y++) {
    let line = ''

    for (let x = 0; x < canvas.columns; x++) {
      const i = (y * canvas.columns + x) * 3

      line += color(words[i + 1], 38) + color(words[i + 2], 48) + String.fromCodePoint(words[i])
    }

    lines.push(`${line}\x1b[0m`)
  }

  return lines.join('\n')
}

function emptyRun(name: string, phases: string[]): RunState {
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

/** A run shaped like the canonical review/verify pipeline, for the synthetic view. */
function syntheticRun(atMs: number): RunState {
  const run = emptyRun('review-changes', ['Review', 'Verify', 'Report'])

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

  // The detail strip's call list, on the agents that have landed.
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

  // `--quiet` turns the thinking agent into one nothing has been heard from
  // for most of a minute, which is what the quiet warning is for.
  const quiet = run.agents.find(a => a.label === 'verify:perf')

  if (quiet && quiet.state === 'running' && has('quiet')) {
    quiet.isThinking = false
    quiet.saying = undefined
    quiet.startedMs = atMs - 50_000
    quiet.activeMs = quiet.startedMs
  }

  return run
}

async function journalRun(dir: string): Promise<RunState> {
  const runId = dir.replace(/\/$/, '').split('/').pop() ?? 'wf'
  const run = emptyRun(runId, [])

  run.transcriptDir = dir
  run.runFile = runFileOf(dir, runId)

  const journal = await Bun.file(`${dir}/journal.jsonl`).text()
  const now = Date.now()

  applyJournal(run, journal, now)

  const summaryFile = Bun.file(run.runFile)

  if (await summaryFile.exists()) {
    applyRunFile(run, await summaryFile.text(), now)
    run.name = runId
  } else {
    run.startedMs = Math.min(...run.agents.map(a => a.startedMs), now)
  }

  // The detail strip reads an agent's own transcript for its prompt and answer;
  // the preview does the same so the strip can be seen without a live session.
  for (const agent of run.agents) {
    const file = Bun.file(`${dir}/agent-${agent.agentId}.jsonl`)

    if (await file.exists()) {
      const read = readAgentTranscript(await file.text())

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

  return run
}

// The same ground the plugin clears to, so the preview shows what ships; the
// palette is drawn for it, and a preview on the terminal's own colour flattered
// the contrast.
const canvas = new Canvas(columns, rows, has('no-backdrop') ? DEFAULT_COLOR : rgb(0x15, 0x18, 0x1e))
const journalDir = arg('journal')

if (has('animate')) {
  process.stdout.write('\x1b[?25l')

  for (let frame = 0; frame < 220; frame++) {
    const atMs = frame * 90
    const run = journalDir ? await journalRun(journalDir) : syntheticRun(atMs)

    paint(canvas, run, {
      nowMs: journalDir ? (run.endedMs ?? Date.now()) : atMs,
      tick: frame,
      orientation: (arg('orientation', 'auto') as any),
    })
    process.stdout.write(`\x1b[H\x1b[2J${toAnsi(canvas)}\n`)
    await Bun.sleep(60)
  }

  process.stdout.write('\x1b[?25h')
} else {
  const atMs = Number(arg('at', '8000'))
  const run = journalDir ? await journalRun(journalDir) : syntheticRun(atMs)
  const pick = arg('select')
  const selectedId = pick
    ? (run.agents.find(a => a.label.includes(pick) || a.agentId === pick)?.agentId ?? pick)
    : undefined

  paint(canvas, run, {
    nowMs: journalDir ? (run.endedMs ?? Date.now()) : atMs,
    tick: Number(arg('tick', '7')),
    orientation: (arg('orientation', 'auto') as any),
    selectedId,
    detailRows: Number(arg('detailRows', '16')),
    detailScroll: Number(arg('scroll', '0')),
  })
  console.log(toAnsi(canvas))
}
