/**
 * The redraw a live run asks for every few frames.
 *
 * A node's label is an element, so its spinner only moves when the tree is
 * built again, and every third frame asks for that. The activity strip is a
 * `Client` that takes its rows by message rather than by a render, so a pane
 * whose only elements are the strip has nothing a redraw would move.
 */

import { expect, mock, test } from 'claude-code/testing'

const HOME = import.meta.dir

const TRANSCRIPT = '/session/subagents/workflows/wf_test'

const PHASES = ['Collect', 'Sift', 'Weigh', 'Merge']
const NAMES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']

const SCRIPT = `export const meta = {
  name: 'probe',
  description: 'a probe',
  phases: [${PHASES.map(p => `{ title: '${p}' }`).join(', ')}],
}
return agent('join', { label: 'merge', phase: 'Merge' })`

const JOURNAL = [
  { type: 'launched' },
  ...PHASES.flatMap((phase, p) =>
    NAMES.map((n, i) => ({
      type: 'started',
      agentId: `a${p}${i}`,
      label: `${phase.toLowerCase()}-${n}`,
      phase,
    })),
  ),
  ...PHASES.flatMap((phase, p) => NAMES.map((n, i) => ({ type: 'result', agentId: `a${p}${i}`, result: n }))),
]
  .map(l => JSON.stringify(l))
  .join('\n')

const AGENT = [
  { type: 'user', message: { content: 'Work.' } },
  ...Array.from({ length: 12 }, (_, i) => [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: `t${i}`, name: 'Bash', input: { command: `echo step-${i}`, description: `Say step ${i}` } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: 'ok' }] } },
  ]).flat(),
]
  .map(row => JSON.stringify(row))
  .join('\n')

const FILES: Record<string, string> = {
  [`${TRANSCRIPT}/journal.jsonl`]: JOURNAL,
  [`${TRANSCRIPT}/agent-a00.jsonl`]: AGENT,
}

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

function elementsOf(node: Node): Node[] {
  const children = node.children ?? node.props?.children
  const list = children === undefined ? [] : Array.isArray(children) ? children : [children]

  return list.filter((c): c is Node => !!c && typeof c === 'object')
}

function nodesOf(node: unknown): Node[] {
  const walk = (at: Node): Node[] => [at, ...elementsOf(at).flatMap(walk)]

  return walk(node as Node)
}

function renderPane($: any): Promise<unknown> {
  return $.ui.render({
    surface: 'terminal',
    component: 'Pane',
    requestId: 'flowpane',
    viewport: { columns: 106, rows: 40 },
    props: {
      title: 'workflow',
      isFocused: true,
      bodyColumns: 100,
      placement: 'dock',
      scroll: { bodyRows: 36, offset: 0, height: 36 },
      view: {},
    },
  })
}

test('a live run drawn as one picture beside the strip is blitted on the redraw beat, not built again', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const painted: string[] = []

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  on('env.get', () => ({ value: HOME }))
  on('ui.open', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.blit', () => {
    painted.push('blit')

    return { value: { requestId: 'flowpane' } }
  })
  on('ui.invalidate', () => {
    painted.push('invalidate')

    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'flowpane' } }))
  on('command.run', () => ({ text: '' }))
  on('session.id', () => ({ value: 'test-session' }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('fs.exists', ($$: unknown, e: { path: string }) => ({ value: e.path in FILES }))
  on('fs.read', ($$: unknown, e: { path: string }) => ({ value: FILES[e.path] ?? '' }))

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await clock.advance(600)
  await $.command.run({ command: 'flowpane', args: 'horizontal' })

  await renderPane($)

  for (let beat = 0; beat < 2; beat++) {
    painted.length = 0
    await clock.advance(400)

    expect(painted).toContain('invalidate')
  }

  const pointer = { row: 6 }

  await $.ui.scroll({ requestId: 'flowpane', by: 1, pointer })
  await clock.advance(30)

  const tree = await renderPane($)

  const drawn = nodesOf(tree)

  expect(drawn.filter(n => n.type === 'Raster' || n.type === 'Client').map(n => n.type)).toEqual(['Raster', 'Client'])
  expect(drawn.filter(n => n.type === 'Button' && String(n.props?.key ?? '').startsWith('node:'))).toEqual([])

  painted.length = 0

  for (let step = 0; step < 6; step++) {
    await $.ui.scroll({ requestId: 'flowpane', by: step % 2 === 0 ? -1 : 1, pointer })
    await clock.advance(100)
  }

  expect(painted).toContain('blit')
  expect(painted).not.toContain('invalidate')
})
