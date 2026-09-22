/**
 * What a node spent, where nothing on the pane counted it.
 *
 * The engine attributes a count to every agent when the run ends, and the live
 * reader keeps one for every agent it watched. An agent that finished before
 * this pane started drawing has neither, so its own transcript is read for it —
 * once, and only for an agent that has stopped without being counted. A
 * thirty-second helper reading nothing had been drawing as a step that cost
 * nothing, which is the same picture as a step that was never counted.
 *
 * The sweep skips a running agent deliberately; the detail dialog does not,
 * because the file of the row a reader just opened has been read anyway.
 */

import { expect, mock, test } from 'claude-code/testing'

/**
 * The home the stub answers with: a directory this machine actually has.
 *
 * The plugin looks for `$HOME/.claude/projects` on the way up, to recover the
 * runs of earlier sessions, and the engine refuses `fs.exists` on a path it
 * cannot reach. A refusal is not a false — the whole hook is skipped, and a
 * test that drives one reads an empty reply and fails for a reason it is not
 * about. This file's own folder exists and holds no `.claude`.
 */
const HOME = import.meta.dir

const TRANSCRIPT = '/session/subagents/workflows/wf_test'
const RUN_FILE = '/session/workflows/wf_test.json'

const SCRIPT = `export const meta = {
  name: 'probe',
  description: 'a probe',
  phases: [{ title: 'Collect' }],
}
return agent('done', { label: 'collect:done', phase: 'Collect' })`

/** One agent that landed before the pane was watching, and one still going. */
const JOURNAL = [
  { type: 'launched' },
  { type: 'started', agentId: 'a1', label: 'collect:done', phase: 'Collect' },
  { type: 'started', agentId: 'a2', label: 'collect:going', phase: 'Collect' },
  { type: 'result', agentId: 'a1', result: 'red' },
]
  .map(l => JSON.stringify(l))
  .join('\n')

/** A transcript whose newest request carried `n` tokens of context. */
function transcript(n: number, said = 'red'): string {
  return [
    { type: 'user', message: { content: 'Say red.' } },
    {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: said }],
        usage: { input_tokens: n - 3_000, cache_read_input_tokens: 3_000, output_tokens: 12 },
      },
    },
  ]
    .map(l => JSON.stringify(l))
    .join('\n')
}

/** The summary the engine writes while the run is still going. */
const RUN_SUMMARY = JSON.stringify({
  status: 'running',
  workflowName: 'probe',
  workflowProgress: [
    {
      type: 'workflow_agent',
      agentId: 'a1',
      label: 'collect:done',
      phaseTitle: 'Collect',
      state: 'done',
      tokens: 44_000,
    },
  ],
})

const LAUNCH = {
  status: 'async_launched',
  taskId: 't1',
  taskType: 'local_workflow',
  runId: 'wf_test',
  workflowName: 'probe',
  summary: 'a probe',
  transcriptDir: TRANSCRIPT,
}

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown }

function childrenOf(node: Node): unknown[] {
  const kids = (node as { children?: unknown }).children ?? node.props?.children

  return Array.isArray(kids) ? kids : kids === undefined || kids === null ? [] : [kids]
}

function linesOf(cells: string, columns: number, rows: number): string[] {
  const binary = atob(cells)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  const words = new Uint32Array(bytes.buffer)
  const lines: string[] = []

  for (let y = 0; y < rows; y++) {
    let line = ''

    for (let x = 0; x < columns; x++) {
      line += String.fromCodePoint(words[(y * columns + x) * 3])
    }

    lines.push(line.trimEnd())
  }

  return lines
}

/** Every line the pane shows, and every Button key in it. */
function paneOf(tree: unknown): { text: string; keys: string[] } {
  const lines: string[] = []
  const keys: string[] = []

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return
    }

    const it = node as Node

    if (it.type === 'Raster') {
      const props = it.props ?? {}

      lines.push(...linesOf(String(props.cells), Number(props.columns), Number(props.rows)))

      return
    }

    if (it.type === 'Button') {
      keys.push(String(it.props?.key ?? ''))
      lines.push(String(it.props?.label ?? ''))
    }

    if (it.type === 'Text') {
      lines.push(...(childrenOf(it).filter(c => typeof c === 'string') as string[]))
    }

    childrenOf(it).forEach(walk)
  }

  walk(tree)

  return { text: lines.join('\n'), keys }
}

function renderPane($: any, columns = 84) {
  return $.ui.render({
    surface: 'terminal',
    component: 'Pane',
    requestId: 'flowpane',
    viewport: { columns: columns + 6, rows: 30 },
    props: {
      title: 'workflow',
      isFocused: true,
      bodyColumns: columns,
      placement: 'dock',
      scroll: { bodyRows: 26, offset: 0, height: 26 },
      view: {},
    },
  })
}

/**
 * The engine, with whichever files this test says are there.
 *
 * `asked` and `reads` are the point of the stub: what the sweep does is mostly
 * what it declines to do, and a file it never asked for is the only evidence of
 * a skip that a drawing cannot show.
 */
