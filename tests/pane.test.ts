/**
 * The pane, end to end over the engine: a Workflow launch opens it, a journal
 * on disk fills it, and the Pane's render hands back the drawing.
 *
 * The drawing is not one element. A Raster is a leaf, so the rows that carry a
 * node's label are drawn as Boxes of Text and Buttons and the rest as Rasters
 * between them — which is what makes a node clickable. `paneOf` reads the tree
 * back into the lines a terminal would show, whichever kind each row is.
 *
 * Nothing here touches a real workflow or a real file. The test's own hooks sit
 * beneath the plugin, so `tool.call` answers the launch record the engine would
 * return and `fs.read` answers the journal the run would have written.
 */

import { expect, mock, test } from 'claude-code/testing'

import { cellColor } from '../hooks/canvas'

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

/** A Raster's cells, three words each: the code point, then the two colours. */
function wordsOf(cells: string): Uint32Array {
  const binary = atob(cells)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new Uint32Array(bytes.buffer)
}

/** Decodes a Raster's cells back to the lines a terminal would show. */
function linesOf(cells: string, columns: number, rows: number): string[] {
  const words = wordsOf(cells)
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

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown }

/**
 * A rendered node's children. The engine hands back a tree of its own, where a
 * Text's content and a Box's rows both sit beside `props` rather than in it.
 */
function childrenOf(node: Node): unknown[] {
  const children = node.children ?? node.props?.children

  return children === undefined ? [] : Array.isArray(children) ? children : [children]
}

function elementsOf(node: Node): Node[] {
  return childrenOf(node).filter((c): c is Node => !!c && typeof c === 'object')
}

/** What one element of a drawing row puts on the line. */
function textOf(node: Node): string {
  if (node.type === 'Button') {
    return String(node.props?.label ?? '')
  }

  return childrenOf(node).map(String).join('')
}

type Pane = {
  /** Every row of the drawing, in order, whether it came from a Raster or elements. */
  lines: string[]
  /** The keys of the Rasters the drawing was cut into. */
  keys: string[]
  /** One per node label, keyed `node:<agentId>`. */
  buttons: Node[]
}

/**
 * The pane's drawing, read back out of the render tree.
 *
 * The children of the pane's column are the drawing followed by the footer, so
 * the walk stops at the first row that is neither a Raster nor a row of drawing
 * segments — the footer's own Box.
 */
function paneOf(node: unknown): Pane {
  const root = node as Node
  const lines: string[] = []
  const keys: string[] = []
  const buttons: Node[] = []

  for (const row of elementsOf(root)) {
    if (row.type === 'Raster') {
      const props = row.props as unknown as { key: string; columns: number; rows: number; cells: string }

      keys.push(props.key)
      lines.push(...linesOf(props.cells, props.columns, props.rows))

      continue
    }

    const parts = elementsOf(row)

    // The footer is a row too, and it comes after every band. It is the one
    // holding a control rather than a node — or, with the settings open, a
    // column of two such rows.
    const isFooter =
      row.props?.flexDirection === 'column' ||
      parts.some(p => p.type === 'Button' && !String(p.props?.key ?? '').startsWith('node:'))

    if (isFooter) {
      break
    }

    buttons.push(...parts.filter(p => p.type === 'Button'))
    lines.push(parts.map(textOf).join('').trimEnd())
  }

  if (lines.length === 0) {
    throw new Error('no drawing in the tree')
  }

  return { lines, keys, buttons }
}

