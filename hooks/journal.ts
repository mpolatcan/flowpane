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
  /**
   * The argument that says what the call was about: a command, a path, a query.
   *
   * Held whole, its own line breaks included, up to `INPUT_MAX` — the Tool Calls tab
   * draws it as it was written, and a command cut down to its first line is a
   * command nobody can check.
   */
  input: string
  startedMs: number
  endedMs?: number
  isError?: boolean
  /**
   * What the tool answered, held the same way its argument is, up to `INPUT_MAX`.
   *
   * One line of it used to be kept, which made the reading a header with nothing
   * under it: a test run's line one is `RUN  v2.1.9` and the verdict is thirty
   * lines down. A run watched live and the same run replayed keep the same
   * amount, so the two say the same thing.
   */
  result?: string
  /** The model request (1-based) that issued it, and what that request wrote. */
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
  /** Every call in order, for the detail dialog; absent until the first lands. */
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
  /** The context its newest model request carried, live from `turn.step`. */
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
  /**
   * What the script said each phase was for, where it said anything.
   *
   * Titles alone are what the pane needs for a phase with work in it — the
   * agents say the rest. A phase the run never entered has no agents, so this
   * is everything it has: see `Step`.
   */
  plan?: Step[]
  /** Agent rows in the order the journal announced them. */
  agents: AgentRow[]
  /** The run's return value, once it has one. */
  result?: string
  error?: string
  /** What the script `log()`ged, from the run summary. */
  logs?: string[]
  /** Every agent's tokens, from the run summary. */
  totalTokens?: number
  /** The model the run resolved to, for an agent whose own is not recorded. */
  defaultModel?: string
  /**
   * True when the run was rebuilt from the files on disk rather than watched
   * from its launch. Those files carry no clock of their own, so such a run
   * has its times read off the files instead.
   */
  recovered?: boolean
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
 * What a workflow declared about one of its phases, before anything ran in it.
 *
 * A phase the run never entered has no agents to draw and, until now, nothing
 * else either — so the pane drew it as an empty box. The script says more than
 * its name: what the phase is for, and what it would have run on. Both are
 * written at launch and neither depends on the run reaching the phase, so they
 * are what a phase that never ran can still say for itself.
 */
export type Step = {
  title: string
  /** The one-line description `meta.phases` carries beside the title. */
  detail?: string
  /** The model the phase declared, where it declared one. */
  model?: string
}

/**
 * Pulls the declared phases out of a workflow script's `meta` block.
 *
 * `meta` is required to be a pure literal, so a scan of the entries inside
 * `phases: [...]` is enough and costs no evaluation. A script that declares no
 * phases returns none, and the pane falls back to the phase names the journal
 * reports.
 *
 * The entries are split on the braces rather than scanned field by field
 * across the whole block: a single pass for `title:` and another for `detail:`
 * would pair the first title with the first detail wherever a phase in between
 * declared one and not the other.
 */
export function phasesOfScript(script: string): Step[] {
  const block = /phases\s*:\s*\[([\s\S]*?)\]/.exec(script)

  if (!block) {
    return []
  }

  const steps: Step[] = []
  const field = (entry: string, name: string) =>
    new RegExp(`${name}\\s*:\\s*['"\`]([^'"\`]*)['"\`]`).exec(entry)?.[1] || undefined

  for (const entry of block[1].matchAll(/\{([^{}]*)\}/g)) {
    const title = field(entry[1] as string, 'title')

    if (title) {
      steps.push({ title, detail: field(entry[1] as string, 'detail'), model: field(entry[1] as string, 'model') })
    }
  }

  return steps
}

/**
 * The workflow's name and the run's id out of a persisted script's file name.
 *
 * The engine writes every run's script to `workflows/scripts` at launch, named
 * `<workflowName>-<runId>.js`. It is the only file a run has before it ends, so
 * it is what says a run exists while it is still going — and a run id starts
 * `wf_`, which a workflow name is free to as well, so the split is taken at the
 * last `wf_` in the name rather than the first.
 */
