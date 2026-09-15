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
| `<transcriptDir>/agent-<id>.jsonl` | the prompt the agent was given and the text it answered | when its detail dialog is opened |
| `<session>/workflows/scripts/<name>-<runId>.js` | that a run exists at all, what workflow it is, and its phases | at launch — the only file a run has before it ends |

`turn.step` is what makes the pane honest about a running agent. The hook is an
async generator that forwards every chunk untouched and only watches them go by,
so a node says `thinking` (or the tail of what the model is saying) while a
request streams, its token count climbs request by request rather than landing
once at the end, and the header sums the spend across the run. The four usage
counts are added the same way the run summary adds them, so the live figure
lands on the final one. An agent nothing has been heard from — no chunk, no tool
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