function renderPane($: any) {
  return $.ui.render({
    surface: 'terminal',
    component: 'Pane',
    requestId: 'flowpane',
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

/**
 * The calls the plugin makes on `$`, answered from under it. A call's hooks see
 * `{ value }` or `{ deny }`, so that is the shape a bottom implementation hands
 * back — including for the calls whose value is nothing at all.
 */
function stubEngine(on: any, opened: { id: string; title?: string }[] = []) {
  on('env.get', () => ({ value: '/home/test' }))
  on('ui.open', ($$: unknown, e: { id: string; title?: string }) => {
    opened.push({ id: e.id, title: e.title })

    return { value: undefined }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: { requestId: 'flowpane' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'flowpane' } }))
  on('command.run', () => ({ text: '' }))
  on('session.id', () => ({ value: 'test-session' }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('fs.exists', ($$: unknown, e: { path: string }) => ({
    value: e.path === `${TRANSCRIPT}/journal.jsonl`,
  }))
  on('fs.read', ($$: unknown, e: { path: string }) => {
    if (e.path === `${TRANSCRIPT}/journal.jsonl`) {
      return { value: JOURNAL }
    }

    throw new Error(`unexpected read: ${e.path}`)
  })
}

test('a Workflow launch opens the pane and draws the run', async ($, on) => {
  mock.clock(on, { now: 1_000 })

  const opened: { id: string; title?: string }[] = []

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  stubEngine(on, opened)

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })

  expect(opened.map(o => o.id)).toContain('flowpane')

  const pane = paneOf(await renderPane($))
  const text = pane.lines.join('\n')

  expect(text).toContain('probe')
  expect(text).toContain('Collect')
  expect(text).toContain('Merge')
})

test('the drawing is cut into bands so a node can be pressed', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  stubEngine(on)

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await clock.advance(600)

  const pane = paneOf(await renderPane($))

  // Every band is a Raster keyed by the row it starts at, and the rows between
  // them carry the labels — so there is a Button for each agent on screen.
  expect(pane.keys.length).toBeGreaterThan(1)
  expect(pane.keys.every(k => k.startsWith('dag:'))).toBe(true)
  expect(pane.buttons.length).toBeGreaterThanOrEqual(2)

  const keys = pane.buttons.map(b => String(b.props?.key ?? ''))

  expect(keys.every(k => k.startsWith('node:'))).toBe(true)

  // Pressing one opens its detail over the graph, headed by that agent.
  await $.ui.press({ plugin: 'flowpane', key: keys[0], requestId: 'flowpane' })

  const opened = paneOf(await renderPane($)).lines.join('\n')

  expect(opened).toContain('▮ color:red')
  expect(opened).toContain('Response')
})

test('every row is as wide as the drawing, not as wide as the seat', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  stubEngine(on)

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await clock.advance(600)

  const rows = elementsOf((await renderPane($)) as Node)
  const rasters = rows.filter(r => r.type === 'Raster')

  // The canvas is made at the width the surface says the body has, and a
  // Raster is that many cells wide. A row of elements left to itself takes the
  // seat's width instead, so the rows carrying a node's label ran their ground
  // past every Raster beside them and the drawing had a step down
  // its right edge on those rows alone.
  expect(rasters.length).toBeGreaterThan(0)
  expect(Number(rasters[0]?.props?.columns)).toBe(84)

  // And every row sits on the same ground, to the value. A Raster keeps four
  // bits a channel, an element's colour is not rounded at all, so handing both
  // kinds of row the same colour drew them a few values apart and banded the
  // pane across every row that carried a node's label.
  const bg = wordsOf(String(rasters[0]?.props?.cells))[2]
  const ground = `#${cellColor(bg).toString(16).padStart(6, '0')}`

  expect(bg).not.toBe(cellColor(bg))

  for (const row of rows) {
    if (row.type === 'Raster') {
      expect(Number(row.props?.columns)).toBe(84)

      continue
    }

    expect(row.props?.backgroundColor).toBe(ground)
    expect(row.props?.width).toBe(84)
  }
})

test('the journal drives the node states', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })

  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  stubEngine(on)

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })

  // The timer reads the journal a few frames in.
  await clock.advance(600)

  const text = paneOf(await renderPane($)).lines.join('\n')

  expect(text).toContain('color:red')
  expect(text).toContain('color:green')
  // The landed agent carries a tick, the one still running does not. A card
  // sets its name into its top edge, so the two are a stroke or more apart.
  expect(text).toMatch(/✔[─\s]+color:red/)
  expect(text).not.toMatch(/✔[─\s]+color:green/)
})

test('the pane says so when no workflow has run', async ($, on) => {
  mock.clock(on, { now: 0 })
  stubEngine(on)

  const result = await $.command.run({ command: 'flowpane', args: '' })

  expect(JSON.stringify(result)).toContain('No workflow is running')

  // And the pane says it in the drawing rather than in a sentence under an
  // empty rectangle: the bar is there, and under it what the session has run.
  const pane = paneOf(await renderPane($))

  expect(pane.lines[0].trim()).toBe('FlowPane - Dynamic Workflow Visualizer')
  expect(pane.lines[1]).toMatch(/^\u2500+$/)
  expect(pane.lines.join('\n')).toContain('No workflow has run in this session yet.')

  // `$` is unused past here, but the run file path helper is what pairs a
  // transcript directory with the summary the engine writes at the end.
  expect(RUN_FILE).toBe('/session/workflows/wf_test.json')
})
