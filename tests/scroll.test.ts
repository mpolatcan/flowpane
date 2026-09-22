/**
 * The detail dialog, driven the way a reader drives it: press the node to open
 * it, press the arrows at the ends of a block's own bar to move that block,
 * and press the mark at the dialog's corner to shut it again.
 *
 * A prompt long enough to overflow its block is the whole point — with a short
 * one every position shows the same lines, and a scroll that does nothing is
 * indistinguishable from a scroll that is broken.
 */

import { expect, mock, test } from 'claude-code/testing'

/**
 * The home the stub answers with: a directory this machine actually has.
 *
 * The plugin looks for `$HOME/.claude/projects` on the way up, to recover the
 * runs of earlier sessions, and the engine refuses `fs.exists` on a path it
 * cannot reach — `a network location is not reached from here (host check)`. A
 * refusal is not a false. The whole hook is skipped, so `command.run` and
 * `session.start` came back with nothing, and the eighteen tests across these
 * five files that drive a hook rather than the painter read an empty reply and
 * failed for a reason none of them was about.
 *
 * `import.meta.dir` is this file's own folder: it exists, it holds no `.claude`,
 * so the recovery finds nothing and returns — which is what `/home/test` was
 * there to arrange — and it is wherever the repo happens to be checked out.
 */
const HOME = import.meta.dir

const TRANSCRIPT = '/session/subagents/workflows/wf_test'

