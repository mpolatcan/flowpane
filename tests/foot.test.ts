/**
 * The row under the drawing: the way into the settings, what the pane is set
 * to, and what the pane is.
 *
 * It is the only part of the pane a reader acts on directly rather than reads,
 * so it has to say which of its words are controls. It used to be four cycles
 * and three rules — a row that read as one sentence, and which of its words did
 * something was found out by clicking them. Two buttons say it instead, one at
 * each end, with the state quiet between them.
 */

import { expect, mock, test } from 'claude-code/testing'
import { NAME, VERSION } from '../hooks/about'

type Node = {
  type?: string
  props?: Record<string, unknown>
  hover?: Record<string, unknown>
  children?: unknown
}

/** Every element of the tree, flat, in the order the row draws them. */
function flatten(tree: unknown): Node[] {
  const out: Node[] = []

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return
    }

    const it = node as Node
    const kids = it.children ?? (it.props?.children as unknown)


    out.push(it)
    ;(Array.isArray(kids) ? kids : [kids]).forEach(walk)
  }

  walk(tree)

  return out
}

/**
 * `stored` is what a session before this one left behind, for the test that
 * reads a setting back: the row is where the pane says what it is set to, so it
 * is where a preference dropped on the way in shows.
 */
function stubEngine(on: any, stored: Record<string, unknown> = {}): void {
  on('env.get', () => ({ value: '/home/test' }))
  on('ui.open', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: { requestId: 'flowpane' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'flowpane' } }))
  on('session.id', () => ({ value: 'test-session' }))
  on('store.get', ($$: unknown, e: { key: string }) => ({ value: stored[e.key] }))
  on('store.set', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
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

/** A string of nothing but the rule glyph: the line above the row. */
const ONLY_RULE = /^\u2500+$/

/** The row's own elements: its buttons, the text between them, and the line. */
function footOf(nodes: Node[]) {
  const buttons = nodes.filter(
    n => n.type === 'Button' && !String(n.props?.key ?? '').startsWith('run:'),
  )
  const strings = nodes
    .filter(n => n.type === 'Text')
    .flatMap(n => (Array.isArray(n.children) ? n.children : [n.children]))
    .filter((child): child is string => typeof child === 'string')

  return {
    buttons,
    texts: strings.filter(t => !ONLY_RULE.test(t)),
    rule: strings.find(t => ONLY_RULE.test(t)) ?? '',
  }
}

test('two buttons, one at each end, and they say so under the pointer', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  stubEngine(on)

  const { buttons } = footOf(flatten(await renderPane($)))

  expect(buttons.map(b => b.props?.key)).toEqual(['@settings', '@about'])
  expect(String(buttons[0].props?.label ?? '')).toBe('⚙ Settings')
  // The name is the button. An icon for it would be one cell wide in one
  // terminal and two in the next, and the row is a grid.
  expect(String(buttons[1].props?.label ?? '')).toBe(`${NAME} ${VERSION}`)

  // Dim at rest and full strength under the pointer: the row stays quiet beside
  // the drawing, and the word a reader is about to press does not.
  for (const button of buttons) {
    expect(button.props?.dimColor).toBe(true)
    expect(button.hover?.dimColor).toBe(false)
    expect(String(button.hover?.color ?? '')).toMatch(/^#[0-9a-f]{6}$/)
    expect(String(button.hover?.scope ?? '').length).toBeGreaterThan(0)
  }
})

test('the row says what the pane is set to, in the dialog own words', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  stubEngine(on)

  // Wide enough for all three: what a narrower pane drops is the next test.
  const nodes = flatten(await renderPane($, 90))
  const { texts } = footOf(nodes)
  const state = texts.find(t => t.includes('│')) ?? ''

  // Every fact is named, in the dialog's own word for it: `tokyo-night` alone
  // is an answer to a question that is not on screen, and a reader who has not
  // opened the dialog has no way to tell which word is the setting and which
  // the value.
  expect(state).toContain('Layout: fits')
  expect(state).toContain('Theme: tokyo-night')
  expect(state).toContain('Detail height: 24 rows')

  // In the order the dialog lists them: a footer that reads down while the
  // dialog reads across is two names for one setting.
  expect(state.indexOf('Theme')).toBeGreaterThan(state.indexOf('Layout'))
  expect(state.indexOf('Detail height')).toBeGreaterThan(state.indexOf('Theme'))

  // One rule before each fact, the same rule the top bar divides with: three
  // facts, three rules. Spaced instead, the row read as one sentence with no
  // way to see where a setting ended.
  expect(state.split('│').length).toBe(4)
  expect(state).not.toContain('·')

  // Quiet, and not a control: the things to press are the things that light,
  // and a third lit word between them is a third thing to try.
  const node = nodes.find(
    n =>
      n.type === 'Text' &&
      (Array.isArray(n.children) ? n.children : [n.children]).includes(state),
  )

  expect(node?.props?.dimColor).toBe(true)
})

