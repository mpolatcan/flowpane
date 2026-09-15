/**
 * What a press does to the view, with no session under it.
 *
 * These rules used to live inside the plugin's engine handler, where the only
 * way to check one was to drive a whole run. They are a function now, so a
 * press is one call and the answer is the view it returns.
 */

import { expect, test } from 'claude-code/testing'

import { applyPress, MAX_DETAIL, MIN_DETAIL, type PaneView } from '../hooks/press'

function view(): PaneView {
  return {
    orientation: 'flow',
    theme: 'tokyo-night',
    detailRows: 16,
    selectedId: null,
    detailScroll: [],
    picking: false,
    settings: false,
    menu: null,
    about: false,
  }
}

test('opening a node opens its detail and leaves the layout alone', () => {
  const v = view()

  expect(applyPress(v, 'a1', { hasRun: true })).toEqual({ opened: 'a1' })
  expect(v.selectedId).toBe('a1')
  // The detail is a dialog over the drawing. A strip took its rows from the
  // layout, so opening one had to put the graph into the timeline first; a
  // dialog leaves the reader the drawing they asked the question about.
  expect(v.orientation).toBe('flow')

  applyPress(v, '@close', { hasRun: true })

  expect(v.selectedId).toBeNull()
  expect(v.orientation).toBe('flow')
})

test('a layout picked while the detail is open is the one that stays', () => {
  const v = view()

  applyPress(v, 'a1', { hasRun: true })
  applyPress(v, 'orientation', { hasRun: true })

  const picked = v.orientation

  applyPress(v, '@close', { hasRun: true })

  expect(v.orientation).toBe(picked)
})

test('the settings work with no run on the pane, and nothing else does', () => {
  const v = view()

  expect(applyPress(v, 'theme', { hasRun: false }).store).toEqual(['theme'])
  expect(v.theme).not.toBe('tokyo-night')

  applyPress(v, '@runs', { hasRun: false })
  expect(v.picking).toBe(true)

  // A node press with no run has nothing to open, and must not leave the view
  // saying an agent is selected.
  expect(applyPress(v, 'a1', { hasRun: false })).toEqual({})
  expect(v.selectedId).toBeNull()
})

test('the detail dialog stops at both ends of its range', () => {
  const v = view()

  for (let i = 0; i < 40; i++) {
    applyPress(v, 'detail-taller', { hasRun: true })
  }

  expect(v.detailRows).toBe(MAX_DETAIL)

  for (let i = 0; i < 40; i++) {
    applyPress(v, 'detail-shorter', { hasRun: true })
  }

  expect(v.detailRows).toBe(MIN_DETAIL)
})

test('a block scrolls no further than it has lines', () => {
  const v = view()
  const detail = { panes: [{ total: 30, visible: 10, scroll: 0 }, { total: 4, visible: 10, scroll: 0 }] }

  applyPress(v, 'detail-down:0', { hasRun: true, detail })
  expect(v.detailScroll[0]).toBe(3)

  for (let i = 0; i < 20; i++) {
    applyPress(v, 'detail-down:0', { hasRun: true, detail })
  }

  expect(v.detailScroll[0]).toBe(20)

  // A block that fits has nowhere to go, and its arrow says so by doing nothing.
  applyPress(v, 'detail-down:1', { hasRun: true, detail })
  expect(v.detailScroll[1]).toBe(0)

  applyPress(v, 'detail-up:0', { hasRun: true, detail })
  expect(v.detailScroll[0]).toBe(17)
})

test('the two ends of the foot row take turns', () => {
  const v = view()

  applyPress(v, '@settings', { hasRun: true })
  applyPress(v, 'open:theme', { hasRun: true })

  expect(v.settings).toBe(true)
  expect(v.menu).toBe('theme')

  // What the pane is set to and what the pane is are two answers to two
  // questions, and a reader who asked the second is done with the first.
  applyPress(v, '@about', { hasRun: true })

  expect(v.about).toBe(true)
  expect(v.settings).toBe(false)
  expect(v.menu).toBeNull()

  applyPress(v, '@settings', { hasRun: true })

  expect(v.settings).toBe(true)
  expect(v.about).toBe(false)
})

test('the About dialog shuts from its own corner, and from the name again', () => {
  const v = view()

  applyPress(v, '@about', { hasRun: false })

  expect(v.about).toBe(true)

  applyPress(v, '@about-close', { hasRun: false })

  expect(v.about).toBe(false)

  // The name opens it and the name shuts it: the button a reader pressed to
  // ask is the button they press again when they have their answer.
  applyPress(v, '@about', { hasRun: false })
  applyPress(v, '@about', { hasRun: false })

  expect(v.about).toBe(false)
})

test('the run menu shuts whatever the foot row opened', () => {
  const v = view()

  applyPress(v, '@about', { hasRun: true })
  applyPress(v, '@runs', { hasRun: true })

  expect(v.picking).toBe(true)
  expect(v.about).toBe(false)
})