export function runOfScriptName(fileName: string): { name: string; runId: string } | null {
  const parts = /^(.+)-(wf_.+)\.js$/.exec(fileName)

  return parts ? { name: parts[1], runId: parts[2] } : null
}

/**
 * Times one agent of a recovered run by the files the engine stamped for it:
 * its `.meta.json`, written when it was spawned, and its own transcript,
 * written to until it stopped. Either may be missing, and the row keeps what it
 * had when one is.
 */
export function applyFileClock(row: AgentRow, spawnedMs?: number, lastWroteMs?: number): void {
  if (spawnedMs !== undefined) {
    row.startedMs = Math.round(spawnedMs)
  }

  if (lastWroteMs !== undefined) {
    // A running agent is still writing, so its transcript's mtime is when it
    // last said something rather than when it stopped — and how long ago that
    // was is what the pane calls an agent quiet by. Read as an end instead, a
    // busy agent would have been drawn as having stopped minutes ago.
    if (row.state === 'running') {
      row.activeMs = Math.max(row.activeMs ?? 0, Math.round(lastWroteMs))
    } else {
      row.endedMs = Math.round(lastWroteMs)
    }
  }

  // The two files are stamped a moment apart from each other as well as from
  // the engine's own clock, and an agent that answered at once can have them
  // land out of order. A bar drawn from a negative duration runs backwards.
  if (row.endedMs !== undefined && row.startedMs > row.endedMs) {
    row.startedMs = row.endedMs
  }
}

/** The `workflows/<runId>.json` path that pairs with a transcript directory. */
export function runFileOf(transcriptDir: string, runId: string): string {
  // <session>/subagents/workflows/<runId>  ->  <session>/workflows/<runId>.json
  const session = transcriptDir.replace(/\/subagents\/workflows\/[^/]+$/, '')

  return `${session}/workflows/${runId}.json`
}

/**
 * The whole of what an agent answered, as text.
 *
 * An agent given a schema answers with an object, and returns it through a tool
 * call rather than as text — so its transcript holds no answer at all and the
 * journal line is the only place the value exists. Capped, because a run that
 * answered with a megabyte would otherwise be held in memory a frame at a time.
 */