/** A pane with the room for two blocks of a detail beside each other. */
const WIDE = 110

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
  phases: [{ title: 'Collect' }],
}
return agent('long', { label: 'color:red', phase: 'Collect' })`

const JOURNAL = [
  { type: 'launched' },
  { type: 'started', agentId: 'a1', label: 'color:red', phase: 'Collect' },
  { type: 'result', agentId: 'a1', result: 'red' },
]
  .map(l => JSON.stringify(l))
  .join('\n')

/**
 * A hundred numbered lines, so which of them is on screen is unmistakable, and
 * so the block overflows whatever share of the dialog it is given.
 */
const PROMPT = Array.from({ length: 100 }, (_, i) => `line ${String(i + 1).padStart(2, '0')} of the prompt`).join(' ')

const AGENT_FILE = [
  { type: 'user', message: { content: PROMPT } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'red' }] } },
]
  .map(l => JSON.stringify(l))
  .join('\n')

/**
 * The other shape the dialog takes, and the one that was reported broken: a
 * prompt short enough to fit beside a call list far too long for the rows.
 */
const SHORT_PROMPT = 'Say red.'

const CALLS_FILE = [
  { type: 'user', message: { content: SHORT_PROMPT } },
  {
    type: 'assistant',
    message: {
      content: Array.from({ length: 20 }, (_, i) => ({
        type: 'tool_use',
        id: `c${i + 1}`,
        name: 'Bash',
        input: { command: `echo call ${String(i + 1).padStart(2, '0')} of the list` },
      })),
    },
  },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'red' }] } },
]
  .map(l => JSON.stringify(l))
  .join('\n')

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
      const text = childrenOf(it).filter(c => typeof c === 'string')

      lines.push(...(text as string[]))
    }

    childrenOf(it).forEach(walk)
  }

  walk(tree)

  return { text: lines.join('\n'), keys }
}

/**
 * `columns` is the width the pane gives the drawing, which is what decides how
 * many blocks of a detail stand side by side. The default is a pane narrow
 * enough that they stack; the two-column test asks for a wider one.
 */
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

function stubEngine(on: any, agentFile = AGENT_FILE) {
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
  on('fs.exists', ($$: unknown, e: { path: string }) => ({
    value: e.path === `${TRANSCRIPT}/journal.jsonl` || e.path === `${TRANSCRIPT}/agent-a1.jsonl`,
  }))
  on('fs.read', ($$: unknown, e: { path: string }) => {
    if (e.path === `${TRANSCRIPT}/journal.jsonl`) {
      return { value: JOURNAL }
    }

    if (e.path === `${TRANSCRIPT}/agent-a1.jsonl`) {
      return { value: agentFile }
    }

    throw new Error(`unexpected read: ${e.path}`)
  })
}

test('the arrows at the ends of a block’s bar move that block', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  stubEngine(on)

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await clock.advance(600)

  const first = paneOf(await renderPane($))
  const node = first.keys.find(k => k.startsWith('node:'))

  expect(node).toBeDefined()

  await $.ui.press({ plugin: 'flowpane', key: node!, requestId: 'flowpane' })

  const opened = paneOf(await renderPane($))

  expect(opened.text).toContain('line 01 of the prompt')
  expect(opened.keys).toContain('node:detail-down:0')

  await $.ui.press({ plugin: 'flowpane', key: 'node:detail-down:0', requestId: 'flowpane' })

  const scrolled = paneOf(await renderPane($))

  expect(scrolled.text).not.toContain('line 01 of the prompt')
  expect(scrolled.keys).toContain('node:detail-up:0')

  await $.ui.press({ plugin: 'flowpane', key: 'node:detail-up:0', requestId: 'flowpane' })

  expect(paneOf(await renderPane($)).text).toContain('line 01 of the prompt')
})

test('a tab opens its own pane, and the arrow moves the pane that is open', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  stubEngine(on, CALLS_FILE)

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await clock.advance(600)

  const node = paneOf(await renderPane($, WIDE)).keys.find(k => k.startsWith('node:'))

  await $.ui.press({ plugin: 'flowpane', key: node!, requestId: 'flowpane' })

  const opened = paneOf(await renderPane($, WIDE))

  // The dialog opens on the prompt, across the whole pane rather than in a
  // column beside the calls. A one-line prompt has nowhere to go, and says so
  // by having no arrows of its own.
  expect(opened.text).toContain('Say red.')
  expect(opened.text).not.toContain('call 20 of the list')
  expect(opened.keys).not.toContain('node:detail-down:0')
  expect(opened.keys).toContain('node:@tab:1')

  await $.ui.press({ plugin: 'flowpane', key: 'node:@tab:1', requestId: 'flowpane' })

  const calls = paneOf(await renderPane($, WIDE))

  // Newest first: the last call an agent made is the one a reader opened the
  // dialog to see, so it is the one the pane opens on.
  expect(calls.text).toContain('call 20 of the list')
  expect(calls.keys).toContain('node:detail-down:1')

  await $.ui.press({ plugin: 'flowpane', key: 'node:detail-down:1', requestId: 'flowpane' })

  const scrolled = paneOf(await renderPane($, WIDE))

  expect(scrolled.text).not.toContain('call 20 of the list')

  // The whole complaint that started this: moving one pane leaves the other
  // where the reader left it, so the tab back is the prompt, whole.
  await $.ui.press({ plugin: 'flowpane', key: 'node:@tab:0', requestId: 'flowpane' })

  expect(paneOf(await renderPane($, WIDE)).text).toContain('Say red.')
})

test('opening a node draws its detail over the graph, not in place of it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  stubEngine(on)

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await clock.advance(600)

  const first = paneOf(await renderPane($))

  // The row under the drawing says what the pane is set to, so it is what says
  // the drawing is still the one the reader chose.
  expect(first.text).toContain('Layout: fits')

  const node = first.keys.find(k => k.startsWith('node:'))

  await $.ui.press({ plugin: 'flowpane', key: node!, requestId: 'flowpane' })

  const opened = paneOf(await renderPane($))

  // The detail is a dialog over the drawing, so the layout the reader chose is
  // the one still under it. The strip it replaced took its rows from the
  // layout, and opening one had to put the graph into the timeline first.
  expect(opened.text).toContain('Layout: fits')
  expect(opened.text).toContain('line 01 of the prompt')
  // Shutting the dialog is a mark at its own corner now, not a word in the row
  // under the drawing.
  expect(opened.text).not.toContain('Close detail')
  expect(opened.keys).toContain('node:@close')

  await $.ui.press({ plugin: 'flowpane', key: 'node:@close', requestId: 'flowpane' })

  const shut = paneOf(await renderPane($))

  expect(shut.text).not.toContain('line 01 of the prompt')
  expect(shut.text).toContain('Layout: fits')
})

test('a layout picked while the detail is open is the one that stays', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  stubEngine(on)

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await clock.advance(600)

  const node = paneOf(await renderPane($)).keys.find(k => k.startsWith('node:'))

  await $.ui.press({ plugin: 'flowpane', key: node!, requestId: 'flowpane' })
  expect(paneOf(await renderPane($)).text).toContain('Layout: fits')

  // The settings are a dialog over the drawing, opened from the row under it.
  // It covers the detail while it is up and gives it back when it shuts.
  await $.ui.press({ plugin: 'flowpane', key: '@settings', requestId: 'flowpane' })

  const settings = paneOf(await renderPane($))

  // Shut, the dialog says what the pane is set to; the other layouts are
  // behind the control that says it.
  expect(settings.keys).toContain('node:open:layout')
  expect(settings.keys).not.toContain('node:set:orientation:vertical')

  await $.ui.press({ plugin: 'flowpane', key: 'node:open:layout', requestId: 'flowpane' })

  const unrolled = paneOf(await renderPane($))

  expect(unrolled.keys).toContain('node:set:orientation:vertical')

  // Named with the value it is being set to: a press says what it does rather
  // than what it moves on from.
  await $.ui.press({ plugin: 'flowpane', key: 'node:set:orientation:vertical', requestId: 'flowpane' })
  await $.ui.press({ plugin: 'flowpane', key: '@settings', requestId: 'flowpane' })

  const picked = paneOf(await renderPane($))

  expect(picked.text).toContain('Layout: vertical')
  expect(picked.text).toContain('line 01 of the prompt')

  await $.ui.press({ plugin: 'flowpane', key: 'node:@close', requestId: 'flowpane' })

  const shut = paneOf(await renderPane($))

  expect(shut.text).not.toContain('line 01 of the prompt')
  expect(shut.text).toContain('Layout: vertical')
})
