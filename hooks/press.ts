/**
 * What a press does to the view, with nothing of the session in it.
 *
 * The plugin's own press handler had all of this inside it, wound together
 * with the engine calls that persist a setting and read an agent's transcript.
 * That made the pane's behaviour reachable only from a live session: the one
 * place it could be exercised was the place it was hardest to look at. Here
 * the decision is a function over a plain object, so the plugin, the browser
 * tool in `dev/` and a test can all press the same buttons and get the same
 * view back.
 *
 * What the caller must still do is returned rather than done: a run to show, an
 * agent whose transcript wants reading, settings worth remembering. Those need
 * the engine, and the engine is the part that cannot be had outside a session.
 */

import type { Orientation } from './layout'
import {
  ABOUT,
  ABOUT_CLOSE,
  BAND_OPEN,
  CALL_BACK,
  CALL_OPEN,
  CALL_PANE,
  CALL_OUT_PANE,
  DETAIL_CLOSE,
  DETAIL_TAB,
  MAX_DETAIL,
  MIN_DETAIL,
  PASS_OPEN,
  RUN_BACK,
  RUN_OPEN,
  RUN_PICKER,
  SETTING_MENUS,
  SETTINGS,
  SETTINGS_CLOSE,
  useTheme,
  type BodyScroll,
  type DetailView,
  type SettingMenu,
} from './paint'
import { nextTheme, THEMES } from './theme'

// The bounds belong to the dialog they size, and the settings dialog greys out
// a step that would go past either of them. Re-exported so the plugin still has
// one place to read what a press can do.
export { BAND_OPEN, MAX_DETAIL, MIN_DETAIL, SETTING_MENUS, type BodyScroll, type SettingMenu } from './paint'

/** Everything a press can change. The plugin's own state is a superset of it. */
export type PaneView = {
  orientation: Orientation
  theme: string
  detailRows: number
  /**
   * What the detail dialog is open on: an agent by its id, or a nested run by
   * `@run:<phase>`, which has no agent of its own.
   */
  selectedId: string | null
  /**
   * The nested run an open agent was reached from, where it was.
   *
   * Only the way back. Cleared whenever the reading moves anywhere the run's
   * list is not behind, so `◂ Back` is never offered to a dialog that did not
   * come from one.
   */
  fromRun: string | null
  /**
   * The tool call opened out of that agent's Calls list, by its own id.
   *
   * It takes the dialog the agent had rather than opening a box inside it, so
   * the agent's tab and every tab's place are untouched while it is open and
   * the way back is a press rather than a search.
   */
  openCall: string | null
  /** The first line on screen in the opened call. */
  callScroll: number
  callOutScroll: number
  /** The first line on screen in each block of the dialog. */
  detailScroll: number[]
  /**
   * Which of the dialog's tabs is on top.
   *
   * It survives the dialog being shut and another node opened: a reader working
   * down a failed phase is reading the same tab of each agent, and a dialog that
   * opened on the prompt every time made them press twice per node. Out of
   * range for the agent now open, the paint clamps it and reports back which tab
   * it settled on.
   */
  detailTab: number
  /**
   * Where the body is in a drawing larger than it, in cells.
   *
   * The pane keeps the offset and the paint clamps it, so a pane that grows, a
   * run that ends, or a layout that changes shape moves the drawing back into
   * view on its own rather than leaving the reader on a blank field.
   */
  bodyScroll: { x: number; y: number }
  /**
   * Whether the body follows the phase the run is working in.
   *
   * On until a reader scrolls, and on again the moment the run enters a
   * different phase — so looking back at what a finished phase did is a peek
   * that ends when there is something new to see, rather than a state the
   * reader has to remember to leave.
   */
  following: boolean
  /** The phase the last paint said the run was working in, to see it change. */
  front: string | null
  /**
   * The nested runs the reader has unfolded, by phase name.
   *
   * Kept as a list rather than a set so a view is a plain object a test can
   * write out whole, the way every other field here is.
   */
  opened: string[]
  /** True while the run name's list is unrolled under the top bar. */
  picking: boolean
  /** True while the settings dialog is open over the drawing. */
  settings: boolean
  /** Which setting's list is unrolled inside it, of the one that can be. */
  menu: SettingMenu | null
  /** True while the About dialog is open over the drawing. */
  about: boolean
}