function answerOfLine(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? ''

  return text.length > 20_000 ? text.slice(0, 20_000) : text
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
        // When it landed is the reading, not the landing — the journal line
        // carries no clock. A row the summary has already timed keeps that
        // time; this only covers the gap before the summary is written.
        row.endedMs = row.endedMs ?? nowMs

        const said = line.type === 'error' ? line.error : line.result

        row.resultPreview = previewOf(said)
        // The preview is one line cut to fit a node's tail; the dialog wants the
        // whole answer, and for an agent that answered through a schema this
        // line is the only place the whole answer is written down.
        row.result = row.result ?? answerOfLine(said)
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
  defaultModel?: string
  /** Present per agent below; declared here for the row fields that use it. */
  phases?: { title?: string; detail?: string; model?: string }[]
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

  if (typeof summary.defaultModel === 'string') {
    run.defaultModel = summary.defaultModel
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
  for (const step of summary.phases ?? []) {
    if (!step.title) {
      continue
    }

    if (!run.phases.includes(step.title)) {
      run.phases.push(step.title)
    }

    // The file is the fuller source: it is written from the engine's own copy
    // of `meta`, where the script the pane scans at launch is text. Where both
    // have something to say about a phase, this is the one that is right.
    const plan = (run.plan ??= [])
    const at = plan.findIndex(s => s.title === step.title)
    const said = { title: step.title, detail: step.detail, model: step.model }

    if (at < 0) {
      plan.push(said)
    } else {
      plan[at] = said
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

/**
 * The cells of a call's argument the run holds on to.
 *
 * A command is the thing a reader opens a detail dialog to read, and it used to
 * arrive here as the first line of itself cut to a hundred and seventeen cells
 * — so a heredoc, a pipeline written over three lines, or any `gh api` call with
 * its flags wrapped was unrecoverable from the moment the chain saw it. No
 * dialog can undo that, however wide it is drawn.
 *
 * The cap is what a person will read rather than what a tool may be handed: an
 * `Edit` carrying a file's whole new text is not a command anybody reads in a
 * pane, and holding megabytes of it per call on a seventy-eight agent run is
 * memory spent on something never drawn. The transcript reader is capped the
 * same way, so a run watched live and the same run replayed say the same thing.
 */
const INPUT_MAX = 4_000

function heldOf(value: string): string {
  return value.length > INPUT_MAX ? `${value.slice(0, INPUT_MAX)}…` : value
}

/** The argument that says what a call is about, with its own line breaks kept. */
export function inputOf(event: Record<string, unknown>): string {
  const preferred = ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'prompt', 'description']

  for (const key of preferred) {
    const value = event[key]

    if (typeof value === 'string' && value.trim()) {
      return heldOf(value)
    }
  }

  for (const [key, value] of Object.entries(event)) {
    if (RESERVED_KEYS.has(key) || value === undefined) {
      continue
    }

    return heldOf(typeof value === 'string' ? value : JSON.stringify(value))
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
    call.result = heldOf(typeof said === 'string' ? said : JSON.stringify(said) ?? '')
  }

  return true
}

/** One thing a `turn.step` hook saw of an agent's model request. */
export type StepPart =
  | { kind: 'start' }
  | { kind: 'text'; text: string }
  | { kind: 'stop'; tokens?: number; output?: number }
  | { kind: 'end' }

/** How much of what the model says the row keeps, for the tail and the detail. */
const SAYING_MAX = 240

/**
 * Records what a model request of one agent is doing, as its stream goes by.
 *
 * `turn.step` carries the agent's id and streams the request beneath it, so
 * the pane learns three things the journal and the summary never say while an
 * agent runs: that it is thinking, what it has said so far, and what its
 * requests have cost.
 *
 * The cost is the context its newest request carried, which is what the run
 * summary's own `tokens` turns out to be: over the eleven thousand agents on
 * this machine whose transcript and summary can both be read, the two agree to
 * within a fraction of a percent on all but seven.
 *
 * It was the four usage counts of every request added together, which counts
 * the same context once per request: an agent that made eleven requests over a
 * twenty-thousand-token context read `∑ 224k` while the engine's own panel
 * beside it read `21.3k`, and a long one read `∑ 2m` against `153.5k`. Cached
 * context is read back whole on every request and is not spent again, so adding
 * it up measures how often the agent was called rather than what it cost.
 *
 * The newest rather than the widest, which are the same figure until a context
 * is compacted. Five agents in the corpus were: they ran to a quarter of a
 * million tokens, were cut back, and finished at a third of that — and the
 * engine reports what they finished carrying. A high-water mark would leave the
 * pane a hundred thousand above the panel beside it for the rest of the run.
 *
 * The seven it misses are retries. The engine's figure for an agent it ran
 * twice covers both tries and the transcript keeps only the last, so a retry
 * reads low until the summary lands and replaces the figure outright. A drop in
 * context cannot be banked instead, because compaction is the same drop and
 * banking it would double-count the five above.
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
    // A usage with nothing in it is the stream being closed rather than a
    // request being paid for — the last record of a transcript is often one,
    // every count zero. Taking it as the newest request would drop the figure
    // to nothing at the moment the agent finished.
    if (part.tokens) {
      // The newest request's context, not a running total and not the widest
      // one either. An agent's context usually only grows, so the widest and
      // the newest are the same figure — until it is compacted, and then the
      // agent carries what is left rather than what it had at its fullest. The
      // engine's own per-agent `tokens` is the newest, on both sides of that.
      row.liveTokens = part.tokens

      // The calls this request issued are stamped with what it wrote: tokens
      // belong to a request, not a call, so the same figure stands on each.
      //
      // What it wrote, not what it cost. A request's full cost is mostly the
      // context it read back, which is all but the same figure on every request
      // an agent makes — a column of `∑ 28k` twenty-five deep says nothing
      // about any one call. What the model produced to make the call is the
      // part that moves.
      const issued = part.output ?? part.tokens

      for (const call of row.calls ?? []) {
        if (call.step === row.steps && issued !== undefined) {
          call.stepTokens = issued
        }
      }
    }

    row.isThinking = false
  } else {
    row.isThinking = false
  }

  return true
}

/**
 * The context a request carried: what was sent fresh, what was written to the
 * cache, and what was read back out of it.
 *
 * Not the output. The engine's own per-agent `tokens` is this figure at its
 * widest, and adding the output on overshoots it — the run summary is counting
 * what the agent had to hold, not what it produced.
 */
export function contextOfUsage(usage: {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}): number {
  return (
    (usage.input_tokens ?? 0) +
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
/**
 * The model an agent was spawned on, from the `.meta.json` the engine writes
 * beside its transcript.
 *
 * The run summary carries the same fact and more, but it is not written until
 * the run has something to summarise — for the first minute of a run there is
 * no file at all, which is exactly the minute a reader is watching hardest.
 * This one exists from the moment the agent is spawned.
 */
export function readAgentMeta(text: string): string | undefined {
  try {
    const meta = JSON.parse(text) as { model?: unknown }

    return typeof meta.model === 'string' && meta.model.length > 0 ? meta.model : undefined
  } catch {
    return undefined
  }
}

/**
 * A model id as a person would say it: `Haiku 4.5`, `Opus 5`, `Sonnet 3.5`.
 *
 * The engine writes the id it resolved — `claude-haiku-4-5-20251001`, or
 * `claude-opus-5[1m]` with the context window on the end — and neither the
 * date nor the prefix tells anyone anything a node has room to say.
 *
 * The family is capitalised because it is a name. Lower case made it read as a
 * word the drawing had chosen — a card saying `haiku` under an agent that
 * wrote one is a card that has to be read twice.
 */
export function modelName(model?: string): string {
  if (!model) {
    return ''
  }

  const id = model.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '').replace(/^claude-/, '')
  const family = /(haiku|sonnet|opus|fable)/.exec(id)?.[1]

  if (!family) {
    return id
  }

  const named = family[0].toUpperCase() + family.slice(1)

  // The version sits either side of the family name, depending on the era the
  // id was minted in: `haiku-4-5` and `3-5-sonnet` are the same shape of fact.
  const version =
    new RegExp(`${family}-(\\d+)(?:-(\\d+))?`).exec(id) ??
    new RegExp(`(\\d+)(?:-(\\d+))?-${family}`).exec(id)

  if (!version) {
    return named
  }

  return `${named} ${version[1]}${version[2] ? `.${version[2]}` : ''}`
}

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

    // Both ends of a call are stamped in the recording: the request that issued
    // it carries the moment it was written, and the row carrying the answer the
    // moment it came back. Read off those, a call that ran while nothing was
    // watching states its own duration and cost like one that did.
    const stamp = Date.parse(String(row?.timestamp ?? ''))
    const at = Number.isFinite(stamp) ? stamp : 0
    const issued = Number(row?.message?.usage?.output_tokens)

    for (const part of content) {
      if (part?.type === 'tool_use' && typeof part.name === 'string') {
        const call: ToolCall = {
          id: typeof part.id === 'string' ? part.id : `call-${calls.length + 1}`,
          name: part.name,
          input: heldOf(payloadOf(part.input)),
          startedMs: at,
        }

        // Tokens belong to a request, not to a call, so every call the same
        // request issued carries the same figure — the way the live reader
        // stamps them.
        if (Number.isFinite(issued) && issued > 0) {
          call.stepTokens = issued
        }

        calls.push(call)
        byId.set(call.id, call)
      }

      if (part?.type === 'tool_result') {
        const call = byId.get(String(part.tool_use_id))

        if (call) {
          call.result = heldOf(answerOf(part.content))
          call.isError = part.is_error === true

          if (at > 0 && call.startedMs > 0 && at >= call.startedMs) {
            call.endedMs = at
          }
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
