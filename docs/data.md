# How it gets its data

The files a run writes, when each appears, and how a run already going is recovered.

The pane is fed by two files the engine already writes, because the hook events
alone are not enough:

| Source | Carries | When |
| --- | --- | --- |
| `tool.call` on `Workflow` | `runId`, `transcriptDir`, `workflowName` | at launch — the tool returns as soon as the run registers, so this is seconds before the first agent |
| `<transcriptDir>/journal.jsonl` | `{type:"started",agentId,label,phase}`, `{type:"result",agentId,result}` | live, as the run goes |
| `<session>/workflows/<runId>.json` | final status, per-agent `startedAt`, `durationMs`, `tokens`, `model`, the run's return value | once, at the end |
| `tool.call`, unmatched | every subagent's tool call, with the `agentId` the journal names | live, around each call |
| `turn.step` | every model request a subagent makes, with its `agentId`: the text as it streams and the request's `usage` at its stop | live, chunk by chunk |
| `<transcriptDir>/agent-<id>.meta.json` | the model the agent was spawned on, its type, its phase | at spawn — so a node can name its model while it is still running |
| `<transcriptDir>/agent-<id>.jsonl` | the prompt the agent was given, the text it answered, and what its newest request was holding | when its detail dialog is opened, and once per agent that stopped without the pane hearing it |
| `<session>/workflows/scripts/<name>-<runId>.js` | that a run exists at all, what workflow it is, and its phases | at launch — the only file a run has before it ends |

`turn.step` is what makes the pane honest about a running agent. The hook is an
async generator that forwards every chunk untouched and only watches them go by,
so a node says `thinking` (or the tail of what the model is saying) while a
request streams, its token count climbs request by request rather than landing
once at the end, and the header sums the spend across the run.

What a node shows is the context its newest request carried — the `input`,
`cache_creation` and `cache_read` counts of that request added together. That is
what the run summary's own per-agent `tokens` turns out to be: over the eleven
thousand agents on this machine whose transcript and summary can both be read,
the two agree to within a fraction of a percent on all but seven. The run's
`totalTokens` is those per-agent figures added up, so the header's sum is right
once the parts are. `dev/checktokens.ts` is the check.

It used to add all four counts of every request together. That counts the same
context once per request: an agent that made eleven requests over a
twenty-thousand-token context read `∑ 224k` on the pane while the engine's own
panel beside it read `21.3k`, and a long one read `∑ 2m` against `153.5k`.
Cached context is read back whole on every request and is not spent again, so
adding it up measures how often the agent was called, not what it cost. The
output is left out for the same reason it is left out of the summary's figure:
the number is what the agent had to hold, not what it produced — the per-call
`stepTokens` in the detail's call list is the one that says what a request
wrote.

The newest request rather than the widest, which are the same figure until a
context is compacted. Five agents in the corpus were: they ran to a quarter of a
million tokens, were cut back, and finished at a third of that — and the engine
reports what they finished carrying, so a high-water mark would leave the pane a
hundred thousand above the panel beside it for the rest of the run. A usage with
every count zero is skipped: the last record of a transcript is often one, the
stream being closed rather than a request being paid for.

The same figure is read back out of the file where nothing watched the request
go by. An agent that finished before the pane started — a run adopted
mid-flight, or a pane opened on a run from earlier in the session — has no
stream to count, so it used to carry no figure at all until the whole run ended
and the engine's summary landed. A helper that ran for thirty seconds inside a
run still going therefore looked like a step that cost nothing. Its transcript
states it: the newest request's usage, read the way the live reader keeps it,
taken once per agent when the agent has stopped and the run has said nothing
about it. Where even that is missing the card says `∑ —` rather than leaving
the slot out — see [nodes.md](nodes.md).

The seven it still misses are retries. The engine's figure for an agent it ran
twice covers both tries and the transcript keeps only the last, so a retried
agent reads low until the summary lands and replaces the figure outright. A drop
in context cannot be banked to fix it, because compaction is the same drop and
banking it would double-count the five above.