/** What the caller has to do about the press, once the view is settled. */
export type PressResult = {
  /** A run the reader asked for by name. */
  run?: string
  /** An agent whose detail just opened, and whose transcript is wanted. */
  opened?: string
  /** Settings the press changed, for whoever keeps them between sessions. */
  store?: ('theme' | 'detailRows' | 'orientation')[]
}

/** The orientations the layout control walks, in the order it walks them. */
export const ORIENTATIONS: Orientation[] = ['horizontal', 'vertical', 'timeline', 'auto']

export function nextOrientation(current: Orientation): Orientation {
  const at = ORIENTATIONS.indexOf(current)

  return ORIENTATIONS[(at + 1) % ORIENTATIONS.length]
}

/**
 * Opens a node's detail dialog, or shuts the open one.
 *
 * The layout is not touched either way. A strip took its rows from the graph,
 * so opening one had to put the graph into the timeline first — half a diagram
 * is worse than a list — and pressing a node redrew every other node smaller.
 * A dialog is over the drawing rather than in it, so the drawing a reader
 * asked a question about is the one still behind the answer.
 */
export function showDetail(view: PaneView, agentId: string | null, fromRun: string | null = null): void {
  view.selectedId = agentId
  view.fromRun = fromRun
  // A call belongs to the agent it was made by. Left open across a move to
  // another node, the dialog came up on a call the node in the title never
  // made — or, where the new agent happened to have a call of the same id, on
  // the wrong one silently.
  view.openCall = null
  view.callScroll = 0
  view.callOutScroll = 0
}

/** Moves one block of the dialog, as far as the block has anywhere to go. */
export function scrollDetail(view: PaneView, detail: DetailView | null, pane: number, by: number): void {
  if (!Number.isInteger(pane)) {
    return
  }

  // An opened call has a list of its own and keeps its own place in it. It is
  // not one of the tabs — the tabs are still there behind it, at the lines the
  // reader left them on — so it is moved by its own number rather than by an
  // index into theirs.
  if (pane === CALL_PANE || pane === CALL_OUT_PANE) {
    const out = pane === CALL_OUT_PANE
    const held = out ? detail?.out : detail?.call
    const end = held ? Math.max(0, held.total - held.visible) : 0
    const at = out ? view.callOutScroll : view.callScroll
    const to = Math.max(0, Math.min(end, at + by))

    if (out) {
      view.callOutScroll = to
    } else {
      view.callScroll = to
    }

    return
  }

  if (pane < 0) {
    return
  }

  const shown = detail?.panes[pane]
  const last = shown ? Math.max(0, shown.total - shown.visible) : 0
  const at = view.detailScroll[pane] ?? 0

  view.detailScroll[pane] = Math.max(0, Math.min(last, at + by))
}

/** A row of the list, and a lane of the graph: one press, one thing more. */
const BODY_STEP_Y = 3
const BODY_STEP_X = 8

/**
 * The wheel over the pane, which moves whatever the reader is looking at.
 *
 * The pane paints one screenful and keeps its own window, so the engine's own
 * scroll never has anywhere to go — its tree is exactly as tall as its body.
 * `ui.scroll` still fires, and this is what answers it: the rows the wheel asked
 * for, applied to the pane's window instead of the engine's.
 *
 * A dialog takes it while one is open, because a dialog is modal here and the
 * drawing behind it takes no presses either. `by` arrives signed and already
 * accelerated — a tick at rest is one row, a burst is more — so it is used as
 * given rather than multiplied up to the arrow's step. An arrow is pressed once
 * for a deliberate move; a wheel is turned until the reader sees what they want.
 *
 * Which way it moves is decided here, because the event does not say. A scroll
 * carries rows and nothing else — one signed axis, and no shift-wheel on the
 * terminal to widen it — so `over`, the body row the pointer was on, is what
 * the sideways move is read from. Two things ask for one: the wheel over the
 * rail along the foot, which moves what that rail moves, the way a wheel over
 * any scrollbar does; and a drawing that can only go sideways, which takes the
 * wheel wherever it is turned. The flow layout is the second case exactly — it
 * overruns by two hundred columns and by no rows at all — and without the rule
 * the widest drawing the pane makes would be the one drawing whose wheel did
 * nothing.
 *
 * Sideways, a tick is the arrow's own step rather than the row's. The two are
 * not the same distance: a cell is about half as wide as it is tall, and two
 * hundred columns at a column a tick is a reader turning the wheel two hundred
 * times to reach the end of a run.
 */
