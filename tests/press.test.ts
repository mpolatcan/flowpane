/**
 * What a press does to the view, with no session under it.
 *
 * These rules used to live inside the plugin's engine handler, where the only
 * way to check one was to drive a whole run. They are a function now, so a
 * press is one call and the answer is the view it returns.
 */

import { expect, test } from 'claude-code/testing'

import type { Orientation } from '../hooks/layout'
import { applyPress, drew, MAX_DETAIL, MIN_DETAIL, nextOrientation, wheel, type PaneView } from '../hooks/press'

function view(): PaneView {
  return {
    orientation: 'horizontal',
    theme: 'tokyo-night',
    detailRows: 16,
    selectedId: null,
    fromRun: null,
    openCall: null,
    callScroll: 0,
    callOutScroll: 0,
    detailScroll: [],
    detailTab: 0,
    bodyScroll: { x: 0, y: 0 },
    following: true,
    opened: [],
    picking: false,
    settings: false,
    menu: null,
    about: false,
  }
}

test('folding a nested run back forgets the steps folded inside it', () => {
  const phase = '▸ code-review'
  const v = view()

  v.opened = [phase, `${phase}\u00001`]

  applyPress(v, `@band:${phase}`, { hasRun: true })

  expect(v.opened).toEqual([])

  // Reopened, the run is whole again rather than carrying a fold the reader
  // made minutes ago and can no longer see the cause of.
  applyPress(v, `@band:${phase}`, { hasRun: true })

  expect(v.opened).toEqual([phase])
})

test('opening a call leaves the tabs where they were, and Back returns to them', () => {
  const v = view()

  applyPress(v, 'a1', { hasRun: true })
  applyPress(v, '@tab:1', { hasRun: true })

  const detail = { panes: [{ total: 0, visible: 0, scroll: 0 }, { total: 40, visible: 10, scroll: 0 }], tab: 1 }

  applyPress(v, 'detail-down:1', { hasRun: true, detail })

  expect(v.detailScroll[1]).toBe(3)

  applyPress(v, '@call:c7', { hasRun: true, detail })

  expect(v.openCall).toBe('c7')
  expect(v.callScroll).toBe(0)
  // The list is still on the row it was left on. The call takes the dialog's
  // rectangle, not its state.
  expect(v.detailTab).toBe(1)
  expect(v.detailScroll[1]).toBe(3)

  // And the call's own reading moves on its own number, not the tab's.
  const open = { panes: [], tab: 1, call: { total: 40, visible: 10, scroll: 0 } }

  applyPress(v, 'detail-down:-1', { hasRun: true, detail: open })

  expect(v.callScroll).toBe(3)
  expect(v.detailScroll[1]).toBe(3)

  applyPress(v, '@call-back', { hasRun: true })

  expect(v.openCall).toBeNull()
  expect(v.detailTab).toBe(1)
  expect(v.detailScroll[1]).toBe(3)
})

test('moving to another agent shuts the call opened out of the last one', () => {
  const v = view()

  applyPress(v, 'a1', { hasRun: true })
  applyPress(v, '@call:c7', { hasRun: true })
  applyPress(v, 'a2', { hasRun: true })

  // A call belongs to the agent that made it, and the dialog came up on a call
  // the node in its title never made.
  expect(v.selectedId).toBe('a2')
  expect(v.openCall).toBeNull()
})