test('the row ends where the drawing ends, at every width', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  stubEngine(on)

  for (const columns of [120, 84, 60, 44, 30, 22]) {
    const { buttons, texts, rule } = footOf(flatten(await renderPane($, columns)))
    const drawn = buttons.reduce((w, b) => w + String(b.props?.label ?? '').length, 0)
      + texts.reduce((w, t) => w + t.length, 0)

    // The line above the row spans the drawing and stops with it: a rule drawn
    // to the width of the seat steps off the right edge of everything above it.
    expect(rule.length).toBe(columns)

    // A footer one cell wider than the pane costs the drawing a row and puts
    // half the state under the graph.
    expect(drawn).toBeLessThanOrEqual(columns)
    // The way in is never dropped: a pane with no button is a pane whose
    // settings can only be reached by a command nobody has been told about.
    expect(buttons[0].props?.key).toBe('@settings')
  }
})

test('what will not fit is dropped from the end, and the name goes last', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  stubEngine(on)

  const wide = footOf(flatten(await renderPane($, 88)))
  const middle = footOf(flatten(await renderPane($, 60)))
  const narrow = footOf(flatten(await renderPane($, 30)))

  const stateOf = (texts: string[]) => texts.find(t => t.includes('│')) ?? ''

  expect(stateOf(wide.texts)).toContain('Detail height: 24 rows')
  // The detail height is the first to go: it matters while a node is open, and
  // the layout is the one a reader changes most.
  expect(stateOf(middle.texts)).not.toContain('Detail height')
  expect(stateOf(middle.texts)).toContain('Layout: fits')
  expect(stateOf(narrow.texts)).toBe('')

  // The name outlasts every fact, because a pane that will not say what it is
  // has nowhere to send the reader who asks.
  expect(narrow.buttons.map(b => b.props?.key)).toEqual(['@settings', '@about'])
})

test('a line divides the drawing from the row, and is not a control', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  stubEngine(on)

  const nodes = flatten(await renderPane($))
  const kinds = nodes
    .filter(n => n.type === 'Text' || n.type === 'Button')
    .flatMap(n =>
      n.type === 'Button'
        ? [String(n.props?.key ?? '')]
        : (Array.isArray(n.children) ? n.children : [n.children])
            .filter((c): c is string => typeof c === 'string')
            .map(c => (ONLY_RULE.test(c) ? 'rule' : 'state')),
    )

  // Directly above the row, not floating somewhere in the drawing: the canvas
  // ends, the line is drawn, and the row follows it.
  expect(kinds.indexOf('rule')).toBe(kinds.indexOf('@settings') - 1)

  const line = nodes.find(
    n =>
      n.type === 'Text' &&
      (Array.isArray(n.children) ? n.children : [n.children]).some(
        c => typeof c === 'string' && ONLY_RULE.test(c),
      ),
  )

  // Drawn in the tone the drawing's own rules take, mixed from the ground, so
  // it reads as the last line of the picture rather than as a border the
  // surface put there. The surface's dim would be the colour of the state.
  expect(String(line?.props?.color ?? '')).toMatch(/^#[0-9a-f]{6}$/)
  expect(line?.props?.dimColor).toBeUndefined()
})

test('the row says the layout a session picked up from the store', async ($, on) => {
  mock.clock(on, { now: 1_000 })

  // `stack` is what the layout control wrote into the store before this
  // release, and what `plugin.json` still documents the `orientation` setting
  // as taking for the layout down the pane. Read strictly it is not an
  // orientation, and the preference was dropped on the way in: the row came
  // back saying `fits`, which reads as a control that does not hold.
  on('session.start', ($$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  stubEngine(on, { orientation: 'stack' })

  await $.session.start({ cwd: '/home/test', surface: 'terminal', isInteractive: true })

  const { texts } = footOf(flatten(await renderPane($, 90)))
  const state = texts.find(t => t.includes('\u2502')) ?? ''

  expect(state).toContain('Layout: vertical')
})