An agent nothing has been heard from — no chunk, no tool
call — for 45 seconds is marked `quiet` in the warning colour, and the header
counts them, which is how a hung agent is told from a slow one before the run
itself times out.

The model is read from `.meta.json` rather than waited for. The journal's
`started` line carries no model and the run summary is not written until the run
has something to summarise, so a pane fed only by those two names no model for
the first minute of a run and then names them all at once. `.meta.json` is
written per agent at spawn, so the name is there from the first frame — one read
per agent, remembered, never repeated.

The run summary's `attempt`, `toolCalls`, `lastToolName`, `defaultModel` and
`logs` are folded in too: a retried agent's detail says `try 2`, a run this
module never watched still shows its last tool call and the model it ran on, and
a finished run with no return value shows the last thing the script `log()`ged in
the header.

## What a tool call was passed is kept whole

The argument that says what a call is about — `command`, `file_path`, `pattern`,
`query`, `url`, `prompt`, whichever the call carries — is kept as it was
written, line breaks included, up to 4,000 characters, whether it was watched
live or read back off a transcript.

It used to be cut at capture: the first non-blank line, and then 117 characters
of that. Nothing downstream could show more, however wide the dialog was, and a
`Bash` call of four lines came back as the first of them — `set -e` — which says
nothing about what the call did. The cap that replaced it is high enough that
what gets cut is a payload no one was going to read in a pane, and the dialog
wraps the rest rather than eliding it. See `inputOf` and `INPUT_MAX`.

A call's *result* is still cut to a preview: that is the agent's own material,
and a list of answers buried the calls themselves. See `previewOf`, which the
run's logs, its result and each call's result still go through.

The two files are read in that order and never the other way round. A journal
line says an agent landed but not when, so the reader stamps it with the moment
it read the line — which for a run rebuilt after a module reload is now. The
summary carries the engine's own `startedAt` and `durationMs`, so it has to be
the one that settles every row: applied first, it was overwritten by the
journal, and every agent of a finished run then claimed to have taken from its
own start until the present. On the timeline that drew every bar to the right
edge, which is how the bug was found.

## Finding a run that is already going

The summary is written when a run ends, so a walk over `<session>/workflows`
finds only the runs that are over. A workflow already in flight when the plugin
loaded was missing from the list entirely — the one run a reader most wants to
watch was the one run the pane could not offer.

The engine persists every run's script at launch, under
`workflows/scripts/<workflowName>-<runId>.js`. That file is what says a run
exists before there is anything to summarise, and it carries three things
nothing else does yet: the workflow's name, its declared phases, and — in its
mtime — the moment the run launched, to the second. So the walk makes two
passes: the summaries for the runs that are over, then the scripts for whatever
is left, which is what is still going.

Timing those runs takes one more step. A journal line says an agent started and
that it landed, but not when, so a reader that joined late stamps both with the
moment it read the line: every agent of a run adopted mid-flight drew as having
started now and taken no time at all. Usually the summary settles that, and a
run still going has not written one. Each agent leaves two files that are
stamped for it — its `.meta.json`, written when it is spawned, and its own
transcript, written to until it stops — and those two mtimes come within a
second of the figures the summary gives later, for the price of a `stat` rather
than a read.

A running agent's transcript mtime is when it last said something, not when it
stopped, so it is read as the agent's last sign of life rather than as an end —
which is also what the pane's 45-second `quiet` mark measures against. Read as
an end instead, a busy agent would have been drawn as having stopped minutes
ago; measured from its start, every agent of a recovered run would have been
accused of hanging.

A workflow subagent's tool calls run through the same `tool.call` chain as the
main loop's, carrying `agentId`, so "what is this agent doing right now" needs
no polling: the hook wraps the call, and the node shows the tool while it runs
and the count once it lands.

Classic settings hooks were the first thing tried and are the wrong tool here:
`PostToolUse` on `Workflow` fires ~50ms in with `status: "async_launched"`, and
`SubagentStop` fires per workflow agent but carries no phase, no label and no
start — completion events only, nothing to animate.
