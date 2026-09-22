/**
 * The wheel over the pane.
 *
 * The pane paints one screenful and keeps its own window, so the engine's
 * scroll has nowhere to go: its tree is exactly as tall as its body. The plugin
 * answers `ui.scroll` itself and deliberately does not pass it on, which means
 * the whole of what a wheel does — down the drawing, or sideways over the rail
 * along the foot — is decided here and nowhere else.
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
  ...PHASES.flatMap((phase, p) =>
    NAMES.map((n, i) => ({ type: 'result', agentId: `a${p}${i}`, result: n })),
  ),
]
  .map(l => JSON.stringify(l))
  .join('\n')

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
  const children = node.children ?? node.props?.children

  return children === undefined ? [] : Array.isArray(children) ? children : [children]
}

function elementsOf(node: Node): Node[] {
  return childrenOf(node).filter((c): c is Node => !!c && typeof c === 'object')
}

function textOf(node: Node): string {
  return node.type === 'Button' ? String(node.props?.label ?? '') : childrenOf(node).map(String).join('')
}

function wordsOf(cells: string): Uint32Array {
  const binary = atob(cells)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new Uint32Array(bytes.buffer)
}

function linesOf(cells: string, columns: number, rows: number): string[] {
  const words = wordsOf(cells)
  const lines: string[] = []

  for (let y = 0; y < rows; y++) {
    let line = ''

    for (let x = 0; x < columns; x++) {
      line += String.fromCodePoint(words[(y * columns + x) * 3])
    }

    lines.push(line)
  }

  return lines
}

/** Every row of the drawing, in order, whether it came from a Raster or elements. */
function paneOf(node: unknown): string[] {
  const lines: string[] = []

  for (const row of elementsOf(node as Node)) {
    if (row.type === 'Raster') {
      const props = row.props as unknown as { columns: number; rows: number; cells: string }

      lines.push(...linesOf(props.cells, props.columns, props.rows))

      continue
    }

    const parts = elementsOf(row)
    const isFooter =
      row.props?.flexDirection === 'column' ||
      parts.some(p => p.type === 'Button' && !String(p.props?.key ?? '').startsWith('node:'))

    if (isFooter) {
      break
    }

    lines.push(parts.map(textOf).join(''))
  }

  if (lines.length === 0) {
    throw new Error('no drawing in the tree')
  }

  return lines
}

function renderPane($: any) {
  return $.ui.render({
    surface: 'terminal',
    component: 'Pane',
    requestId: 'flowpane',
    viewport: { columns: 56, rows: 18 },
    props: {
      title: 'workflow',
      isFocused: true,
      bodyColumns: 50,
      placement: 'dock',
      scroll: { bodyRows: 14, offset: 0, height: 14 },
      view: {},
    },
  })
}

/**
 * `painted` catches every repaint, for the test that asserts none happened: a
 * wheel that moved nothing still costs a frame if it repaints anyway, and
 * nothing the pane draws would show the difference.
 */
function stubEngine(on: any, painted?: string[]): void {
  on('env.get', () => ({ value: HOME }))
  on('ui.open', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.blit', () => {
    painted?.push('blit')

    return { value: { requestId: 'flowpane' } }
  })
  on('ui.invalidate', () => {
    painted?.push('invalidate')

    return { value: undefined }
  })
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

/** A run drawn into a pane too small for it: both ways across, down alone. */
async function shownRun($: any, on: any, clock: any, layout = 'horizontal'): Promise<string[]> {
  on('tool.call', { tool: 'Workflow' }, () => ({ result: LAUNCH }))
  stubEngine(on)

  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await clock.advance(600)
  await $.command.run({ command: 'flowpane', args: layout })

  return paneOf(await renderPane($))
}

/** The row the rail along the foot is drawn on: the canvas's own last row. */
function railRow(lines: string[]): number {
  return lines.findIndex(line => line.startsWith('\u25c2'))
}

/** Where a word stands in the drawing: which row, and which column of it. */
function findAt(lines: string[], word: string): { row: number; column: number } {
  const row = lines.findIndex(line => line.includes(word))

  return { row, column: row < 0 ? -1 : lines[row].indexOf(word) }
}

test('the drawing this run makes overruns the pane both ways', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const base = await shownRun($, on, clock)

  // The fixture is the test. With a drawing that fits, every wheel is a wheel
  // over nothing and both of the tests below pass saying nothing.
  expect(railRow(base)).toBeGreaterThan(0)
  expect(base.some(line => line.includes('\u25b4'))).toBe(true)
})

test('a wheel over the rail along the foot moves the drawing sideways', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const base = await shownRun($, on, clock)

  await $.ui.scroll({ requestId: 'flowpane', by: -1, pointer: { row: railRow(base) } })

  const moved = paneOf(await renderPane($))
  const was = findAt(base, 'Weigh')
  const now = findAt(moved, 'Weigh')

  // Sideways and only sideways: the phase heading is further along its own row
  // than it was, and it is on the same row.
  expect(now.row).toBe(was.row)
  expect(now.column).toBeGreaterThan(was.column)
})

test('a wheel over the drawing moves it down', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const base = await shownRun($, on, clock)

  await $.ui.scroll({ requestId: 'flowpane', by: 1, pointer: { row: railRow(base) - 3 } })

  const moved = paneOf(await renderPane($))
  const was = findAt(base, 'two')
  const now = findAt(moved, 'two')

  // Down and only down: the second card has come up a row, and it is in the
  // same column it was in.
  expect(now.row).toBeLessThan(was.row)
  expect(now.column).toBe(was.column)
})

test('a wheel that moves nothing leaves the drawing where it was', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const base = await shownRun($, on, clock)

  await $.ui.scroll({ requestId: 'flowpane', by: 0, pointer: { row: railRow(base) } })

  expect(paneOf(await renderPane($)).join('\n')).toBe(base.join('\n'))
})

test('a wheel on the last row moves the drawing up and down where no rail is drawn there', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const base = await shownRun($, on, clock, 'vertical')

  // Down the pane the same run needs no columns it has not got, so the foot
  // carries no sideways rail and its last row is drawing like any other. The
  // rail's row is the one the wheel turns sideways on, and it is not this one.
  expect(railRow(base)).toBe(-1)

  // Back, rather than on: the pane follows the phase at the front, so the
  // drawing opens at the end of itself and the room it has left is upwards.
  await $.ui.scroll({ requestId: 'flowpane', by: -1, pointer: { row: base.length - 1 } })

  const moved = paneOf(await renderPane($))
  const was = findAt(base, 'two')
  const now = findAt(moved, 'two')

  // A reader whose pointer happened to rest along the bottom edge turned the
  // wheel and watched the drawing go sideways, in a layout with nowhere
  // sideways to go — so it went nowhere, and the wheel read as broken.
  expect(now.row).toBeGreaterThan(was.row)
  expect(now.column).toBe(was.column)
})

test('a wheel over a pane with no run on it moves nothing and repaints nothing', async ($, on) => {
  mock.clock(on, { now: 1_000 })

  const painted: string[] = []

  stubEngine(on, painted)

  await $.ui.scroll({ requestId: 'flowpane', by: 4, pointer: { row: 3 } })

  // There is no drawing to move and no view to move it in, and the frame a
  // repaint costs buys the reader nothing. The engine sends a wheel at every
  // notch it is turned, so the pane is asked this far more often than it is
  // asked anything else.
  expect(painted).toEqual([])
})