function stubEngine(
  on: any,
  files: Record<string, string | (() => string)>,
  asked: string[] = [],
  reads: string[] = [],
): void {
  on('env.get', () => ({ value: HOME }))
  on('ui.open', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: { requestId: 'flowpane' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'flowpane' } }))
  on('command.run', () => ({ text: '' }))
  on('session.id', () => ({ value: 'test-session' }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('fs.exists', ($$: unknown, e: { path: string }) => {
    asked.push(e.path)

    return { value: files[e.path] !== undefined }
  })
  on('fs.read', ($$: unknown, e: { path: string }) => {
    const held = files[e.path]

    if (held === undefined) {
      throw new Error(`unexpected read: ${e.path}`)
    }

    reads.push(e.path)

    return { value: typeof held === 'function' ? held() : held }
  })
}

/** A run launched and read once, drawn into a pane. */
async function launched($: any, on: any, files: Record<string, string | (() => string)>, asked?: string[], reads?: string[]) {
  const clock = mock.clock(on, { now: 1_000 })

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  stubEngine(on, { [`${TRANSCRIPT}/journal.jsonl`]: JOURNAL, ...files }, asked, reads)

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await clock.advance(600)

  return clock
}

test('an agent that stopped before the pane was watching is counted from its own transcript', async ($, on) => {
  await launched($, on, { [`${TRANSCRIPT}/agent-a1.jsonl`]: transcript(15_000) })

  // Nothing else on the pane holds a figure for this agent: the run has not
  // ended, so there is no summary, and it landed before the live reader was
  // keeping one.
  expect(paneOf(await renderPane($)).text).toContain('15k')
})

test('an agent still working is left to the live reader, and its file is not swept', async ($, on) => {
  const reads: string[] = []

  await launched(
    $,
    on,
    {
      [`${TRANSCRIPT}/agent-a1.jsonl`]: transcript(15_000),
      [`${TRANSCRIPT}/agent-a2.jsonl`]: transcript(90_000),
    },
    [],
    reads,
  )

  await renderPane($)

  // The live reader is ahead of the file, and a transcript still being written
  // to is read again at every tick for a figure the pane already has better.
  expect(reads).toContain(`${TRANSCRIPT}/agent-a1.jsonl`)
  expect(reads).not.toContain(`${TRANSCRIPT}/agent-a2.jsonl`)
})

test('an agent the summary already counted is not read again', async ($, on) => {
  const reads: string[] = []

  await launched($, on, { [RUN_FILE]: RUN_SUMMARY, [`${TRANSCRIPT}/agent-a1.jsonl`]: transcript(15_000) }, [], reads)

  // One file for the whole run beats one file per agent, so the sweep is for
  // the agents that file has nothing to say about.
  expect(paneOf(await renderPane($)).text).toContain('44k')
  expect(reads).not.toContain(`${TRANSCRIPT}/agent-a1.jsonl`)
})

test('an agent with no transcript to read is asked for it once, and says nothing was recorded', async ($, on) => {
  const asked: string[] = []
  const clock = await launched($, on, {}, asked)

  await clock.advance(600)
  await clock.advance(600)

  const path = `${TRANSCRIPT}/agent-a1.jsonl`

  // Several ticks, one question. The sweep runs on every read of the run, so a
  // missing file that is asked about each time is a stat per agent per tick for
  // an answer that has already been given.
  expect(asked.filter(p => p === path).length).toBe(1)
  expect(paneOf(await renderPane($)).text).toContain('∑')
})

test('opening a running agent counts it from the file that was opened anyway', async ($, on) => {
  const reads: string[] = []

  await launched($, on, { [`${TRANSCRIPT}/agent-a2.jsonl`]: transcript(90_000) }, [], reads)

  const keys = paneOf(await renderPane($)).keys.filter(k => k.startsWith('node:'))
  const going = keys[keys.length - 1]

  await $.ui.press({ plugin: 'flowpane', key: going, requestId: 'flowpane' })

  // The sweep left this row alone, so the dialog is the one place the figure
  // can come from — and leaving it blank on the row whose file has just been
  // read is a gap the reader can see the answer to.
  expect(reads).toContain(`${TRANSCRIPT}/agent-a2.jsonl`)
  expect(paneOf(await renderPane($)).text).toContain('90k')
})

test('a count already taken is not replaced by a second reading of the file', async ($, on) => {
  let grown = false
  const files = {
    [`${TRANSCRIPT}/agent-a1.jsonl`]: () => {
      const text = transcript(grown ? 90_000 : 15_000)

      grown = true

      return text
    },
  }

  await launched($, on, files)

  const node = paneOf(await renderPane($)).keys.find(k => k.startsWith('node:'))

  await $.ui.press({ plugin: 'flowpane', key: node!, requestId: 'flowpane' })

  const opened = paneOf(await renderPane($)).text

  // The dialog reads the whole file for the prompt and what came back, and the
  // count is taken from the same reading — but the figure the pane already has
  // was taken by whichever reader was closest to the agent, and a later one
  // overwriting it makes the figure depend on when the dialog was opened.
  expect(opened).toContain('15k')
  expect(opened).not.toContain('90k')
})