test('opening a node opens its detail and leaves the layout alone', () => {
  const v = view()

  expect(applyPress(v, 'a1', { hasRun: true })).toEqual({ opened: 'a1' })
  expect(v.selectedId).toBe('a1')
  // The detail is a dialog over the drawing. A strip took its rows from the
  // layout, so opening one had to put the graph into the timeline first; a
  // dialog leaves the reader the drawing they asked the question about.
  expect(v.orientation).toBe('horizontal')

  applyPress(v, '@close', { hasRun: true })

  expect(v.selectedId).toBeNull()
  expect(v.orientation).toBe('horizontal')
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

test('the body scrolls as far as the drawing overruns and no further', () => {
  const v = view()
  const body = { x: 0, y: 0, spanX: 0, spanY: 7 }

  applyPress(v, 'body-down', { hasRun: true, body })
  expect(v.bodyScroll).toEqual({ x: 0, y: 3 })

  // Clamped against what the last paint reported. Left to run, a reader who
  // held the arrow past the end of a run would have to press up the same number
  // of times before anything moved.
  for (let i = 0; i < 10; i++) {
    applyPress(v, 'body-down', { hasRun: true, body })
  }

  expect(v.bodyScroll).toEqual({ x: 0, y: 7 })

  // Sideways only where there is anything to the side: a stack divides the
  // width it is given, so only the flow layout ever overruns across.
  applyPress(v, 'body-right', { hasRun: true, body })
  expect(v.bodyScroll.x).toBe(0)

  applyPress(v, 'body-up', { hasRun: true, body })
  expect(v.bodyScroll.y).toBe(4)
})

test('a different drawing starts at the top of itself', () => {
  const v = view()

  v.bodyScroll = { x: 4, y: 12 }
  applyPress(v, 'orientation', { hasRun: true })

  // A cell offset into the drawing it replaced means nothing in the new one.
  expect(v.bodyScroll).toEqual({ x: 0, y: 0 })

  v.bodyScroll = { x: 4, y: 12 }
  applyPress(v, 'run:wf_other', { hasRun: true })

  expect(v.bodyScroll).toEqual({ x: 0, y: 0 })
})

test('a nested run is unfolded and folded back by the same press', () => {
  const v = view()

  v.bodyScroll = { x: 0, y: 6 }
  applyPress(v, '@band:\u25b8 code-review', { hasRun: true })

  expect(v.opened).toEqual(['\u25b8 code-review'])
  // Unfolding adds rows inside the band, so everything above it is where it was
  // and the reader is still looking at the band they pressed. What stops is the
  // following: they opened a nested run to read it, and a pane that went back to
  // the front the moment the phase changed would take it away from them.
  expect(v.bodyScroll).toEqual({ x: 0, y: 6 })
  expect(v.following).toBe(false)

  applyPress(v, '@band:\u25b8 code-review', { hasRun: true })

  expect(v.opened).toEqual([])
})

test('scrolling stops the body following, and a new phase starts it again', () => {
  const v = view()
  const body = { x: 0, y: 12, spanX: 0, spanY: 40 }

  drew(v, { body, front: 'Develop' })

  expect(v.following).toBe(true)
  // Every paint writes back what it drew, so a press steps from what is on the
  // pane rather than from a figure the following made stale.
  expect(v.bodyScroll).toEqual({ x: 0, y: 12 })

  applyPress(v, 'body-up', { hasRun: true, body })

  expect(v.following).toBe(false)
  expect(v.bodyScroll.y).toBe(9)

  // The run ticking is not the run moving on: the same phase still at work
  // leaves the reader where they went.
  drew(v, { body: { ...body, y: 9 }, front: 'Develop' })

  expect(v.following).toBe(false)

  // A different phase is something new to see, and the window goes back to it.
  drew(v, { body: { ...body, y: 9 }, front: 'Verify' })

  expect(v.following).toBe(true)
})

test('the wheel over the drawing moves the drawing', () => {
  const v = view()
  const body = { x: 0, y: 0, spanX: 0, spanY: 40 }

  wheel(v, { body }, 4)

  // The rows the engine asked for, as asked: `by` arrives signed and already
  // accelerated, so it is not multiplied up to the arrow's step.
  expect(v.bodyScroll).toEqual({ x: 0, y: 4 })
  expect(v.following).toBe(false)

  wheel(v, { body }, -10)

  // And clamped at the top, like every other way of moving it.
  expect(v.bodyScroll.y).toBe(0)
})

test('the wheel over a drawing that only goes sideways moves it sideways', () => {
  const v = view()
  // The flow layout, as a real run lays out in it: two hundred columns over the
  // pane's width and not one row over its height.
  const body = { x: 0, y: 0, spanX: 234, spanY: 0 }

  wheel(v, { body, foot: 28 }, 2, 12)

  // A wheel the drawing has no rows to answer with is a wheel that does
  // nothing, so the one way the drawing can go is the way it goes. Sideways a
  // tick is the arrow's own step, not the row's — a cell is half as wide as it
  // is tall, and the run is two hundred columns long.
  expect(v.bodyScroll).toEqual({ x: 16, y: 0 })
  expect(v.following).toBe(false)
})

test('the wheel over the rail along the foot moves the drawing sideways', () => {
  const v = view()
  const body = { x: 0, y: 0, spanX: 60, spanY: 40 }

  // Row 28 is the canvas's last, where the sideways rail is drawn.
  wheel(v, { body, foot: 28 }, 3, 28)

  expect(v.bodyScroll).toEqual({ x: 24, y: 0 })

  // A row above it is over the drawing, which scrolls the way it always did.
  wheel(v, { body, foot: 28 }, 3, 27)

  expect(v.bodyScroll).toEqual({ x: 24, y: 3 })
})

test('the wheel with a node open moves the dialog, not the drawing', () => {
  const v = view()
  const body = { x: 0, y: 0, spanX: 0, spanY: 40 }
  const detail = { panes: [{ total: 80, visible: 10 }, { total: 4, visible: 10 }] }

  v.selectedId = 'verify:perf'
  v.detailTab = 0

  wheel(v, { body, detail }, 5)

  // A dialog is modal here and the drawing behind it takes no presses, so it
  // takes no wheel either. The pane that moves is the tab that is open.
  expect(v.detailScroll[0]).toBe(5)
  expect(v.bodyScroll).toEqual({ x: 0, y: 0 })
})

test('the wheel over an open call moves the compartment it is over', () => {
  const v = view()
  const body = { x: 0, y: 0, spanX: 0, spanY: 40 }
  // The shelf between the two stands on row 9: the argument is above it, the
  // output below.
  const detail = {
    panes: [],
    tab: 1,
    split: 9,
    call: { total: 40, visible: 6, scroll: 0 },
    out: { total: 400, visible: 12, scroll: 0 },
  }

  v.selectedId = 'verify:perf'
  v.openCall = 'c7'

  wheel(v, { body, detail }, 4, 12)

  // A reader with the pointer on a three-line command turned the wheel and
  // watched the answer move instead, because one number moved whichever of the
  // two the paint reported last.
  expect(v.callOutScroll).toBe(4)
  expect(v.callScroll).toBe(0)

  wheel(v, { body, detail }, 3, 6)

  expect(v.callScroll).toBe(3)
  expect(v.callOutScroll).toBe(4)

  // Neither of them touches the tabs waiting behind the call.
  expect(v.detailScroll).toEqual([])
})

test('a nested run opens on its phase, and a row of it remembers the way back', () => {
  const phase = '\u25b8 code-review'
  const v = view()

  applyPress(v, `@run:${phase}`, { hasRun: true })

  // The run has no agent of its own. What is selected is the phase, which is
  // the only thing the press could name: the row a reader pressed stands for
  // fourteen agents and carries the id of whichever one decided the trip.
  expect(v.selectedId).toBe(`@run:${phase}`)
  expect(v.fromRun).toBe(null)

  applyPress(v, 'a4', { hasRun: true })

  expect(v.selectedId).toBe('a4')
  expect(v.fromRun).toBe(phase)

  applyPress(v, '@run-back', { hasRun: true })

  // Back to the list, not out of the reading: a reader working down fourteen
  // agents presses this thirteen times.
  expect(v.selectedId).toBe(`@run:${phase}`)
  expect(v.fromRun).toBe(null)
})

test('an agent opened from the graph has no run behind it', () => {
  const v = view()

  applyPress(v, 'a1', { hasRun: true })

  // The way back is offered only where there is something to go back to. An
  // agent pressed in the drawing has the drawing behind it, which is still on
  // the pane around the dialog.
  expect(v.fromRun).toBe(null)

  applyPress(v, '@close', { hasRun: true })

  expect(v.selectedId).toBe(null)
  expect(v.fromRun).toBe(null)
})

test('the wheel over a nested run moves its list, not the tab an agent was left on', () => {
  const v = view()
  const body = { x: 0, y: 0, spanX: 0, spanY: 40 }
  const detail = { panes: [{ total: 80, visible: 10, scroll: 0 }], tab: 0 }

  // A nested run's dialog is one list and has no tabs. The number left over
  // from the last agent is still in the view, and it is not this dialog's.
  v.selectedId = '@run:▸ code-review'
  v.detailTab = 2

  wheel(v, { body, detail }, 5)

  // Moved by `detailTab`, the wheel wrote into pane two — a pane this dialog
  // does not have — and the list under the pointer stayed where it was.
  expect(v.detailScroll[0]).toBe(5)
  expect(v.detailScroll[2]).toBeUndefined()

  // And the drawing behind the dialog takes no wheel, as it takes no press.
  expect(v.bodyScroll).toEqual({ x: 0, y: 0 })
})

test('the layout control walks the four orientations in one fixed order', () => {
  const walk: Orientation[] = ['horizontal']

  while (walk.length < 5) {
    walk.push(nextOrientation(walk[walk.length - 1]))
  }

  // Written out here rather than read off `ORIENTATIONS`. The footer's control
  // and the settings dialog's list both take their order from that one array,
  // so every check of the agreement so far has been the array agreeing with
  // itself: swapped, both move together and nothing notices. The order is a
  // decision — the two layouts a reader switches between most, then the two
  // they set once — and this is the only place it is written down twice.
  expect(walk).toEqual(['horizontal', 'vertical', 'timeline', 'auto', 'horizontal'])
})
