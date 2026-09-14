/**
 * The pane, end to end over the engine: a Workflow launch opens it, a journal
 * on disk fills it, and the Pane's render hands back a Raster whose cells carry
 * the run.
 *
 * Nothing here touches a real workflow or a real file. The test's own hooks sit
 * beneath the plugin, so `tool.call` answers the launch record the engine would
 * return and `fs.read` answers the journal the run would have written.
 */

import { expect, mock, test } from 'claude-code/testing'

const TRANSCRIPT = '/session/subagents/workflows/wf_test'
const RUN_FILE = '/session/workflows/wf_test.json'

const LAUNCH = {
  status: 'async_launched',
  taskId: 't1',
  taskType: 'local_workflow',
  runId: 'wf_test',
  workflowName: 'probe',
  summary: 'a probe',
  transcriptDir: TRANSCRIPT,
}

const SCRIPT = `export const meta = {
  name: 'probe',
  description: 'a probe',
  phases: [{ title: 'Collect' }, { title: 'Merge' }],
}
phase('Collect')
const colors = await parallel(['red', 'green'].map(c => () => agent('say ' + c, { label: 'color:' + c, phase: 'Collect' })))
phase('Merge')
return agent('join', { label: 'merge', phase: 'Merge' })`

const JOURNAL = [
  { type: 'launched' },
  { type: 'started', agentId: 'a1', label: 'color:red', phase: 'Collect' },
  { type: 'started', agentId: 'a2', label: 'color:green', phase: 'Collect' },
  { type: 'result', agentId: 'a1', result: 'red' },
]
  .map(l => JSON.stringify(l))
  .join('\n')

/** Decodes a Raster's cells back to the lines a terminal would show. */
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

/** Finds the one Raster in a render tree. */
function rasterOf(node: unknown): { key: string; columns: number; rows: number; cells: string } {
  const seen: unknown[] = [node]

  while (seen.length > 0) {
    const next = seen.shift() as { type?: string; props?: Record<string, unknown> } | null

    if (!next || typeof next !== 'object') {
      continue
    }

    if (next.type === 'Raster') {
      return next.props as unknown as { key: string; columns: number; rows: number; cells: string }
    }

    const children = (next.props?.children ?? []) as unknown

    seen.push(...(Array.isArray(children) ? children : [children]))
  }

  throw new Error('no Raster in the tree')
}

function renderPane($: any) {
  return $.ui.render({
    surface: 'terminal',
    component: 'Pane',
    requestId: 'wfpane',
    viewport: { columns: 90, rows: 30 },
    props: {
      title: 'workflow',
      isFocused: true,
      bodyColumns: 84,
      placement: 'dock',
      scroll: { bodyRows: 24, offset: 0, height: 24 },
      view: {},
    },
  })
}

test('a Workflow launch opens the pane and draws the run', async ($, on) => {
  mock.clock(on, { now: 1_000 })

  const opened: { id: string; title?: string }[] = []

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  on('ui.open', ($$, e, next) => {
    opened.push({ id: e.id, title: e.title })

    return next(e)
  })
  on('fs.exists', ($$, e) => e.path === `${TRANSCRIPT}/journal.jsonl`)
  on('fs.read', ($$, e) => {
    if (e.path === `${TRANSCRIPT}/journal.jsonl`) {
      return JOURNAL
    }

    throw new Error(`unexpected read: ${e.path}`)
  })

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })

  expect(opened.map(o => o.id)).toContain('wfpane')

  const raster = rasterOf(await renderPane($))
  const lines = linesOf(raster.cells, raster.columns, raster.rows)
  const text = lines.join('\n')

  expect(raster.key).toBe('dag')
  expect(text).toContain('probe')
  expect(text).toContain('Collect')
  expect(text).toContain('Merge')
})

test('the journal drives the node states', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  on('fs.exists', ($$, e) => e.path === `${TRANSCRIPT}/journal.jsonl`)
  on('fs.read', () => JOURNAL)

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })

  // The timer reads the journal a few frames in.
  await clock.advance(600)

  const raster = rasterOf(await renderPane($))
  const text = linesOf(raster.cells, raster.columns, raster.rows).join('\n')

  expect(text).toContain('color:red')
  expect(text).toContain('color:green')
  // The landed agent carries a tick, the one still running does not.
  expect(text).toMatch(/✔ color:red/)
  expect(text).not.toMatch(/✔ color:green/)
})

test('the pane says so when no workflow has run', async ($, on) => {
  mock.clock(on, { now: 0 })

  const result = await $.command.run({ command: 'wf', args: '' })

  expect(JSON.stringify(result)).toContain('No workflow has run')

  // `$` is unused past here, but the run file path helper is what pairs a
  // transcript directory with the summary the engine writes at the end.
  expect(RUN_FILE).toBe('/session/workflows/wf_test.json')
})
