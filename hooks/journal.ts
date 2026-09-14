/**
 * The run model the pane draws, and the journal reader that fills it.
 *
 * A workflow run writes `journal.jsonl` into its transcript directory as it
 * goes — one `started` line per agent with its label and phase, one `result`
 * (or `error`) line when that agent lands — and the engine writes the run's
 * summary to `workflows/<runId>.json` once the whole run is over. The journal
 * is the live feed; the summary is the completion signal and the source of the
 * per-agent numbers the journal has no room for.
 */

export type AgentState = 'running' | 'done' | 'failed' | 'stopped'

/** One tool the agent called, and how often. */
export type ToolUse = {
  name: string
  count: number
  /** When the most recent call started, in wall-clock ms. */
  atMs: number
  /** True while the most recent call is still running. */
  isRunning: boolean
}

/** One tool call, as the `tool.call` chain saw it go by. */
export type ToolCall = {
  /** The call's `tool_use_id`, or a counter when the engine gave none. */
  id: string
  name: string
  /** The argument that says what the call was about: a command, a path, a query. */
  input: string
  startedMs: number
  endedMs?: number
  isError?: boolean
  /** First line of what the tool answered. */
  result?: string
  /** The model request (1-based) that issued it, and that request's tokens once it stopped. */
  step?: number
  stepTokens?: number
}

export type AgentRow = {
  agentId: string
  label: string
  phase: string
  state: AgentState
  /** Wall-clock ms when this reader first saw the agent start. */
  startedMs: number
  /** Wall-clock ms when it landed; undefined while it runs. */
  endedMs?: number
  /** First line of the agent's result, for the row's tail. */
  resultPreview?: string
  /** Total tokens, from the run summary; absent until the run ends. */
  tokens?: number
  /** The tools this agent has called, newest last. Filled live from tool.call. */
  tools: ToolUse[]
  /** Every call in order, for the detail strip; absent until the first lands. */
  calls?: ToolCall[]
  /** The prompt the agent was given, read from its transcript on demand. */
  prompt?: string
  /** The agent's full result, read from its transcript on demand. */
  result?: string
  /** The model it resolved to, from the run summary. */
  model?: string
  /** Which try this is, from the run summary: 1 unless the engine retried it. */
  attempt?: number
  /** Tool calls the summary counted, for a run the hook chain never watched. */
  toolCalls?: number
  /** The last tool the summary saw it call, with what that call was about. */
  lastTool?: string
  /** Tokens its model requests have used so far, summed live from `turn.step`. */
  liveTokens?: number
  /** Model requests made so far, counted live from `turn.step`. */
  steps?: number
  /** True from a model request's first chunk to its stop. */
  isThinking?: boolean
  /** Wall-clock ms of the last thing seen from this agent: a request, a tool call. */
  activeMs?: number
  /** The tail of what the model said in its latest request, from the text chunks. */
  saying?: string
}

export type RunStatus = 'running' | 'completed' | 'failed' | 'stopped'

export type RunState = {
  runId: string
  name: string
  summary: string
  transcriptDir: string
  /** `workflows/<runId>.json`, written when the run ends. */
  runFile: string
  startedMs: number
  endedMs?: number
  status: RunStatus
  /** Phase titles in script order, from `meta.phases`. */
  phases: string[]
  /** Agent rows in the order the journal announced them. */
  agents: AgentRow[]
  /** The run's return value, once it has one. */
  result?: string
  error?: string
  /** What the script `log()`ged, from the run summary. */
  logs?: string[]
  /** Every agent's tokens, from the run summary. */
  totalTokens?: number
  /**
   * Journal lines already folded in. It lives on the run, not on the reader:
   * the pane can be closed and reopened on the same run, and a reader that
   * started over would announce every agent a second time.
   */
  consumed: number
}

type JournalLine = {
  type: string
  agentId?: string
  label?: string
  phase?: string
  result?: unknown
  error?: unknown
}