export function wheel(
  view: PaneView,
  context: { detail?: DetailView | null; body?: BodyScroll | null; foot?: number | null },
  by: number,
  over?: number,
): void {
  if (by === 0) {
    return
  }

  if (view.selectedId) {
    // A nested run's list is the whole of its dialog and keeps its place under
    // pane zero. Moved by `detailTab` instead, the wheel wrote into whichever
    // tab the last agent was left on — a pane the run's dialog does not have —
    // and the list under the pointer stayed where it was.
    // An opened call is two compartments with a shelf between them, and the
    // wheel moves the one the pointer is over. Moved by whichever is bigger, a
    // reader with the pointer on a three-line command turned the wheel and
    // watched the answer move instead.
    const split = context.detail?.split
    const onArg = typeof split === 'number' && typeof over === 'number' && over < split
    const pane = view.selectedId.startsWith(RUN_OPEN)
      ? 0
      : view.openCall
        ? onArg || split === undefined
          ? CALL_PANE
          : CALL_OUT_PANE
        : view.detailTab

    scrollDetail(view, context.detail ?? null, pane, by)

    return
  }

  const body = context.body ?? null
  const onRail = typeof context.foot === 'number' && over === context.foot
  const onlySideways = (body?.spanY ?? 0) === 0 && (body?.spanX ?? 0) > 0

  if (onRail || onlySideways) {
    scrollBody(view, body, by * BODY_STEP_X, 0)

    return
  }

  scrollBody(view, body, 0, by)
}

/**
 * What a paint just decided, taken back into the view.
 *
 * Two things: the offset the paint actually drew at, so the next press steps
 * from what is on the pane rather than from a figure the follow made stale —
 * and the phase the run is working in, so a *change* of it can be seen.
 *
 * The change is what ends a peek. A reader who scrolled back to a phase that
 * finished is left there while the run gets on with the same phase it was in,
 * and is taken to the front when the run enters a different one. The other
 * rules were both worse: snapping back on every tick makes the pane unreadable
 * while a run is live, and never snapping back needs a *resume* control, which
 * is a control nobody presses and a pane left showing the past.
 */
export function drew(view: PaneView, drawn: { body?: BodyScroll; front?: string }): void {
  view.bodyScroll = { x: drawn.body?.x ?? 0, y: drawn.body?.y ?? 0 }

  if (drawn.front !== undefined && drawn.front !== view.front) {
    view.following = true
  }

  view.front = drawn.front ?? null
}

/**
 * Moves the drawing under the body, as far as the drawing has anywhere to go.
 *
 * Clamped against what the last paint reported rather than left to run: a
 * reader who held the down arrow past the end of a run would otherwise have to
 * press up the same number of times before anything moved.
 */
export function scrollBody(view: PaneView, body: BodyScroll | null, dx: number, dy: number): void {
  const spanX = body?.spanX ?? 0
  const spanY = body?.spanY ?? 0

  view.bodyScroll = {
    x: Math.max(0, Math.min(spanX, view.bodyScroll.x + dx)),
    y: Math.max(0, Math.min(spanY, view.bodyScroll.y + dy)),
  }
  // Moving the body by hand is what stops it following. The offset it moves
  // from is the one the pane holds, which every paint writes back to what it
  // actually drew — so a first press against a following body steps from what
  // is on the pane rather than from wherever the reader last left off.
  view.following = false
}

