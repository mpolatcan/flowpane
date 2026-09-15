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
  DETAIL_CLOSE,
  MAX_DETAIL,
  MIN_DETAIL,
  RUN_PICKER,
  SETTING_MENUS,
  SETTINGS,
  SETTINGS_CLOSE,
  useTheme,
  type DetailView,
  type SettingMenu,
} from './paint'
import { nextTheme, THEMES } from './theme'

// The bounds belong to the dialog they size, and the settings dialog greys out
// a step that would go past either of them. Re-exported so the plugin still has
// one place to read what a press can do.
export { MAX_DETAIL, MIN_DETAIL, SETTING_MENUS, type SettingMenu } from './paint'

/** Everything a press can change. The plugin's own state is a superset of it. */
export type PaneView = {
  orientation: Orientation
  theme: string
  detailRows: number
  /** The agent whose detail dialog is open. */
  selectedId: string | null
  /** The first line on screen in each block of the dialog. */
  detailScroll: number[]
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
export const ORIENTATIONS: Orientation[] = ['flow', 'stack', 'time', 'auto']

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
export function showDetail(view: PaneView, agentId: string | null): void {
  view.selectedId = agentId
}

/** Moves one block of the dialog, as far as the block has anywhere to go. */
export function scrollDetail(view: PaneView, detail: DetailView | null, pane: number, by: number): void {
  if (!Number.isInteger(pane) || pane < 0) {
    return
  }

  const shown = detail?.panes[pane]
  const last = shown ? Math.max(0, shown.total - shown.visible) : 0
  const at = view.detailScroll[pane] ?? 0

  view.detailScroll[pane] = Math.max(0, Math.min(last, at + by))
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
  context: { hasRun: boolean; detail?: DetailView | null },
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

    return { store: ['orientation'] }
  }

  if (!context.hasRun) {
    return {}
  }

  if (pressed === DETAIL_CLOSE) {
    showDetail(view, null)

    return {}
  }

  if (pressed.startsWith('detail-up:') || pressed.startsWith('detail-down:')) {
    const pane = Number(pressed.slice(pressed.indexOf(':') + 1))

    scrollDetail(view, context.detail ?? null, pane, pressed.startsWith('detail-up') ? -3 : 3)

    return {}
  }

  showDetail(view, view.selectedId === pressed ? null : pressed)
  view.detailScroll = []

  return view.selectedId ? { opened: view.selectedId } : {}
}