/**
 * Pulls the phase titles out of a workflow script's `meta` block.
 *
 * `meta` is required to be a pure literal, so a scan for the `title:` strings
 * inside `phases: [...]` is enough and costs no evaluation. A script that
 * declares no phases returns none, and the pane falls back to the phase names
 * the journal reports.
 */
export function phasesOfScript(script: string): string[] {
  const block = /phases\s*:\s*\[([\s\S]*?)\]/.exec(script)

  if (!block) {
    return []
  }

  const titles: string[] = []

  for (const m of block[1].matchAll(/title\s*:\s*['"`]([^'"`]+)['"`]/g)) {
    titles.push(m[1])
  }

  return titles
}

/** The `workflows/<runId>.json` path that pairs with a transcript directory. */
export function runFileOf(transcriptDir: string, runId: string): string {
  // <session>/subagents/workflows/<runId>  ->  <session>/workflows/<runId>.json
  const session = transcriptDir.replace(/\/subagents\/workflows\/[^/]+$/, '')

  return `${session}/workflows/${runId}.json`
}

function previewOf(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? ''
  const line = text.split('\n').find(l => l.trim().length > 0) ?? ''

  return line.length > 120 ? `${line.slice(0, 117)}...` : line
}

/**
 * Folds the journal's lines into the run, in place.
 *
 * Only lines past `consumed` are read, so a poll costs one file read and the
 * new lines' parse; the returned count is the next poll's starting point, and
 * `changed` says whether the pane needs redrawing.
 */
export function applyJournal(run: RunState, text: string, nowMs: number): boolean {
  const lines = text.split('\n').filter(l => l.trim().length > 0)

  if (lines.length <= run.consumed) {
    return false
  }

  let changed = false

  for (const raw of lines.slice(run.consumed)) {
    let line: JournalLine

    try {
      line = JSON.parse(raw) as JournalLine
    } catch {
      continue
    }

    if (line.type === 'started' && line.agentId) {
      // A journal read that overlaps one already folded in must not announce
      // an agent twice; the id is the agent's identity across reads.
      if (run.agents.some(a => a.agentId === line.agentId)) {
        continue
      }

      run.agents.push({
        agentId: line.agentId,
        label: line.label ?? line.agentId.slice(0, 8),
        phase: line.phase ?? '',
        state: 'running',
        startedMs: nowMs,
        tools: [],
      })

      if (line.phase && !run.phases.includes(line.phase)) {
        run.phases.push(line.phase)
      }

      changed = true
      continue
    }

    if (line.type === 'result' || line.type === 'error') {
      const row = run.agents.find(a => a.agentId === line.agentId)

      if (row) {
        row.state = line.type === 'error' ? 'failed' : 'done'
        row.endedMs = nowMs
        row.resultPreview = previewOf(
          line.type === 'error' ? line.error : line.result,
        )
        changed = true
      }

      continue
    }
  }

  run.consumed = lines.length

  return changed
}

type RunSummary = {
  status?: string
  result?: unknown
  durationMs?: number
  startTime?: number
  logs?: unknown[]
  totalTokens?: number
  /** Present per agent below; declared here for the row fields that use it. */
  phases?: { title?: string }[]
  workflowProgress?: {
    type?: string
    agentId?: string
    label?: string
    phaseTitle?: string
    state?: string
    model?: string
    promptPreview?: string
    startedAt?: number
    durationMs?: number
    tokens?: number
    resultPreview?: string
    attempt?: number
    toolCalls?: number
    lastToolName?: string
    lastToolSummary?: string
    lastProgressAt?: number
  }[]
}

/**
 * Closes the run out from `workflows/<runId>.json`: the final status and
 * return value, and the per-agent durations and token counts the journal
 * never carried. A row the summary knows and the journal missed is added, so
 * a run whose journal the pane joined late still draws whole.
 */
export function applyRunFile(run: RunState, text: string, nowMs: number): void {
  let summary: RunSummary

  try {
    summary = JSON.parse(text) as RunSummary
  } catch {
    return
  }

  // The summary file exists while the run is still going, so an unfinished
  // status must read as unfinished: mapping everything that is not 'completed'
  // to a failure told the person a live run had already failed.
  run.status =
    summary.status === 'completed'
      ? 'completed'
      : summary.status === 'killed' || summary.status === 'aborted'
        ? 'stopped'
        : summary.status === 'failed' || summary.status === 'error'
          ? 'failed'
          : 'running'

  if (typeof summary.startTime === 'number') {
    run.startedMs = summary.startTime
  }

  if (Array.isArray(summary.logs)) {
    run.logs = summary.logs.map(previewOf).filter(Boolean)
  }

  if (typeof summary.totalTokens === 'number') {
    run.totalTokens = summary.totalTokens
  }

  if (run.status === 'running') {
    return applyProgress(run, summary, nowMs)
  }

  run.endedMs =
    typeof summary.startTime === 'number' && typeof summary.durationMs === 'number'
      ? summary.startTime + summary.durationMs
      : nowMs
  run.result = summary.result === undefined ? undefined : previewOf(summary.result)

  applyProgress(run, summary, nowMs)

  // Nothing in a finished run ended after the run did. A row read back from the
  // journal long after the fact was stamped with the reading, not the landing;
  // the run's own end is the latest anything in it can honestly claim.
  for (const row of run.agents) {
    if (row.endedMs === undefined || row.endedMs > run.endedMs) {
      row.endedMs = run.endedMs
    }

    if (row.startedMs > row.endedMs) {
      row.startedMs = row.endedMs
    }
  }
}

/** The per-agent rows of a summary, live or final. */
function applyProgress(run: RunState, summary: RunSummary, nowMs: number): void {
  for (const title of summary.phases ?? []) {
    if (title.title && !run.phases.includes(title.title)) {
      run.phases.push(title.title)
    }
  }

  for (const entry of summary.workflowProgress ?? []) {
    if (entry.type !== 'workflow_agent' || !entry.agentId) {
      continue
    }

    let row = run.agents.find(a => a.agentId === entry.agentId)

    if (!row) {
      row = {
        agentId: entry.agentId,
        label: entry.label ?? entry.agentId.slice(0, 8),
        phase: entry.phaseTitle ?? '',
        state: 'running',
        startedMs: nowMs,
        tools: [],
      }

      run.agents.push(row)
    }

    row.tokens = entry.tokens
    row.model = entry.model ?? row.model
    row.prompt = row.prompt ?? entry.promptPreview
    row.label = entry.label ?? row.label
    row.phase = entry.phaseTitle ?? row.phase
    row.resultPreview = row.resultPreview ?? entry.resultPreview

    if (typeof entry.attempt === 'number') {
      row.attempt = entry.attempt
    }

    if (typeof entry.toolCalls === 'number') {
      row.toolCalls = entry.toolCalls
    }

    if (entry.lastToolName) {
      row.lastTool = entry.lastToolSummary
        ? `${entry.lastToolName} ${entry.lastToolSummary}`
        : entry.lastToolName
    }

    if (typeof entry.lastProgressAt === 'number' && entry.lastProgressAt > (row.activeMs ?? 0)) {
      row.activeMs = entry.lastProgressAt
    }

    if (entry.state === 'done') {
      row.state = 'done'
    } else if (entry.state === 'failed' || entry.state === 'error') {
      row.state = 'failed'
    } else if (run.status !== 'running' && row.state === 'running') {
      // The run is over, so nothing of it is still running: an agent with no
      // result of its own went down with it.
      row.state = 'stopped'
    }

    // `startedAt` and `durationMs` are the engine's own clock. Whatever the
    // reader guessed from when it happened to see the journal line gives way.
    if (typeof entry.startedAt === 'number') {
      row.startedMs = entry.startedAt
    }

    if (typeof entry.durationMs === 'number') {
      row.endedMs = row.startedMs + entry.durationMs
    }
  }
}

/**
 * Records a tool call against the agent that made it.
 *
 * A workflow subagent's `tool.call` reaches a plugin hook carrying the same
 * `agentId` the journal names, so the pane can show what an agent is doing
 * right now — the one thing neither the journal nor the summary says while the
 * agent is still running.
 */
export function noteToolCall(
  run: RunState,
  agentId: string,
  tool: string,
  nowMs: number,
  isRunning: boolean,
): boolean {
  const row = run.agents.find(a => a.agentId === agentId)

  if (!row) {
    return false
  }

  row.activeMs = Math.max(row.activeMs ?? 0, nowMs)

  const seen = row.tools.find(t => t.name === tool)

  if (seen) {
    if (isRunning) {
      seen.count++
      seen.atMs = nowMs
    }

    seen.isRunning = isRunning
  } else {
    row.tools.push({ name: tool, count: 1, atMs: nowMs, isRunning })
  }

  return true
}

/** The keys a `tool.call` event carries beside the tool's own arguments. */
const RESERVED_KEYS = new Set([
  'tool',
  'tool_use_id',
  'agentId',
  'consent',
  'session_id',
  'transcript_path',
  'cwd',
  'prompt_id',
  'permission_mode',
  'agent_id',
  'agent_type',
  'effort',
])

/** The argument that says what a call is about, as one line. */
export function inputPreviewOf(event: Record<string, unknown>): string {
  const preferred = ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'prompt', 'description']

  for (const key of preferred) {
    const value = event[key]

    if (typeof value === 'string' && value.trim()) {
      return previewOf(value)
    }
  }

  for (const [key, value] of Object.entries(event)) {
    if (RESERVED_KEYS.has(key) || value === undefined) {
      continue
    }

    return previewOf(typeof value === 'string' ? value : JSON.stringify(value))
  }

  return ''
}

/** Opens a call record on the agent: its id, tool and argument, and which request issued it. */
export function noteCallStart(
  run: RunState,
  agentId: string,
  call: { id: string; name: string; input: string },
  nowMs: number,
): boolean {
  const row = run.agents.find(a => a.agentId === agentId)

  if (!row) {
    return false
  }

  row.calls ??= []
  row.calls.push({ ...call, startedMs: nowMs, step: row.steps })

  return true
}

/** Closes a call record with what the tool answered. */
export function noteCallEnd(
  run: RunState,
  agentId: string,
  id: string,
  nowMs: number,
  outcome: { result?: unknown; text?: unknown; isError?: boolean },
): boolean {
  const call = run.agents.find(a => a.agentId === agentId)?.calls?.find(c => c.id === id)

  if (!call) {
    return false
  }

  call.endedMs = nowMs
  call.isError = outcome.isError === true

  const said = typeof outcome.text === 'string' ? outcome.text : outcome.result

  if (said !== undefined) {
    call.result = previewOf(said)
  }

  return true
}

/** One thing a `turn.step` hook saw of an agent's model request. */
export type StepPart =
  | { kind: 'start' }
  | { kind: 'text'; text: string }
  | { kind: 'stop'; tokens?: number }
  | { kind: 'end' }

/** How much of what the model says the row keeps, for the tail and the detail. */
const SAYING_MAX = 240

/**
 * Records what a model request of one agent is doing, as its stream goes by.
 *
 * `turn.step` carries the agent's id and streams the request beneath it, so
 * the pane learns three things the journal and the summary never say while an
 * agent runs: that it is thinking, what it has said so far, and what its
 * requests have cost. Tokens are summed from each request's `usage`, the same
 * four counts the run summary adds up, so the live figure lands on the final
 * one rather than beside it.
 */
export function noteStep(run: RunState, agentId: string, nowMs: number, part: StepPart): boolean {
  const row = run.agents.find(a => a.agentId === agentId)

  if (!row) {
    return false
  }

  row.activeMs = Math.max(row.activeMs ?? 0, nowMs)

  if (part.kind === 'start') {
    row.steps = (row.steps ?? 0) + 1
    row.isThinking = true
    row.saying = ''
  } else if (part.kind === 'text') {
    const said = `${row.saying ?? ''}${part.text}`

    row.saying = said.length > SAYING_MAX ? said.slice(said.length - SAYING_MAX) : said
  } else if (part.kind === 'stop') {
    if (part.tokens !== undefined) {
      row.liveTokens = (row.liveTokens ?? 0) + part.tokens

      // The calls this request issued are stamped with what it cost: tokens
      // belong to a request, not a call, so the same figure stands on each.
      for (const call of row.calls ?? []) {
        if (call.step === row.steps) {
          call.stepTokens = part.tokens
        }
      }
    }

    row.isThinking = false
  } else {
    row.isThinking = false
  }

  return true
}

/** The four counts a request's usage carries, as one number. */
export function tokensOfUsage(usage: {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}): number {
  return (
    (usage.input_tokens ?? 0) +
    (usage.output_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)
  )
}

/** What a tool was handed, as text: the one string argument, or the whole object. */
function payloadOf(input: unknown): string {
  if (typeof input === 'string') {
    return input
  }

  if (!input || typeof input !== 'object') {
    return ''
  }

  const entries = Object.entries(input as Record<string, unknown>)

  // One argument is the payload itself — a command, a path, a query — and
  // wrapping it in its own key would spend a line saying `command`.
  if (entries.length === 1) {
    const [, only] = entries[0]

    return typeof only === 'string' ? only : JSON.stringify(only)
  }

  return entries
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join('\n')
}

/** What a tool answered, as text, however the transcript wrapped it. */
function answerOf(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return content === undefined ? '' : JSON.stringify(content)
  }

  return content
    .map(part =>
      part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : typeof part === 'string'
          ? part
          : JSON.stringify(part),
    )
    .join('\n')
}

/**
 * One agent's transcript: the prompt it was given, the text it answered, and
 * every tool call it made with what it passed and what came back.
 *
 * The first user message is what the workflow asked for and the last assistant
 * text is what it answered. The calls matter for a run this module never
 * watched happen — recovered from disk, the summary knows only a tool's name
 * and a count, so without reading these the detail could say `1 call, last
 * Bash` and nothing about what the call actually did.
 */
export function readAgentTranscript(text: string): {
  prompt?: string
  result?: string
  calls: ToolCall[]
} {
  let prompt
  let result
  const calls: ToolCall[] = []
  const byId = new Map<string, ToolCall>()

  for (const raw of text.split('\n')) {
    if (!raw.trim()) {
      continue
    }

    let row

    try {
      row = JSON.parse(raw)
    } catch {
      continue
    }

    const content = row?.message?.content

    if (row?.type === 'user' && prompt === undefined && typeof content === 'string') {
      prompt = content
    }

    if (!Array.isArray(content)) {
      continue
    }

    for (const part of content) {
      if (part?.type === 'tool_use' && typeof part.name === 'string') {
        const call: ToolCall = {
          id: typeof part.id === 'string' ? part.id : `call-${calls.length + 1}`,
          name: part.name,
          input: payloadOf(part.input),
          startedMs: 0,
        }

        calls.push(call)
        byId.set(call.id, call)
      }

      if (part?.type === 'tool_result') {
        const call = byId.get(String(part.tool_use_id))

        if (call) {
          call.result = answerOf(part.content)
          call.isError = part.is_error === true
        }
      }
    }

    if (row?.type === 'assistant') {
      const said = content
        .filter(c => c?.type === 'text' && typeof c.text === 'string')
        .map(c => c.text)
        .join('')

      if (said.trim()) {
        result = said
      }
    }
  }

  return { prompt, result, calls }
}