/**
 * The press, applied.
 *
 * `hasRun` is whether there is a drawing under the controls at all: the
 * settings and the run picker work from the idle view too, and everything else
 * needs a run to act on.
 */
export function applyPress(
  view: PaneView,
  pressed: string,
  context: { hasRun: boolean; detail?: DetailView | null; body?: BodyScroll | null },
): PressResult {
  if (pressed === RUN_PICKER) {
    view.picking = !view.picking
    view.settings = false
    view.menu = null
    view.about = false

    return {}
  }

  if (pressed.startsWith('run:')) {
    view.picking = false
    view.bodyScroll = { x: 0, y: 0 }
    view.following = true
    view.opened = []

    return { run: pressed.slice(4) }
  }

  // Two things over the drawing at once is one too many: the menu drops from
  // the bar and the settings dialog sits under it, so whichever opens last
  // would be read through the other.
  if (pressed === SETTINGS) {
    view.settings = !view.settings
    view.picking = false
    view.menu = null
    view.about = false

    return {}
  }

  if (pressed === SETTINGS_CLOSE) {
    view.settings = false
    view.menu = null

    return {}
  }

  // The two ends of the foot row open onto the same cell of pane, so they take
  // turns: what the pane is set to and what the pane is are two answers, and a
  // reader who asked for the second is done with the first.
  if (pressed === ABOUT) {
    view.about = !view.about
    view.settings = false
    view.picking = false
    view.menu = null

    return {}
  }

  if (pressed === ABOUT_CLOSE) {
    view.about = false

    return {}
  }

  // A setting says what it is set to and keeps the rest behind that: pressing
  // the control unrolls its list, and pressing it again rolls the list up. One
  // list at a time, because two lists open over each other is two lists a
  // reader has to shut before they can read either.
  if (pressed.startsWith('open:')) {
    const want = pressed.slice('open:'.length) as SettingMenu

    if (!SETTING_MENUS.includes(want)) {
      return {}
    }

    view.menu = view.menu === want ? null : want

    return {}
  }

  // Every setting is named with the value it is being set to, so a press says
  // what it does rather than what it moves on from. A control that cycles can
  // only be read by pressing it: `Theme: gruvbox` says where you are and gives
  // no way to ask for `nord` except five more presses past it.
  if (pressed.startsWith('set:orientation:')) {
    const want = pressed.slice('set:orientation:'.length) as Orientation

    if (!ORIENTATIONS.includes(want)) {
      return {}
    }

    view.orientation = want
    view.menu = null
    // A different axis is a different drawing, and a cell offset into the one
    // it replaced means nothing in it.
    view.bodyScroll = { x: 0, y: 0 }
    view.following = true

    return { store: ['orientation'] }
  }

  if (pressed.startsWith('set:theme:')) {
    const want = pressed.slice('set:theme:'.length)

    if (!THEMES.some(t => t.name === want)) {
      return {}
    }

    view.theme = want
    view.menu = null
    useTheme(view.theme)

    return { store: ['theme'] }
  }

  if (pressed === 'theme') {
    view.theme = nextTheme(view.theme)
    useTheme(view.theme)

    return { store: ['theme'] }
  }

  if (pressed === 'detail-taller' || pressed === 'detail-shorter') {
    const step = pressed === 'detail-taller' ? 2 : -2

    view.detailRows = Math.max(MIN_DETAIL, Math.min(MAX_DETAIL, view.detailRows + step))

    return { store: ['detailRows'] }
  }

  if (pressed === 'orientation') {
    view.orientation = nextOrientation(view.orientation)
    view.bodyScroll = { x: 0, y: 0 }
    view.following = true

    return { store: ['orientation'] }
  }

  if (!context.hasRun) {
    return {}
  }

  if (pressed === DETAIL_CLOSE) {
    showDetail(view, null)

    return {}
  }

  // A row of the Calls list, opened out. The agent's own dialog stays exactly
  // as it was — same tab, same line — because the call takes its rectangle
  // rather than its state, and `◂ Back` puts the reader back on the row.
  if (pressed.startsWith(CALL_OPEN)) {
    view.openCall = pressed.slice(CALL_OPEN.length)
    view.callScroll = 0
    view.callOutScroll = 0

    return {}
  }

  if (pressed === CALL_BACK) {
    view.openCall = null
    view.callScroll = 0
    view.callOutScroll = 0

    return {}
  }

  // A nested run's own name. There is no agent behind it — the row stands for a
  // whole workflow — so the dialog reads the phase, and every agent in it is a
  // row of the list.
  if (pressed.startsWith(RUN_OPEN)) {
    showDetail(view, view.selectedId === pressed ? null : pressed)
    view.detailScroll = []

    return {}
  }

  if (pressed === RUN_BACK) {
    const back = view.fromRun

    showDetail(view, back === null ? null : `${RUN_OPEN}${back}`)
    view.detailScroll = []

    return {}
  }

  // A trip on the dialog's own strip. The tab is left alone — a reader
  // comparing what two attempts were asked is on the Prompt of both — and the
  // way back to a nested run's list goes with it, since a strip inside that
  // reading is not a way out of it.
  if (pressed.startsWith(PASS_OPEN)) {
    const agentId = pressed.slice(PASS_OPEN.length)

    showDetail(view, agentId, view.fromRun)
    view.detailScroll = []

    return { opened: agentId }
  }

  if (pressed.startsWith(DETAIL_TAB)) {
    const want = Number(pressed.slice(DETAIL_TAB.length))

    if (Number.isInteger(want) && want >= 0) {
      view.detailTab = want
    }

    return {}
  }

  // A nested run is a whole workflow inside one band of this one. Shut, it is a
  // row saying how many agents it held; opened, it is the phase every other
  // phase is. The band keeps its name either way, so the same press folds it
  // back up.
  if (pressed.startsWith(BAND_OPEN)) {
    const phase = pressed.slice(BAND_OPEN.length)

    view.opened = view.opened.includes(phase)
      ? // Folding the run back takes the steps a reader folded inside it with
        // it. Left behind, they were state nothing on the pane could see: the
        // run came back on its next press with three of its steps mysteriously
        // rolled up, minutes after the reader folded them. A step key is keyed
        // under the run's own name, which is what makes them findable here.
        view.opened.filter(open => open !== phase && !open.startsWith(`${phase}\u0000`))
      : [...view.opened, phase]
    // The offset stays: unfolding a band adds rows *inside* it, so everything
    // above it is where it was and the reader is still looking at the band they
    // pressed. What stops is the following — a reader who opened a nested run
    // is reading that run, and a pane that pulled them back to the front the
    // moment the phase changed would close what they had just opened.
    view.following = false

    return {}
  }

  if (pressed === 'body-up' || pressed === 'body-down') {
    scrollBody(view, context.body ?? null, 0, pressed === 'body-up' ? -BODY_STEP_Y : BODY_STEP_Y)

    return {}
  }

  if (pressed === 'body-left' || pressed === 'body-right') {
    scrollBody(view, context.body ?? null, pressed === 'body-left' ? -BODY_STEP_X : BODY_STEP_X, 0)

    return {}
  }

  if (pressed.startsWith('detail-up:') || pressed.startsWith('detail-down:')) {
    const pane = Number(pressed.slice(pressed.indexOf(':') + 1))

    scrollDetail(view, context.detail ?? null, pane, pressed.startsWith('detail-up') ? -3 : 3)

    return {}
  }

  // Pressed from inside a nested run's list, the agent remembers the run: the
  // list is the only place in the pane an agent can be reached from that the
  // reader cannot see behind the dialog, so it is the only one worth a way back.
  const from = view.selectedId?.startsWith(RUN_OPEN) === true ? view.selectedId.slice(RUN_OPEN.length) : null

  showDetail(view, view.selectedId === pressed ? null : pressed, from)
  view.detailScroll = []

  return view.selectedId ? { opened: view.selectedId } : {}
}
