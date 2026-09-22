/**
 * Paints a run onto a canvas: the header band, the phases along whichever axis
 * the layout chose, the barrier spines between them, the inferred carries that
 * cross a barrier, the agent nodes, and — when one is selected — the detail
 * dialog carrying what the graph has no room for.
 *
 * Everything here is a pure function of the run, the tick and the selection, so
 * the ticker can repaint and blit without the engine re-rendering the tree. It
 * returns the label spans it drew, which is what makes a node clickable: the
 * tree builder lays a Button over the same cells.
 */

import {
  ARM,
  armsOf,
  Canvas,
  cells,
  cross,
  DEFAULT_COLOR,
  edge,
  HOP,
  joint,
  line,
  mix,
  PORT,
  spinnerAt,
  type Rgb,
} from './canvas'
import { aboutRows, NAME, shippedVersion, TAGLINE, type AboutRow } from './about'
import { modelName, type AgentRow, type RunState, type RunStatus, type Step, type ToolCall } from './journal'
import { DEFAULT_THEME, paletteOf, themeOf, THEMES, type Palette, type Theme } from './theme'
import {
  aheadDepth,
  barRowsOf,
  entryOf,
  exitOf,
  extentOf,
  INSET_W,
  layout,
  type LaneBox,
  type Layout,
  type NodeBox,
  type Orientation,
  scrolled,
  titledPane,
} from './layout'
import {
  chainOf,
  wavesOf,
  edgesOf,
  follows,
  isPipelineLike,
  orderedLanes,
  passesFor,
  passesOf,
  sourcesOf,
  type Carry,
  type FoldedLane,
  type FoldPass,
  type Pass,
} from './shape'

/**
 * Four state colours, three data colours, and the greys between them.
 *
 * The states answer "how is it going": only work in flight is warm, so a
 * running agent is the one thing on a finished-green pane that moves and
 * glows. The data colours answer "what am I looking at": the clock, the token
 * count and the model name each keep one hue wherever they are drawn — on a
 * node, down a timeline row, in the detail dialog — so a column of numbers can
 * be read by colour before it is read by position. They are deliberately
 * quiet: three more saturated hues beside the states would be confetti.
 */
let COLORS: Palette = paletteOf(themeOf(DEFAULT_THEME))

/**
 * The theme those colours were derived from.
 *
 * The palette answers what to paint a thing in, which is all the drawing needs.
 * The settings dialog needs one fact the derivation loses: which of the themes
 * is the one on, so its own row can be marked in a list of all six.
 */
let THEME: Theme = themeOf(DEFAULT_THEME)

/**
 * Paints in this theme from here on.
 *
 * The palette is a module binding rather than something threaded through every
 * call: it is read at draw time by about two hundred sites, and a theme is a
 * property of the pane rather than of any one of them.
 */
export function useTheme(name: string): void {
  THEME = themeOf(name)
  COLORS = paletteOf(THEME)
}

/**
 * The brightest point of a breathing rule or a live bar.
 *
 * Derived from the palette rather than fixed: the warm cream it used to be was
 * chosen against one theme's yellow, and under another it read as a second
 * colour entering the drawing rather than as the same colour lit.
 */
function glowOf(): Rgb {
  return mix(COLORS.running, COLORS.text, 0.55)
}

/**
 * The colour of a rule, a border or an empty track: structure the drawing needs
 * and the reader should not have to look at.
 *
 * Mixed toward the palette's own grey, and never toward a hue. It used to be
 * mixed toward the accent, which is the blue the wires are drawn in — so a
 * phase border and the line crossing it were the same colour, and the drawing
 * read as though the two meant the same thing. Structure is grey here and
 * everywhere; a colour on this pane is a fact about the work.
 *
 * It is still mixed from the ground rather than fixed: the flat dark grey it
 * replaced was picked against the pane's own ground, where it all but
 * disappeared, and on any other ground it read as a full-width smear left over
 * from another program rather than as a line this drawing meant to put there.
 */
export function quietOf(ground: Rgb): Rgb {
  return mix(ground === DEFAULT_COLOR ? COLORS.track : ground, COLORS.dim, 0.38)
}

/**
 * The ground a block of quoted material sits on: what an agent was asked, what
 * it called, what it answered.
 *
 * One step off the pane's own ground and no more. The block has to read as
 * something set into the pane rather than written on it, and a panel that
 * announces itself is a second frame around text that already has a heading
 * and a rule.
 */
function quoteOf(ground: Rgb): Rgb {
  return mix(ground === DEFAULT_COLOR ? COLORS.track : ground, COLORS.track, 0.6)
}

/**
 * How a repeat is written wherever one is shown: on the node that made it, and
 * on the caption of the phase that looped.
 *
 * Two cells, because the node has two to spare and the fact is worth them: a
 * phase with three agents against one file has either opened three lenses at
 * once or gone round three times, and the drawing cannot say which by position.
 */
const LOOP = 0x21bb

function loopMark(count: number | undefined): string {
  return count === undefined || count < 1 ? '' : `${String.fromCodePoint(LOOP)}${count}`
}

/** The most passes any one piece of this phase's work took. */
function deepest(agents: AgentRow[], passes: Map<string, Pass>): number {
  return Math.max(0, ...agents.map(a => passes.get(a.agentId)?.total ?? 0))
}

const DASH_H = 0x2504
const DASH_V = 0x2506
const BULLET = 0x25ae
/** One cell of a palette, three of them to a theme in the settings dialog. */
const SWATCH = 0x25ae
const ARROW_RIGHT = 0x25b8
const ARROW_DOWN = 0x25be
const ARROW_UP = 0x25b4
const ARROW_LEFT = 0x25c2
/** The rule down a node's left edge, in place of a frame around it. */
/**
 * The two weights a card's frame is drawn in: light for a node, heavy for the
 * one whose detail is open. Weight rather than colour alone, so the open card
 * is still the open card in a terminal that renders the palette differently.
 */
const LIGHT = { across: 0x2500, down: 0x2502, tl: 0x256d, tr: 0x256e, bl: 0x2570, br: 0x256f }
/** Where a crossbar meets the wall of the box it is inside: `├` and `┤`. */
const SHELF_L = 0x251c
const SHELF_R = 0x2524
const HEAVY = { across: 0x2501, down: 0x2503, tl: 0x250f, tr: 0x2513, bl: 0x2517, br: 0x251b }

/**
 * The dashed register: the strip of phases still ahead, and the rules a list
 * row is divided by. A dash here is a double one, so it is never a carry.
 */
const SEAM_V = 0x254e
const SEAM_H = 0x254c

/**
 * The boundary between two phases, laid out across.
 *
 * Continuous, where the dashed seam above is what it used to be. On a terminal
 * the dash did not hold that line apart from the wires: an inferred carry is
 * drawn in the triple dash, and at the size a cell renders, two dash patterns
 * two columns apart are one grey shimmer. The gutter carried four verticals —
 * two wires, a barrier spine and this — and a reader could not say which of
 * them bounded a phase and which joined two agents.
 *
 * So the boundary runs whole and the wires keep the dash, which now means one
 * thing on this pane: a carry read off the labels rather than proved by the
 * text. The boundary gives way wherever a wire crosses it — the wire stays
 * whole and the border breaks — and a one-cell gap in a straight grey line is
 * a gap the eye closes without being asked.
 */
const BOUND_V = 0x2502

/** The state bar down the left of a list row, where there is no room for a card. */
const RULE = 0x258c

/** The stroke between one piece of the header and the next. */
const SEP_V = 0x2502
/** The header's closing rule: run through, filled where work has landed. */
const RULE_DONE = 0x2501
const RULE_LEFT = 0x2500
/** The same two strokes, dashed: a band that is another workflow's run. */
const SEAM_DONE = 0x254d
const SEAM_LEFT = 0x254c

/**
 * The stroke a phase's rule is drawn in.
 *
 * Dashed where the phase is a nested run. The pane already spends that stroke
 * on work which is not this run's own — the phases it skipped, the strip
 * naming the ones still ahead — and a nested run is the third of those: its
 * agents belong to a workflow this one called, and they are on the pane
 * because the call happened here, not because this run ran them.
 *
 * It costs no cells, it reads at a glance down a column of seventeen rules,
 * and it is the same fact in every layout, because every layout draws a phase
 * as a rule with a name in it. The alternative was a bracket in the margin,
 * which needs two columns the narrow panes do not have and cannot be drawn at
 * all beside a band laid out across.
 */
function ruleOf(nested: boolean, landed: boolean): number {
  return nested ? (landed ? SEAM_DONE : SEAM_LEFT) : landed ? RULE_DONE : RULE_LEFT
}
/** The run name's caret: shut it points down at the list, open it points back. */
const CARET_DOWN = 0x25be
const CARET_UP = 0x25b4

/** The detail dialog's close mark, at the dialog's own top corner. */
const CLOSE_MARK = 0x2715

/**
 * The mark that says a figure is a duration.
 *
 * A card twenty cells wide has room for `1m54s 38k` and none for the words, and
 * without a mark the two figures are told apart by colour alone — which leaves
 * `1m` a minute on one card and `1.1m` a million tokens on the next. So the
 * duration is marked and the token count is not: an hourglass says what it
 * stands against without being read as anything else, and whatever is beside it
 * unmarked is the count. The mark is written against its figure with no space
 * between, so the pair reads as one word rather than as a glyph and a number.
 *
 * The token count carries the same kind of mark. The first one tried was a
 * diamond, which stands for nothing in particular — a reader who has not been
 * told cannot work out what it means, and there is nowhere in the pane that
 * tells them. `\u2211` is not that: a token count is a total, and a sum sign is
 * what a total is written under everywhere else. It costs one cell where the
 * word `tkns` cost five, so every card can carry it and no figure on the pane
 * stands without saying what it is a figure of.
 */
const CLOCK_MARK = '\u29d6'
const SPEND_MARK = '\u2211'
/**
 * What stands where a token count would, for a row that has none.
 *
 * A row with no figure used to draw no figure, which is the same picture a row
 * that genuinely spent nothing draws — and the two are not the same fact. An
 * agent's count arrives twice: the engine attributes one to every agent when
 * the run ends, and until then the pane has whatever it read of that agent's
 * own transcript. So a finished agent inside a running run can have nothing to
 * show yet, and drawing nothing said it had been cheap. The dash says the pane
 * does not know, `\u22110` says it knows the answer is none, and a reader can
 * tell a reporting gap from a cheap step.
 */
const SPEND_NONE = '\u2014'
const TOOL_MARK = '\u2699'
const THINK_MARK = '\u25cc'
const REQUEST_MARK = '\u21c4'
/** How many agents: two of a thing joined, because that is what it counts. */
const FLEET_MARK = '\u29c9'

/** Where a phase seam hangs off that rule. */
const TEE_DONE = 0x252f
const TEE_LEFT = 0x252c
const TEE_RIGHT = 0x251c
/** The cells the surface's own close control takes, top right. */
const CLOSE_W = 2
/**
 * The cells one block of a detail needs to carry a wrapped line without
 * breaking it mid-phrase.
 */
const BLOCK_W = 40

/** Where a node's label was drawn, so the tree can lay a Button over it. */
export type Hotspot = {
  agentId: string
  x: number
  y: number
  w: number
}

/**
 * The hotspot id the run's own name carries, in place of an agent's.
 *
 * The chooser that switches runs used to be a row of its own under the footer,
 * on screen whether or not anyone was choosing. The run's name is already at
 * the top of the pane saying which run this is, so the name is the control: it
 * is the same fact, and pressing what a thing is called to get the others is
 * how every other chooser in a terminal behaves. The `@` cannot collide with an
 * agent id, which the engine writes as a plain identifier.
 */
export const RUN_PICKER = '@runs'

/** The hotspot key the detail dialog's close mark carries. */
export const DETAIL_CLOSE = '@close'

/**
 * The hotspot key the settings button carries.
 *
 * Every setting used to be a control of its own in a row under the drawing:
 * four presses wide, on screen whether or not anyone was changing anything, and
 * each one a cycle you could only read by pressing it. One button opens them
 * all, and the row it came from now spends its width saying what the pane is
 * set to rather than how to change it.
 */
export const SETTINGS = '@settings'

/** The hotspot key the settings dialog's close mark carries. */
export const SETTINGS_CLOSE = '@settings-close'

/**
 * The hotspot key the pane's own name carries, at the far end of the foot row.
 *
 * The name is the button. An `i` in a circle is two cells wide in some
 * terminals and one in others, and a row that reads well in one terminal and
 * wraps in the next is worse than one with no icon — the same reason the foot
 * row's gear is a geometric glyph rather than an emoji. What a reader presses
 * to find out what this is, is what it is called.
 */
export const ABOUT = '@about'

/** The hotspot key the About dialog's close mark carries. */
export const ABOUT_CLOSE = '@about-close'

/**
 * Rows the detail dialog can be asked for.
 *
 * How tall the dialog opens is a fact about the dialog, so the bounds live
 * beside the code that draws it — the settings dialog reads them to grey out a
 * step that would go past either end.
 */
export const MIN_DETAIL = 5
export const MAX_DETAIL = 32

export type PaintOptions = {
  nowMs: number
  tick: number
  orientation?: Orientation
  /** The agent whose detail dialog is open, if any. */
  selectedId?: string
  /** Rows the detail dialog may take; 0 draws none. */
  detailRows?: number
  /** The first line to show in each block of the dialog; clamped to each list. */
  detailScroll?: number[]
  /** Which of the dialog's tabs is open; clamped to the ones the agent has. */
  detailTab?: number
  /**
   * The tool call opened out of the Calls list, by its own id.
   *
   * It takes the dialog the agent had, so the agent's tab and scroll are left
   * where they were and the way back returns to them.
   */
  openCall?: string
  /** The first line to show in the opened call's argument; clamped to what it holds. */
  callScroll?: number
  /** The first line to show in the opened call's output; clamped the same way. */
  callOutScroll?: number
  /**
   * The nested run an open agent was reached from, by its phase.
   *
   * Only for the way back: the agent is drawn exactly as it would be had it
   * been pressed in the graph, with `◂ Back` added to its corner.
   */
  fromRun?: string
  /**
   * How far the drawing is scrolled inside the body, in cells; clamped to what
   * the drawing actually overruns by, so a pane that grew scrolls back on its
   * own rather than leaving the reader on a blank field.
   */
  bodyScroll?: { x: number; y: number }
  /**
   * Whether the window follows the phase the run is working in. On by default,
   * and off only while a reader is looking somewhere else. `bodyScroll` is what
   * the pane shows when it is off.
   */
  follow?: boolean
  /**
   * Whether the run's name opens the list of the session's other runs, and
   * whether that list is open. Absent where there is nothing to choose between.
   */
  runPicker?: 'shut' | 'open'
  /**
   * The session's runs, for the list the name opens. Read only while that list
   * is open; the menu puts them in its own order.
   */
  runs?: RunEntry[]
  /**
   * The first row of that list on screen, where it is taller than the pane.
   *
   * Absent until a reader scrolls, and absent again once the list is shut: an
   * unscrolled list seats itself on the run the pane is drawing, so a reader
   * who opens the list to move away from the run they are on can see where they
   * are standing without scrolling to find it.
   */
  runScroll?: number
  /** True while the settings dialog is open over the drawing. */
  settings?: boolean
  /**
   * Which setting's list is unrolled inside that dialog, if any.
   *
   * The dialog shows what the pane is set to and keeps the rest behind the
   * control that says it, so one list at a time is open and the pane has to
   * remember which.
   */
  menu?: SettingMenu
  /** True while the About dialog is open over the drawing. */
  about?: boolean
  /**
   * The nested runs the reader has unfolded, by phase name. A nested run left
   * shut is one row saying how many agents it held; opened it is the phase every
   * other phase is.
   */
  opened?: string[]
}

/**
 * One run as the menu lists it.
 *
 * The parts arrive separately rather than as one line because the menu draws
 * them in three columns and three colours: the state's own glyph, the name and
 * how far it got, and the clock it started on.
 */
export type RunEntry = {
  id: string
  /** The glyph for the state the run is in. */
  mark: string
  /** What the workflow is called. */
  name: string
  /** How many of its agents landed, as `6/10`. */
  tally: string
  status: RunStatus
  /** When it started, for the clock column and for the order. */
  startedMs: number
}

/**
 * How much of the drawing the body is showing, and how much of it is off the
 * edges. The pane keeps the offset; this is what it clamps the offset against,
 * so the scroll follows the drawing when the drawing or the pane changes size.
 */
export type BodyScroll = {
  /** Where the body is, in cells from the drawing's own origin. */
  x: number
  y: number
  /** The furthest either can go: the drawing's extent less the body's own. */
  spanX: number
  spanY: number
}

/**
 * How much of the session's runs a list is showing, and whereabouts in them.
 *
 * Reported back the way the detail dialog's panes and the body are: the pane
 * keeps an offset, the paint clamps it against what it actually drew, and the
 * pane takes the clamped figure. A list that shrank because a run ended, or a
 * pane that grew, moves back into view on its own rather than leaving the
 * reader on a blank field.
 */
export type RunWindow = {
  /** Every row the list has, headings included. */
  total: number
  /** How many of them the pane can stand at once. */
  visible: number
  /** The first row on screen. */
  scroll: number
}

export type PaintResult = {
  hotspots: Hotspot[]
  /**
   * Which way the drawing was read, not which layout drew it.
   *
   * `list` is a layout a reader can ask for and never an answer here: the flat
   * list runs down the pane, so it is drawn on the vertical axis and reports
   * it. Naming it in this union would offer a caller a case that can never
   * arrive, and a caller that branched on it to find the list would silently
   * never match.
   */
  orientation: 'horizontal' | 'vertical' | 'timeline'
  /** The detail list's extent and window, when one is drawn. */
  detail?: DetailView
  /** Where the drawing sits in the body, when it is larger than the body. */
  body?: BodyScroll
  /** The run list's extent and window, wherever one is drawn. */
  runList?: RunWindow
  /**
   * The phase the run is working in, while it is running.
   *
   * What the window follows, and what says when it should stop following: a
   * reader who scrolled away is left alone until this changes, which is the
   * run moving on rather than the run merely ticking.
   */
  front?: string
  /**
   * The layout the drawing was actually made from, scroll and all.
   *
   * A rail costs the drawing a column, so the painter's own layout is not
   * always the one a bare `layout()` at the same size returns — and anything
   * asking where a box ended up has to ask the painter.
   */
  view?: Layout
}

/**
 * A running agent with nothing seen from it for this long is called quiet: no
 * request streaming, no tool call. Long enough that a slow model response is
 * not accused, short enough that a hung one is noticed before the run is.
 */
const QUIET_MS = 45_000

/** The tokens a row can claim: the summary's once it has them, the live sum until then. */
function tokensOf(agent: AgentRow): number | undefined {
  return agent.tokens ?? agent.liveTokens
}

/** How long a running agent has been silent, or 0 when it is not. */
function quietFor(agent: AgentRow, nowMs: number): number {
  if (agent.state !== 'running' || agent.isThinking || agent.tools.some(t => t.isRunning)) {
    return 0
  }

  const since = nowMs - (agent.activeMs ?? agent.startedMs)

  return since >= QUIET_MS ? since : 0
}

function colorOf(state: AgentRow['state']): Rgb {
  return state === 'done'
    ? COLORS.done
    : state === 'failed'
      ? COLORS.failed
      : state === 'stopped'
        ? COLORS.stopped
        : COLORS.running
}

/**
 * How far a card's frame is carried toward the state of the agent inside it.
 *
 * Four fifths. Just over half was the first setting, and on a dark ground it
 * was not enough: `done` landed on a muted teal and `running` on an olive, and
 * a pane of twenty cards read as a pane of grey boxes with coloured ticks in
 * them. The hue has to survive being drawn one cell wide in a line glyph, which
 * is a fraction of the ink a word of the same colour puts down.
 *
 * It stops short of the state colour itself so the frame stays a boundary: at
 * full strength the border is the brightest thing on the card and is read
 * before the name and the figures it encloses.
 */
const STATE_EDGE = 0.8

/**
 * A card's frame, tinted by the state of the agent it encloses.
 *
 * The frame was once drawn in the plain boundary tone for every card, because
 * an earlier attempt at a state-coloured edge failed on three counts: it was
 * the full state colour, so the border shouted louder than the name it framed;
 * the stopped state was a grey, so a cut-off card's frame was the same grey as
 * the phase boundary behind it; and the wires were free to be drawn in a hue a
 * state was also drawn in, so a border and the line crossing it could agree in
 * colour while meaning different things.
 *
 * All three are now settled. `stopped` is a grey carried toward the text tone,
 * well clear of the near-ground tone the boundaries are drawn in, so a cut-off
 * card is read as cut off rather than as a rule. `edgeOf` picks a wire hue
 * at least 45 degrees off every state hue, so no card's frame can be mistaken
 * for the wire that lands on it. And the tint stops at `STATE_EDGE`, so the
 * frame is a boundary that also says something rather than a slab of colour.
 *
 * What it buys is the reading a graph is for: which part of the run is done,
 * which part is working and which part broke, taken in as shapes on a page
 * before a single word is read.
 */
export function frameOf(state: AgentRow['state'], ground: Rgb): Rgb {
  return mix(quietOf(ground), colorOf(state), STATE_EDGE)
}

/**
 * What happened to an agent, in a word, for the timeline.
 *
 * A bar is a measurement, and a measurement cannot say whether the thing it
 * measures finished: three weights of block and a mark one cell wide were
 * carrying that on their own, and a stopped agent's hollow grey bar read as a
 * row that had not been drawn yet rather than as work the run cut off. A
 * running agent is the exception, and says what it is doing instead — which is
 * the fact that changes while it is watched.
 */
function stateWord(state: AgentRow['state']): string {
  return state === 'running' ? '' : state === 'done' ? 'done' : state === 'failed' ? 'failed' : 'stopped'
}

/**
 * The glyph beside a node's name: spinner, tick, cross, or the stopped mark.
 *
 * All four are drawn heavy. A state mark is one cell against a name drawn in
 * several, so a light glyph loses the comparison it is there to win: `\u2718` and
 * `\u229d` are outlines, and at a glance a pane of them reads as a pane of
 * identical grey specks. `\u2716` and `\u2298` fill the cell the way `\u2714` does.
 */
function markOf(state: AgentRow['state'], tick: number): number {
  return state === 'running'
    ? spinnerAt(tick)
    : state === 'done'
      ? 0x2714
      : state === 'failed'
        ? 0x2716
        : 0x2298
}

function elapsed(ms: number): string {
  if (ms < 1000) {
    return `${Math.max(0, Math.round(ms))}ms`
  }

  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`
  }

  const minutes = Math.floor(ms / 60_000)

  return `${minutes}m${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}s`
}

/**
 * A token count in five cells at most: `812`, `38.4k`, `1.1m`.
 *
 * A long run spends millions, and `2431.7k` is a figure a reader has to count
 * the digits of before they know what it is. The scale changes at a thousand of
 * the unit below it, and one decimal is kept either side of the change so the
 * figure never jumps from `999k` to `1m`.
 *
 * Called with nothing, it writes the dash: every spelling below is built from
 * this one or from {@link tokensShort}, so the two guards give the whole ladder
 * a way to say that no count was recorded, each in its own shape.
 */
function tokens(n?: number): string {
  if (n === undefined) {
    return SPEND_NONE
  }

  if (n < 1000) {
    return String(n)
  }

  const scaled = n >= 1_000_000 ? n / 1_000_000 : n / 1000
  const unit = n >= 1_000_000 ? 'm' : 'k'
  // A decimal that is always a zero is a decimal that says nothing: `15.0k` is
  // `15k` written in two more cells.
  const figure = scaled.toFixed(1).replace(/\.0$/, '')

  return `${figure}${unit}`
}

/** The same again with the mark held off the figure, for a card that can hold it. */
function tokensShortWide(n?: number): string {
  return tokensShort(n).replace(SPEND_MARK, `${SPEND_MARK} `)
}

/** The same count with the decimal dropped once it buys nothing: `15k`, `9.4k`. */
function tokensShort(n?: number): string {
  if (n === undefined) {
    return `${SPEND_MARK}${SPEND_NONE}`
  }

  if (n < 1000) {
    return `${SPEND_MARK}${n}`
  }

  const scaled = n >= 1_000_000 ? n / 1_000_000 : n / 1000
  const unit = n >= 1_000_000 ? 'm' : 'k'
  const figure = scaled >= 10 ? `${Math.round(scaled)}${unit}` : `${scaled.toFixed(1)}${unit}`

  return `${SPEND_MARK}${figure}`
}

/** The count under its mark, the way a card glues its clock to its duration. */
function tokensLong(n?: number): string {
  return `${SPEND_MARK}${tokens(n)}`
}

/** The same, with a space, for the two rows wide enough to let it breathe. */
function tokensWide(n?: number): string {
  return `${SPEND_MARK} ${tokens(n)}`
}

/**
 * The widest spelling of all: the mark, the figure, and the unit written out.
 *
 * `∑ 38.4k` says which measurement it is to a reader who knows the pane, and
 * the mark is the only thing telling them. Where the row has five cells to
 * spare it says so in words instead, and nobody has to learn the mark to read
 * the pane's most-quoted figure. It is the first form to go when the room runs
 * out, because the mark carries the same fact in a fifth of the width.
 */
function tokensNamed(n?: number): string {
  return `${tokensWide(n)} tkns`
}

/**
 * How a card writes its token count: with the unit where every card can hold
 * it, bare where one cannot.
 *
 * `17k` beside `⧖12.9s` is two figures in two units, and only one of them says
 * which it is — the duration carries a clock, the count carried nothing, so a
 * reader had to know the pane to know what the second figure was. Both carry a
 * mark now; what is left to choose is the precision, and a decimal costs two
 * cells that a card of thirty-two columns has and a card of fourteen does not.
 *
 * Every card or none. Two spellings of one measurement down a column of cards
 * is a column that has to be read twice, which is the whole reason the picture
 * settles its formats once a frame rather than per node. A list needs neither:
 * its counts are a column, and a column says its unit at the head.
 */
function spendingOf(
  nodes: NodeBox[],
  nowMs: number,
  clock: (ms: number) => string,
  density: 'card' | 'row',
): (n?: number) => string {
  if (density !== 'card') {
    return tokensShort
  }

  const holds = (form: (n: number) => string) =>
    nodes.every(node => {
      const spent = tokensOf(node.agent)

      if (spent === undefined) {
        return true
      }

      const took = (node.agent.endedMs ?? nowMs) - node.agent.startedMs

      // The duration, two cells between the figures, and one inside each stroke.
      return clock(took).length + 2 + form(spent).length <= node.w - 4
    })

  // Widest first: the decimal, then the cell of air that divides the mark from
  // the figure, then the figure alone. The air outranks the decimal — `∑ 17k`
  // is a count with a mark beside it, `∑17.3k` is one token a reader has to
  // break apart before either half can be read.
  return [tokensNamed, tokensWide, tokensShortWide, tokensLong, tokensShort].find(holds) ?? tokensShort
}

/**
 * A duration in four cells at most — `0.2s`, `4s`, `95s`, `12m` — with the unit
 * fixed for the whole picture by the longest of them.
 *
 * Picked per value instead, a run lasting a quarter of an hour writes `12m`
 * over one node and `40s` over the next, and the two cannot be compared without
 * doing the arithmetic first.
 */
function tightClockFor(longestMs: number): (ms: number) => string {
  if (longestMs >= 600_000) {
    return ms => `${Math.max(1, Math.round(ms / 60_000))}m`
  }

  if (longestMs >= 950) {
    return ms => `${Math.max(1, Math.round(ms / 1000))}s`
  }

  return ms => `${Math.max(1, Math.round(ms / 100)) / 10}s`
}

/** Text cut to `max` cells, with an ellipsis in the last of them where it was cut. */
function truncate(s: string, max: number): string {
  if (max <= 0) {
    return ''
  }

  // Cells, not UTF-16 units: an astral character is two units and one cell, a
  // combining mark is one unit and no cell, and a budget counted in units hands
  // a label either less room than it has or more room than it fits.
  if (cells(s) <= max) {
    return s
  }

  // One cell is the first letter, not the mark. The mark says a name was cut,
  // which a reader can see for themselves in a field one cell wide; the letter
  // says which name it was, and `G` against `D` against `C` is the difference
  // between a row of phases and a row of marks.
  if (max === 1) {
    const first = [...s][0] as string

    return cells(first) === 1 ? first : '…'
  }

  // The mark is part of the budget, and the characters are measured as they are
  // kept. Counted in units and with a character kept whatever the budget, a
  // label cut to one cell came back two wide — and the cell it ran into is the
  // one the wire leaves the card by, so a name too long for its box rubbed out
  // the point that says which card the line belongs to.
  let kept = ''
  let used = 0

  for (const ch of s) {
    const w = cells(ch)

    if (used + w > max - 1) {
      break
    }

    kept += ch
    used += w
  }

  return `${kept}…`
}

/**
 * The marker a workflow engine writes in front of a nested run's name, and the
 * one this pane writes when that run is open.
 */
const FOLD_SHUT = '\u25b8 '
const FOLD_OPEN = '\u25be '

/**
 * A nested run's name, in the cells it has, and whatever the cells could not
 * take.
 *
 * `code-review:ai-review-agentic` is not one name. It is a plugin and a
 * workflow, and cutting it from the right — which is all `truncate` can do —
 * spends the half that varies to keep the half that does not. Every nested run
 * of one plugin shares its plugin half, so `code-review:ai-review-age…` and
 * `code-review:ai-review-quick…` are two runs a reader cannot tell apart at any
 * width where either is cut at all.
 *
 * So the name gives way in a fixed order, as the header's own fields do:
 *
 * 1. **A half that repeats the other goes first**, at every width. The pipeline
 *    runs `test-coverage:test-coverage` and `security-reviewer:security-review`;
 *    the second word of each is the first one again, and a name written twice is
 *    a name a reader reads twice and learns nothing by. The longer half is kept,
 *    because it is the one carrying the extra letters.
 * 2. **Then the plugin half.** It is repeated down the run wherever that plugin
 *    appears, and it is the half a reader can infer from the one that is left.
 * 3. **Only then is the workflow half cut**, from the right, as any other name
 *    is.
 *
 * A name with no halves to it — `Base Branch Health`, most agent labels — skips
 * to step 3, which is the plain truncation it always had.
 */
export function runName(s: string, width: number): string {
  const mark = s.startsWith(FOLD_SHUT) || s.startsWith(FOLD_OPEN) ? s.slice(0, 2) : ''
  const name = s.slice(mark.length)
  const at = name.indexOf(':')
  const room = Math.max(1, width - cells(mark))

  if (at <= 0 || at === name.length - 1) {
    return mark + truncate(name, room)
  }

  const plugin = name.slice(0, at)
  const workflow = name.slice(at + 1)
  // One half saying the other over again: `test-coverage:test-coverage`, and
  // `security-reviewer:security-review`, which is the same word with its ending
  // filed off. Either way the longer of the two is the whole of what the pair
  // had to say.
  const doubled = plugin.startsWith(workflow) || workflow.startsWith(plugin)
  const said = doubled ? (plugin.length >= workflow.length ? plugin : workflow) : name

  if (cells(said) <= room) {
    return mark + said
  }

  if (!doubled && cells(workflow) <= room) {
    return mark + workflow
  }

  // Room for neither half whole. The plugin half has already gone by this
  // point, so what is cut is the workflow half — cutting the pair would spend
  // the last cells on the half step 2 decided was the one to lose.
  return mark + truncate(doubled ? said : workflow, room)
}

/** Wraps text to a width, breaking at spaces where it can. */
/** Frames each end of a moving label is held at, and frames between steps. */
const SLIDE_HOLD = 9
const SLIDE_EVERY = 3

/**
 * A label longer than the cells it has, moved along a little at a time so the
 * whole of it can be read.
 *
 * It travels to its end, waits, and travels back — it does not run round. A
 * label that wraps shows its tail and its head in the same cells for as many
 * frames as the label is long, and `edge:down paint:correctness` caught
 * mid-wrap reads as `.: tness  paint:`, which is not a label at all. Going
 * back the way it came, every frame is a piece of the real name.
 *
 * Only the labels of agents that are working move, and only while the run is
 * live — a pane of finished agents all sliding at once would be the busiest
 * thing on screen and none of it would mean anything. Both ends are held for
 * about a second, because a name that never stops moving is a name that has to
 * be caught rather than read.
 *
 * `tick` below zero is the still frame: a run that has ended draws no more
 * frames, so a label left halfway through its travel would stay there.
 */
function slide(s: string, width: number, tick: number): string {
  if (s.length <= width || width <= 0 || tick < 0) {
    return truncate(s, width)
  }

  const travel = s.length - width
  const step = Math.floor(tick / SLIDE_EVERY) % (2 * (travel + SLIDE_HOLD))
  const at =
    step < SLIDE_HOLD
      ? 0
      : step < SLIDE_HOLD + travel
        ? step - SLIDE_HOLD
        : step < 2 * SLIDE_HOLD + travel
          ? travel
          : 2 * SLIDE_HOLD + 2 * travel - step

  return s.slice(at, at + width)
}

function wrap(s: string, width: number, lines: number): string[] {
  const words = s.replace(/\s+/g, ' ').trim().split(' ')
  const out: string[] = []
  let line = ''

  for (const word of words) {
    if (line && line.length + word.length + 1 > width) {
      out.push(line)
      line = word

      if (out.length === lines) {
        break
      }
    } else {
      line = line ? `${line} ${word}` : word
    }
  }

  if (out.length < lines && line) {
    out.push(line)
  }

  return out.slice(0, lines).map(l => truncate(l, width))
}

/**
 * The same, where the first line is narrower than the rest.
 *
 * A call's first line shares its row with the figures the call cost, and every
 * line after it has the block to itself. Wrapped to the narrow width throughout,
 * a long command broke about a third early on every continuation and the column
 * carried a ragged margin of blank cells no figure ever stood in.
 */
function wrapAfter(s: string, first: number, rest: number, lines: number): string[] {
  const words = s.replace(/\s+/g, ' ').trim().split(' ')
  const out: string[] = []
  let line = ''

  const room = () => (out.length === 0 ? first : rest)

  for (const word of words) {
    if (line && line.length + word.length + 1 > room()) {
      out.push(line)
      line = word

      if (out.length === lines) {
        break
      }
    } else {
      line = line ? `${line} ${word}` : word
    }
  }

  if (out.length < lines && line) {
    out.push(line)
  }

  return out.slice(0, lines).map((l, i) => truncate(l, i === 0 ? first : rest))
}

/**
 * Somebody else's text, wrapped the way they wrote it.
 *
 * Every other wrap on the pane flattens whitespace, which is right for a node's
 * tail and wrong for a document: a heredoc, a `gh api` call with a flag per
 * line, a markdown brief with headings and lists, or a patch argument is
 * *structured* by its line breaks, and run together it becomes one unreadable
 * paragraph that happens to contain the right characters. So the source's own
 * lines are kept and each is wrapped inside itself.
 *
 * Past `cap` the remaining lines are counted rather than drawn, so the block
 * still says how much there was.
 */
function written(text: string, first: number, rest: number, cap: number): string[] {
  if (!text) {
    return []
  }

  const out: string[] = []

  for (const line of text.split('\n')) {
    if (out.length >= cap) {
      break
    }

    if (!line.trim()) {
      // A blank line in the middle of an argument is the writer's own spacing
      // and is kept; one before the first drawn line is not, since it would
      // leave the call's name on a row with nothing beside it.
      if (out.length > 0) {
        out.push('')
      }

      continue
    }

    out.push(...wrapAfter(line, out.length === 0 ? first : rest, rest, cap - out.length))
  }

  const over = text.split('\n').length - out.length

  return over > 0 && out.length >= cap ? [...out, `… ${over} more lines`] : out
}

/**
 * A light travelling along a wire into work that is running.
 *
 * A spinner says an agent is busy. Nothing said that the work now in it came
 * along that line from the agent before, and on a graph of thirty still strokes
 * the one that is carrying something is the one a reader wants. So the cells
 * keep their glyphs and one of them, moving, is lit.
 */
function paintFlowing(c: Canvas, cells: { x: number; y: number }[], tick: number): void {
  if (tick < 0 || cells.length === 0) {
    return
  }

  // One cell every other frame: at a frame each eighth of a second, a step per
  // frame crosses a gutter three times a second, which reads as a flicker
  // rather than as something moving along a line.
  const step = Math.floor(tick / 2)
  const at = cells[((step % cells.length) + cells.length) % cells.length]

  c.put(at.x, at.y, c.at(at.x, at.y), mix(COLORS.running, glowOf(), 0.6))
}

function pulse(at: number, length: number, tick: number): number {
  const head = (((tick * 0.7) % length) + length) % length
  const distance = Math.min(Math.abs(at - head), length - Math.abs(at - head))

  return Math.max(0, 1 - distance / 3)
}

/**
 * What the agent is doing right now, and nothing once it has stopped doing it.
 *
 * It used to end with the head of what the agent answered. A node is the pane's
 * own drawing of a run, and the agent's prose is another program's words: set
 * in a node's spare cells it read as the pane talking, it was a sentence cut
 * off wherever the row ran out, and the phrase it cut to was as likely to be
 * `Let's run the existing` as anything worth the row. What an agent said is in
 * its dialog, whole, where it can be read as a sentence. The row says what is
 * happening, which is the part that changes while it is watched.
 */
function tailOf(agent: AgentRow, nowMs: number): string {
  const busy = agent.tools.find(t => t.isRunning)

  if (agent.state === 'running' && busy) {
    return busy.count > 1 ? `${busy.name} ×${busy.count}` : busy.name
  }

  // That it is thinking, not the tail of what it is thinking. A slice off the
  // end of a half-written sentence reads as a fault in the pane; the whole of
  // it is in the dialog, where it can be read as a sentence.
  if (agent.state === 'running' && agent.isThinking) {
    return 'thinking'
  }

  const quiet = quietFor(agent, nowMs)

  if (quiet > 0) {
    return `quiet ${elapsed(quiet)}`
  }

  if (agent.state === 'running' && agent.tools.length > 0) {
    const calls = agent.tools.reduce((sum, t) => sum + t.count, 0)

    return `${calls} tool ${calls === 1 ? 'call' : 'calls'}`
  }

  return ''
}

/**
 * What a running agent is doing, for its card's bottom edge, or nothing where
 * the card has nothing to add to the mark in its corner.
 *
 * The same marks the rest of the pane gives the same two things — a tool call
 * and a turn of thinking — so a card is read with the vocabulary the run line
 * and the detail dialog already taught. Going quiet has no mark, because nothing
 * in the drawing means quiet; it has a duration instead, which is the whole of
 * what is worrying about it.
 */
function doingOf(agent: AgentRow, nowMs: number): string {
  if (agent.state !== 'running') {
    return ''
  }

  const busy = agent.tools.find(t => t.isRunning)

  if (busy) {
    return `${TOOL_MARK} ${busy.count > 1 ? `${busy.name} ×${busy.count}` : busy.name}`
  }

  if (agent.isThinking) {
    return `${THINK_MARK} thinking`
  }

  const quiet = quietFor(agent, nowMs)

  if (quiet > 0) {
    return `quiet ${elapsed(quiet)}`
  }

  const calls = agent.tools.reduce((sum, t) => sum + t.count, 0)

  return calls > 0 ? `${TOOL_MARK} ${calls}` : ''
}

/** The colour a tail is drawn in: a quiet agent's is the warning, the rest fade toward its state. */
function tailColorOf(agent: AgentRow, nowMs: number, color: Rgb): Rgb {
  if (quietFor(agent, nowMs) > 0) {
    return mix(COLORS.failed, COLORS.running, 0.5)
  }

  const live = agent.state === 'running' && (agent.tools.length > 0 || agent.isThinking)

  return mix(COLORS.dim, color, live ? 0.6 : 0.45)
}

/**
 * A node's name with the phase it already sits under taken off the front.
 *
 * Every lane is captioned with its phase, so `gather:rivers` in a column headed
 * Gather spends seven of its cells repeating the header — and in a six-phase
 * run those are the cells that would have carried `rivers`, the only part that
 * tells one agent of a phase from its four siblings.
 */
function nodeLabel(agent: AgentRow): string {
  const phase = agent.phase?.trim()

  if (!phase || !agent.label.toLowerCase().startsWith(phase.toLowerCase())) {
    return agent.label
  }

  const rest = agent.label.slice(phase.length).replace(/^[\s:/_-]+/, '')

  // A label that is only its phase keeps it; the alternative is an empty node.
  return rest.length > 0 ? rest : agent.label
}

/** One field of a node's facts row, in its category's colour. */
type Field = { text: string; color: Rgb }

/**
 * What an agent spent and what it ran on, in the cells available.
 *
 * The token count and the model are the two facts the graph states nowhere
 * else, so on a card they are the two that stay. A card too narrow for all
 * three gives up the clock first — the timeline draws every duration to scale
 * and the detail dialog writes it out, so it is the one fact losing a place
 * here does not lose outright.
 *
 * Down a list the order turns over. A lane's rows are one model's work almost
 * every time, so the model becomes a column of the same word repeated, which
 * costs eight cells a row to say what one line at the top of the lane would
 * say once. The clock is the field that differs row to row, and a list is read
 * by comparing rows.
 */
function factsOf(
  agent: AgentRow,
  took: number,
  model: string | undefined,
  room: number,
  scale: Scale,
  withModel = true,
  density: 'card' | 'row' = 'card',
): {
  fields: Field[]
  gap: number
} {
  const spent = tokensOf(agent)
  const width = (fields: Field[], gap: number) =>
    fields.reduce((sum, f) => sum + f.text.length, 0) + gap * Math.max(0, fields.length - 1)
  const spend: Field[] = [{ text: scale.spend(spent), color: COLORS.spend }]
  const time: Field = { text: scale.clock(took), color: COLORS.clock }
  const name = withModel ? scale.model(agent.model ?? model) : ''
  const named: Field[] = name ? [{ text: name, color: COLORS.model }] : []

  const tries: Field[][] =
    density === 'row'
      ? [[time, ...spend, ...named], [time, ...spend], [...spend]]
      : [[time, ...spend, ...named], [...spend, ...named], [time, ...spend]]

  for (const fields of tries) {
    for (const gap of [scale.gap, 1]) {
      if (width(fields, gap) <= room) {
        return { fields, gap }
      }
    }
  }

  // Nothing, where not even the count fits. The ladder used to hand the count
  // back whatever the room was, so a node with eight cells for a name and two
  // for a figure drew the figure and cut the name to `ri…` — a row that says
  // what some agent spent without saying which agent. A count with no name
  // against it is a number in a list of numbers.
  return { fields: width(spend, 1) <= room ? spend : [], gap: 1 }
}

/**
 * One way of writing a duration, for every node in the picture.
 *
 * Left to itself each node picks the longest form it has room for, which puts
 * `73s` next to `1m16s` in neighbouring lanes — the same quantity in two units,
 * a column a reader has to convert before they can compare it. So the narrowest
 * node decides, and the rest follow it.
 */
function clockOf(
  nodes: NodeBox[],
  nowMs: number,
  density: 'card' | 'row',
  marks: boolean,
): (ms: number) => string {
  const mark = marks ? CLOCK_MARK : ''
  // A mark glued to its figure reads as one long token — `⧖12.9s` — and the
  // glyph that says which measurement this is gets read as part of the number.
  // One cell of air is what divides them, and it is given up only where no
  // form of the duration fits with it.
  const airs = marks ? [' ', ''] : ['']
  const longest = Math.max(1, ...nodes.map(n => (n.agent.endedMs ?? nowMs) - n.agent.startedMs))
  // The cells the figures actually have: a card's inner width less a stroke
  // either side, a row's width less the rule, the mark, the name and the model.
  const roomOf = (node: NodeBox) => (density === 'card' ? node.w - 2 : node.w - 13)
  const forms: ((ms: number) => string)[] = [
    elapsed,
    tightClockFor(longest),
    ...(longest >= 60_000 ? [(ms: number) => `${Math.max(1, Math.round(ms / 60_000))}m`] : []),
  ]

  const holds = (form: (ms: number) => string, air: string) =>
    nodes.every(node => {
      const agent = node.agent
      const spent = tokensOf(agent)
      const took = (agent.endedMs ?? nowMs) - agent.startedMs
      const rest = tokensShort(spent).length + 1

      return mark.length + air.length + form(took).length + rest <= roomOf(node)
    })

  // Precision first, air second: `⧖12.9s` says more than `⧖ 13s`, so the
  // seconds are kept and the space is what goes when the two cannot both fit.
  for (const form of forms) {
    for (const air of airs) {
      if (holds(form, air)) {
        return (ms: number) => `${mark}${air}${form(ms)}`
      }
    }
  }

  const form = forms[forms.length - 1]

  return (ms: number) => `${mark}${form(ms)}`
}

/**
 * One way of writing a model's name, for every node in the picture — the same
 * bargain the clock strikes, for the same reason.
 *
 * Nothing is cut. `Sonnet 5` shortened to `Son…` is a worse answer than no
 * answer: a reader who cannot read it goes and looks the model up anyway, and
 * has spent four cells to find that out. Nor does each node choose for itself,
 * which put `Haiku 4.5` in one lane beside `Haiku` in the next — the same fact
 * twice, written two ways, reading as two different models.
 *
 * So the form is chosen once, for the longest name in the run, and it is the
 * longest form most of the nodes can hold: the full name, else the family
 * alone, else nothing. A node too narrow for the chosen form drops the field
 * rather than writing a shorter one, so wherever a model appears it is written
 * the same way — one cramped lane no longer decides for the whole picture, and
 * the run line's legend still names every model the run used.
 *
 * The cells counted are the cells the model is written in, which is not the
 * same place in both densities: a card sets it into its bottom edge, a row puts
 * it in the facts against the right. Counting the facts row in both said a card
 * had no space for a name while half of its bottom edge sat empty.
 */
function namingOf(
  nodes: NodeBox[],
  nowMs: number,
  model: string | undefined,
  clock: (ms: number) => string,
  spend: (n?: number) => string,
  density: 'card' | 'row',
): (model?: string) => string {
  const names = [...new Set(nodes.map(n => modelName(n.agent.model ?? model)))].filter(n => n.length > 0)

  if (names.length === 0) {
    return () => ''
  }

  const rooms = nodes.map(node => {
    const agent = node.agent
    const spent = tokensOf(agent)
    const took = (agent.endedMs ?? nowMs) - agent.startedMs

    if (density === 'card') {
      return edgeRoom(node)
    }

    // What the other two fields leave at their tightest: the inner width, less
    // the clock and the tokens, less one cell between each of the three.
    const taken = clock(took).length + spend(spent).length + 1 + 1

    return node.w - 13 - taken
  })
  const enough = Math.ceil(rooms.length / 2)
  const holds = (width: number) => rooms.filter(room => room >= width).length >= enough

  if (holds(Math.max(...names.map(n => n.length)))) {
    return m => modelName(m)
  }

  if (holds(Math.max(...names.map(n => n.split(' ')[0].length)))) {
    return m => modelName(m).split(' ')[0]
  }

  return () => ''
}

/**
 * How the picture writes its shared measurements, decided once per frame and
 * used by every node: one duration format, one model name, one gap between the
 * facts. Each of them is a thing a reader compares down a column, and a column
 * that changes its mind between rows is a column that has to be read twice.
 */
type Scale = {
  clock: (ms: number) => string
  spend: (n?: number) => string
  model: (model?: string) => string
  /** The cells between one fact and the next; 1 where a node cannot hold 2. */
  gap: number
}

/**
 * Whether a card's bottom edge has room for the word it would carry — the model
 * it ran on, or what it is doing while it runs.
 *
 * The edge loses cells to the pass mark set into its right-hand end, so two
 * cards of one width can differ on this: the one on its third pass has three
 * fewer cells there than the one on its first.
 */
function footFits(
  box: NodeBox,
  nowMs: number,
  scale: Scale,
  model: string | undefined,
  pass?: Pass,
): boolean {
  const { agent } = box
  const inner = Math.max(1, box.w - 2)
  const right = box.x + box.w - 1
  const repeat = inner >= 13 && (pass?.index ?? 1) > 1 ? loopMark(pass?.index) : ''
  const edgeEnd = right - 1 - (repeat.length > 0 ? repeat.length + 1 : 0)
  const edgeRoom = Math.max(0, edgeEnd - (box.x + 3))
  const doing = truncate(doingOf(agent, nowMs), edgeRoom)
  const named = doing || scale.model(agent.model ?? model)
  const edgeAt = Math.min(
    box.x + 2 + Math.max(1, Math.floor((inner - 2 - named.length) / 2)),
    edgeEnd - named.length,
  )

  return named.length > 0 && edgeAt >= box.x + 3
}

/**
 * Whether a lane writes its models on its cards' feet, for every card of the
 * lane at once.
 *
 * A card whose foot cannot take the word puts the model in with the figures
 * instead, and the figures give up the clock to make room. Decided card by
 * card, one band came out with three cards reading `2m45s ∑91k` and three
 * reading `∑42k Sonnet 5` — the row a reader compares the cards by, saying two
 * different things across one phase, because half of them happened to be on a
 * second pass. So the lane decides once: where any card can write its own foot,
 * none of them moves the model inward, and the cards whose feet are spoken for
 * say nothing about their model — which the run line and the dialog both do.
 */
function feetOf(nodes: NodeBox[], nowMs: number, scale: Scale, model: string | undefined, passes: Map<string, Pass>): boolean {
  return nodes.some(n => footFits(n, nowMs, scale, model, passes.get(n.agent.agentId)))
}

/**
 * The cells a one-row node's name is claimed before its figures are, for every
 * node of one lane at once.
 *
 * Row by row the claim followed each name's own length, so a lane came out with
 * a clock against its short names and none against its long ones — the figures
 * stopped being a column and became a ragged edge, which is the thing a list is
 * laid out to avoid. The longest name in the lane sets it, and every row of the
 * lane then gives up the same field.
 *
 * By lane and not by pane, unlike the forms the figures take: a duration is
 * written one way everywhere so two nodes can be compared across the drawing,
 * where a name is read against the names beside it in its own column. A lane of
 * long names would otherwise take the width off every other lane on the pane.
 *
 * The share rounds up. Rounded down, a fifteen-cell row gave its names eight
 * cells and the ninth to the clock, so a name of nine came out cut for a single
 * character — and a reader who widened the pane from a hundred and ten columns
 * to a hundred and twenty watched a whole name turn into a truncated one,
 * because the extra width had let a second figure onto the row.
 */
function claimOf(nodes: NodeBox[]): number {
  if (nodes.length === 0) {
    return 0
  }

  const shared = Math.max(1, Math.min(...nodes.map(n => n.w)) - 5)
  const wants = Math.max(0, ...nodes.map(n => cells(nodeLabel(n.agent))))

  return Math.min(wants, Math.max(8, Math.ceil(shared * 0.55)))
}

function scaleOf(
  nodes: NodeBox[],
  nowMs: number,
  model: string | undefined,
  density: 'card' | 'row',
): Scale {
  // A card sets its two figures side by side in the middle of a row, where
  // nothing says which is which; a list right-aligns each of them in a column
  // of its own, where the column does. So the mark goes on the cards.
  const marks = density === 'card'
  const clock = clockOf(nodes, nowMs, density, marks)
  const spend = spendingOf(nodes, nowMs, clock, density)
  const named = namingOf(nodes, nowMs, model, clock, spend, density)
  let gap = 2

  for (const node of nodes) {
    const agent = node.agent
    const spent = tokensOf(agent)
    const parts = [
      clock((agent.endedMs ?? nowMs) - agent.startedMs),
      spend(spent),
      density === 'card' ? '' : named(agent.model ?? model),
    ].filter(t => t.length > 0)
    const ink = parts.reduce((sum, t) => sum + t.length, 0)

    if (ink + 2 * (parts.length - 1) > node.w - 2) {
      gap = 1
    }
  }

  return { clock, spend, model: named, gap }
}

/**
 * The cells a card's bottom edge has for a word, once the corners and a stroke
 * either side of it are taken.
 */
function edgeRoom(node: NodeBox): number {
  return node.w - 6
}

/** Draws fields left to right, and answers where the last of them ended. */
/**
 * A dialog's title, centred on its top edge.
 *
 * Every dialog the pane opens is a box whose top edge is a rule with the title
 * set into it and the close mark at the right-hand corner. Set flush left, the
 * title sat against one corner with the rest of the edge running away from it,
 * which reads as a label stuck on the box rather than as the box's own name —
 * and with a mark at the far corner the edge had weight at both ends and none
 * in the middle. Centred, it reads the way a card's name and a phase's do,
 * which are the pane's other two names set into a rule.
 *
 * The title gives way to the close mark, never the other way about: a title
 * pushed a cell or two off centre is still the title, and a close mark moved in
 * off the corner is a second place to look for the way out.
 */
/**
 * A rule across the inside of a dialog, tied into the frame at both ends.
 *
 * Drawn from the first cell inside the frame to the last, it left a `│` at each
 * end with a stroke running up to it and no joint, so a dialog with two of them
 * read as three strips stacked up rather than as one box with shelves in it. A
 * tee costs nothing and says which of the two lines is the wall.
 */
function paintCrossbar(c: Canvas, rect: Rect, y: number, edge: Rgb, word?: string): void {
  for (let dx = 1; dx < rect.w - 1; dx++) {
    c.put(rect.x + dx, y, LIGHT.across, quietOf(c.background))
  }

  c.put(rect.x, y, SHELF_L, edge)
  c.put(rect.x + rect.w - 1, y, SHELF_R, edge)

  if (word === undefined) {
    return
  }

  // Set into the shelf from the left rather than centred on it. A shelf names
  // the compartment under it, and a name in the middle of a rule reads as a
  // heading for the whole box — which is what the dialog's own title is.
  const said = truncate(word, Math.max(0, rect.w - 10))
  const at = rect.x + 4

  for (let dx = -1; dx <= cells(said); dx++) {
    c.put(at + dx, y, 0x20, edge)
  }

  c.text(at, y, said, quietOf(c.background))
}

function paintDialogTitle(
  c: Canvas,
  x: number,
  y: number,
  right: number,
  fields: Field[],
  edge: Rgb,
): void {
  const closeX = right - 4
  const width = widthOf(fields, 1)
  const first = x + 2
  // Centred in the rule it is set into, which runs from the left corner to the
  // close mark — not in the box's full width. Centred on the box, the stroke to
  // the left of the title was three or four cells longer than the stroke to its
  // right, because the close mark eats the end of that one; the title measured
  // centre and looked off it, which is the only measurement that matters here.
  const at = Math.max(first, Math.min(x + Math.floor((closeX - x - width) / 2), closeX - 1 - width))

  // The whole span is cleared before the title goes into it, its own gaps
  // included: a stroke showing through between the mark and the name joins the
  // two into one word with a line in it. A blank either side as well, so the
  // rule reads as one line broken by a name rather than as two lines with a
  // name between them.
  for (let cell = at - 1; cell <= Math.min(at + width, closeX - 1); cell++) {
    c.put(cell, y, 0x20, edge)
  }

  drawFields(c, at, y, Math.max(0, closeX - 1 - at), fields, 1)
}

/**
 * The same fields with a divider between each pair of them.
 *
 * A row of figures separated by gaps alone is read as one run of figures: the
 * clock, the spend, the request count and the model are four different kinds of
 * fact, and at three cells apart the eye groups them by whatever happens to be
 * short. The divider is the same upright the dialog's own columns are divided
 * by, in the same tone, so the row reads as fields rather than as a sentence.
 */
function divided(fields: Field[]): Field[] {
  return fields.flatMap((field, i) =>
    i === 0 ? [field] : [{ text: '\u2502', color: COLORS.track }, field],
  )
}

function drawFields(
  c: Canvas,
  x: number,
  y: number,
  room: number,
  fields: Field[],
  gap: number,
): number {
  let at = x

  for (const field of fields) {
    const left = x + room - at

    if (left <= 0) {
      break
    }

    at += c.text(at, y, truncate(field.text, left), field.color) + gap
  }

  return Math.max(x, at - gap)
}

/**
 * An agent as a block of rows: its name, what it spent, and — where the layout
 * left a third row — what it is doing or what it answered.
 *
 * The block has a rule down its left edge in its state's colour rather than a
 * frame around it. A frame cost two of every node's rows and two of its
 * columns to say one thing, "this is a node", which position and the state
 * mark already say; those cells now carry the model and the token count, which
 * nothing else on the graph does.
 */
/**
 * Every trip the run made through one piece of work, as a mark apiece.
 *
 * This is what the fold buys. A pipeline that rewinds twice used to draw three
 * rows reading `Develop`, `Develop`, `Develop`, told apart only by their clocks
 * — and on the run this was built against, seventy-eight rows for nineteen
 * pieces of work, forty of them below the fold of a pane that showed twenty-eight.
 * One row with `✔ 1  ✔ 2  ✖ 3` beside it says which trip failed without the
 * reader counting rows, and says it in the width the rows were wasting anyway.
 *
 * Each pass is its own press, so the trip a reader wants is one click rather
 * than a hunt: the mark is a coloured cell outside the target and the number is
 * the target, which is the spacing every other mark-and-name on the pane keeps,
 * and the only spacing a Button allows.
 */
function paintPasses(
  c: Canvas,
  x: number,
  y: number,
  room: number,
  box: NodeBox,
  tick: number,
  hotspots: Hotspot[],
): number {
  const passes = box.passes

  if (!passes || passes.length < 2 || room < PASS_W) {
    return 0
  }

  // What will not fit is counted rather than cut. The last passes are the ones
  // kept: a loop is read for how it ended, and the run's earliest attempt is the
  // one whose outcome has already been overtaken.
  const fits = Math.floor((room + PASS_GAP) / PASS_W)
  const over = passes.length - fits
  const shown = over > 0 ? passes.slice(passes.length - (fits - 1)) : passes
  let at = x

  if (over > 0) {
    const said = `+${over + 1}`

    c.text(at, y, said, COLORS.dim)
    at += cells(said) + 1
  }

  for (const pass of shown) {
    const digit = String(pass.index)

    c.put(at, y, markOf(pass.agent.state, tick), colorOf(pass.agent.state))
    c.text(at + 2, y, digit, COLORS.dim)
    hotspots.push({ agentId: pass.agent.agentId, x: at + 2, y, w: cells(digit) })
    at += 2 + cells(digit) + PASS_GAP
  }

  return at - x - PASS_GAP
}

/** A pass: its state mark, a cell of air, its number — then the gap to the next. */
const PASS_GAP = 2
const PASS_W = 3 + PASS_GAP

/**
 * The press a node's name answers to.
 *
 * A node standing for a whole nested run answers to the run, not to the agent
 * whose figures it happens to be drawn from — see `RUN_OPEN`. Everything else
 * is one agent and answers to it.
 */
function pressOf(box: Pick<NodeBox, 'agent' | 'inside'>): string {
  return box.inside ? `${RUN_OPEN}${box.inside.phase}` : box.agent.agentId
}

function paintNode(
  c: Canvas,
  box: NodeBox,
  nowMs: number,
  tick: number,
  density: 'card' | 'row',
  isSelected: boolean,
  hotspots: Hotspot[],
  scale: Scale,
  model?: string,
  pass?: Pass,
  /** What this lane keeps for a name before its figures: see `claimOf`. */
  claim = 0,
  /** Whether this lane writes its models on the cards' feet: see `feetOf`. */
  feet = false,
): void {
  const { agent } = box
  const color = colorOf(agent.state)
  const running = agent.state === 'running'
  const took = (agent.endedMs ?? nowMs) - agent.startedMs
  const mark = markOf(agent.state, tick)
  // A box that stands for a whole nested run carries that run's name, not the
  // name of whichever of its agents happened to decide it.
  const label = box.name ?? nodeLabel(agent)
  // A card's own name carries its state where the state is the exception. The
  // frame is one tone for every card, so what is left to say `stopped` is the
  // mark in the corner, one cell wide and — for a stopped agent — grey on grey.
  // A name is a word, and a word at the size a name is drawn reads across a
  // pane of twenty cards. Done and running stay in the text colour: they are
  // what a card is expected to be, and a graph where every name is coloured
  // says nothing by colouring the ones that matter.
  const labelColor = isSelected
    ? COLORS.accent
    : agent.state === 'failed' || agent.state === 'stopped'
      ? colorOf(agent.state)
      : COLORS.text
  // Motion is spent on the agents being watched: the one that is working, and
  // the one whose detail is open.
  const moving = running || isSelected

  if (density === 'row') {
    // One row, and the width of the whole pane to put it in: the state down the
    // left edge, the mark and the name beside it, the facts against the right
    // edge where they line up down the list, and what the agent is doing
    // between the two.
    const labelX = box.x + 3
    // What the row has for a label and its facts together: the width less the
    // rule, the mark and the two cells of air that keep the two apart.
    const shared = Math.max(1, box.w - 5)
    // The label is claimed first, and the facts take what is left.
    //
    // It used to be the other way about, with the facts measured against the
    // full row and the label handed the remainder — so a row wide enough for
    // three figures and a model name cut `paint:correctness` to `paint:c…`
    // while the figures kept every digit. Of everything on the row the label is
    // the one field that says which agent it is; the clock and the count are
    // read once a reader has found the row they want, and the model is written
    // again in the detail. A drawing gives up the fact a reader can look up
    // before the one they are looking with.
    //
    // Not all of it, though: a row is a row of columns, and a label allowed to
    // run to the right edge leaves the figures nothing and breaks the column
    // they line up in. It takes what it needs up to a little over half, and the
    // longest name in the lane says how much that is for every row of it — see
    // `Scale.claim`.
    const facts = factsOf(agent, took, model, Math.max(0, shared - claim), scale, true, 'row')
    const factsW = facts.fields.reduce((sum, f) => sum + f.text.length, 0) +
      facts.gap * Math.max(0, facts.fields.length - 1)
    const factsX = box.x + box.w - factsW
    const room = Math.max(1, factsX - labelX - 2)

    // A row is too short for a card, but not for the edge of one: down a list
    // of thirty agents the rules make a rail of states that can be read without
    // reading a single label.
    c.put(box.x, box.y, RULE, isSelected ? COLORS.accent : mix(color, COLORS.track, agent.state === 'done' ? 0.25 : 0))
    c.put(box.x + 1, box.y, mark, color)

    // A name that slides shows the whole of itself frame by frame, so it is
    // handed the whole of itself; a name that stands still is handed the ladder.
    const drawn = moving ? slide(label, room, tick) : runName(label, room)
    const shown = cells(drawn)

    c.text(labelX, box.y, drawn, labelColor)
    hotspots.push({ agentId: pressOf(box), x: labelX, y: box.y, w: shown })

    // The passes, then whatever room is left for what the agent is saying. A
    // row that stands for three trips round a loop has to say which of them
    // failed before it says what the last one answered.
    const marksX = labelX + shown + 2
    const marked = paintPasses(c, marksX, box.y, Math.max(0, factsX - marksX - 2), box, tick, hotspots)
    // A row standing for a whole nested run says what it is saying, the way any
    // other row does. It used to carry `▸ 23 agents` here whenever it stood for
    // a folded run at all — a second copy of the handle the band's own caption
    // carries, set among the row's measurements, where it displaced the one
    // thing the row had to say about its state.
    //
    // A wave folded back inside an opened run is the exception, and `alone`
    // marks it: it is a row in the middle of a band rather than a band of its
    // own, so it has no rule with a caption on it and the row is the only place
    // the way back out can go.
    const alone = box.inside?.alone === true
    const tail = alone && box.inside ? `${FOLD_SHUT}${box.inside.agents} agents` : tailOf(agent, nowMs)
    const tailX = marksX + marked + (marked > 0 ? PASS_GAP : 0)
    const tailRoom = factsX - tailX - 2

    if (tail && tailRoom > 4) {
      const wrote = c.text(tailX, box.y, truncate(tail, tailRoom), alone ? COLORS.dim : tailColorOf(agent, nowMs, color))

      if (alone && box.inside) {
        hotspots.push({ agentId: `${BAND_OPEN}${box.inside.phase}`, x: tailX, y: box.y, w: wrote })
      }
    }

    drawFields(c, factsX, box.y, factsW, facts.fields, facts.gap)

    return
  }

  // A node is a card: a frame on all four sides, in the one tone every line on
  // this pane is drawn in, with its name set into the top edge.
  //
  // It was a fill a step up from the pane's ground, which said the same thing
  // in no rows at all — but a node's name row is drawn as elements rather than
  // into the Raster, and a Button carries no background, so the fill broke
  // across every label on the pane. A frame is drawn in code points, and a code
  // point survives the cut.
  //
  // The frame is tinted by the state of the agent inside it — see `frameOf`,
  // which says what that costs and why it is now worth paying. The selection
  // ring keeps the accent over the tint: which card is open is not a state the
  // run is in, and the one card a reader has asked about outranks the four
  // states of the cards they have not.
  const frame = isSelected ? COLORS.accent : frameOf(agent.state, c.background)
  const edges = isSelected ? HEAVY : LIGHT
  const last = box.y + box.h - 1
  const right = box.x + box.w - 1

  for (let dx = 1; dx < box.w - 1; dx++) {
    c.put(box.x + dx, box.y, edges.across, frame)
    c.put(box.x + dx, last, edges.across, frame)
  }

  for (let dy = 1; dy < box.h - 1; dy++) {
    c.put(box.x, box.y + dy, edges.down, frame)
    c.put(right, box.y + dy, edges.down, frame)
  }

  c.put(box.x, box.y, edges.tl, frame)
  c.put(right, box.y, edges.tr, frame)
  c.put(box.x, last, edges.bl, frame)
  c.put(right, last, edges.br, frame)

  // The name is centred in the top edge with its state mark immediately to the
  // left of it, one cell of air between the two. Centred because a card is a
  // box and its name is its title: ragged left in a column of boxes, the names
  // drift away from the boxes they name as the boxes change width.
  //
  // The mark used to sit against the left corner, a third of a card away from
  // the word it qualifies. Two things a reader pairs — this agent, that state —
  // should be read in one movement, and on a wide card they were not: the eye
  // went to the name, then back out to the corner. Beside the name it is one
  // phrase. The air is what keeps it a phrase rather than a prefix, and it is
  // also what keeps the mark's colour: the name is a press target, a `Button`
  // carries no colour, and a mark inside that target would be drawn in the
  // label's own plain text.
  const inner = Math.max(1, box.w - 2)
  const titleRoom = Math.max(1, inner - 6)
  // The same ladder the row uses, and for the same reason: a card is where a
  // name has fewest cells of all, so `Base Branch Health` set into a twelve-cell
  // top edge comes out `Bas…` and the card says nothing about which agent it is.
  const shown = moving ? slide(label, titleRoom, tick) : runName(label, titleRoom)
  const titled = cells(shown) + 2
  const markX = Math.max(box.x + 2, box.x + 2 + Math.floor((inner - 2 - titled) / 2))
  const labelX = markX + 2

  c.put(markX - 1, box.y, 0x20, frame)
  c.put(markX, box.y, mark, color)
  c.put(markX + 1, box.y, 0x20, frame)

  // What the canvas says it wrote, not what the string measures: a name the
  // grid had to stand a box in for is shorter on the pane than it is in the
  // journal, and the blank that closes the name off goes where the name ended.
  const drawn = c.text(labelX, box.y, shown, labelColor)

  c.put(labelX + drawn, box.y, 0x20, frame)

  hotspots.push({ agentId: pressOf(box), x: labelX, y: box.y, w: drawn })

  // Which go at this piece of work this agent was, set into the bottom edge
  // opposite the name. The first pass goes unmarked — it reads as the ordinary
  // node it is, and the cells it would take are the ones the name wants.
  const repeat = inner >= 13 && (pass?.index ?? 1) > 1 ? loopMark(pass?.index) : ''

  if (repeat.length > 0) {
    c.text(right - repeat.length - 1, last, repeat, COLORS.dim)
  }

  // The bottom edge, set the way the name is set into the top — centred, on the
  // same reckoning, so the two words sit over each other however wide the card
  // is. It used to queue behind the clock and the tokens for the middle row and
  // lose, which is how a card twenty cells wide came to say nothing about its
  // model while half its bottom edge was strokes.
  //
  // While the agent runs, the edge says what it is doing — which tool it is in,
  // that it is thinking, that it has gone quiet — and when it lands the model
  // takes the edge back. The corner mark says running; it does not say running
  // *at what*, and that is the fact that changes minute to minute and the one a
  // reader is watching for. The model does not change at all, so a card can
  // afford to say it once the work it was doing is over.
  const edgeEnd = right - 1 - (repeat.length > 0 ? repeat.length + 1 : 0)
  const edgeRoom = Math.max(0, edgeEnd - (box.x + 3))
  const doing = truncate(doingOf(agent, nowMs), edgeRoom)
  // The model, on every card a phase's own rule names — a shut nested run's
  // included. It used to carry `▸ 5 agents` there instead, as a second way into
  // the run: the count stood in the model's cells, and a run still going lost
  // the count as well, because what the card is doing takes that edge ahead of
  // both. One edge cannot carry a measurement, a state and a control, so the
  // control went to the band's caption, which is where it is in every layout,
  // and the edge went back to saying the one thing it always says.
  //
  // A wave folded back inside an opened run keeps it, because there is nowhere
  // else for it to go: that card is one of several in a band rather than a band
  // of its own, and the rule above it names the phase, not the wave — see
  // `alone`.
  const inside =
    box.inside?.alone === true ? truncate(`${FOLD_SHUT}${box.inside.agents} agents`, edgeRoom) : ''
  const named = doing || inside || scale.model(agent.model ?? model)
  const edgeAt = Math.min(
    box.x + 2 + Math.max(1, Math.floor((inner - 2 - named.length) / 2)),
    edgeEnd - named.length,
  )
  const wrote = named.length > 0 && edgeAt >= box.x + 3

  if (wrote) {
    c.put(edgeAt - 1, last, 0x20, frame)
    c.text(edgeAt, last, named, mix(doing ? color : COLORS.model, frame, 0.25))
    c.put(edgeAt + named.length, last, 0x20, frame)

    // A wave's own way back out, on the card's bottom edge because the band's
    // rule above it belongs to the phase and says nothing about the wave.
    if (box.inside && named === inside) {
      hotspots.push({ agentId: `${BAND_OPEN}${box.inside.phase}`, x: edgeAt, y: last, w: named.length })
    }
  }

  if (box.h < 3) {
    return
  }

  // The figures, and what the agent is doing after them, centred as one run
  // between the card's two edges. A card is a box and everything set on it is
  // set to its middle: left-aligned, the clock drifts away from the name above
  // it as the card widens, and the row reads as text that a frame happens to
  // enclose.
  // The figures have the whole width between the two strokes. They are centred
  // in it, so the cells nearest the frame are spare on every card that does not
  // need them — and on the one that does, a card whose figures reach its own
  // edges is what a card too narrow to pad looks like.
  //
  // Figures only. The row used to end with what the agent was saying as it
  // thought, or with the opening of what it answered, and eight cells of either
  // is a fragment: `“nction with c…` is a card reporting the middle of a word.
  // Both are whole in the dialog a press opens, which is where text that has to
  // be read rather than compared belongs.
  const textX = box.x + 1
  const room = inner
  const facts = factsOf(agent, took, model, room, scale, !feet)
  const figures = widthOf(facts.fields, facts.gap)
  const at = textX + Math.max(0, Math.floor((room - figures) / 2))

  drawFields(c, at, box.y + 1, room - (at - textX), facts.fields, facts.gap)
}

/**
 * Draws the barrier between two lanes: a spine in the gutter, every agent of
 * the earlier lane feeding it, every agent of the later one fed from it.
 *
 * The spine is what the phase actually is — a join, then a fork — so one of
 * these replaces the `n × m` edges a literal graph would draw, and the count of
 * lines stays the count of agents.
 */
function paintBarrier(
  c: Canvas,
  left: NodeBox[],
  right: NodeBox[],
  busAt: number,
  orientation: 'horizontal' | 'vertical',
  /** True where the bus stands for carries read off labels, not for a barrier. */
  inferred = false,
  tick = -1,
): void {
  if (left.length === 0 || right.length === 0) {
    return
  }

  const along = (p: { x: number; y: number }) => (orientation === 'horizontal' ? p.y : p.x)
  const ports = [
    ...left.map(n => exitOf(n, orientation)),
    ...right.map(n => entryOf(n, orientation)),
  ]
  const from = Math.min(...ports.map(along))
  const to = Math.max(...ports.map(along))
  // The tone every line that joins two nodes is drawn in. A barrier is a join —
  // it says the later phase waited for the earlier one — so it is drawn the way
  // a carry is, and not in a grey of its own.
  //
  // One tone, too, whether or not the work has crossed it. A barrier that
  // greened as its phase landed put a state on a line, and the phase's own rule
  // already fills with exactly that fact, in the layer meant to carry it.
  const color = COLORS.wire
  const spine = orientation === 'horizontal' ? (inferred ? DASH_V : 0x2502) : inferred ? DASH_H : 0x2500
  const feeder = orientation === 'horizontal' ? (inferred ? DASH_H : 0x2500) : inferred ? DASH_V : 0x2502

  for (let at = from; at <= to; at++) {
    if (orientation === 'horizontal') {
      line(c, busAt, at, spine, color)
    } else {
      line(c, at, busAt, spine, color)
    }
  }

  // Which sides of the spine each tap is on, so the junction glyph says whether
  // it feeds the barrier, leaves it, or both.
  const taps = new Map<number, { in: boolean; out: boolean }>()
  const tapOf = (at: number) => {
    const tap = taps.get(at) ?? { in: false, out: false }

    taps.set(at, tap)

    return tap
  }

  for (const node of left) {
    const port = exitOf(node, orientation)

    // In the barrier's own tone, not the feeding agent's. A line tinted by the
    // state of the card at one end of it is a border that changes colour for a
    // reason the reader has to work out — and with twenty agents in four states
    // the gutter came out in four greens and three greys.
    // The point the feeder leaves by, marked, with the run starting past it —
    // the same point a carry out of this card would take, since it is the same
    // card and the same side of it.
    //
    // Marked even where the bus stands hard against the card and there is no
    // run to start. The cell used to be given to the feeder instead, on the
    // grounds that a point with no line after it says nothing — but a node
    // drawn as a row has no edge for a line to leave from, so what it drew was
    // a stroke with one end against the bus and the other against the blank
    // between a card's name and its figures. The point is what says *this card*;
    // the bus in the next cell is what it says it about.
    c.put(port.x, port.y, PORT, color)

    if (orientation === 'horizontal') {
      for (let x = port.x + 1; x < busAt; x++) {
        cross(c, x, port.y, feeder, color)
      }
    } else {
      for (let y = port.y + 1; y < busAt; y++) {
        cross(c, port.x, y, feeder, color)
      }
    }

    tapOf(along(port)).in = true
  }

  for (const node of right) {
    const port = entryOf(node, orientation)
    // The arrowhead is the end of the line, so it is drawn in the line's colour.
    // What state the card it points at is in is said on the card.
    const head = color
    const route: { x: number; y: number }[] = []

    if (orientation === 'horizontal') {
      for (let x = busAt + 1; x < port.x; x++) {
        cross(c, x, port.y, feeder, color)
        route.push({ x, y: port.y })
      }

      route.push(port)
      c.put(port.x, port.y, ARROW_RIGHT, head)
    } else {
      for (let y = busAt + 1; y < port.y; y++) {
        cross(c, port.x, y, feeder, color)
        route.push({ x: port.x, y })
      }

      route.push(port)
      c.put(port.x, port.y, ARROW_DOWN, head)
    }

    if (node.agent.state === 'running') {
      paintFlowing(c, route, tick)
    }

    tapOf(along(port)).out = true
  }

  // The junction says which ways this cell of the bus actually goes: along the
  // spine where there is more spine to go to, out to whatever feeds it, out to
  // whatever it feeds. A tap at either end of the bus caps it with a corner —
  // written as a `┤` the bus read as carrying on past its own last node.
  const ALONG = orientation === 'horizontal' ? { back: ARM.up, on: ARM.down } : { back: ARM.left, on: ARM.right }
  const ACROSS = orientation === 'horizontal' ? { in: ARM.left, out: ARM.right } : { in: ARM.up, out: ARM.down }

  for (const [at, tap] of taps) {
    const arms =
      (at > from ? ALONG.back : 0) |
      (at < to ? ALONG.on : 0) |
      (tap.in ? ACROSS.in : 0) |
      (tap.out ? ACROSS.out : 0)

    const glyph = joint(arms) ?? spine

    if (orientation === 'horizontal') {
      c.put(busAt, at, glyph, color)
    } else {
      c.put(at, busAt, glyph, color)
    }
  }
}

/**
 * Says that two phases ran at the same time, where a barrier would have said
 * one waited for the other.
 *
 * Concurrency used to be drawn by drawing nothing: a barrier is left out
 * between two phases whose clocks overlap, and the gutter came out empty. In a
 * row of twenty phases joined left to right, one gutter without an arrowhead in
 * it is not a statement a reader notices — a workflow that dispatched a review
 * and a security scan in one batch was read off the pane as having run them one
 * after the other, and the clocks that disprove it are two cards apart.
 *
 * So the gutter says it. The mark is the double line, laid along the run rather
 * than across it: a barrier's spine always cuts the way the work flows, and
 * this is the same two cells turned ninety degrees. Across the pane that is
 * `═`, down it `║` — the pair of tracks the two phases are, beside each other
 * and neither feeding the other.
 *
 * Grey, and one cell. It is not a wire — nothing travels along it — and the
 * rule that keeps colour for states and wires keeps this at the weight of the
 * borders it stands between.
 */
function paintAlongside(
  c: Canvas,
  left: NodeBox[],
  right: NodeBox[],
  busAt: number,
  orientation: 'horizontal' | 'vertical',
): void {
  if (left.length === 0 || right.length === 0 || busAt < 0) {
    return
  }

  const along = (p: { x: number; y: number }) => (orientation === 'horizontal' ? p.y : p.x)
  const ports = [
    ...left.map(n => exitOf(n, orientation)),
    ...right.map(n => entryOf(n, orientation)),
  ]
  // Halfway down what the two phases occupy between them, so the mark stands
  // against the cards it is about rather than at the top of a gutter whose
  // cards are at the bottom of it.
  const at = Math.round((Math.min(...ports.map(along)) + Math.max(...ports.map(along))) / 2)
  const glyph = orientation === 'horizontal' ? 0x2550 : 0x2551

  if (orientation === 'horizontal') {
    line(c, busAt, at, glyph, COLORS.dim)
  } else {
    line(c, at, busAt, glyph, COLORS.dim)
  }
}

/**
 * Says, on the card, where a phase was fed from when it was fed from further
 * back than the phase before it.
 *
 * These used to be drawn: an edge over more than one lane cannot run straight —
 * the band it passes is in the way — so each pair of phases got a rail outside
 * the block of nodes, leaving the drawing, crossing the phase it passed and
 * coming back in. Three sides of a rectangle round that phase. A run of
 * twenty-one phases has eighteen such pairs, so the graph came out as eighteen
 * nested rectangles in the wire colour with the cards somewhere inside them,
 * and the reader who had to read it said they could not tell what was connected
 * to what. They were right: a rail spans at least two whole phases, the drawing
 * scrolls, and a line with both ends off the pane says only that there is a
 * line.
 *
 * So the fact is written where the reader is already looking — under the card
 * that was fed, in the name of the phase that fed it. It costs a row of the gap
 * the cards already leave between them, it cannot be taken for a wire because
 * it is a word, and it reads at any scroll position because it is not a line
 * between two places.
 *
 * The wires that remain are the ones between neighbours, which is every line a
 * reader can follow end to end on one screen.
 */
/**
 * The longest run of untouched cells on one row, within a node's own columns.
 *
 * A row beside a card is rarely empty and rarely full: a wire from two bands
 * back runs down through one column of it and leaves the rest clear. Asking
 * whether the whole row is free gave up on every such row and said nothing;
 * asking for the longest clear run writes in the space that is actually there.
 */
function clearRun(c: Canvas, x: number, y: number, width: number): { x: number; w: number } | undefined {
  if (y < 0 || y >= c.rows) {
    return undefined
  }

  const end = Math.min(x + width, c.columns)
  let best: { x: number; w: number } | undefined
  let start = -1

  for (let at = x; at <= end; at++) {
    const cell = at < end ? c.at(at, y) : 1
    const free = cell === 0 || cell === 0x20

    if (free && start < 0) {
      start = at
    }

    if (!free && start >= 0) {
      if (best === undefined || at - start > best.w) {
        best = { x: start, w: at - start }
      }

      start = -1
    }
  }

  return best
}

/**
 * The cells of a clear run a label may actually use.
 *
 * A run ends at whatever is drawn beside it, and a label set hard against that
 * reads as one word with it: `↰ Preflig…▾` was a card's source and the
 * arrowhead of a wire arriving at the same card, with nothing between them to
 * say they were two things. So a cell of air is kept wherever the run ends at
 * something rather than at the card's own edge.
 */
function roomOf(c: Canvas, run: { x: number; w: number }, y: number, end: number): number {
  const after = run.x + run.w
  const cell = after < end && after < c.columns ? c.at(after, y) : 0x20

  return cell === 0 || cell === 0x20 ? run.w : run.w - 1
}

/**
 * The cells of one row a written source may take, counting a wire running
 * through them as cells it may have.
 *
 * Down the pane every row beside a card has a wire down the middle of it, so a
 * label that waits for a wholly clear row waits for one that never comes. The
 * band's own caption settled this already: it stands where it is centred, clears
 * its cells, and the wire gives way for that one row and runs whole above and
 * below it. This is the same bargain for the same reason.
 *
 * A plain upright only — the light one and the dashed one. A tee, an elbow, an
 * arrowhead or a card's frame is a shape a reader follows rather than a line
 * passing through, and rubbing one out loses a fact rather than a cell of a
 * line that is drawn again on the next row.
 */
function wireRun(c: Canvas, x: number, y: number, width: number): { x: number; w: number } | undefined {
  if (y < 0 || y >= c.rows) {
    return undefined
  }

  const end = Math.min(x + width, c.columns)
  let best: { x: number; w: number } | undefined
  let start = -1

  for (let at = x; at <= end; at++) {
    const cell = at < end ? c.at(at, y) : 1
    const free = cell === 0 || cell === 0x20 || cell === LIGHT.down || cell === DASH_V

    if (free && start < 0) {
      start = at
    }

    if (!free && start >= 0) {
      if (best === undefined || at - start > best.w) {
        best = { x: start, w: at - start }
      }

      start = -1
    }
  }

  return best
}

function paintSources(c: Canvas, view: Layout, sources: Map<string, string[]>): void {
  if (sources.size === 0) {
    return
  }

  for (const box of view.lanes) {
    for (const node of box.nodes) {
      const named = sources.get(node.agent.agentId)

      if (!named || named.length === 0) {
        continue
      }

      // Above the card, in every layout. The row under a card is the row its
      // wires leave by down the pane, so a name written there reads as
      // something coming out of the card rather than into it; and a label that
      // stood under a card across the pane and over one down it was the same
      // fact in two shapes, which a reader has to learn twice.
      //
      // Said rather than left to whichever row is free. The band used to close
      // hard under its cards, so down the pane the row below one was the next
      // band's rule and the name had nowhere to go but up; a band that leaves
      // that row free would quietly have started writing a card's inputs on the
      // row its outputs leave by.
      //
      // Down the pane it is the second row up, not the first: the first is the
      // one the arrowheads land on, and an arrowhead stands in the middle of it,
      // so a label there had half a card's width, gave up its word for its name,
      // and on a narrow pane said nothing at all. The second row up is the
      // band's own, given to it for this, and the wire running down it gives way
      // the way it gives way for a band's caption — whole above, whole below.
      //
      // The row nearest the card is still the fallback, and the row under it
      // after that, because a card standing hard under its band's rule has
      // neither of the rows above it. Which of the three is asked of the cells,
      // because that is the only way to be right about a row a wire, a rule or a
      // name may already have taken.
      //
      // The mark points at the card, so it is the arrowhead of the row it
      // landed on: `▾` from above, `▴` from below. It used to be `↰`, which is
      // the return arrow everywhere else a developer meets it — a reader asked
      // whether the run rewound to this step. Every input this pane draws ends
      // in an arrowhead pointing into the card it feeds; an input it writes
      // instead of drawing should say the same thing the same way.
      const end = Math.min(node.x + node.w, c.columns)
      const down = view.orientation === 'vertical'
      const rows = [
        ...(down ? [{ y: node.y - 2, mark: ARROW_DOWN, over: true }] : []),
        { y: node.y - 1, mark: ARROW_DOWN, over: false },
        { y: node.y + node.h, mark: ARROW_UP, over: false },
      ]
      // Eight cells, which is a mark, a cell of air and six letters of a phase
      // name. It was ten, and at ten the label a card carried across the pane
      // went missing from the same card drawn down it, at every width where the
      // row it had there came to nine.
      const found = rows
        .map(row => ({ ...row, run: (row.over ? wireRun : clearRun)(c, node.x, row.y, node.w) }))
        .find(({ run, y }) => run !== undefined && roomOf(c, run, y, end) >= 8)

      if (found === undefined || found.run === undefined) {
        continue
      }

      const at = found.y
      const room = roomOf(c, found.run, at, end)
      // Where the run ends at the arrowhead of a wire already arriving at this
      // card, that arrowhead serves both: the source is written up against it
      // rather than given a second one two cells along. Two marks of the same
      // shape on one row, both pointing into the same card, are one fact drawn
      // twice — and down the pane, where the label and the wire share the row
      // above the card, the second mark cost the name the cells it needed
      // (`↰ Preflig…▾`).
      //
      // Otherwise the label brings its own, and keeps a cell of air after it:
      // the spacing a card gives its own state mark, since a mark set against a
      // word is read as part of the word.
      const shares = found.run.x + found.run.w < end && c.at(found.run.x + found.run.w, at) === found.mark
      const budget = shares ? room : room - 2

      // As many names as the card is wide, and a count for the rest. A card
      // twelve columns wide cannot carry two phase names and should not pretend
      // to — `▾ from Setup +2` says the same thing in the room there is.
      const namesIn = (space: number): string => {
        let said = runName(named[0], space)

        for (let i = 1; i < named.length; i++) {
          const more = `${said}  ${runName(named[i], Math.max(1, space - cells(said) - 2))}`

          if (cells(more) > space) {
            return `${said} +${named.length - i}`
          }

          said = more
        }

        return said
      }

      // The word, not the mark alone. `▴ Preflight` was the arrowhead every
      // drawn input ends in and the name of what sent it, which is right and is
      // learned rather than read: the first reader to meet one asked what the
      // text beside the card was for. `from` is the word the dialog's own foot
      // already uses for the same fact, so the pane and the dialog say it the
      // same way.
      //
      // Where the word would cost the name letters it is dropped instead — the
      // ladder a token count runs down, for the same reason. Down the pane the
      // arriving wire's arrowhead stands in the middle of the row the label
      // shares with it, so the label has half a card's width and no more, and
      // `from Prefli…` names nothing while spelling out a mark the reader has
      // already met spelled out on some other card in the same drawing.
      const lead = 'from '
      const wide = namesIn(budget)
      const tight = namesIn(Math.max(1, budget - lead.length))
      const said = tight === wide ? lead + tight : wide

      // The mark is a wire's and takes a wire's colour; the name is a name and
      // stays grey. Drawn in one tone the pair read as a caption, which put the
      // written arrowhead in a different register from the drawn one beside it.
      //
      // Written rather than put, because it is a mark in a sentence and not the
      // end of a line — the same standing the strip's `Verify ▸ Escalate` has.
      // A line the pane draws has to reach something at both ends, and this one
      // is pointing at a card out of the space where the wire would have been.
      const text = truncate(said, budget)

      if (shares) {
        c.text(found.run.x + room - cells(text), at, text, quietOf(c.background))
      } else {
        // Centred on the card, the way a card centres its own name and its own
        // model. Set against the left edge it hung off a card wider than it by
        // the whole of the difference, which read as a label belonging to
        // whatever was further left rather than to the card it points at.
        //
        // On the card and not on the run of clear cells: the run is whatever
        // the rest of the drawing left, and centring in that put the label
        // wherever the wires happened to fall. Clamped into the run after,
        // since that is the space it may actually write in.
        const wide = 2 + cells(text)
        const middle = node.x + Math.floor((node.w - wide) / 2)
        const from = Math.max(found.run.x, Math.min(middle, found.run.x + room - wide))

        // Cleared before it is written, where the row it took has a wire
        // running down it. `c.text` skips a blank, so the cell the wire is in
        // would keep the wire and the label would be written around it; and a
        // cell put back to a blank is a cell the line checker knows was given
        // up rather than overwritten, which is how a band's caption covers a
        // wire without being read as a word drawn over one.
        if (found.over) {
          for (let dx = 0; dx < wide; dx++) {
            c.put(from + dx, at, 0x20, quietOf(c.background))
          }
        }

        c.text(from, at, String.fromCodePoint(found.mark), COLORS.wire)
        c.text(from + 2, at, text, quietOf(c.background))
      }
    }
  }
}

/**
 * Which column the border before each lane stands in, indexed by lane. `-1`
 * where that gutter is too narrow to hold one.
 *
 * One cell clear of the phase it closes, which leaves the middle of the gutter
 * to the barrier's spine with a blank column either side of it. Standing in
 * that middle column — where it used to — the border and the spine were the
 * same cells, so the edge of a phase could not be told from the line every
 * agent of it feeds, and the wires arriving read as the border's own kinks.
 */
/**
 * Where the boundary before each lane is drawn, or -1 where it has none.
 *
 * The layout stands it halfway between the cards either side of it, so the
 * phases divide the pane into sections and the name over a column of cards is
 * centred on the section it names. The arrowheads land in the cell before a
 * card and the spine stands between the boundary and them: a gutter with no
 * clear column left over goes without a boundary, which costs a line where
 * drawing it would cost the wires.
 */
function bordersOf(lanes: LaneBox[], orientation: 'horizontal' | 'vertical'): number[] {
  return lanes.map(lane =>
    orientation === 'horizontal' && lane.edgeAt >= 0 && lane.edgeAt < lane.busAt && lane.edgeAt < lane.x - 1
      ? lane.edgeAt
      : -1,
  )
}

/**
 * The line between one phase and the next, and — stacked — the name of the
 * phase it opens.
 *
 * Laid out across, a phase is a column of cards, and a column of cards looks
 * like every other column of cards: the same five agents appear under five
 * phase names, and which column a card is in is the only thing that says which
 * phase it ran in. So the boundary is a dashed rule down the gutter, quiet
 * enough not to be read as a wire, and the wires cross it at a junction drawn
 * in their own colour.
 *
 * Stacked, the phases are bands down the page, and the same boundary turns with
 * them into a rule across the pane. There it has the room to carry the band's
 * name, centred, and to fill itself to the fraction of that band which has
 * landed — so one row says where a phase starts, what it is called and how far
 * it has got, which is what the captions, the seam and the header's progress
 * rule said between them before.
 */
/**
 * The lane the run is working in, which is where the window looks.
 *
 * The lane holding the most recently started agent that is still running; with
 * none running, the most recently started lane of any state, which is where the
 * run has got to. Taken off the drawing rather than off the run, because a
 * phase the layout dropped is a phase there is nothing to look at.
 */
function frontLaneOf(view: Layout, live: boolean): LaneBox | undefined {
  if (!live) {
    return undefined
  }

  const drawn = view.lanes.filter(lane => lane.nodes.length > 0)
  const running = drawn.filter(lane => lane.nodes.some(node => node.agent.state === 'running'))
  const among = running.length > 0 ? running : drawn

  if (among.length === 0) {
    return undefined
  }

  const startedAt = (lane: LaneBox) => Math.max(...lane.nodes.map(node => node.agent.startedMs))

  // Ties go to the later lane: phases that began in the same millisecond are
  // phases replayed from a file, and there the declared order is the run's.
  return among.reduce((latest, lane) => (startedAt(lane) >= startedAt(latest) ? lane : latest))
}

/**
 * The loop, drawn as a loop: a rail down the left gutter from the last phase
 * the run went round on back up to the first.
 *
 * Down the pane a rewind has nowhere to show itself. Every phase is a row, the
 * rows run in the order the run declared them, and a run that went round four
 * times draws the same rows a run that went round once does — only with more
 * marks on them. The marks say a phase was entered again; they cannot say which
 * phases were entered again *together*, which is the thing a reader wants when
 * a pipeline rewinds. Here the run's seventeen phases hold a body of eleven,
 * and the four outside it ran once each, at the ends.
 *
 * So the rail spans the phases that repeated, first to last, and the head at
 * the top points into the row control came back to. It is the only wire this
 * layout draws, and it is drawn in the wire's colour for that reason: it is
 * control flow, not furniture. The gutter is two cells the list layout keeps
 * free at every width, which is why the rail can be drawn without asking the
 * layout for room.
 *
 * Drawn before the band rules, because a rule goes into blank cells only: the
 * rule then starts at the rail's right arm, and every caption the rail passes
 * joins it with a tee rather than crossing it.
 */
function paintReturn(c: Canvas, view: Layout, laneAgents: FoldedLane[], bottom: number): void {
  if (view.list !== true) {
    return
  }

  const looped = view.lanes.filter(
    lane => (laneAgents[lane.index]?.entries ?? 0) > 1 && lane.nodes.length > 0,
  )

  // One phase that repeated is a phase that was retried, and its own caption
  // already counts the attempts. A rail wants two ends in different sections,
  // because what it says is that they went round together.
  if (looped.length < 2) {
    return
  }

  const first = looped[0] as LaneBox
  const last = looped[looped.length - 1] as LaneBox
  const head = Math.min(...first.nodes.map(n => n.y))
  const foot = Math.max(...last.nodes.map(n => n.y + n.h - 1))
  // The outermost margin of the phases it ties, not the first one's: a nested
  // run a reader has opened stands its rows in by a gutter of their own, and a
  // rail hung off that would be a rail drawn inside the run it encloses.
  const rail = Math.min(...looped.flatMap(lane => lane.nodes.map(node => node.x))) - 2

  if (foot <= head || rail < 0) {
    return
  }

  const tone = COLORS.wire
  const tees = new Set(
    view.lanes
      .map(lane => lane.captionRow)
      .filter((row): row is number => row !== undefined && row > head && row < foot),
  )

  for (let y = head + 1; y < foot; y++) {
    if (y >= 0 && y < bottom) {
      c.put(rail, y, tees.has(y) ? TEE_RIGHT : BOUND_V, tone)
    }
  }

  if (head >= 0 && head < bottom) {
    c.put(rail, head, LIGHT.tl, tone)
    c.put(rail + 1, head, ARROW_RIGHT, tone)
  }

  if (foot >= 0 && foot < bottom) {
    c.put(rail, foot, LIGHT.bl, tone)
    c.put(rail + 1, foot, RULE_LEFT, tone)
  }
}

/**
 * The fork from a phase's rule into the agents that ran in it.
 *
 * Laid out down the pane as bands, a fan is drawn as a fan: a barrier over the
 * band and a wire into every card. The flat list has room for neither — it is
 * what a pane too narrow for a node of any kind falls back to — and without
 * them three agents that ran at once and three passes that ran in turn are the
 * same three rows in the same order. The one fact the list kept was sequence,
 * which is the one fact its order already gave.
 *
 * So it keeps the one line it has room for: a stem in the gutter, branching out
 * of the phase's own rule into each of its rows and closing under the last. A
 * phase that ran a single agent gets none — a fork with one tine says nothing
 * a reader could not already see — and that is itself the reading: a phase with
 * a stem fanned out, a phase without one did not.
 *
 * Drawn before the rules, because a rule gives way to whatever is already in
 * its cells: the stem's own branch off it has to survive the rule being laid
 * across the pane afterwards.
 */
function paintStems(c: Canvas, view: Layout, bottom: number): void {
  if (view.list !== true) {
    return
  }

  const tone = quietOf(c.background)

  for (const lane of view.lanes) {
    if (lane.nodes.length < 2) {
      continue
    }

    const stem = (lane.nodes[0] as NodeBox).x - 1
    const head = lane.captionRow ?? -1

    if (stem < 0) {
      continue
    }

    if (head >= 0 && head < bottom) {
      c.put(stem, head, TEE_LEFT, tone)
    }

    lane.nodes.forEach((node, at) => {
      if (node.y < 0 || node.y >= bottom) {
        return
      }

      c.put(stem, node.y, at === lane.nodes.length - 1 ? LIGHT.bl : TEE_RIGHT, tone)
    })
  }
}

/**
 * A nested run a reader has opened, told apart from the run that called it.
 *
 * Opened, its agents used to be drawn exactly as the calling run's own are —
 * same rule down the left, same gutter, same indent — so thirteen rows of
 * another workflow sat in the middle of this one with nothing but the band
 * above them to say so, and that band scrolls away. A reader who arrived at the
 * rows by scrolling had no way to know whose they were.
 *
 * So the run gets a gutter of its own, one step in from the calling run's, and
 * it is drawn in the dashed register — the same double dash the strip of
 * phases still ahead is drawn in, which on this pane already means *not part of
 * the run proper*. The gutter closes at the foot on what the whole of the
 * nested run came to, so folding it away again loses no figure that was on the
 * pane while it was open.
 *
 * The child's own phases are not drawn, because they are not recorded: every
 * agent of a nested run carries the calling run's phase name (`▸ plugin:flow`,
 * and `#2` for the second trip), so the pane has its passes and its agents and
 * no phase structure beneath them to lay out.
 */
function paintInset(
  c: Canvas,
  view: Layout,
  laneAgents: FoldedLane[],
  nowMs: number,
  bottom: number,
): void {
  if (view.list !== true) {
    return
  }

  const tone = quietOf(c.background)

  for (const lane of view.lanes) {
    if (lane.inset !== true || lane.nodes.length === 0) {
      continue
    }

    const rail = (lane.nodes[0] as NodeBox).x - INSET_W
    const head = Math.min(...lane.nodes.map(node => node.y))
    const foot = Math.max(...lane.nodes.map(node => node.y + node.h - 1)) + 1

    if (rail < 0) {
      continue
    }

    for (let y = head; y < foot; y++) {
      if (y >= 0 && y < bottom) {
        c.put(rail, y, SEAM_V, tone)
      }
    }

    if (foot < 0 || foot >= bottom) {
      continue
    }

    c.put(rail, foot, LIGHT.bl, tone)
    c.put(rail + 1, foot, SEAM_H, tone)

    const agents = laneAgents[lane.index]?.agents ?? []
    const at = rail + 3
    const room = Math.max(0, c.columns - at - 1)

    if (agents.length > 0 && room > 8) {
      c.text(at, foot, truncate(sumOf(agents, nowMs), room), COLORS.dim)
    }
  }
}

/**
 * What a whole nested run came to: how many agents it ran, how long the run
 * spent inside it, and what it spent there.
 *
 * The clock is the passes added up, not the first start to the last end. A run
 * entered three times is three separate stretches with the calling run's own
 * work in the gaps — first start to last end counted those gaps as time inside
 * the nested run, and read as forty-nine minutes for a run that took six.
 * Which trip is which is in the phase name: the engine writes `#2` and `#3`
 * after it for the second and third.
 */
function sumOf(agents: AgentRow[], nowMs: number): string {
  const passes = new Map<string, AgentRow[]>()

  for (const agent of agents) {
    const trip = passes.get(agent.phase) ?? []

    trip.push(agent)
    passes.set(agent.phase, trip)
  }

  const took = [...passes.values()].reduce(
    (sum, trip) =>
      sum +
      Math.max(
        0,
        Math.max(...trip.map(a => a.endedMs ?? nowMs)) - Math.min(...trip.map(a => a.startedMs)),
      ),
    0,
  )
  const spent = agents
    .map(a => tokensOf(a))
    .filter((n): n is number => n !== undefined)
    .reduce((sum, n) => sum + n, 0)

  return [
    `${TOOL_MARK} ${agents.length} agents`,
    elapsed(took),
    ...(spent > 0 ? [tokensShort(spent)] : []),
  ].join('  ')
}

function paintSections(
  c: Canvas,
  view: Layout,
  laneAgents: FoldedLane[],
  passes: Map<string, Pass>,
  bottom: number,
  tick: number,
  over: boolean,
  hotspots: Hotspot[],
  /**
   * The cells across the drawing has, which is the pane less whatever the
   * scroll rail down the right edge takes.
   *
   * The rules used to run the pane's full width and the rail was painted over
   * the last two cells of each of them, so a caption centred on the pane sat
   * two cells left of the middle of the rule a reader could actually see.
   */
  width: number,
): void {
  const tone = quietOf(c.background)

  /**
   * The border goes into the cells nothing else is in. A cell an edge is
   * already drawn in keeps the edge, whole and in its own colour, and the
   * border is the thing that breaks.
   *
   * It used to join instead, so a crossing became `\u253c` and a turn became
   * `\u252c` — one stroke made of a border and a wire, and no way to tell by
   * looking which part of it was which. Two lines that cross have to be drawn
   * as two lines: the one in front stays whole and the one behind gives way,
   * which is how a reader knows there are two. The one in front is the wire,
   * because the wire is the thing being followed and the border is a boundary
   * the eye completes across a one-cell gap without being asked.
   */
  const ink = (x: number, y: number, code: number, paint: Rgb) => {
    if (y < 0 || y >= bottom || x < 0 || x >= c.columns) {
      return
    }

    if (c.at(x, y) !== 0x20) {
      return
    }

    c.put(x, y, code, paint)
  }

  if (view.orientation === 'horizontal') {
    // As tall as the drawing, not as tall as the pane. A boundary divides the
    // cards from each other, and a run of four phases of one agent draws four
    // cards twelve rows deep in a body of thirty-four: run to the foot, the
    // boundaries were four full-height vertical lines with a band of cards
    // somewhere in the middle of them, and most of the ink on the pane was
    // furniture around a drawing a fifth its size. A reader looking at that
    // said they could not read the graph, and the lines they were reading were
    // these.
    const nodes = view.lanes.flatMap(lane => lane.nodes)

    if (nodes.length === 0) {
      return
    }

    // It starts under the header's rule, where the header has already drawn the
    // tee that says a section begins here, and stops one row past the last card
    // — the row the `↰` marks are written on. Starting it beside the topmost
    // card instead left that tee as a stub with nothing under it.
    const bandTop = view.headerRows
    const bandBottom = Math.min(bottom, Math.max(...nodes.map(n => n.y + n.h)) + 1)

    bordersOf(view.lanes, view.orientation).forEach(x => {
      if (x < 0) {
        return
      }

      for (let y = bandTop; y < bandBottom; y++) {
        ink(x, y, BOUND_V, tone)
      }
    })

    return
  }

  view.lanes.forEach((lane, i) => {
    const y = lane.captionRow ?? -1

    if (y < 0 || y >= bottom) {
      return
    }

    const fold = laneAgents[lane.index]
    // `▸` is the press that opens a nested run, so once it is open the mark has
    // to stop saying *press me to open*. A marker that never changes is a
    // control with no state, and a reader who has opened two of three nested
    // runs cannot see which two.
    const open = fold?.nested === true && fold.shut !== true
    const facts = phaseFactsOf(
      open ? FOLD_OPEN + lane.phase.slice(FOLD_SHUT.length) : lane.phase,
      lane.index,
      fold?.agents ?? [],
      passes,
      over,
    )
    // The heavy stroke says *progress*, not *done*. A band with work still in it
    // fills to the share of it that has landed; a band that has all landed, and
    // one nothing has entered, draw the plain rule every other divider on the
    // pane is drawn with.
    //
    // It used to fill by the same share whatever the state, so a finished run of
    // seventeen phases was seventeen rules of heavy stroke across the whole pane
    // — seventeen hundred cells of the loudest ink the drawing has, all of it
    // repeating what the count at the end of each rule already said. Structure is
    // grey here, and a rule that has nothing left to report is structure.
    const filled =
facts.total > 0 && facts.landed < facts.total ? Math.round((facts.landed / facts.total) * width) : 0
    for (let x = 0; x < width; x++) {
      const landed = x < filled

      // Laid out down the pane the wires run down and the rule runs across, so
      // this is the same crossing the across layout makes in its gutters — and
      // it is settled the same way: the wire stays whole and the rule breaks.
      //
      // The rule used to arc over the wire instead, in its own quiet. An arc is
      // the mark for *two lines, and this is the one in front*, and spending it
      // on a boundary sent a reader looking for a second line to follow. A
      // one-cell gap in a rule that runs the width of the pane is read as a
      // rule with something crossing it, which is what it is.
      if (armsOf(c.at(x, y)) === (ARM.up | ARM.down)) {
        continue
      }

      // Where the band is tight enough that a card's exit cell is the next
      // band's rule, one cell has two marks to carry, and the point is the one
      // that stays. It is the only thing on the pane that says which card a
      // wire left, and a band drawn as rows has no edge of its own for the wire
      // to leave from — rubbed out, the run below it began in mid-air.
      //
      // The rule used to win this cell, on the grounds that it runs the width
      // of the pane and a gap in it reads as a gap in the phase. It does not:
      // the rule gives way to every wire crossing it for the same reason, and
      // one cell of a hundred and ten is a rule with something crossing it.
      if (c.at(x, y) === PORT) {
        continue
      }

      ink(x, y, ruleOf(fold?.nested === true, landed), tone)
    }

    // The name is set into the rule the way a card's is set into its top edge:
    // centred, with a blank cell either side of it, so the rule reads as one
    // line broken by a word rather than as two lines with a word between them.
    //
    // Centred in every layout, because a name titles the thing under it and the
    // reader crosses layouts: a caption flush left down the pane and centred
    // across it is the same fact told two ways, and the pane stops reading as
    // one drawing seen from two sides.
    //
    // It stands where it is centred whatever crosses the rule there, and the
    // wire gives way: the caption clears the cells it stands in, so a wire
    // passing through the rule loses this one row of itself and runs on above
    // and below, which is the same break the rule takes for the wire everywhere
    // else on the pane.
    //
    // The caption used to give way instead, stepping along the rule until it
    // found a window with no wire in it. Down a pane of centred cards the spine
    // runs down the middle, which is the caption's own column, so every band
    // stepped aside and by a different amount: the rule came out longer on one
    // side of the caption than the other, band after band, and a reader asked
    // why the phase names were not centred.
    const nested = fold?.nested === true
    const shut = fold?.shut === true
    const handle = nested ? foldHandle(shut, fold?.agents.length ?? 0, width) : ''
    const label = paintPhaseLabel(
      c,
      0,
      y,
      width,
      facts,
      2,
      handle.length > 0 ? HANDLE_GAP + handle.length + 1 : 0,
    )

    c.put(label.x - 1, y, 0x20, tone)
    c.put(label.x + label.used, y, 0x20, tone)

    // A run of twenty-three agents drawn as one row has to have a way in, and a
    // way back out once it is open. Both are the handle after the caption. The
    // mark the name opens with takes the press only where there was no room for
    // the handle: it is a coloured cell, and a Button strips the colour, so it
    // is a target of last resort rather than the ordinary one.
    if (nested) {
      const drew = paintFoldHandle(
        c,
        lane.phase,
        label.x + label.used + HANDLE_GAP,
        y,
        width - label.x - label.used - HANDLE_GAP,
        tone,
        shut,
        fold?.agents.length ?? 0,
        hotspots,
      )

      if (!drew) {
        hotspots.push(markSpot(lane.phase, label.x, y, 0))
      }
    }
  })
}

function along(view: Layout, p: { x: number; y: number }): number {
  return view.orientation === 'horizontal' ? p.y : p.x
}

/**
 * True where the gutter has room for a bundle: a line of its own, clear of the
 * row the arrowheads land on. Drawn in a one-row gutter the bundle's junctions
 * land on its own arrowheads and rub them out.
 */
function deeper(view: Layout, right: LaneBox): boolean {
  const ports = right.nodes.map(n => entryOf(n, view.orientation))

  return ports.length > 0 && Math.min(...ports.map(p => (view.orientation === 'horizontal' ? p.x : p.y))) > right.busAt
}

/**
 * Whether two of these carries would be drawn over each other crossing the
 * gutter.
 *
 * Each turns once and then runs along the gutter, from the cell it leaves to
 * the cell it arrives at. Two such runs that share a cell are two lines a
 * reader sees as one long line, and no colour separates them — the eye follows
 * the run, not the hue. Where that happens they are drawn as the one bus they
 * already look like, which says the same thing and says it once.
 *
 * Runs that merely meet at a port do not count: that is a join, and a join is
 * what a bus would draw there anyway.
 */
function crowded(view: Layout, crossing: Carry[], byId: Map<string, NodeBox>): boolean {
  const spans: [number, number][] = []

  for (const e of crossing) {
    const from = byId.get(e.fromId)
    const to = byId.get(e.toId)

    if (!from || !to) {
      continue
    }

    const leaves = along(view, exitOf(from, view.orientation))
    const arrives = along(view, entryOf(to, view.orientation))

    spans.push([Math.min(leaves, arrives), Math.max(leaves, arrives)])
  }

  return spans.some((s, i) => spans.some((t, j) => j !== i && s[0] < t[1] && t[0] < s[1]))
}

/**
 * Drops the press targets that stand off the drawing.
 *
 * A label clipped by the edge of the pane, or covered by the notice or the
 * detail dialog, was never drawn — and a Button over cells that hold nothing is
 * a press that lands on nothing.
 */
/**
 * Drops the drawing's presses that the body's window clipped, and leaves the
 * header's alone.
 *
 * A node scrolled off the top is still in the list the painter built: it drew
 * nothing, but it pushed a hotspot, and a press landing on the header row above
 * it would open an agent the reader cannot see.
 */
function inWindow(
  hotspots: Hotspot[],
  from: number,
  box: { x: number; y: number; w: number; h: number },
): void {
  const body = hotspots.splice(from)

  hotspots.push(
    ...body.filter(
      h => h.x >= box.x && h.x + h.w <= box.x + box.w && h.y >= box.y && h.y < box.y + box.h,
    ),
  )
}

function onCanvas(c: Canvas, hotspots: Hotspot[], lastRow: number): void {
  const shown = hotspots.filter(h => h.w > 0 && h.x >= 0 && h.x + h.w <= c.columns && h.y >= 0 && h.y < lastRow)

  hotspots.length = 0
  hotspots.push(...shown)
}

/**
 * Everything behind an open dialog stops being pressable.
 *
 * The graph is drawn first and whole, so the cards under a dialog are still in
 * the list of things that can be pressed. Left there, a press meant for a line
 * of the dialog opens whichever node it happens to cover.
 *
 * The ones beside it go too, and that is the point. A hotspot is drawn as a
 * Button, and a Button carries no colour — the surface draws its label at full
 * strength whatever the cells under it were mixed to. So a node left pressable
 * behind a dialog is also a node left *lit* behind one: a row of white labels
 * across a drawing that has been pushed back, which reads as the graph still
 * being the thing on top. What is behind a dialog is behind it in both senses,
 * for every dialog the pane draws.
 *
 * `keep` is for a control that stands outside the dialog and shuts it: the run
 * name carries the menu's only way back, where every other dialog has a ✕ of
 * its own inside it.
 */
function modal(hotspots: Hotspot[], open: boolean, keep: string[] = []): void {
  if (!open) {
    return
  }

  const kept = hotspots.filter(h => keep.includes(h.agentId))

  hotspots.length = 0
  hotspots.push(...kept)
}

/**
 * What the detail dialog leaves pressable: the run name, and only while the
 * menu is open over it.
 *
 * The menu drops from that name, so it needs the name's own hotspot to know
 * where to drop from and to give the reader a way to roll it back up. Shut,
 * the name is a piece of the bar like any other, and the dialog takes its
 * press with everything else.
 */
function menuKeeps(options: PaintOptions): string[] {
  return options.runPicker === 'open' ? [RUN_PICKER] : []
}

/**
 * Where an agent's detail opens: a dialog over the drawing, not a strip under
 * it.
 *
 * The strip took its rows from the layout, so pressing one card to read it
 * redrew every other card smaller — and on a short pane the graph fell to a
 * list at the moment a reader asked it a question. A dialog costs the graph
 * nothing: it covers the middle while it is open and gives all of it back when
 * it shuts.
 *
 * Inset on all four sides, so the drawing shows around it and says the graph is
 * still there. The bar stays clear as well: which run this is and what it has
 * spent are the two facts that hold whatever is open over them. A pane with no
 * room to inset opens no dialog rather than a box with no room for a sentence.
 */
function dialogOf(c: Canvas, rows: number): Rect | null {
  const top = barRowsOf(c.rows, c.columns)
  // The frame takes a row at each end, so the rows asked for are the rows the
  // reading gets.
  const h = Math.min(Math.max(rows, 5) + 2, c.rows - top - 1)
  // Wide enough for two blocks side by side wherever the pane can spare them.
  // A dialog narrower than that stacks what an agent was asked and what it
  // called into one column, and asks for a scroll to read what would have
  // fitted. Otherwise it takes what the pane has, less a cell of drawing at
  // each side: the dialog is the reading the graph can only hint at, and every
  // cell it gives back to the picture behind it is a line of prose wrapped
  // sooner.
  const two = 2 * BLOCK_W + 4
  const w = Math.max(24, Math.min(c.columns - 2, Math.max(two, Math.round(c.columns * 0.92))))

  if (h < 7 || w > c.columns || c.columns < 26) {
    return null
  }

  return {
    x: Math.max(0, Math.floor((c.columns - w) / 2)),
    y: top + Math.max(0, Math.floor((c.rows - top - h) / 2)),
    w,
    h,
  }
}

/**
 * The dialog over the drawing: a nested run, an agent, or one of that agent's
 * calls opened out of it.
 *
 * All three take the same rectangle, so this is where they are told apart
 * rather than in any of them. A call that is no longer in the agent's list —
 * the reader moved to another agent with the call still open — falls back to
 * the agent, which is the thing they pressed to get here.
 */
function openDetail(
  c: Canvas,
  agent: AgentRow | undefined,
  inside: AgentRow[],
  phase: string | undefined,
  nowMs: number,
  tick: number,
  panel: Rect,
  options: PaintOptions,
  hotspots: Hotspot[],
  fedBy: string[],
  /** Every trip through the open agent's own work: see `passesFor`. */
  passes: FoldPass[],
  defaultModel?: string,
): DetailView {
  if (phase !== undefined && inside.length > 0) {
    const pane = paintRun(c, phase, inside, nowMs, panel, options.detailScroll?.[RUN_PANE] ?? 0, tick, hotspots)

    return { panes: [pane], tab: RUN_PANE, run: pane }
  }

  if (agent === undefined) {
    return { panes: [], tab: 0 }
  }

  const call = options.openCall ? agent.calls?.find(one => one.id === options.openCall) : undefined

  if (call) {
    const shown = paintCall(
      c,
      call,
      nowMs,
      panel,
      { arg: options.callScroll ?? 0, out: options.callOutScroll ?? 0 },
      agent.state === 'running',
      hotspots,
    )

    return {
      panes: [shown.arg],
      tab: options.detailTab ?? 0,
      call: shown.arg,
      out: shown.out,
      split: shown.split,
    }
  }

  return paintDetail(
    c,
    agent,
    nowMs,
    tick,
    panel,
    options.detailScroll ?? [],
    options.detailTab ?? 0,
    hotspots,
    fedBy,
    passes,
    defaultModel,
    options.fromRun,
  )
}

export function paint(c: Canvas, run: RunState, options: PaintOptions): PaintResult {
  const { nowMs, selectedId } = options
  // A run that has ended draws no more frames, so anything that moves has to
  // stop on a frame that reads: the still tick holds every label at its start
  // and every spinner where it was.
  const tick = run.status === 'running' ? options.tick : -1

  c.clear()

  const selected = run.agents.find(a => a.agentId === selectedId)
  // A nested run has no agent of its own to be selected by. What is selected is
  // the phase, and what the dialog reads is every agent in it — see `RUN_OPEN`.
  const phase = selectedId?.startsWith(RUN_OPEN) ? selectedId.slice(RUN_OPEN.length) : undefined
  const inside = phase === undefined ? [] : run.agents.filter(a => a.phase === phase)
  const reading = selected !== undefined || inside.length > 0
  const panel: Rect | null = reading ? dialogOf(c, options.detailRows ?? 0) : null
  // What fed this agent from further back than the band above it. The graph
  // writes the same phases beside the card; the dialog is where they are said
  // in full, and where the mark beside the card is spelled out in a word.
  const fedBy = selected === undefined ? [] : (sourcesOf(run).get(selected.agentId) ?? [])
  // Which trip through its own work this agent is. The card it was opened from
  // carries the same marks, but only as many of them as its width allows — so
  // the dialog reads the whole list rather than the drawn part of it.
  const trips = selected === undefined ? [] : passesFor(run, selected.agentId)
  /** Which nested runs the reader has unfolded, in whichever layout is drawn. */
  const opened = options.opened && options.opened.length > 0 ? new Set(options.opened) : undefined

  if (options.orientation === 'timeline') {
    const { hotspots, body, front } = paintTimeline(
      c,
      run,
      nowMs,
      tick,
      selectedId,
      0,
      c.columns,
      options.runPicker,
      opened,
      options.bodyScroll?.y ?? 0,
      options.bodyScroll?.x ?? 0,
      options.follow !== false,
    )

    onCanvas(c, hotspots, c.rows)
    modal(hotspots, panel !== null && reading, menuKeeps(options))

    const detail = panel && reading
      ? openDetail(c, selected, inside, phase, nowMs, tick, panel, options, hotspots, fedBy, trips, run.defaultModel)
      : undefined

    onCanvas(c, hotspots, c.rows)

    // Drawn in the order they stack, then the drawing pushed back behind
    // whichever of them ended up in front.
    const menu = paintRunMenu(c, run, options, hotspots)
    const settings = paintSettings(c, options, hotspots)
    const about = paintAbout(c, options, hotspots)

    shade(c, frontOf(about, settings, menu.rects, detail && panel))

    return {
      hotspots,
      orientation: 'timeline',
      detail,
      ...(body ? { body } : {}),
      ...(front ? { front } : {}),
      ...(menu.window ? { runList: menu.window } : {}),
    }
  }

  const setting = options.orientation ?? 'auto'
  // The drawing is laid out whole and the body shows a window on to it, rather
  // than the layout being cut down until it fitted. A run of seventy agents is
  // a run of seventy agents at any pane size, and the reader scrolls to the
  // part they want; before this, the pane drew what fitted and said `… 38 more`
  // about the rest, which is a way of saying the pane cannot show the run.
  //
  // The rails cost cells, and the cells change what fits, so the size is
  // settled first: lay out, see which way the drawing overruns, give up the
  // column or the row that rail needs, and lay out again at what is left.
  //
  // A rail once asked for is kept, and that is what makes the search end. It
  // used to be free to take one away again, on the grounds that giving up a
  // column cannot make the drawing narrower — which is true of the column and
  // false of the row. Past the height `densityOf` will stand cards in, every
  // node in the drawing flattens to a row, so the foot's one row can make the
  // drawing much shorter: at 30 by 16 a run laid out 53 by 36 as cards and 45
  // by 14 as rows. The taller one wants a rail, the shorter one does not, and
  // each is reached by doing what the other asked for — there is no fixed
  // point to find. What shipped was the worse half of the pair: a drawing
  // overrunning the body by twenty-one rows with no arrows beside it.
  //
  // Latched, the flags only ever turn on, so three passes settle them. A rail
  // that turns out to have nothing to scroll is not drawn — see below — and
  // the cells it reserved are simply left blank, which is what the timeline
  // has always done with its foot.
  let railed: boolean = false
  let footed: boolean = false
  let view = layout(run, c.columns, c.rows, setting, 0, opened)

  for (let pass = 0; pass < 3; pass++) {
    const reach = extentOf(view)
    // A body with no room for two arrows and a track between them cannot show
    // a rail, and giving up cells for one it cannot draw makes the pane that
    // was already too small smaller. A drawing overruns such a pane whatever
    // is done about it.
    const roomy = c.rows - view.headerRows >= 2 + RAIL_MIN
    const wantsRail: boolean = railed || (roomy && reach.h > c.rows - (footed ? 1 : 0))
    const wantsFoot: boolean =
      footed || (c.columns >= 2 + RAIL_MIN && reach.w > c.columns - (railed ? RAIL_W : 0))

    if (wantsRail === railed && wantsFoot === footed) {
      break
    }

    railed = wantsRail
    footed = wantsFoot
    view = layout(run, c.columns - (railed ? RAIL_W : 0), c.rows, setting, footed ? 1 : 0, opened)
  }

  const bodyW = c.columns - (railed ? RAIL_W : 0)
  const bodyFoot = c.rows - (footed ? 1 : 0)
  // The first row the drawing may land on, which is not the first row under the
  // header: a stacked band carries its own name over itself, and the first
  // band's name sits on the last row the header counts. Across, the header's
  // last two rows are the phase names and the rule under them, both drawn from
  // the lanes — the strip's own caption sits on the same pair, and a body that
  // began below them clipped it.
  const bodyTop =
    view.orientation === 'horizontal'
      ? view.headerRows
      : Math.min(view.headerRows, ...view.lanes.map(l => l.captionRow ?? view.headerRows))
  const reach = extentOf(view)
  const spanX = Math.max(0, reach.w - bodyW)
  const spanY = Math.max(0, reach.h - bodyFoot)
  // While the run is live the window looks where the work is. Seventeen phases
  // are wider and taller than any pane, and a pane that opened at the first one
  // showed a phase that finished an hour ago while the agent actually running
  // was off the drawing entirely — the reader had to scroll to find the present.
  //
  // Scrolling away is a peek rather than a decision: the pane stays where it is
  // put until the run enters a different phase, and then it goes back to the
  // front. Staying away until asked back needs a control that says *resume*, and
  // a control nobody presses while reading leaves the pane showing the past.
  // Nothing is lost by going back, because the run is still going and what was
  // being read is still there to scroll to.
  const front = frontLaneOf(view, run.status === 'running')
  const seat =
    options.follow !== false && front
      ? {
          x: front.x + front.w / 2 - bodyW / 2,
          y: front.y + front.h / 2 - bodyTop - (bodyFoot - bodyTop) / 2,
        }
      : { x: options.bodyScroll?.x ?? 0, y: options.bodyScroll?.y ?? 0 }
  const atX = Math.max(0, Math.min(spanX, Math.round(seat.x)))
  const atY = Math.max(0, Math.min(spanY, Math.round(seat.y)))

  view = scrolled(view, -atX, -atY)

  const lanes = orderedLanes(run, opened)
  const carries = edgesOf(run)
  const byId = new Map<string, NodeBox>()
  const hotspots: Hotspot[] = []

  const laneOf = new Map<string, number>()

  view.lanes.forEach((lane, index) => {
    for (const node of lane.nodes) {
      byId.set(node.agent.agentId, node)
      laneOf.set(node.agent.agentId, index)
    }
  })

  const scale = scaleOf([...byId.values()], nowMs, run.defaultModel, view.density)
  const passes = passesOf(run)

  paintHeader(
    c,
    run,
    view.lanes,
    lanes,
    nowMs,
    tick,
    view.orientation,
    view.headerRows,
    c.columns,
    passes,
    hotspots,
    options.runPicker,
  )

  paintAheadCaption(c, view, overOf(run))

  // Where the header's own presses end. Everything pushed after this belongs to
  // the drawing, and the drawing can be scrolled out from under the reader, so
  // the two are filtered by different rules.
  const headerSpots = hotspots.length

  // From here to the rails, every cell lands inside the body. The header keeps
  // its rows whatever the drawing is doing underneath it, and a lane scrolled
  // half off the top draws the half that is still in the body — the rest simply
  // does not land, so nothing has to be laid out twice or cut to size.
  // The window holds the drawing's rows, not its columns: the layout was
  // already narrowed to leave the rail its column, so the only cells that reach
  // past the body are the stubs where a wire leaves the last card — and the
  // rail, drawn last, takes back whatever lands under it. Clipping the width as
  // well cut those stubs and left an arm pointing at nothing.
  c.window(0, bodyTop, c.columns, bodyFoot - bodyTop)

  // The flat list, and not merely a stack of one-row nodes: a band of rows still
  // has gutters to route through and still says which node fed which, so it is
  // drawn with every wire a band of cards gets.
  const isList = view.list === true

  // How each phase's work was spread over time: the agents that ran together, in
  // the order the groups went. A phase is fed at whatever started first and left
  // from whatever finished last, which for a fan is all of it, for a chain is one
  // node at either end, and for anything between is the two ends of the middle.
  const waves = view.lanes.map(lane => wavesOf(lanes[lane.index] ?? { agents: [] }))

  // Which phases ran one agent at a time. A chain is fed once, at its head, and
  // hands on from each pass to the next; a fan is fed at every node. The hops
  // along a chain are drawn but not recorded as edges of the run: `passesOf`
  // reads the edge list to decide what is a repeat of one piece of work, and a
  // phase of three different steps run in order is a sequence, not three goes
  // at the same thing.
  const chains = view.lanes.map(lane => chainOf(lanes[lane.index] ?? { agents: [] }))
  const known = new Set(carries.map(e => `${e.fromId}>${e.toId}`))
  const wires: Carry[] = [...carries]

  for (const chain of chains) {
    for (let i = 1; i < (chain?.length ?? 0); i++) {
      const hop = { fromId: (chain as AgentRow[])[i - 1].agentId, toId: (chain as AgentRow[])[i].agentId }

      if (!known.has(`${hop.fromId}>${hop.toId}`)) {
        known.add(`${hop.fromId}>${hop.toId}`)
        wires.push(hop)
      }
    }
  }

  /** True where a carry between these two can be drawn as one straight line. */
  const abreast = (from?: NodeBox, to?: NodeBox) =>
    from !== undefined &&
    to !== undefined &&
    (view.orientation === 'horizontal'
      ? exitOf(from, 'horizontal').y === entryOf(to, 'horizontal').y
      : exitOf(from, 'vertical').x === entryOf(to, 'vertical').x)

  // A band used to wrap, and then only its outer rows faced anything outside
  // it: a wire into the second row would have been drawn down through the cards
  // on the first, and a line through a card is a line through a word. So a
  // barrier landed on the row facing it and a carry between two rows the wire
  // could not reach was left undrawn. A band stands whole on one row now — see
  // `stackLayout` — so every card of it faces both ways and every carry is a
  // line that can be drawn.

  /** The gutters drawn as one bundle, whose carries are not drawn again. */
  const bundled = new Set<number>()
  /** Where every edge put its arrowhead, so a rail can be kept off them. */
  const arrows: { x: number; y: number }[] = []

  // Barriers first, so a node always wins the cells it shares with one.
  for (let i = 1; i < view.lanes.length && !isList; i++) {
    const left = view.lanes[i - 1]
    const right = view.lanes[i]

    // Nothing has crossed into this phase yet. Its caption in the header says
    // so; the body says it by staying empty, which is the honest drawing of a
    // phase with nothing in it.
    if (right.ghost) {
      continue
    }

    const crossing = carries.filter(e => laneOf.get(e.fromId) === i - 1 && laneOf.get(e.toId) === i)
    const askew = crossing.filter(e => !abreast(byId.get(e.fromId), byId.get(e.toId)))
    // A band that wrapped used to bundle what crossed it whatever else was
    // true, because a wire from a row inside it could not be drawn without
    // crossing the cards between. Bands stand whole now, so what is left is the
    // reason a band on one row bundles: too many carries, turning too close
    // together, to be followed one by one.
    const wants =
      crossing.length > 0 && askew.length > 0 && deeper(view, right) && crowded(view, crossing, byId)
    const bundle = () => {
      const pick = (ids: string[]) =>
        [...new Set(ids)].flatMap(id => {
          const node = byId.get(id)

          return node ? [node] : []
        })

      bundled.add(i)
      paintBarrier(
        c,
        pick(crossing.map(e => e.fromId)),
        pick(crossing.map(e => e.toId)),
        right.busAt,
        view.orientation,
        true,
        tick,
      )
    }

    // Two phases that ran side by side have no barrier between them, whatever
    // order they were declared in. Drawing one says the later waited for the
    // earlier, which a reader can disprove from the two clocks on screen.
    //
    // They get a mark of their own instead. Leaving the gutter empty said the
    // right thing only to a reader who had counted the arrowheads.
    if (!follows(lanes[i - 1], lanes[i])) {
      if (wants) {
        bundle()
      } else {
        paintAlongside(
          c,
          left.nodes,
          right.nodes,
          right.busAt,
          view.orientation,
        )
      }

      continue
    }

    if (!isPipelineLike(lanes[i - 1], lanes[i], carries)) {
      // A phase is entered at whatever started first and left from whatever
      // finished last. Feeding every pass of a chain from the phase above draws
      // four arrows into work that was handed along, and the line each pass gave
      // the next — the only line that says it was a sequence — is lost among
      // them. A nested run opened out is the same fault at four times the size:
      // a dozen agents that planned, fanned out and gathered, drawn with a wire
      // from the phase above into all twelve and a wire out of all twelve into
      // the phase below, is two gutters of wire that say the calling phase
      // started twelve agents at once. The doors are the first wave and the
      // last; a phase that really is one fan has one wave, and keeps every wire.
      const ends = (groups: AgentRow[][], pick: (w: AgentRow[][]) => AgentRow[], nodes: NodeBox[]) => {
        if (groups.length < 2) {
          return nodes
        }

        const door = pick(groups).flatMap(agent => {
          const node = byId.get(agent.agentId)

          return node ? [node] : []
        })

        return door.length > 0 ? door : nodes
      }

      paintBarrier(
        c,
        ends(waves[i - 1], group => group[group.length - 1], left.nodes),
        ends(waves[i], group => group[0], right.nodes),
        right.busAt,
        view.orientation,
        false,
        tick,
      )
    } else if (wants) {
      bundle()
    }
  }

  // Where each wire that changes lane turns.
  //
  // The gutter is several lines deep and a wire could turn on any of them. They
  // share one: a gutter where every wire turns on the first line it can is a
  // comb — one trunk with a tooth bending out of it into each card it feeds —
  // and a gutter where each takes a line of its own is four wires at four
  // depths with the reader picking one out of the crossings, which is the
  // picture the brief called spaghetti.
  //
  // A wire moves off the shared line for one reason: a wire already turning
  // there whose span overlaps its own. Two runs on one line read as one line
  // exactly where they overlap and nowhere else, and the gap between two dashed
  // runs looks like more of the dashes.
  const turnAt = new Map<Carry, number>()

  if (!isList) {
    const flow = view.orientation === 'horizontal'
    /** The coordinate along the run: the axis a wire crosses the gutter on. */
    const lead = (p: { x: number; y: number }) => (flow ? p.x : p.y)
    /** The coordinate across it: the axis a wire moves along while it turns. */
    const side = (p: { x: number; y: number }) => (flow ? p.y : p.x)
    const gutters = new Map<number, Carry[]>()
    // The lines a turn is kept off: a band's own name rule laid out down, the
    // border between two columns laid out across. A wire crossing one reads as
    // a wire; a wire lying along one for twenty cells reads as the border
    // having come apart.
    const rules = new Set(
      flow
        ? bordersOf(view.lanes, 'horizontal').filter(at => at >= 0)
        : view.lanes.flatMap(lane => (lane.captionRow === undefined ? [] : [lane.captionRow])),
    )
    // The bus is the barrier's own line, and the line a rail comes in on. A
    // wire that turns there is drawn along both and reads as part of them.
    const buses = new Set(view.lanes.map(lane => lane.busAt))
    const kept = new Set([...rules, ...buses])

    for (const carry of wires) {
      const from = byId.get(carry.fromId)
      const to = byId.get(carry.toId)
      const lane = laneOf.get(carry.toId) ?? -1

      if (!from || !to || lane - (laneOf.get(carry.fromId) ?? 0) !== 1) {
        continue
      }

      const leaves = exitOf(from, view.orientation)

      if (side(leaves) !== side(entryOf(to, view.orientation))) {
        gutters.set(lane, [...(gutters.get(lane) ?? []), carry])
      }
    }

    for (const group of gutters.values()) {
      /** Where this wire leaves and arrives, with the departure moved to the edge. */
      const endsOf = (carry: Carry) => {
        const from = byId.get(carry.fromId) as NodeBox
        const to = byId.get(carry.toId) as NodeBox
        const end = entryOf(to, view.orientation)

        return [exitOf(from, view.orientation), end] as const
      }
      const reach = (carry: Carry) => {
        const [from, to] = endsOf(carry)

        return Math.abs(side(to) - side(from))
      }

      /**
       * Every cell a wire lays a line in, keyed `lead,side`: out of its card to
       * the column it was given, along that column, and in to the card it
       * feeds. Compared cell by cell rather than span against span, because
       * what a reader trips over is two wires in one cell, and the run out of a
       * card crosses the runs of every wire whose column it passes.
       */
      const cellsOf = (carry: Carry, at: number): Set<string> => {
        const [from, to] = endsOf(carry)
        const cells = new Set<string>()
        const run = (a: number, b: number, mark: (i: number) => void) => {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
            mark(i)
          }
        }

        run(lead(from), at, i => cells.add(`${i},${side(from)}`))
        run(side(from), side(to), i => cells.add(`${at},${i}`))
        run(at, lead(to), i => cells.add(`${i},${side(to)}`))

        return cells
      }

      const laid = new Map<Carry, Set<string>>()

      /** Whether this column leaves the wire clear of every wire already given one. */
      const free = (carry: Carry, at: number): boolean => {
        const cells = cellsOf(carry, at)

        for (const [other, theirs] of laid) {
          // Two wires off one card, or two into one, are one wire as far as a
          // reader is concerned: they share a run, and the cell they part on
          // says so with a fork. Only strangers have to keep off each other.
          if (other.fromId === carry.fromId || other.toId === carry.toId) {
            continue
          }

          for (const cell of cells) {
            if (theirs.has(cell)) {
              return false
            }
          }
        }

        return true
      }

      /**
       * The order columns are handed out in.
       *
       * A wire that leaves on the row another wire arrives on has to turn
       * before that one does, or it runs along the arrival for as many cells as
       * lie between their two columns. Given its column first it takes the
       * nearer one, and a band of wires that each shift by one card comes out
       * as a staircase instead of a weave.
       *
       * Cards one row tall are where this comes up. A wire cannot leave by an
       * edge the card does not have, so on those its departure falls back to
       * the name row — and the name rows of one band are the rows the band
       * before it arrives on.
       */
      const rest = [...group].sort((a, b) => reach(b) - reach(a))
      const order: Carry[] = []

      while (rest.length > 0) {
        const next = rest.findIndex(
          carry => !rest.some(o => o !== carry && side(endsOf(o)[0]) === side(endsOf(carry)[1])),
        )

        order.push(...rest.splice(next === -1 ? 0 : next, 1))
      }

      order.forEach((carry, i) => {
        const [from, to] = endsOf(carry)
        const leaves = lead(from)
        // The line the arrowheads land on stays clear: a run along it turns
        // every arrowhead in the gutter into part of the same long line.
        const depth = Math.max(1, lead(to) - leaves)
        // The nearest line the wire can turn on without touching another wire.
        // Sharing is preferred rather than avoided, because a gutter where
        // every wire turns on the first line it can is a comb — five wires
        // leaving five cards on one column, each bending once into the card it
        // feeds — and a gutter where every wire takes a line of its own is
        // five bends at five depths, which is the picture the brief called
        // spaghetti. A wire only moves out when the line it wants would put it
        // in a cell another wire is already in.
        // The column touching a card is not a turn column. A corner drawn in
        // it stands against the frame of whichever card is level with it, and
        // the wire then reads as leaving that card rather than as passing it —
        // which is what a reader saw at the head of every wire in the gutter,
        // where the corner sat hard against the card in the band it was
        // leaving. One clear cell either side is enough, and the gutter is
        // sized to give it; where it is not, the columns come back.
        const rooms = [...Array(depth).keys()].map(at => leaves + at)
        const air = depth >= 4 ? rooms.slice(1, -1) : rooms
        const clear = air.filter(at => !kept.has(at))
        // Where the gutter is two lines deep and both are spoken for, the bus
        // is the better of them to give up. A rule is drawn whatever else
        // happens — it is the border between two phases, or the line a band is
        // named on — where a bus is only drawn where a barrier joins the two
        // phases, and where none does the line is empty.
        const spare = air.filter(at => !rules.has(at))
        const pick = clear.length > 0 ? clear : spare.length > 0 ? spare : rooms
        const at = pick.find(room => free(carry, room)) ?? (pick[i % pick.length] as number)

        laid.set(carry, cellsOf(carry, at))
        turnAt.set(carry, at)
      })
    }
  }

  /**
   * A corner that keeps whatever line was already in the cell.
   *
   * Two wires leaving one card turn on the same column, and the one that turns
   * lands on the cell the one that goes straight is already running through.
   * Written as a plain corner, the second wire rubbed out the first's arm and
   * the fork read as a line that stopped and another that started: `\u256e` where
   * the row carries on to the right of it. Merged, the cell says what is true —
   * `\u252c`, one wire in and two out.
   *
   * `had` is what the cell held before this wire drew anything, which is not
   * what it holds now: a wire's own run is drawn through both of its corners on
   * the way past, so reading the cell here would add the arm the corner is
   * there to take away.
   */
  const corner = (had: number, arms: number, fallback: number) =>
    joint(had | arms) ?? joint(arms) ?? fallback
  /** What a cell holds now, as arms, for the corner that is about to replace it. */
  const armsAt = (x: number, y: number) => armsOf(c.at(x, y)) ?? 0

  // Two registers, and the difference is the point. A confirmed edge is drawn
  // solid and at full strength: this agent's answer is in that agent's prompt,
  // which is a record of what flowed. An inferred one stays dashed and dimmed,
  // because a shared label is a hint about the run, not a fact about it.
  for (const carry of isList ? [] : wires) {
    const from = byId.get(carry.fromId)
    const to = byId.get(carry.toId)

    if (!from || !to) {
      continue
    }

    const span = (laneOf.get(carry.toId) ?? 0) - (laneOf.get(carry.fromId) ?? 0)

    // Drawn as one rail above, not as a line of its own through the nodes.
    if (span > 1) {
      continue
    }

    // And a carry to a band further back is not drawn at all. The bands stand
    // in the order they ran, so a source named on a later one — a fix agent
    // whose answer the phase that asked for it quotes back — is a line from the
    // foot of the drawing to its head, across every band between and every name
    // on them. What came out was the head alone: the run from the source
    // stopped before it started, and a lone arrowhead sat under a phase rule
    // pointing at nothing. The loop mark on the card already says the phase was
    // entered again.
    if (span < 0) {
      continue
    }

    // Already in this gutter's bundle.
    if (span === 1 && bundled.has(laneOf.get(carry.toId) ?? -1)) {
      continue
    }

    const start = exitOf(from, view.orientation)
    const end = entryOf(to, view.orientation)
    // Every carry is drawn in the one colour a carry is drawn in, whatever it
    // joins, so a line reads as a line and a frame as a frame. Proven and
    // inferred stay apart by stroke alone — solid and full against dashed —
    // which is a difference between two edges, not between an edge and a card.
    //
    // The inferred one used to be dimmed toward the ground as well. Two tones
    // for two kinds of carry, plus a third for the barrier and a fourth for the
    // rails, put four near-greys on one screen in the layer whose whole job is
    // to be followed, and a reader asked what each of them meant. There are two
    // tones on the pane now: one for what bounds and one for what joins.
    const tone = COLORS.wire
    const lit = to.agent.state === 'running'
    const solid = carry.confirmed === true
    const stroke = tone

    const across = solid ? 0x2500 : DASH_H
    const down = solid ? 0x2502 : DASH_V

    /**
     * The point of the wire, and the cell it grows out of.
     *
     * A dashed run ends on a gap as often as on a dash, and a filled triangle
     * hung off a gap reads as a mark dropped beside the card rather than as a
     * line arriving at it — which is what the head looked like against a card's
     * own border. The cell before the point is drawn whole, so the point grows
     * out of a stem. Only that cell, and only where the run itself put a dash
     * there: a corner in it is a corner, and squaring it off would give the
     * turn an arm it does not have.
     */
    /** The cell a wire leaves by, marked, with the run starting past it. */
    const portAt = (x: number, y: number) => {
      c.put(x, y, PORT, tone)
    }

    /**
     * One cell of a run laid across the pane, hopped where a wire crosses it.
     *
     * Only a wire. An arc says *two lines share this cell and this is the one
     * in front*, and it used to be drawn over the border between two phases as
     * well — so a reader followed the arc looking for the second line and found
     * a boundary, which is not a line anything travels along. Four arcs down a
     * gutter where nothing crossed anything read as the picture's busiest
     * junction.
     *
     * The border gives way instead, which is the rule the pane already keeps
     * everywhere else it draws one: it is painted after the wires, into the
     * cells they left empty, so a run through it simply leaves a gap and the
     * eye completes a boundary across one cell without being asked.
     */
    const acrossAt = (x: number, y: number) => {
      cross(c, x, y, across, stroke)
    }

    const tipAt = (x: number, y: number, downward: boolean) => {
      const before = downward ? { x, y: y - 1 } : { x: x - 1, y }

      if (c.at(before.x, before.y) === (downward ? DASH_V : DASH_H)) {
        c.put(before.x, before.y, downward ? 0x2502 : 0x2500, stroke)
      }

      c.put(x, y, downward ? ARROW_DOWN : ARROW_RIGHT, tone)
      arrows.push({ x, y })
    }

    // A pass feeding the next pass of the same work: both nodes are in one
    // band, side by side. There is no gutter to route through and none is
    // wanted — the whole edge is the gap between two neighbours.
    if (span === 0) {
      const flow = view.orientation === 'horizontal'
      const gap = flow ? to.y - (from.y + from.h) : to.x - (from.x + from.w)
      const at = flow ? from.x + Math.floor(from.w / 2) : from.y + Math.floor(from.h / 2)

      const abreast = flow ? to.x === from.x : to.y === from.y
      // And the cells between them have to be empty for a line to run through
      // them. A lane packed with cards a row apart has another node standing in
      // the gap, and a line drawn through that node runs under its name: the
      // names are written after the wires, so the cell came back a letter with
      // a port or an arrowhead lost beneath it. The stack already says which
      // pass went first; a wire no reader can see does not say it again.
      const lane = view.lanes[laneOf.get(carry.fromId) ?? -1]
      const between = (lane?.nodes ?? []).some(node =>
        node !== from && node !== to &&
        (flow
          ? node.y < to.y && node.y + node.h > from.y + from.h && at >= node.x && at < node.x + node.w
          : node.x < to.x && node.x + node.w > from.x + from.w && at >= node.y && at < node.y + node.h),
      )

      if (abreast && !between && gap >= 1 && gap <= 3) {
        const head = flow ? to.y - 1 : to.x - 1
        const route: { x: number; y: number }[] = []

        const first = flow ? from.y + from.h : from.x + from.w

        for (let i = first; i <= head; i++) {
          route.push(flow ? { x: at, y: i } : { x: i, y: at })

          if (i === head) {
            continue
          }

          // The cell against the card is the point the run leaves by, as it is
          // for every other edge. A card in a list has no frame for a line to
          // end on, so a run starting with a stroke ran out of the middle of
          // the row above it, from a cell of the label that happened to be
          // blank. One cell of room is all there is between two cards a row
          // apart, and an edge that short is its own arrowhead.
          if (i === first) {
            c.put(flow ? at : i, flow ? i : at, PORT, tone)

            continue
          }

          if (flow) {
            line(c, at, i, down, stroke)
          } else {
            line(c, i, at, across, stroke)
          }
        }

        if (flow) {
          c.put(at, head, ARROW_DOWN, tone)
          arrows.push({ x: at, y: head })
        } else {
          c.put(head, at, ARROW_RIGHT, tone)
          arrows.push({ x: head, y: at })
        }

        if (lit) {
          paintFlowing(c, route, tick)
        }
      }

      continue
    }

    if (view.orientation === 'horizontal' && start.y === end.y) {
      const route: { x: number; y: number }[] = []
      const marked = end.x - start.x >= 2

      if (marked) {
        portAt(start.x, start.y)
      }

      for (let x = marked ? start.x + 1 : start.x; x < end.x; x++) {
        acrossAt(x, start.y)
        route.push({ x, y: start.y })
      }

      c.put(end.x, end.y, ARROW_RIGHT, tone)
      arrows.push(end)

      if (lit) {
        paintFlowing(c, [...route, end], tick)
      }
    } else if (view.orientation === 'vertical' && start.x === end.x) {
      const route: { x: number; y: number }[] = []
      const marked = end.y - start.y >= 2

      if (marked) {
        portAt(start.x, start.y)
      }

      for (let y = marked ? start.y + 1 : start.y; y < end.y; y++) {
        line(c, start.x, y, down, stroke)
        route.push({ x: start.x, y })
      }

      c.put(end.x, end.y, ARROW_DOWN, tone)
      arrows.push(end)

      if (lit) {
        paintFlowing(c, [...route, end], tick)
      }
    } else if (view.orientation === 'horizontal' && end.x - start.x >= 2) {
      // The cell the wire leaves on is a turn it may take: a corner there is a
      // wire leaving the card and going straight for its row. Clamped a cell
      // past it, the first column the gutter has to give was never used, and
      // every wire dealt that column fell onto the next one instead.
      const leave = start
      const turn = Math.max(leave.x, Math.min(end.x - 1, turnAt.get(carry) ?? leave.x))
      const downward = end.y > leave.y
      const route: { x: number; y: number }[] = []
      const hadTail = armsAt(turn, leave.y)
      const hadHead = armsAt(turn, end.y)

      // The point and the turn share a cell where the wire turns the moment it
      // leaves, and the turn is the one that has to be drawn: a corner says
      // which way the wire went, and a gutter one column wide has no room to
      // say both.
      if (turn > leave.x) {
        portAt(leave.x, leave.y)
      }

      // Across from the card to the column this one was given, then down it.
      for (let x = leave.x + 1; x < turn; x++) {
        acrossAt(x, leave.y)
        route.push({ x, y: leave.y })
      }

      // Low to high whichever way the wire travels: run from the far end back
      // toward the near one and the loop's own test is false before its first
      // step, which drew the two corners and nothing between them.
      for (let y = Math.min(leave.y, end.y); y <= Math.max(leave.y, end.y); y++) {
        cross(c, turn, y, down, stroke)
        route.push({ x: turn, y })
      }

      // Both ends of that run are corners, and drawn as plain run neither says
      // so: the first cell reads as a line passing beside the card it in fact
      // leaves, and the last as one passing over the arrowhead it turns into.
      c.put(turn, leave.y, corner(hadTail, ARM.left | (downward ? ARM.down : ARM.up), down), stroke)
      c.put(turn, end.y, corner(hadHead, ARM.right | (downward ? ARM.up : ARM.down), down), stroke)

      for (let x = turn + 1; x < end.x; x++) {
        acrossAt(x, end.y)
        route.push({ x, y: end.y })
      }

      tipAt(end.x, end.y, false)
      route.push(end)

      if (lit) {
        paintFlowing(c, route, tick)
      }
    } else if (view.orientation === 'horizontal') {
      // Two lanes with no gutter between them to turn in: the router bends it
      // where it can rather than drawing nothing.
      const route = edge(c, start.x, start.y, end.x, end.y, stroke, tone, !solid)

      arrows.push(end)

      if (lit) {
        paintFlowing(c, route, tick)
      }
    } else {
      const leave = start
      const turn = Math.max(leave.y, turnAt.get(carry) ?? leave.y)
      const rightward = end.x > leave.x
      const route: { x: number; y: number }[] = []
      const hadTail = armsAt(leave.x, turn)
      const hadHead = armsAt(end.x, turn)

      if (turn > leave.y) {
        portAt(leave.x, leave.y)
      }

      // Down from the card to the row this one was given, then across.
      for (let y = leave.y + 1; y < turn; y++) {
        cross(c, leave.x, y, down, stroke)
        route.push({ x: leave.x, y })
      }

      for (let x = Math.min(leave.x, end.x); x <= Math.max(leave.x, end.x); x++) {
        acrossAt(x, turn)
        route.push({ x, y: turn })
      }

      // Both ends of that run are corners, and drawn as plain run neither says
      // so: the first cell reads as a line passing under the card it in fact
      // leaves, and the last as one passing over the arrowhead it in fact turns
      // into — which matters most where a rail crosses the same row, since then
      // every cell on it looks like part of the same long line.
      c.put(leave.x, turn, corner(hadTail, ARM.up | (rightward ? ARM.right : ARM.left), across), stroke)
      c.put(end.x, turn, corner(hadHead, ARM.down | (rightward ? ARM.left : ARM.right), across), stroke)

      for (let y = turn + 1; y < end.y; y++) {
        cross(c, end.x, y, down, stroke)
        route.push({ x: end.x, y })
      }

      tipAt(end.x, end.y, true)
      route.push(end)

      if (lit) {
        paintFlowing(c, route, tick)
      }
    }
  }

  const bottom = bodyFoot

  const over = overOf(run)

  paintReturn(c, view, lanes, bottom)
  paintStems(c, view, bottom)
  paintInset(c, view, lanes, nowMs, bottom)
  paintSections(c, view, lanes, passes, bottom, tick, over, hotspots, bodyW)

  for (const lane of view.lanes) {
    if (lane.ghost) {
      paintPlan(c, lane.ghost, lane.phase, run.plan, bottom, over, true)
    }
  }

  for (const lane of view.lanes) {
    const claim = claimOf(lane.nodes)
    const feet = feetOf(lane.nodes, nowMs, scale, run.defaultModel, passes)

    for (const node of lane.nodes) {
      paintNode(
        c,
        node,
        nowMs,
        tick,
        view.density,
        pressOf(node) === selectedId,
        hotspots,
        scale,
        run.defaultModel,
        passes.get(node.agent.agentId),
        claim,
        feet,
      )
    }
  }

  // An edge over more than one lane has a whole band of nodes in its way, so it
  // is not drawn at all: the card it arrives at says which phase it came from,
  // in words. Drawn after everything else the body holds — the rules, the
  // cards, the wires — because the row it goes on is whichever of the two
  // beside the card is still clear, and asking that before the rules are down
  // put the name in the row a band is named on.
  if (!isList) {
    paintSources(c, view, sourcesOf(run))
  }

  const placed = view.lanes.flatMap(l => l.nodes)

  if (view.pending.length > 0) {
    if (view.ahead) {
      paintAhead(c, view, run.plan, bottom, over)
    } else {
      const foot = placed.length > 0 ? Math.max(...placed.map(n => n.y + n.h)) : view.headerRows
      const depth = Math.max(1, Math.min(view.aheadRows ?? 1, Math.max(1, bottom - foot - 1)))
      // Scrolled, the band goes where the run puts it: under the last section,
      // wherever that has moved to, so it scrolls with the drawing it belongs
      // to. Standing still it is centred in what the drawing left, not pinned
      // to either end of it — down the pane the end of the run is the foot of
      // the drawing, and a section held against the seat's own bottom edge
      // reads as part of the pane's furniture rather than as the next thing the
      // run will do, while held against the last node instead it is the same
      // blank rows simply moved underneath it. Between the two it reads as the
      // drawing's own last section, which is what it is.
      const slack = Math.max(0, bottom - foot - 1 - depth)
      const top =
        spanY > 0 ? foot + 1 : Math.min(bottom - depth, foot + 1 + Math.floor(slack / 2))

      paintAheadBand(c, view.pending, run.plan, top, depth, over)
    }
  }

  c.window()
  inWindow(hotspots, headerSpots, { x: 0, y: bodyTop, w: bodyW, h: bottom - bodyTop })

  // Reserved and drawn are two questions. The reservation is what the drawing
  // was laid out against and cannot be taken back here; the rail is drawn only
  // where it has somewhere to go, because a scrollbar with both arrows greyed
  // and a full thumb is a control that reads as broken. The timeline's foot
  // has always asked the second question; both of these now do too.
  if (railed && spanY > 0) {
    paintBodyRail(c, c.columns - 1, bodyTop, bottom - bodyTop, atY, spanY, hotspots)
  }

  if (footed && spanX > 0) {
    paintFootRail(c, c.rows - 1, c.columns, atX, spanX, bodyW, hotspots)
  }

  onCanvas(c, hotspots, c.rows)
  modal(hotspots, panel !== null && reading, menuKeeps(options))

  const detail = panel && reading
    ? openDetail(c, selected, inside, phase, nowMs, tick, panel, options, hotspots, fedBy, trips, run.defaultModel)
    : undefined

  onCanvas(c, hotspots, c.rows)

  const menu = paintRunMenu(c, run, options, hotspots)
  const settings = paintSettings(c, options, hotspots)
  const about = paintAbout(c, options, hotspots)

  shade(c, frontOf(about, settings, menu.rects, detail && panel))

  return {
    hotspots,
    orientation: view.orientation,
    detail,
    view,
    ...(menu.window ? { runList: menu.window } : {}),
    ...(front ? { front: front.phase } : {}),
    ...(spanX > 0 || spanY > 0 ? { body: { x: atX, y: atY, spanX, spanY } } : {}),
  }
}

/**
 * The width a column of plan rows wants: enough for the longest of them whole.
 *
 * It was a fixed seven tenths of the pane whatever it held, which on short
 * details put the models against a right edge the words never reached and left
 * the block sitting off-centre inside a rectangle nothing filled. Sized to what
 * it holds, the block is centred by the same arithmetic that centres every other
 * node down the pane.
 *
 * Seven tenths is still the ceiling. A detail long enough to want the whole pane
 * would set every other row's model a screen's width from its name, and the
 * column of models is the part a reader compares down.
 */
function planWidth(phases: string[], plan: Step[] | undefined, columns: number): number {
  const want = (phase: string) => {
    const step = plan?.find(s => s.title === phase)
    const detail = step?.detail ?? ''
    const named = step?.model ? modelName(step.model) : ''

    return 5 + cells(phase) + (detail ? 2 + cells(detail) : 0) + (named ? 2 + cells(named) : 0)
  }

  const widest = Math.max(0, ...phases.map(want))

  return Math.min(columns - 4, Math.max(20, Math.min(widest, Math.floor(columns * 0.7))))
}

/**
 * A phase the run never entered, drawn as the phase it is.
 *
 * It used to be an empty rectangle in a dashed stroke, and in the list layout
 * not even that — a caption with nothing under it. Three layouts had three
 * answers to one question, and none of the three looked like the phases beside
 * them, so a reader had to learn a shape for work that happened and a second
 * shape for work that did not.
 *
 * It is a node now, and one shape of node wherever it is drawn: the row the
 * strip beside the graph names it in, the row the band at the foot names it in,
 * and the row a section of its own draws it as. The same rule down the left
 * edge, the same mark column, the same name, the same model against the right
 * edge. What tells it from a node that ran is the tone, which is the one the
 * pane draws everything that has not happened in.
 *
 * It was a card where the nodes beside it were cards, on the reasoning that a
 * node should take its lane's shape. But a card carries four facts and a phase
 * that never ran has three, so the fourth side of the frame went round blank
 * cells — and the pane then had two shapes for one thing after all, a card in
 * one place and a row in the next.
 *
 * What it says is what the script declared about the phase and nothing more —
 * see `Step`. The detail line goes where an agent's figures go, because on a
 * phase that never ran the question a reader has is what it was for. No count
 * is drawn: a workflow declares what its phases do, never how many agents they
 * will open, and a row of three empty cards under `Verify` would be the pane
 * inventing a number the run never had.
 */
function paintPlan(
  c: Canvas,
  box: { x: number; y: number; w: number; h: number },
  phase: string,
  plan: Step[] | undefined,
  bottom: number,
  /** Whether the run is over, and the phase will never be entered: see `overOf`. */
  over: boolean,
  /**
   * Whether to cut the row to what it has to say. A section with one node in it
   * hands over the room it can spare rather than the room the phase needs, and
   * a name and a line about itself set across seven tenths of a wide pane left
   * the model alone against the right edge, half a pane from the detail it
   * belongs to. The lists do not ask for this: their rows share one width so
   * their names line up, and a row cut to its own content would break that
   * column for the sake of a row nobody is comparing across.
   */
  fit = false,
): void {
  const step = plan?.find(s => s.title === phase)
  const detail = step?.detail ?? ''
  const named = step?.model ? modelName(step.model) : ''
  // The stroke of a thing that is not there. Pulled toward the stopped tone
  // once the run is over, for the reason the caption is: grey alone is the
  // colour of a phase still to come and of one that will never come, and a
  // reader looking at a finished run wants those two told apart.
  const frame = over ? mix(quietOf(c.background), COLORS.stopped, 0.7) : quietOf(c.background)
  const word = aheadTone(over)
  // Into the blank cells only, so a wire passing through keeps its own.
  const ink = (x: number, y: number, code: number, color: Rgb) => {
    if (y < 0 || y >= bottom || x < 0 || x >= c.columns || c.at(x, y) !== 0x20) {
      return
    }

    c.put(x, y, code, color)
  }

  if (box.w < 5) {
    return
  }

  const want = 5 + cells(phase) + (detail ? 2 + cells(detail) : 0) + (named ? 2 + cells(named) : 0)
  const width = fit ? Math.min(box.w, Math.max(20, want)) : box.w
  const left = box.x + (fit ? Math.floor((box.w - width) / 2) : 0)

  // The rule down the left edge, the mark, the name, and what is known about it
  // after that — the shape every one-row node on this pane takes.
  const labelX = left + 3
  const shared = Math.max(1, width - 5)
  const name = truncate(phase, shared)
  const rest = Math.max(0, shared - cells(name) - 2)

  ink(left, box.y, RULE, frame)

  if (over) {
    ink(left + 1, box.y, 0x2298, word)
  }

  c.text(labelX, box.y, name, word)

  // The model against the right edge, where a row that ran writes its own, and
  // the detail in the cells between the two.
  const tail = named && rest > cells(named) + 2 ? named : ''

  if (tail) {
    c.text(left + width - cells(tail), box.y, tail, frame)
  }

  const room = rest - (tail ? cells(tail) + 2 : 0)

  if (detail && room > 4) {
    c.text(labelX + cells(name) + 2, box.y, truncate(detail, room), frame)
  }
}

/**
 * The phases the pane had no room to give a section of its own, named at the
 * end of the ones it did.
 *
 * A run whose last phases are still ahead says so where those phases would be
 * drawn: after the last section, behind the same boundary that divides the
 * phases beside it, as a column of names in the tone of the thing they are —
 * nothing yet. The rest of the header reads across them unchanged, so the
 * strip is read as the sections are, left to right.
 *
 * It used to be a dashed rule across the foot of the pane. That put what comes
 * next under the drawing rather than at the end of it, which read as a note
 * about the pane rather than as part of the run, and it cost the graph a row.
 */
/**
 * The strip's own column head: the boundary's join into the header's rule, and
 * the word over it.
 *
 * Drawn with the header rather than with the strip, because it is a column head
 * and column heads do not scroll. It used to be drawn with the rest of the
 * strip, inside the body, which meant the body's window had to start two rows
 * higher than the drawing did to keep from clipping it — and once the graph
 * could scroll down the pane, a card scrolled far enough up landed on the row
 * the phase names are on and wrote over them.
 */
function paintAheadCaption(c: Canvas, view: Layout, over: boolean): void {
  const strip = view.ahead

  if (!strip || view.pending.length === 0 || view.lanes.length === 0 || view.headerRows < 2) {
    return
  }

  const inner = Math.max(1, strip.w - 1)

  c.put(strip.x, view.headerRows - 1, TEE_LEFT, quietOf(c.background))

  // Centred over the column it captions, which is how every other phase's
  // caption sits over its cards. Flush left it had two left edges a couple of
  // cells apart, the caption's and the list's, which read as a caption that
  // missed rather than as a heading over its list.
  const caption = truncate(over ? 'Skipped' : 'Ahead', inner)
  const capAt = strip.x + 1 + Math.max(0, Math.floor((inner - cells(caption)) / 2))

  c.text(capAt, view.headerRows - 2, caption, aheadTone(over))
}

function paintAhead(c: Canvas, view: Layout, plan: Step[] | undefined, bottom: number, over: boolean): void {
  const strip = view.ahead

  if (!strip || view.pending.length === 0 || view.lanes.length === 0) {
    return
  }

  const phases = view.pending
  const tone = quietOf(c.background)
  // Everything but the boundary itself: the strip runs from the cell after it to
  // the pane's edge.
  const inner = Math.max(1, strip.w - 1)
  const foot = Math.min(
    bottom,
    Math.max(...view.lanes.map(l => Math.max(l.y + l.h, ...l.nodes.map(n => n.y + n.h)))),
  )

  for (let y = Math.max(0, view.headerRows); y < foot; y++) {
    if (c.at(strip.x, y) === 0x20) {
      c.put(strip.x, y, SEAM_V, tone)
    }
  }

  const first = view.headerRows + 1
  const space = Math.max(0, foot - first)
  const shown = phases.length <= space ? phases.length : Math.max(0, space - 1)
  // The column sits in the middle of the strip. The strip is the section those
  // phases would have had, and every other section on the pane centres what it
  // holds.
  //
  // What is centred is the drawing — the rule, the mark and the longest name —
  // not the box the rows are given: a row's box carries two cells past its name
  // for the model to sit against, and centring those as if they were ink pushed
  // the names off the middle by a cell. So the offset is capped at whatever
  // leaves the box its full width, and a strip cut to its longest name simply
  // has nothing to centre.
  const drawnW = Math.max(1, ...phases.slice(0, shown).map(phase => cells(phase) + 3))
  const boxW = Math.min(inner, drawnW + 2)
  const slack = Math.max(0, Math.min(Math.floor((inner - drawnW) / 2), inner - boxW))
  const nameAt = strip.x + 1 + slack
  const room = Math.max(1, inner - slack)

  // Centred down the strip too, the way the foot band is centred in what the
  // drawing leaves it. Pinned under the boundary the caption sits on, three
  // names sat at the top of a column twenty rows deep, which read as a section
  // that had run out rather than one holding the phases still to come. Centred,
  // the blank rows above and below are the section's own margin, and the names
  // sit level with the drawing they are beside.
  //
  // The count the tail becomes is part of the list, so it is centred with it
  // rather than pushing it a row up.
  const drawn = shown + (shown < phases.length && space > 0 ? 1 : 0)
  const top = first + Math.floor(Math.max(0, space - drawn) / 2)

  // The same one-row node the foot band draws and the list layout draws, cut to
  // the width the strip has. A bare column of names was the pane's one piece of
  // drawing that was not a node, so a phase that never ran looked like a note
  // in the margin rather than like the phase it is.
  phases.slice(0, shown).forEach((phase, i) => {
    paintPlan(c, { x: nameAt, y: top + i, w: room, h: 1 }, phase, plan, bottom, over)
  })

  if (shown < phases.length && space > 0) {
    c.text(nameAt, top + shown, truncate(`… ${phases.length - shown}`, room), COLORS.dim)
  }
}

/**
 * The same phases where there is no room for a strip beside the drawing: a band
 * of their own at its foot instead.
 *
 * Down the pane and along a timeline the run's next move is below its last, not
 * beside it, and every phase it did draw down there opens with its name set
 * into a rule across the pane. So does this one — the same device, the same
 * place, the stroke dashed rather than solid because nothing has run in it yet.
 * A caption floating over a rule of its own was a third kind of heading on a
 * pane that already had one.
 *
 * Squeezed to one row it drops the caption and sets the names into the rule
 * instead, which is the line a band's own name goes in anyway.
 */
function paintAheadBand(
  c: Canvas,
  phases: string[],
  plan: Step[] | undefined,
  top: number,
  rows: number,
  over: boolean,
): void {
  if (rows <= 1 || phases.length === 0) {
    paintAheadRow(c, phases, top, over)

    return
  }

  const tone = quietOf(c.background)
  const namesRow = top + 1

  c.fill(0, top, c.columns, 1, c.background)

  for (let x = 0; x < c.columns; x++) {
    c.put(x, top, SEAM_H, tone)
  }

  const caption = truncate(over ? 'Skipped' : 'Ahead', Math.max(1, c.columns - 4))
  const capAt = Math.max(1, Math.floor((c.columns - caption.length) / 2))

  c.put(capAt - 1, top, 0x20, tone)
  c.text(capAt, top, caption, aheadTone(over))
  c.put(capAt + caption.length, top, 0x20, tone)

  // A row each, in the shape a one-row node takes everywhere else on the pane.
  // Where there are more phases than rows the last one counts the rest, the way
  // the strip beside the graph does.
  const space = Math.max(0, top + rows - namesRow)
  const shown = phases.length <= space ? phases.length : Math.max(0, space - 1)
  const wide = planWidth(phases.slice(0, shown), plan, c.columns)
  const at = Math.max(1, Math.floor((c.columns - wide) / 2))

  for (let i = 0; i < space; i++) {
    c.fill(0, namesRow + i, c.columns, 1, c.background)
  }

  phases.slice(0, shown).forEach((phase, i) => {
    paintPlan(c, { x: at, y: namesRow + i, w: wide, h: 1 }, phase, plan, c.rows, over)
  })

  if (shown < phases.length && space > 0) {
    c.text(at + 3, namesRow + shown, truncate(`… ${phases.length - shown} more`, wide), COLORS.dim)
  }
}

/**
 * The phases still ahead as one line: the names in the order they will run,
 * with the pane's own feeds-into mark between them.
 *
 * They were spread one to a share of the width, so a phase stood where its own
 * section would have been drawn. Down the pane that is the wrong axis: the run
 * reads top to bottom there, and three names across the foot of it read as
 * three columns of a layout the drawing is not in. Joined, they read as what
 * they are — the rest of the run, in order — and the mark that joins them is
 * the one every wire on the pane already ends in.
 *
 * Too many for the width, the tail becomes a count: the first phases are the
 * ones about to happen, and a reader who wants the whole list has the run's own
 * script for it.
 */
function aheadFields(phases: string[], room: number, link: Rgb, over: boolean): Field[] {
  const arrow = String.fromCodePoint(ARROW_RIGHT)

  for (let shown = phases.length; shown > 1; shown--) {
    const fields = aheadRun(phases.slice(0, shown), arrow, link, phases.length - shown, over)

    if (widthOf(fields, 1) <= room) {
      return fields
    }
  }

  return [{ text: truncate(phases[0], Math.max(1, room)), color: aheadTone(over) }]
}

/**
 * The colour of a phase that has not run: grey while the run may still reach
 * it, the stopped tone once it cannot. The same tone the agents the run took
 * down with it are drawn in, because it is the same fact about them.
 */
function aheadTone(over: boolean): Rgb {
  return over ? COLORS.stopped : COLORS.idle
}

function aheadRun(shown: string[], arrow: string, link: Rgb, rest: number, over: boolean): Field[] {
  const fields: Field[] = []

  shown.forEach((phase, i) => {
    if (i > 0) {
      fields.push({ text: arrow, color: link })
    }

    fields.push({ text: phase, color: aheadTone(over) })
  })

  if (rest > 0) {
    fields.push({ text: arrow, color: link })
    fields.push({ text: `\u2026 ${rest}`, color: link })
  }

  return fields
}

/**
 * The same phases in the one row a short pane can spare: a dashed rule with the
 * names set into it. A phase the run has reached opens a solid rule and fills
 * it as its agents land; a phase still ahead opens nothing yet.
 */
function paintAheadRow(c: Canvas, phases: string[], row: number, over: boolean): void {
  if (row < 0 || row >= c.rows) {
    return
  }

  const tone = quietOf(c.background)

  c.fill(0, row, c.columns, 1, c.background)

  for (let x = 0; x < c.columns; x++) {
    c.put(x, row, SEAM_H, tone)
  }

  if (phases.length === 0) {
    return
  }

  // The caption is what a reader can do without, so at one row it goes and the
  // names take its place inside the rule — the same line the band's own caption
  // is set into, carrying what is coming instead of what it is called.
  const fields = aheadFields(phases, Math.max(1, c.columns - 6), tone, over)
  const width = widthOf(fields, 1)
  const at = Math.max(1, Math.floor((c.columns - width) / 2))

  // The whole span is cleared before the names go into it, its own gaps
  // included: a stroke showing through between two names joins them into one
  // word with a line in it.
  for (let x = at - 1; x <= at + width && x < c.columns; x++) {
    c.put(x, row, 0x20, tone)
  }

  drawFields(c, at, row, c.columns - at, fields, 1)
}

/**
 * The list the run's name opens, unrolled from under the name itself.
 *
 * It is drawn into the canvas rather than mounted as a chooser under the
 * drawing. A chooser of its own is a second control: one press to open the
 * area it sits in, another to open its list, and the drawing shortened by a
 * row the whole time. A menu under the name it drops from needs neither — the
 * name is the control, and what it covers it covers only while it is open.
 */
function paintRunMenu(
  c: Canvas,
  run: RunState,
  options: PaintOptions,
  hotspots: Hotspot[],
): { rects: Rect[]; window?: RunWindow } {
  const runs = options.runs ?? []

  if (options.runPicker !== 'open' || runs.length === 0) {
    return { rects: [] }
  }

  // Under the bar, not through it: the name the menu drops from sits on the
  // bar's own middle row, so a menu opening there would cut the bar's closing
  // rule in half and take the run's name with it.
  const top = barRowsOf(c.rows, c.columns)
  // What the menu can show is what stands below the bar — and it leaves the
  // last row alone, where the graph says how much of itself it had to leave
  // out. A pane with no room for one entry and its frame gets no menu.
  const room = c.rows - top - 3
  const across = c.columns - 4

  if (room < 1 || across < 6) {
    return { rects: [] }
  }

  const rows = listOf(runs, options.nowMs)
  // The list keeps every row it has and shows a window on to it. The headings
  // used to be dropped here, on the grounds that a row spent on a caption is a
  // run the reader cannot see — which was true while the rest of the list was
  // being cut off anyway. A list that scrolls loses nothing to them: three rows
  // out of forty-six, and the piles they divide are what the list is for.
  const visible = Math.min(room, rows.length)
  const at = seatOf(rows, run.runId, visible, options.runScroll)
  const window: RunWindow = { total: rows.length, visible, scroll: at }
  const scrolls = rows.length > visible
  const drawn = rows.slice(at, at + visible)

  // Every clock ends in the same column, so the times can be read down the
  // menu rather than hunted for at the end of each name. Measured over the
  // whole list and not the drawn part of it, so the columns stand still while
  // a reader scrolls rather than shifting under the pointer.
  const clockW = rows.reduce((w, r) => Math.max(w, r.clock?.length ?? 0), 0)
  const widest = rows.reduce((w, r) => Math.max(w, r.text.length + (r.clock ? clockW + 2 : 0)), 0)
  // The bar takes a column of its own and a cell of air before it, the way
  // every other scrolled thing in the pane pays for one.
  const bar = scrolls ? 2 : 0
  const inner = Math.max(4, Math.min(across, widest + 4 + bar))
  const width = inner + 2
  const height = drawn.length + 2
  // Under the name it drops from, pulled left only where it would otherwise
  // hang off the pane.
  const chip = hotspots.find(h => h.agentId === RUN_PICKER)
  const x = Math.max(0, Math.min(chip?.x ?? 0, c.columns - width))
  const tone = mix(COLORS.track, COLORS.text, 0.35)

  c.fill(x, top, width, height, c.background)

  for (let dx = 1; dx < width - 1; dx++) {
    c.put(x + dx, top, LIGHT.across, tone)
    c.put(x + dx, top + height - 1, LIGHT.across, tone)
  }

  for (let dy = 1; dy < height - 1; dy++) {
    c.put(x, top + dy, LIGHT.down, tone)
    c.put(x + width - 1, top + dy, LIGHT.down, tone)
  }

  c.put(x, top, LIGHT.tl, tone)
  c.put(x + width - 1, top, LIGHT.tr, tone)
  c.put(x, top + height - 1, LIGHT.bl, tone)
  c.put(x + width - 1, top + height - 1, LIGHT.br, tone)

  // Nothing but the name that opened it: a node's label under the menu would
  // take the press aimed at a run, and a label beside it would be drawn at full
  // strength over a drawing the menu has pushed back. The name stays because it
  // is the menu's only way back — every other dialog carries a ✕ of its own.
  const covered = hotspots.filter(h => h.agentId === RUN_PICKER)

  hotspots.length = 0

  if (scrolls) {
    paintListBar(c, x + width - 2, top + 1, height - 2, window, hotspots)
  }

  drawn.forEach((row, i) => {
    const y = top + 1 + i
    const current = row.id === run.runId
    const nameW = inner - 4 - bar - (clockW > 0 ? clockW + 2 : 0)

    // A heading, or the line that says how many runs did not fit: neither is a
    // run, so neither takes a press. Both start where the state glyphs do, so
    // the menu has one left edge rather than two.
    //
    // A heading carries its state's own mark and its own colour, and a rule
    // runs from the end of its word to the far side of the menu. The word alone
    // divided nothing: four captions in the one grey, each of them a row that
    // looked like the rows under it, so the reader had to read a list to find
    // where one pile ended. The rule is the division and the mark is the answer
    // to which pile this is, which most readers take without reading the word.
    if (row.id === undefined) {
      if (row.mark === undefined) {
        c.text(x + 4, y, truncate(row.text, inner - 4 - bar), COLORS.dim)

        return
      }

      const caption = truncate(row.text, Math.max(1, inner - 8 - bar))

      c.text(x + 4, y, row.mark, row.color ?? COLORS.dim)
      c.text(x + 6, y, caption, row.color ?? COLORS.dim)

      // Stopping where the clocks stop, so the rule ends on the column every
      // row on the menu ends on rather than running into the frame — or into
      // the bar, where the list is tall enough to carry one.
      for (let at = x + 7 + caption.length; at < x + inner - bar; at++) {
        c.put(at, y, LIGHT.across, tone)
      }

      return
    }

    c.put(x + 2, y, current ? SHOWN_MARK : 0x20, COLORS.accent)
    c.text(x + 4, y, row.mark ?? '', row.color ?? COLORS.text)
    c.text(x + 6, y, truncate(row.body ?? row.text, Math.max(1, nameW - 2)), current ? COLORS.accent : COLORS.text)

    if (row.clock) {
      c.text(x + inner - bar - row.clock.length, y, row.clock, COLORS.clock)
    }

    hotspots.push({ agentId: `run:${row.id}`, x: x + 2, y, w: inner - 2 - bar })
  })

  hotspots.push(...covered)

  return { rects: [{ x, y: top, w: width, h: height }], window }
}

/**
 * One thing a setting can be set to, as the settings dialog lists it.
 *
 * The key is what pressing it sets, not what it moves on from: `set:theme:nord`
 * rather than `theme`. A control that cycles can only be read by pressing it —
 * `Theme: gruvbox` says where you are and gives no way to ask for `nord` except
 * five more presses past it — so every choice carries its own name, and once
 * the list it belongs to is open it is one press away.
 */
type Choice = {
  /** What the choice is called. */
  label: string
  /** What pressing it sets. Empty where the entry is a reading, not a choice. */
  key: string
  /** True where the pane is already set to it. */
  live: boolean
  /** True where it cannot be taken: a step past either end of a range. */
  spent?: boolean
  /**
   * The palette the choice names, shown in its own colours ahead of the label.
   *
   * A theme is a set of colours, and a list of six names is a list a reader has
   * to try one at a time. Three cells of the theme's own running, done and
   * accent make the list answerable by looking at it.
   */
  swatch?: Rgb[]
}

/**
 * The settings whose value is picked from a list, and the lists they open.
 *
 * Every choice used to be on screen the whole time the dialog was: fifteen
 * words across seven lines, which a reader has to sort back into four settings
 * before they can find the one they came for — and the answer to "what is this
 * pane set to" was four brackets to hunt for among them. Shut, each setting is
 * one line saying what it is set to; the rest is a press away, where the
 * setting stands.
 */
export const SETTING_MENUS = ['layout', 'theme'] as const

export type SettingMenu = (typeof SETTING_MENUS)[number]

/** The press that unrolls a setting's list, or rolls up the open one. */
export function menuKey(menu: SettingMenu): string {
  return `open:${menu}`
}

/** A setting picked from a list: what it is set to, and what else it offers. */
type SelectRow = {
  kind: 'select'
  name: string
  menu: SettingMenu
  /** What the pane is set to, as the shut control says it. */
  value: string
  /** The colours that value stands for, painted beside the shut control. */
  swatch?: Rgb[]
  options: Choice[]
}

/** A setting that is a number rather than a list: the reading, and its steps. */
type StepRow = {
  kind: 'steps'
  name: string
  choices: Choice[]
  /** Where each step starts, measured from the start of the row's controls. */
  stops: number[]
}

/** One line of the settings dialog: what the setting is called, and its control. */
type SettingRow = SelectRow | StepRow

/** The width the left column takes, wide enough for the longest setting name. */
const SETTING_NAME_W = 14

/** The air between an About pair's two columns. */
const FIELD_GAP = 3

/**
 * The line length the About dialog is drawn for, and the least it will draw at.
 *
 * Prose wants a line short enough to read in one sweep, and the dialog's pairs
 * are shorter than that, so the sentences are what set the width rather than
 * the widest pair. Below the floor the sentences break every three words and
 * the dialog is worse than the foot row it opened from.
 */
const ABOUT_PROSE = 58
const ABOUT_LEAST = 24

/** Lines a sentence may take: enough for the longest of them at the floor width. */
const ABOUT_WRAP = 8

/**
 * The slot a value's own colours take, ahead of every control.
 *
 * Only a theme has colours to show, but the slot stands on every row: a dialog
 * whose values start in three different columns is a dialog that has to be read
 * one line at a time.
 */
const SWATCH_W = 4

/** The layouts the dialog offers, in the order it offers them. */
const LAYOUTS: { value: Orientation; label: string }[] = [
  { value: 'horizontal', label: 'horizontal' },
  { value: 'vertical', label: 'vertical' },
  { value: 'timeline', label: 'timeline' },
  { value: 'list', label: 'list' },
  { value: 'auto', label: 'fits' },
]

/**
 * The cells a choice takes.
 *
 * The label carries a cell of air at each side, so the live one can be marked
 * without the text touching its mark — and so a press target is the same size
 * whether or not it is the live one. A list that moved under the finger as it
 * was pressed would be a list that punishes changing your mind.
 */
function choiceWidth(ch: Choice): number {
  return (ch.swatch ? ch.swatch.length + 1 : 0) + ch.label.length + 2
}

/** Where a stepped row ends, measured from the start of its controls. */
function stepsWidth(row: StepRow): number {
  const last = row.choices.length - 1

  return last < 0 ? 0 : row.stops[last] + choiceWidth(row.choices[last])
}

/** The cells a shut list takes: the value, the mark, and the brackets round both. */
function selectWidth(valueW: number): number {
  return valueW + 4
}

/**
 * Where a row ends, measured from the start of the colour slot.
 *
 * A stepped row starts in that slot rather than after it: its first step is
 * exactly as wide as the colours are, so the reading between the steps lands in
 * the same column as every shut value.
 */
function rowWidth(row: SettingRow, valueW: number): number {
  return row.kind === 'select' ? SWATCH_W + selectWidth(valueW) : stepsWidth(row)
}

/** A setting stepped up and down, set out left to right. */
function inLine(name: string, choices: Choice[]): StepRow {
  const stops: number[] = []
  let at = 0

  for (const ch of choices) {
    stops.push(at)
    at += choiceWidth(ch) + 1
  }

  return { kind: 'steps', name, choices, stops }
}

/** One choice, and the press that takes it. */
function paintChoice(c: Canvas, x: number, y: number, ch: Choice, hotspots: Hotspot[]): void {
  let at = x

  if (ch.swatch) {
    // Ahead of the press target, not inside it. A span a Button is laid over is
    // drawn by the surface as that button's own label, and a Button's label
    // takes no colour — so three cells of a palette inside one would arrive as
    // three grey rectangles, which is the one thing a swatch cannot be.
    for (const tone of ch.swatch) {
      c.put(at, y, SWATCH, tone)
      at++
    }

    at++
  }

  // The dialog's own three tones: the value the pane is set to in the selection
  // colour, the rest at full strength because reading them is the point of the
  // dialog, and a step with nowhere left to go below even the setting names.
  const tone = ch.live ? COLORS.accent : ch.spent === true ? COLORS.idle : COLORS.text

  // Brackets rather than a colour, for the same reason: colour is what a press
  // target loses, so the live value has to stay legible as the live one once
  // the surface has drawn it in its own plain text. They take exactly the air
  // every other choice carries, so nothing moves under the finger when the
  // value changes.
  c.put(at, y, ch.live ? 0x5b : 0x20, tone)
  c.text(at + 1, y, ch.label, tone)
  c.put(at + 1 + ch.label.length, y, ch.live ? 0x5d : 0x20, tone)

  if (ch.key !== '' && ch.spent !== true) {
    hotspots.push({ agentId: ch.key, x: at, y, w: ch.label.length + 2 })
  }
}

/** A setting shut: what it is set to, and the mark that says there is a list. */
function paintSelect(
  c: Canvas,
  x: number,
  y: number,
  row: SelectRow,
  valueW: number,
  open: boolean,
  hotspots: Hotspot[],
): void {
  if (row.swatch) {
    // Outside the press target, as in the list itself, and for the same reason:
    // a Button's label takes no colour.
    row.swatch.forEach((tone, i) => {
      c.put(x + i, y, SWATCH, tone)
    })
  }

  const at = x + SWATCH_W
  const value = truncate(row.value, valueW)

  // The same brackets the stepped reading carries: on every row of the dialog
  // they mean the value the pane is set to. The mark is a glyph rather than a
  // tone because it stands inside the press target, where a tone does not
  // survive — and it turns over when the list is open, so the dialog says
  // which way the list went.
  c.put(at, y, 0x5b, COLORS.accent)
  c.text(at + 1, y, value.padEnd(valueW), COLORS.accent)
  c.put(at + 1 + valueW, y, 0x20, COLORS.accent)
  c.put(at + 2 + valueW, y, open ? ARROW_UP : ARROW_DOWN, COLORS.accent)
  c.put(at + 3 + valueW, y, 0x5d, COLORS.accent)

  hotspots.push({ agentId: menuKey(row.menu), x: at, y, w: selectWidth(valueW) })
}

/**
 * A setting's list, unrolled from the control that says what it is set to.
 *
 * Over the dialog rather than inside it: the dialog is the same four lines
 * whether a list is open or not, so the settings do not move about as one is
 * read, and a list of six can stand taller than the box that opened it. What it
 * covers it covers only while it is open.
 */
function paintSettingList(
  c: Canvas,
  row: SelectRow,
  ctrlX: number,
  ctrlY: number,
  hotspots: Hotspot[],
): Rect[] {
  const swatch = row.options.some(o => o.swatch)
  // The frame, the mark saying which one the pane is on, a cell of air, then
  // the colours and the name; air and the frame again on the other side. The
  // colours and the name stand exactly where the shut control's own colours and
  // value stand, so opening a list does not move the thing being read.
  const lead = 3 + (swatch ? 5 : 0)
  const widest = row.options.reduce((w, o) => Math.max(w, o.label.length), 0)
  // A floor under the name field, because the field is the press target: `on`
  // and `off` are two and three cells, and a two-cell target is a target to
  // miss. Whatever the pane can spare, where it cannot spare that.
  const label = Math.min(Math.max(widest, 6), c.columns - lead - 2)

  if (label < 3) {
    return []
  }

  const width = lead + label + 2
  // Every entry, wherever the pane holds them. Where it does not, the ones that
  // did not fit are counted rather than dropped in silence — `/flowpane theme` and
  // the layout words reach the same settings from the prompt.
  const room = Math.max(1, c.rows - 2)
  const shown = row.options.length <= room ? row.options.length : Math.max(1, room - 1)
  const cut = row.options.slice(0, shown)
  const over = row.options.length - cut.length
  const height = cut.length + (over > 0 ? 1 : 0) + 2
  const x = Math.max(0, Math.min(ctrlX + 1 - lead, c.columns - width))
  const under = ctrlY + 1
  const above = ctrlY - height
  // Below the control it drops from, the way a list that drops from a control
  // should — above it where there is no room below, rather than off the pane.
  const y = under + height <= c.rows ? under : above >= 0 ? above : Math.max(0, c.rows - height)
  const right = x + width - 1
  const last = y + height - 1
  const tone = mix(COLORS.track, COLORS.text, 0.35)

  // What the list covers belongs to the list while it is open: a theme under it
  // would otherwise take the press aimed at the one over it.
  const covered = hotspots.filter(h => h.y < y || h.y > last || h.x + h.w <= x || h.x > right)

  hotspots.length = 0

  c.fill(x, y, width, height, c.background)

  for (let dx = 1; dx < width - 1; dx++) {
    c.put(x + dx, y, LIGHT.across, tone)
    c.put(x + dx, last, LIGHT.across, tone)
  }

  for (let dy = 1; dy < height - 1; dy++) {
    c.put(x, y + dy, LIGHT.down, tone)
    c.put(right, y + dy, LIGHT.down, tone)
  }

  c.put(x, y, LIGHT.tl, tone)
  c.put(right, y, LIGHT.tr, tone)
  c.put(x, last, LIGHT.bl, tone)
  c.put(right, last, LIGHT.br, tone)

  cut.forEach((choice, i) => {
    const line = y + 1 + i
    const at = x + lead

    // The mark and the colours both stand outside the press target, so both
    // keep their own tone once the surface has drawn the name as a button. It
    // is the mark the run menu uses, because it says the same thing there.
    c.put(x + 1, line, choice.live ? SHOWN_MARK : 0x20, COLORS.accent)

    if (choice.swatch) {
      choice.swatch.forEach((shade, k) => {
        c.put(x + 3 + k, line, SWATCH, shade)
      })
    }

    c.text(at, line, truncate(choice.label, label).padEnd(label), choice.live ? COLORS.accent : COLORS.text)
    hotspots.push({ agentId: choice.key, x: at, y: line, w: label })
  })

  if (over > 0) {
    c.text(x + 3, last - 1, truncate(`… ${over} more`, width - 4), COLORS.dim)
  }

  hotspots.push(...covered)

  return [{ x, y, w: width, h: height }]
}

/**
 * How far the drawing is pushed back behind a dialog.
 *
 * Far enough that the dialog is unmistakably the thing being read, and not so
 * far that the graph stops being there. The point of drawing a dialog over the
 * pane rather than beside it is that the run is still running underneath; a
 * scrim that blacked it out would have thrown that away to save a frame border.
 */
const SCRIM = 0.72

/**
 * The drawing, pushed back behind what is open over it.
 *
 * A dialog painted straight onto the graph is the same ink as the graph — same
 * strokes, same palette, a frame around it the only thing saying which is in
 * front. Every cell outside it is mixed toward the ground instead, which is
 * what a shadow over a page does: nothing is hidden, and there is only one
 * thing in focus.
 *
 * Both colours a cell carries move, so a block that had a ground of its own —
 * a detail dialog behind the settings — goes back with everything else rather
 * than staying lit under the dimmed text on it. A cell with no colour set is
 * left alone: that is the terminal's own ground showing through, and this pane
 * does not know what colour it is.
 *
 * `front` is what is being read, and it is a list because one thing open can
 * stand in two boxes: a setting's list hangs outside the dialog it belongs to,
 * and one bounding box around both would leave a bright corner of graph
 * between them.
 */
/**
 * Which of the things open over the drawing is the one being read.
 *
 * The frontmost, and only it: two scrims one over the other would push the
 * graph twice as far back for no reason a reader could name, and would leave
 * the dialog underneath half lit. About sits over the settings, the settings
 * over the run menu, and all of them over a node's detail — so whichever drew
 * last is the one the drawing goes back behind, and the rest go back with it.
 */
function frontOf(about: Rect[], settings: Rect[], menu: Rect[], detail: Rect | null | undefined): Rect[] {
  if (about.length > 0) {
    return about
  }

  if (settings.length > 0) {
    return settings
  }

  if (menu.length > 0) {
    return menu
  }

  return detail ? [detail] : []
}

function shade(c: Canvas, front: Rect[]): void {
  if (front.length === 0) {
    return
  }

  const ground = c.background === DEFAULT_COLOR ? THEME.bg : c.background
  const lit = (x: number, y: number) =>
    front.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)

  for (let y = 0; y < c.rows; y++) {
    for (let x = 0; x < c.columns; x++) {
      if (lit(x, y)) {
        continue
      }

      const cell = c.cell(x, y)

      c.put(
        x,
        y,
        cell.code,
        cell.fg === DEFAULT_COLOR ? cell.fg : mix(cell.fg, ground, SCRIM),
        cell.bg === DEFAULT_COLOR ? cell.bg : mix(cell.bg, ground, SCRIM),
      )
    }
  }
}

/**
 * Everything the pane is set to, in a dialog over the drawing.
 *
 * It used to be a row of controls under the graph: four of them, on screen
 * whether or not anyone was changing anything, each one a cycle you could only
 * read by pressing it. The row cost a line of graph on every pane in every
 * session to serve the few seconds a reader spends setting the pane up, and
 * still could not show a reader the thing they were choosing — you picked a
 * palette by pressing past five others and watching the pane change colour.
 *
 * Opened from one button instead, and drawn as a dialog because that is what it
 * is: a thing you come to, change, and leave. Four lines, one to a setting,
 * each saying what the pane is set to; the choices are behind the control that
 * carries the answer, which is where a reader who wants them will press.
 */
function paintSettings(c: Canvas, options: PaintOptions, hotspots: Hotspot[]): Rect[] {
  if (options.settings !== true) {
    return []
  }

  const top = barRowsOf(c.rows, c.columns)
  // The same inset the detail dialog takes: a cell of drawing showing at each
  // side says the graph is still there under the answer.
  const most = c.columns - 2
  const detail = Math.max(MIN_DETAIL, Math.min(MAX_DETAIL, options.detailRows ?? MIN_DETAIL))
  const here = options.orientation ?? 'auto'
  const layout = LAYOUTS.find(l => l.value === here) ?? LAYOUTS[LAYOUTS.length - 1]
  const palette = paletteOf(THEME)

  const rows: SettingRow[] = [
    {
      kind: 'select',
      name: 'Layout',
      menu: 'layout',
      value: layout.label,
      options: LAYOUTS.map(l => ({
        label: l.label,
        key: `set:orientation:${l.value}`,
        live: here === l.value,
      })),
    },
    {
      kind: 'select',
      name: 'Theme',
      menu: 'theme',
      value: THEME.name,
      swatch: [palette.running, palette.done, palette.accent],
      options: THEMES.map(t => {
        const shades = paletteOf(t)

        return {
          label: t.name,
          key: `set:theme:${t.name}`,
          live: t.name === THEME.name,
          swatch: [shades.running, shades.done, shades.accent],
        }
      }),
    },
    // A range has no list to pick from, so it keeps its two steps and the
    // reading between them — and the reading wears the same brackets the shut
    // lists wear, because it is the same fact in the same column.
    inLine('Detail height', [
      { label: '−', key: 'detail-shorter', live: false, spent: detail <= MIN_DETAIL },
      { label: `${detail} rows`, key: '', live: true },
      { label: '+', key: 'detail-taller', live: false, spent: detail >= MAX_DETAIL },
    ]),
  ]

  // Every list's longest name sizes every shut control, so the values stand in
  // one column rather than three: what the pane is set to is always in the same
  // place, whichever setting is being read.
  const widest = rows.reduce(
    (w, r) => (r.kind === 'select' ? Math.max(w, ...r.options.map(o => o.label.length)) : w),
    0,
  )
  // What a row's controls may take: the pane, less the frame, the air inside it
  // and the column the setting names stand in.
  const room = most - 4 - SETTING_NAME_W
  const valueW = Math.min(widest, room - SWATCH_W - 4)

  if (valueW < 4) {
    return []
  }

  const tight = rows.length + 2
  // Below the bar, which says which run this is and what it has spent — the two
  // facts worth holding whatever is open over them. On a pane too short to hold
  // the dialog under the bar the dialog wins, because a button that opens
  // nothing is worse than a bar covered for as long as it takes to read.
  const below = c.rows - top - 1
  const cap = tight <= below ? below : c.rows

  if (tight > cap) {
    return []
  }

  // A blank line inside each end wherever the pane can spare them: four
  // settings packed against a frame read as one list of four things rather
  // than four settings. Where it cannot, the air goes and the settings stay.
  const airy = tight + 2 <= cap
  const height = airy ? tight + 2 : tight
  const from = tight <= below ? top : 0
  const want = Math.min(room, rows.reduce((w, r) => Math.max(w, rowWidth(r, valueW)), 0)) + SETTING_NAME_W
  const width = Math.max(24, Math.min(most, want + 4))
  const x = Math.max(0, Math.floor((c.columns - width) / 2))
  const y = from + Math.max(0, Math.floor((c.rows - from - height) / 2))
  const right = x + width - 1
  const last = y + height - 1
  const edge = mix(COLORS.dim, COLORS.text, 0.35)

  // Nothing behind the dialog takes a press while it is open. It is the same
  // rule the scrim draws: what is pushed back is not what is being worked on,
  // and a node label answering a press aimed at a setting — or a press aimed
  // at a node landing on a palette — is the dialog and the graph both being
  // live at once.
  hotspots.length = 0

  c.fill(x, y, width, height, c.background)

  for (let dx = 1; dx < width - 1; dx++) {
    c.put(x + dx, y, LIGHT.across, edge)
    c.put(x + dx, last, LIGHT.across, edge)
  }

  for (let dy = 1; dy < height - 1; dy++) {
    c.put(x, y + dy, LIGHT.down, edge)
    c.put(right, y + dy, LIGHT.down, edge)
  }

  c.put(x, y, LIGHT.tl, edge)
  c.put(right, y, LIGHT.tr, edge)
  c.put(x, last, LIGHT.bl, edge)
  c.put(right, last, LIGHT.br, edge)

  // Titled and shut the way the detail dialog is, because it is the same kind
  // of thing: a name set into the top edge, and the close mark at the corner
  // over three cells, since a one-cell target is one cell to miss.
  const closeX = right - 4

  paintDialogTitle(
    c,
    x,
    y,
    right,
    [{ text: truncate(`${TOOL_MARK} Settings`, Math.max(1, closeX - x - 4)), color: COLORS.text }],
    edge,
  )

  c.put(closeX, y, 0x20, edge)
  c.put(closeX + 1, y, CLOSE_MARK, mix(COLORS.dim, COLORS.text, 0.4))
  c.put(closeX + 2, y, 0x20, edge)
  hotspots.push({ agentId: SETTINGS_CLOSE, x: closeX, y, w: 3 })

  const at = x + 2 + SETTING_NAME_W
  const open = options.menu

  rows.forEach((row, i) => {
    const line = y + 1 + (airy ? 1 : 0) + i

    c.text(x + 2, line, row.name, COLORS.dim)

    if (row.kind === 'select') {
      paintSelect(c, at, line, row, valueW, open === row.menu, hotspots)

      return
    }

    row.choices.forEach((ch, j) => {
      const cx = at + row.stops[j]

      if (cx + choiceWidth(ch) > right) {
        return
      }

      paintChoice(c, cx, line, ch, hotspots)
    })
  })

  const unrolled = rows.find(r => r.kind === 'select' && r.menu === open)
  const box: Rect = { x, y, w: width, h: height }

  if (unrolled && unrolled.kind === 'select') {
    const spot = hotspots.find(h => h.agentId === menuKey(unrolled.menu))

    if (spot) {
      return [box, ...paintSettingList(c, unrolled, spot.x, spot.y, hotspots)]
    }
  }

  return [box]
}

/**
 * What the pane is, over the drawing.
 *
 * A reader who has never seen this before is looking at a live diagram with no
 * key: a graph drawn in glyphs, a bar of counters, and a row of words under it.
 * Every one of those is legible once somebody has said what the thing is, and
 * unreadable until then. The foot row carries the name and the name opens this,
 * which is where a person looks for it.
 *
 * It says four things in the order they are asked: what the pane draws, what
 * can be pressed, what the commands are — for the seat that draws no buttons at
 * all — and where the drawing is read from, since an empty graph is either a
 * quiet session or a path this plugin cannot see, and nothing on screen tells
 * the two apart.
 */
function paintAbout(c: Canvas, options: PaintOptions, hotspots: Hotspot[]): Rect[] {
  if (options.about !== true) {
    return []
  }

  const top = barRowsOf(c.rows, c.columns)
  // The inset the other dialogs take: a cell of drawing at each side says the
  // graph is still there under the answer.
  const most = c.columns - 2
  const rows = aboutRows()
  const pad = rows.reduce((w, r) => (r.kind === 'field' ? Math.max(w, r.left.length) : w), 0)
  const want = rows.reduce(
    (w, r) => (r.kind === 'field' ? Math.max(w, pad + FIELD_GAP + r.right.length) : w),
    ABOUT_PROSE,
  )
  if (most < ABOUT_LEAST) {
    return []
  }

  const width = Math.min(most, Math.max(ABOUT_LEAST, want + 4))
  const body = width - 4

  // A sentence is wrapped to the width the dialog turned out to be; a pair is
  // one line whatever happens, because a right-hand column broken over two
  // lines stops being a column.
  const lines: AboutRow[] = []

  for (const row of rows) {
    if (row.kind !== 'text') {
      lines.push(row)

      continue
    }

    // Enough lines that the sentence still ends in a full stop at the narrowest
    // pane the dialog draws on: a line cap that cuts prose mid-clause reads as
    // a bug, and the height below drops whole lines rather than words.
    wrap(row.text, body, ABOUT_WRAP).forEach(text => lines.push({ kind: 'text', text }))
  }

  const below = c.rows - top - 1
  const cap = lines.length + 2 <= below ? below : c.rows
  // Short of the room for all of it, the end goes first: what the pane is and
  // what presses it are what the dialog was opened for, and the path it reads
  // from is the line a reader comes back for later.
  let shown = Math.min(lines.length, cap - 2)

  while (shown > 0 && lines[shown - 1].kind === 'gap') {
    shown--
  }

  if (shown < 1) {
    return []
  }

  const airy = shown + 4 <= cap
  const height = shown + 2 + (airy ? 2 : 0)
  const from = height <= below ? top : 0
  const x = Math.max(0, Math.floor((c.columns - width) / 2))
  const y = from + Math.max(0, Math.floor((c.rows - from - height) / 2))
  const right = x + width - 1
  const last = y + height - 1
  const rule = mix(COLORS.dim, COLORS.text, 0.35)

  // Modal, as the settings are: a press aimed at a line of this landing on a
  // node is the dialog and the graph both being live at once.
  hotspots.length = 0

  c.fill(x, y, width, height, c.background)

  for (let dx = 1; dx < width - 1; dx++) {
    c.put(x + dx, y, LIGHT.across, rule)
    c.put(x + dx, last, LIGHT.across, rule)
  }

  for (let dy = 1; dy < height - 1; dy++) {
    c.put(x, y + dy, LIGHT.down, rule)
    c.put(right, y + dy, LIGHT.down, rule)
  }

  c.put(x, y, LIGHT.tl, rule)
  c.put(right, y, LIGHT.tr, rule)
  c.put(x, last, LIGHT.bl, rule)
  c.put(right, last, LIGHT.br, rule)

  // Titled with the name and the version, which is the answer to half of what
  // the dialog was opened to ask.
  const closeX = right - 4

  paintDialogTitle(
    c,
    x,
    y,
    right,
    [{ text: truncate(`${NAME} ${shippedVersion()}`, Math.max(1, closeX - x - 4)), color: COLORS.text }],
    rule,
  )

  c.put(closeX, y, 0x20, rule)
  c.put(closeX + 1, y, CLOSE_MARK, mix(COLORS.dim, COLORS.text, 0.4))
  c.put(closeX + 2, y, 0x20, rule)
  hotspots.push({ agentId: ABOUT_CLOSE, x: closeX, y, w: 3 })

  let lead = true

  lines.slice(0, shown).forEach((row, i) => {
    const line = y + 1 + (airy ? 1 : 0) + i

    if (row.kind === 'gap') {
      return
    }

    if (row.kind === 'text') {
      // The opening sentence is what the dialog is for, and the note at the end
      // is a footnote to it. Full strength then quiet says which is which
      // without a heading over either.
      c.text(x + 2, line, truncate(row.text, body), lead ? COLORS.text : COLORS.dim)

      return
    }

    lead = false
    c.text(x + 2, line, truncate(row.left, pad), COLORS.text)
    c.text(x + 2 + pad + FIELD_GAP, line, truncate(row.right, Math.max(0, body - pad - FIELD_GAP)), COLORS.dim)
  })

  return [{ x, y, w: width, h: height }]
}

/**
 * The pane with no run to draw: what the session has run, and one line saying
 * what to do about it.
 *
 * The pane used to clear to nothing here and put a sentence under the drawing,
 * with the session's runs in a chooser below that — so the thing the pane is
 * for sat in a native list under an empty rectangle the height of the seat,
 * and the empty rectangle was the biggest thing on screen. The runs are drawn
 * instead, in the pane's own language: the same bar, the same state glyphs in
 * the same colours, the same grouping and clock the menu uses. Idle is not a
 * different product.
 *
 * @returns the cells each run's line occupies, so the rows become Buttons, and
 *   how much of the list the pane could stand, for the caller to clamp against
 */
export function paintIdle(
  c: Canvas,
  runs: RunEntry[],
  nowMs: number,
  options?: PaintOptions,
): { hotspots: Hotspot[]; runList?: RunWindow } {
  const drawn = idleRuns(c, runs, nowMs, options)
  const hotspots = drawn.hotspots

  // The foot row is under the pane whether or not a run is drawing, so both of
  // its buttons have to open onto something here too. A settings button that
  // does nothing until a workflow starts is a button that looks broken, and the
  // idle pane is exactly where somebody asks what this is.
  if (options) {
    const settings = paintSettings(c, options, hotspots)

    shade(c, frontOf(paintAbout(c, options, hotspots), settings, [], null))
  }

  return drawn
}

/** The idle pane itself: the bar, the session's runs, and the line under them. */
function idleRuns(
  c: Canvas,
  runs: RunEntry[],
  nowMs: number,
  options?: PaintOptions,
): { hotspots: Hotspot[]; runList?: RunWindow } {
  c.clear()

  const hotspots: Hotspot[] = []
  const quiet = quietOf(c.background)
  // The pane with nothing to draw is the one a reader is most likely to meet
  // first, so it carries the title on the same terms the run view does.
  const titled = titledPane(c.rows, c.columns)
  const lid = titled ? 1 : 0
  const barRows = Math.min(3, c.rows) + lid

  if (titled) {
    paintTitle(c, -1, c.columns)
  }

  if (barRows - lid >= 3) {
    for (let x = 0; x < c.columns; x++) {
      c.put(x, lid, RULE_LEFT, quiet)
    }
  }

  const line = barRows - lid >= 3 ? lid + 1 : lid

  c.put(0, line, BULLET, COLORS.dim)
  drawFields(
    c,
    2,
    line,
    c.columns - 2,
    [
      { text: NAME, color: COLORS.text },
      { text: '\u2502', color: quiet },
      { text: 'nothing running', color: COLORS.dim },
    ],
    1,
  )

  if (runs.length > 0) {
    const tally = `${runs.length} run${runs.length === 1 ? '' : 's'} this session`

    if (tally.length + 24 < c.columns) {
      c.text(c.columns - tally.length, line, tally, COLORS.dim)
    }
  }

  if (barRows >= 2) {
    for (let x = 0; x < c.columns; x++) {
      c.put(x, barRows - 1, RULE_LEFT, quiet)
    }
  }

  const top = barRows + 1
  const room = c.rows - top

  if (room < 1) {
    return { hotspots }
  }

  if (runs.length === 0) {
    // Nothing to list and nothing to press: the room goes to saying what the
    // pane will do once there is.
    c.text(2, top, 'No workflow has run in this session yet.', COLORS.text)

    if (room > 2) {
      c.text(2, top + 2, 'Start one and its graph draws itself here as it goes.', COLORS.dim)
    }

    return { hotspots }
  }

  // The invitation takes the last row and a blank above it, and the list takes
  // what is left. On a pane too short for both, the list wins: it is the thing
  // that can be acted on.
  const hint = 'Press a run to draw it.'
  const hasHint = room >= 4
  const listRoom = hasHint ? room - 2 : room
  const rows = listOf(runs, nowMs)
  // The same window the menu shows, for the same reason: this is that list in
  // another place, and a list that says how many runs it left out is a list
  // with no way to reach them.
  const visible = Math.min(listRoom, rows.length)
  const at = seatOf(rows, '', visible, options?.runScroll)
  const window: RunWindow = { total: rows.length, visible, scroll: at }
  const scrolls = rows.length > visible
  const drawn = rows.slice(at, at + visible)
  const bar = scrolls ? 2 : 0

  const clockW = rows.reduce((w, r) => Math.max(w, r.clock?.length ?? 0), 0)
  const widest = rows.reduce((w, r) => Math.max(w, r.text.length + (r.clock ? clockW + 2 : 0)), 0)
  // The list is a block, not a table stretched over an empty pane: the clock
  // ends where the widest line does rather than at the pane's far edge.
  const width = Math.min(c.columns - 4, Math.max(widest + bar, hint.length))

  if (scrolls) {
    paintListBar(c, 2 + width - 1, top, visible, window, hotspots)
  }

  drawn.forEach((row, i) => {
    const y = top + i

    // Headed the way the menu heads its groups, because it is the same list in
    // another place: the state's own mark, then the word, then a rule out to
    // the column the clocks end on.
    if (row.id === undefined) {
      if (row.mark === undefined) {
        c.text(2, y, truncate(row.text, width), COLORS.dim)

        return
      }

      const caption = truncate(row.text, Math.max(1, width - 4 - bar))

      c.text(2, y, row.mark, row.color ?? COLORS.dim)
      c.text(4, y, caption, row.color ?? COLORS.dim)

      for (let end = 5 + caption.length; end < 2 + width - bar; end++) {
        c.put(end, y, LIGHT.across, quiet)
      }

      return
    }

    c.text(2, y, row.mark ?? '', row.color ?? COLORS.text)
    c.text(4, y, truncate(row.body ?? row.text, Math.max(1, width - 2 - bar - (clockW > 0 ? clockW + 2 : 0))), COLORS.text)

    if (row.clock) {
      c.text(2 + width - bar - row.clock.length, y, row.clock, COLORS.clock)
    }

    hotspots.push({ agentId: `run:${row.id}`, x: 2, y, w: width - bar })
  })

  // Under the list rather than at the pane's foot: the runs and what to do with
  // them are one block, and a line stranded ten rows below what it refers to is
  // read as being about the pane instead.
  if (hasHint) {
    c.text(2, top + drawn.length + 1, hint, COLORS.dim)
  }

  return { hotspots, runList: window }
}

/** The glyph on the run the pane is drawing, in the menu's left gutter. */
const SHOWN_MARK = 0x25ae

type MenuRow = {
  /** The whole line the row's width is measured from, mark included. */
  text: string
  /** Absent on a heading, which names a state rather than a run. */
  id?: string
  /** The state's own glyph, drawn in the state's colour. */
  mark?: string
  /** The name and the tally, which is what a long menu truncates. */
  body?: string
  color?: Rgb
  /** When the run started, right-aligned in a column of its own. */
  clock?: string
}

/**
 * The runs in the order the menu shows them: by state, and inside a state the
 * most recent first.
 *
 * A session leaves a dozen runs behind, and they are not alike. One may still
 * be going, which is the one a reader opened the menu to find; the rest have
 * landed, been stopped, or failed, and a flat list in the order they happen to
 * have been read puts the live one anywhere. Grouping says what each run is
 * before the reader has to read its glyph, and the clock says which of two
 * runs of the same name is the one they remember.
 */
function listOf(runs: RunEntry[], nowMs: number): MenuRow[] {
  const rows: MenuRow[] = []
  const groups = RUN_GROUPS.map(group => ({
    group,
    mine: runs.filter(r => r.status === group.status).sort((a, b) => b.startedMs - a.startedMs),
  })).filter(g => g.mine.length > 0)

  // A heading over the only state on the list divides nothing, and the row it
  // costs is a run the reader could have seen instead.
  const headed = groups.length > 1

  // The names and the tallies each take a column of their own, so a list of
  // runs of the same workflow can be read down rather than along: the names
  // repeat, and how far each got is the only thing that differs.
  const nameW = runs.reduce((w, r) => Math.max(w, r.name.length), 0)
  const tallyW = runs.reduce((w, r) => Math.max(w, r.tally.length), 0)

  for (const { group, mine } of groups) {
    if (headed) {
      rows.push({ text: group.caption, mark: group.mark, color: group.color() })
    }

    for (const entry of mine) {
      const body = `${entry.name.padEnd(nameW)}  ${entry.tally.padStart(tallyW)}`
      const row: MenuRow = {
        text: `${entry.mark} ${body}`,
        body,
        id: entry.id,
        mark: entry.mark,
        color: group.color(),
        clock: startedAt(entry.startedMs, nowMs),
      }

      rows.push(row)
    }
  }

  return rows
}

/**
 * Where a list too tall for its room starts, given what the pane asked for.
 *
 * Asked for nothing, it seats itself on the run the pane is drawing rather than
 * at the top: the list is opened to move off that run, and a reader who cannot
 * see where they are standing has to scroll to find out. Asked for a row, it
 * gives that row clamped to what the list actually has — which is what moves a
 * list back into view when it shrinks under a reader who had scrolled to its
 * end.
 */
function seatOf(rows: MenuRow[], shownId: string, room: number, asked?: number): number {
  const most = Math.max(0, rows.length - room)

  if (asked !== undefined) {
    return Math.max(0, Math.min(asked, most))
  }

  const at = rows.findIndex(row => row.id === shownId)

  // Already on screen from the top, or not on the list at all: the top is where
  // a reader expects a list to open, and what is still running is up there.
  if (at < 0 || at < room) {
    return 0
  }

  return Math.min(most, at - Math.floor((room - 1) / 2))
}

/**
 * The bar down a run list too tall for its room: two arrows and a thumb.
 *
 * The same furniture the detail dialog and the body already carry, in the same
 * order, because it is the same question — how much of this is on screen, and
 * whereabouts in it. It replaced a line reading `\u2026 38 more \u2014 /flowpane runs`,
 * which named a command that prints the same list somewhere else: a count of
 * what the pane dropped, in place of a way to reach it.
 */
function paintListBar(
  c: Canvas,
  x: number,
  y: number,
  rows: number,
  window: RunWindow,
  hotspots: Hotspot[],
): void {
  const key = (at: number, glyph: number, live: boolean, id: string) => {
    c.put(x, at, glyph, live ? COLORS.accent : COLORS.idle)

    if (live) {
      hotspots.push({ agentId: id, x, y: at, w: 1 })
    }
  }

  const up = window.scroll > 0
  const down = window.scroll + window.visible < window.total

  // A bar one cell tall cannot carry two arrows with a track between them, and
  // drawn as a pair the second landed on the first: the cell said `▾` and
  // nothing else, and at the foot of the list it said nothing at all while both
  // hotspots claimed it. One cell carries the one arrow that has somewhere to
  // go — down while there is more list below it, up at the end — so a list the
  // pane can stand a single row of is still a list a reader can walk.
  if (rows < 2) {
    if (up || down) {
      key(y, down ? ARROW_DOWN : ARROW_UP, true, down ? 'runs-down' : 'runs-up')
    }

    return
  }

  key(y, ARROW_UP, up, 'runs-up')
  key(y + rows - 1, ARROW_DOWN, down, 'runs-down')

  const track = rows - 2

  if (track < 1) {
    return
  }

  const size = Math.max(1, Math.round((window.visible / window.total) * track))
  const at = Math.round((window.scroll / Math.max(1, window.total - window.visible)) * (track - size))

  for (let row = 0; row < track; row++) {
    const filled = row >= at && row < at + size

    c.put(x, y + 1 + row, filled ? 0x2588 : 0x2502, filled ? COLORS.dim : COLORS.track)
  }
}

/**
 * The four states a run can be in, in the order the menu stacks them: what is
 * still going first, then what finished, then what went wrong, then what was
 * stopped. Each takes the tone the whole pane gives that state, so a heading
 * says which pile it opens before its word is read. The colour is read at draw
 * time because the palette is.
 */
const RUN_GROUPS: { status: RunStatus; caption: string; mark: string; color: () => Rgb }[] = [
  { status: 'running', caption: 'Running', mark: '\u25b8', color: () => COLORS.running },
  { status: 'completed', caption: 'Done', mark: '\u2714', color: () => COLORS.done },
  { status: 'failed', caption: 'Failed', mark: '\u2716', color: () => COLORS.failed },
  { status: 'stopped', caption: 'Stopped', mark: '\u2298', color: () => COLORS.stopped },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * When a run started, as short as it can be said without being ambiguous.
 *
 * To the second, because a session often starts the same workflow twice in a
 * minute and the two rows are otherwise identical: the same name, the same
 * state, the same clock. One from another day carries the day as well, or two
 * runs an hour apart on different dates read as the same moment.
 */
function startedAt(startedMs: number, nowMs: number): string {
  if (!Number.isFinite(startedMs) || startedMs <= 0) {
    return ''
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const at = new Date(startedMs)
  const now = new Date(nowMs)
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  const sameDay =
    at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate()

  return sameDay ? clock : `${MONTHS[at.getMonth()]} ${at.getDate()} ${clock}`
}

/**
 * The widths the timeline's three figure columns need, and which of them the
 * row has room for.
 *
 * Every row spends the same cells on each column, so the figures line up and a
 * run's costs can be read down the page. What it spent and what it ran on
 * outrank the clock, which the bar beside them already draws to scale.
 */
function factsColumns(
  run: RunState,
  nowMs: number,
  room: number,
): {
  state: number
  time: number
  spend: number
  model: number
  width: number
  form: (n?: number) => string
} {
  let state = 0
  let time = 0
  let model = 0

  for (const agent of run.agents) {
    const tag = modelName(agent.model ?? run.defaultModel)

    state = Math.max(state, stateWord(agent.state).length)
    time = Math.max(time, elapsed((agent.endedMs ?? nowMs) - agent.startedMs).length)
    model = Math.max(model, tag.length)
  }

  const columnFor = (form: (n?: number) => string) =>
    Math.max(
      0,
      ...run.agents.map(agent => form(tokensOf(agent)).length),
    )

  let form = tokensShort
  let spend = columnFor(form)

  const widthOf = (st: number, t: number, m: number) =>
    [st, t, spend, m].filter(n => n > 0).reduce((sum, n, i) => sum + n + (i > 0 ? 2 : 0), 0)

  // The clock goes first — the bar beside it already draws the same fact — then
  // the model, since the run line's legend names every model the run used. What
  // happened to the agent goes last of all: it is the one fact on the row that
  // nothing else states, and the one a reader came to the timeline to find.
  if (widthOf(state, time, model) > room) {
    time = 0
  }

  if (widthOf(state, time, model) > room) {
    model = 0
  }

  if (widthOf(state, time, model) > room) {
    state = 0
  }

  // What the row has left over goes to the count, widest spelling first: the
  // unit written out, then the mark held off the figure, then the pair closed
  // up. The other three columns are already settled, so this buys legibility
  // with cells nothing else asked for.
  for (const wider of [tokensNamed, tokensWide]) {
    const want = columnFor(wider)
    const was = spend

    spend = want

    if (widthOf(state, time, model) <= room) {
      form = wider
      break
    }

    spend = was
  }

  return { state, time, spend, model, width: Math.min(room, widthOf(state, time, model)), form }
}

/** One row's figures, each right-aligned in its own column. */
function drawColumns(
  c: Canvas,
  x: number,
  y: number,
  columns: { state: number; time: number; spend: number; model: number; form: (n?: number) => string },
  agent: AgentRow,
  took: number,
  fallbackModel?: string,
): void {
  const spent = tokensOf(agent)
  // The figures are right-aligned so their digits line up; the model is a name,
  // not a figure, so it lines up from the left like the labels do. So is what
  // happened to the agent, which is a word and reads as one down the column.
  const cells: [number, string, Rgb, 'right' | 'left'][] = [
    [columns.state, stateWord(agent.state), colorOf(agent.state), 'left'],
    [columns.time, elapsed(took), COLORS.clock, 'right'],
    [columns.spend, columns.form(spent), COLORS.spend, 'right'],
    [columns.model, modelName(agent.model ?? fallbackModel), COLORS.model, 'left'],
  ]

  let at = x

  for (const [width, text, color, align] of cells) {
    if (width <= 0) {
      continue
    }

    const pad = align === 'right' ? width - Math.min(width, text.length) : 0

    c.text(at + pad, y, truncate(text, width), color)
    at += width + 2
  }
}

/**
 * The run against the clock: one row per agent, its bar from when it started
 * to when it landed, the rows grouped by phase in the graph's order.
 *
 * The graph says what fed what; this says what waited on what. A phase whose
 * bars start where the last of the phase before it ends is a barrier seen from
 * the side, and the longest chain of bars is the critical path — which the
 * node meters only hint at, since they compare each agent to the slowest, not
 * to the clock.
 */
/**
 * The time axis under the bar: a rule across the span the bars are drawn on,
 * with a tick and its elapsed time every `step` milliseconds.
 *
 * The timeline used to draw none. Every bar is scaled to the one span the
 * header already states, so a ruled row was said to repeat that fact a dozen
 * times and cost the rows the bars wanted — but a span for the whole run says
 * nothing about where in the run one bar sits, which is the question a trace is
 * opened to answer.
 */
function paintRuler(
  c: Canvas,
  y: number,
  axisX: number,
  axisW: number,
  startMs: number,
  span: number,
  step: number,
  cellOf: (ms: number) => number,
  tone: Rgb,
): void {
  for (let x = axisX; x < axisX + axisW; x++) {
    c.put(x, y, RULE_LEFT, tone)
  }

  for (let ms = 0; ms <= span; ms += step) {
    const x = cellOf(startMs + ms)

    if (x < axisX || x >= axisX + axisW) {
      continue
    }

    c.put(x, y, TEE_LEFT, tone)

    // `0ms` at the origin reads as a measurement of something; `0s` reads as
    // the start of the scale, which is what it is.
    const said = ms === 0 ? '0s' : elapsed(ms)

    if (x + 1 + cells(said) < axisX + axisW) {
      c.text(x + 1, y, said, COLORS.dim)
    }
  }
}

/**
 * The ruler's ticks carried down the rows, in the cells no bar claimed.
 *
 * Without them a bar is read against the scale by looking straight up at it,
 * and across thirty rows of a trace the row is lost by the time the eye is
 * back. It is structure rather than a line anything travels along, so it stops
 * wherever a bar or a word already stands and picks up again underneath.
 */
function paintGrid(
  c: Canvas,
  from: number,
  to: number,
  axisX: number,
  axisW: number,
  startMs: number,
  span: number,
  step: number,
  cellOf: (ms: number) => number,
  tone: Rgb,
): void {
  for (let ms = 0; ms <= span; ms += step) {
    const x = cellOf(startMs + ms)

    if (x < axisX || x >= axisX + axisW) {
      continue
    }

    for (let y = from; y < to; y++) {
      const cell = c.at(x, y)

      if (cell === 0 || cell === 0x20) {
        c.put(x, y, DASH_V, tone)
      }
    }
  }
}

function paintTimeline(
  c: Canvas,
  run: RunState,
  nowMs: number,
  tick: number,
  selectedId: string | undefined,
  reservedRows: number,
  columns = c.columns,
  picker?: 'shut' | 'open',
  opened?: Set<string>,
  scrollY = 0,
  scrollX = 0,
  follow = true,
): { hotspots: Hotspot[]; body?: BodyScroll; front?: string } {
  const hotspots: Hotspot[] = []
  const lanes = orderedLanes(run, opened)
  const passes = passesOf(run)
  const barRows = barRowsOf(c.rows, c.columns)

  paintBar(c, run, nowMs, tick, barRows, columns, hotspots, picker)

  if (run.agents.length === 0) {
    c.text(0, barRows, 'Waiting for the first agent to start.', COLORS.dim)

    return { hotspots }
  }

  /**
   * The rows a phase stands on, which for a shut nested run is not its agents.
   *
   * Twenty-three agents of another workflow listed under this one's phase is a
   * timeline of that workflow with this one's name at the top — and every trip
   * through it interleaved, because the run was entered three times and the
   * calling run worked in between. A shut band draws one bar a trip instead:
   * the span each trip actually took, in the state it came back in, with the
   * calling run's own work visible in the gaps. Press the ▸ for the rest.
   */
  const rowsOf = (lane: FoldedLane) => (lane.shut === true && lane.spans ? lane.spans : lane.agents)
  const running = run.status === 'running'
  // A phase nothing has entered has no bars to draw, so its band is a rule with
  // an empty row under it — which reads as a band that failed to draw rather
  // than as work still to come. They are gathered into a section at the foot
  // instead, the way the other layouts name them, and the rows it takes are
  // kept back before a bar is drawn: taken afterwards they would have been rows
  // an agent was already on.
  const pending = lanes.filter(lane => lane.agents.length === 0).map(lane => lane.phase)
  /**
   * Every row the bands want: a rule, a bar an agent, and a blank between.
   *
   * It does not depend on the width, which is what lets the rail be settled
   * before a cell is drawn. The graph layouts need two passes for this — a rail
   * costs a column, a narrower column changes what fits, and what fits decides
   * whether a rail is needed — but a timeline's rows are its agents, and its
   * agents do not change when the pane narrows.
   */
  let content = 0
  /** The band the run is working in, and the row it opens on. */
  let front: FoldedLane | undefined
  let frontRow = 0

  for (const lane of lanes) {
    if (lane.agents.length === 0) {
      continue
    }

    if (running && lane.agents.some(agent => agent.state === 'running')) {
      front = lane
      frontRow = content
    }

    content += rowsOf(lane).length + 2
  }

  content = Math.max(0, content - 1)

  const startMs = Math.min(run.startedMs, ...run.agents.map(a => a.startedMs))
  const endMs = Math.max(run.endedMs ?? nowMs, ...run.agents.map(a => a.endedMs ?? nowMs))
  const span = Math.max(1000, endMs - startMs)
  // Where a bar ends when its agent never reported one. While the run is going
  // that is the clock; once it has ended it is the end of the run, or the bars
  // of the agents it took down with it kept growing after it died.
  const openEnd = running
    ? nowMs
    : (run.endedMs ?? Math.max(nowMs, ...run.agents.map(a => a.endedMs ?? 0)))
  const shortest = Math.max(
    1,
    Math.min(...run.agents.map(agent => (agent.endedMs ?? openEnd) - agent.startedMs)),
  )

  /**
   * How wide the axis is, which is no longer how wide the pane is.
   *
   * Squeezed into whatever the pane had left, a run of an hour drew every agent
   * that took under a minute as the same two cells — so a column of bars all
   * the same length said the agents all took the same time, which was the one
   * thing the drawing was there to disprove. The axis is a measurement, and a
   * measurement too coarse to separate its readings is not one.
   *
   * So it takes the cells the run needs: enough that the shortest span on it is
   * a cell of its own, and the body scrolls sideways to the rest. Capped,
   * because a single short agent in an hour-long run would otherwise ask for
   * thousands of columns to be scrolled through at a dozen cells a press.
   */
  const AXIS_PANES = 4
  const axisSpanOf = (axisW: number) =>
    Math.max(axisW, Math.min(Math.ceil(span / shortest), axisW * AXIS_PANES))

  /**
   * The rails cost a row and a column, and each changes what the other has to
   * work with, so the sizes are settled before a cell is drawn: measure with
   * neither, see which way the drawing overruns, and measure again at what is
   * left. The same two passes `paint` makes for the graph layouts.
   */
  const measure = (footed: boolean) => {
    const bottom = c.rows - reservedRows - (footed ? 1 : 0)
    const aheadRows = aheadDepth(pending.length, Math.max(1, bottom - barRows))
    const floor = bottom - aheadRows
    // The ruler stands under the bar and does not scroll with the bands: a time
    // axis that scrolls off the top is a scale the reader can no longer read
    // the bars against.
    const top = barRows + 1
    const shown = Math.max(1, floor - top)
    const spanY = Math.max(0, content - shown)
    const railed = spanY > 0 && shown >= 2 + RAIL_MIN && columns >= RAIL_W + 24
    const width = columns - (railed ? RAIL_W : 0)

    // What the names need, not a fixed share of the row.
    //
    // A third of the pane, capped at twenty-eight, is what this column used to
    // take whatever was on it: a run of short names left two thirds of the
    // column empty, and a run of long ones cut every name at twenty-eight
    // however wide the pane was — so at a hundred and forty columns the bars ran
    // on for a hundred cells beside `review:journal:correctne…`. The column asks
    // for the longest name it has to carry and is held to a share of the row,
    // because the bar beside it is the other half of what a reader came here to
    // read.
    const wants = Math.max(0, ...run.agents.map(a => cells(a.label))) + 3 + INSET_W
    const ceiling = Math.max(10, Math.min(Math.floor(width * 0.45), width - 44))
    const labelW = Math.max(10, Math.min(wants, Math.max(Math.floor(width / 3), ceiling)))
    const axisX = labelW + 1
    // The numbers take a column of their own against the right edge rather than
    // riding after each bar. Down a run of thirty agents that is the difference
    // between thirty figures a reader has to find and three columns they can
    // compare — and no bar can reach far enough to shoulder them off the row.
    //
    // The axis is asked for first and the figures are offered what is left.
    // Offered everything past the names, they took forty-six cells of a hundred
    // and ten and left the bars twenty-eight — the narrowest column on a drawing
    // whose whole subject is the bars. Held to this, the ladder in
    // `factsColumns` drops the clock first, which is the fact the bar beside it
    // already draws.
    const wantsAxis = Math.max(12, Math.floor(width * 0.4))
    const facts = factsColumns(run, nowMs, Math.max(0, width - axisX - 1 - wantsAxis))
    const axisW = Math.max(4, width - axisX - 1 - (facts.width > 0 ? facts.width + 2 : 0))

    return {
      aheadRows,
      floor,
      top,
      shown,
      spanY,
      railed,
      width,
      labelW,
      axisX,
      facts,
      axisW,
      factsX: width - facts.width,
      axisSpan: axisSpanOf(axisW),
      spanX: Math.max(0, axisSpanOf(axisW) - axisW),
    }
  }

  const footed = measure(false).spanX > 0
  const { aheadRows, floor, top, shown, spanY, railed, width, labelW, axisX, facts, axisW, factsX, axisSpan, spanX } =
    measure(footed)

  // While the run is live the window looks where the work is, and a reader who
  // scrolled away is left there until the run enters a different phase: the
  // same contract the graph layouts keep, for the same reason. See the seat in
  // `paint`.
  const seat = follow && front ? frontRow - Math.floor(Math.max(0, shown - 1) / 2) : scrollY
  const atY = Math.max(0, Math.min(spanY, Math.round(seat)))
  const atX = Math.max(0, Math.min(spanX, Math.round(scrollX)))

  /** Where a moment stands on the axis, in the cells the pane is over. */
  const cellOf = (ms: number) =>
    axisX -
    atX +
    Math.min(axisSpan - 1, Math.max(0, Math.floor(((ms - startMs) / span) * axisSpan)))
  /** Whether a cell is one of the axis's own, rather than a name's or a figure's. */
  const onAxis = (x: number) => x >= axisX && x < axisX + axisW

  const nowX = cellOf(nowMs)

  // The ruler: a round step of time between ticks, near a dozen cells apart, so
  // a bar can be read against the scale rather than only against the bars
  // beside it. It used to be left out — every bar is scaled to the one span the
  // header states, so a ruled row was said to repeat that fact — but a span for
  // the whole run tells a reader nothing about where in the run one bar sits,
  // which is the question a trace is opened to answer.
  const STEPS = [
    1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000,
    1_800_000, 3_600_000,
  ]
  const perCell = span / axisSpan
  const step = STEPS.find(ms => ms >= perCell * 12) ?? STEPS[STEPS.length - 1]
  const quiet = quietOf(c.background)

  paintRuler(c, barRows, axisX, axisW, startMs, span, step, cellOf, quiet)

  let y = top - atY
  /** Where the bar's own presses end: everything after this can scroll away. */
  const headerSpots = hotspots.length

  // From here the bands are drawn at their place in the whole timeline, and the
  // window takes whichever of them the pane is currently over. A band scrolled
  // half off the top draws the half still in the body; the rest simply does not
  // land, so nothing has to be laid out twice or cut to size.
  c.window(0, top, width, floor - top)

  for (const lane of lanes) {
    if (lane.agents.length === 0) {
      continue
    }

    // The same rule a stacked band opens with, for the same reason: it says
    // where a phase starts, what it is called and how far it has got, and the
    // rows under it are that phase's agents.
    const open = lane.nested === true && lane.shut !== true
    const indent = open ? INSET_W : 0
    const band = phaseFactsOf(
      open ? FOLD_OPEN + lane.phase.slice(FOLD_SHUT.length) : lane.phase,
      lanes.indexOf(lane),
      lane.agents,
      passes,
      overOf(run),
    )
    const filled = band.total > 0 ? Math.round((band.landed / band.total) * width) : 0

    for (let x = 0; x < width; x++) {
      c.put(x, y, ruleOf(lane.nested === true, x < filled), quiet)
    }

    const handle = lane.nested === true ? foldHandle(!open, lane.agents.length, width) : ''
    // Centred, like every other band rule that runs the width of the pane.
    const label = paintPhaseLabel(
      c,
      0,
      y,
      width,
      band,
      2,
      handle.length > 0 ? HANDLE_GAP + handle.length + 1 : 0,
    )

    c.put(label.x - 1, y, 0x20, quiet)
    c.put(label.x + label.used, y, 0x20, quiet)

    // The handle that opens the run and folds it back, after the caption,
    // exactly where the other two layouts put it.
    if (lane.nested) {
      const drew = paintFoldHandle(
        c,
        lane.phase,
        label.x + label.used + HANDLE_GAP,
        y,
        width - label.x - label.used - HANDLE_GAP,
        quiet,
        !open,
        lane.agents.length,
        hotspots,
      )

      if (!drew) {
        hotspots.push(markSpot(lane.phase, label.x, y, 0))
      }
    }

    y++

    for (const agent of rowsOf(lane)) {
      // A shut nested run's rows are its trips, not its agents, so each of them
      // answers to the run — the same press its card and its row answer to in
      // the other two layouts.
      const key = lane.shut === true ? `${RUN_OPEN}${lane.phase}` : agent.agentId
      const isSelected = key === selectedId
      const color = colorOf(agent.state)
      const took = (agent.endedMs ?? openEnd) - agent.startedMs
      const room = labelW - 3 - indent

      const moving = agent.state === 'running' || isSelected

      // A nested run's agents stand one step in from the run that called them,
      // behind the same dashed gutter the other layouts give them — so a reader
      // scrolling a trace of a hundred rows can see at a glance which of them
      // belong to this run and which to a workflow it called.
      if (indent > 0) {
        c.put(1, y, SEAM_V, quiet)
      }

      c.put(1 + indent, y, markOf(agent.state, tick), color)
      c.text(
        3 + indent,
        y,
        moving ? slide(agent.label, room, tick) : truncate(agent.label, room),
        isSelected ? COLORS.accent : COLORS.text,
      )
      hotspots.push({ agentId: key, x: 3 + indent, y, w: Math.min(room, cells(agent.label)) })

      const x0 = cellOf(agent.startedMs)
      const x1 = cellOf(agent.endedMs ?? openEnd)
      const length = x1 - x0 + 1
      // The axis is wider than the pane, so a bar can start before the window
      // and end after it. Clipped rather than moved: a bar drawn at the edge it
      // ran off is a bar in the wrong place on the scale.
      const from = Math.max(x0, axisX)
      const to = Math.min(x1, axisX + axisW - 1)
      const isLive = agent.state === 'running'
      const glow = glowOf()

      // An agent the run took down with it never landed, so its bar is not a
      // record of work done — it is how long the agent was up when the run
      // ended. Hollow says that; a solid block of the same length claims the
      // agent worked the whole of it.
      const cut = agent.state === 'stopped'
      // Three weights, and each says what the bar is. Solid: this is how long
      // the agent took. Half: the run ended under it, so this is how long it
      // was up, not how long it worked. Light with a head: it is still going,
      // and the right end is where the clock is now, not where the agent
      // finished — a solid block reaching the marker read as a measurement, and
      // the measurement it seemed to give grew every second.
      const block = cut ? 0x2591 : isLive ? 0x2592 : 0x2588

      for (let x = from; x <= to; x++) {
        const tone = isLive
          ? mix(color, glow, pulse(x - x0, Math.max(2, length * 2), tick))
          : isSelected
            ? mix(color, COLORS.accent, 0.35)
            : color

        c.put(x, y, block, tone)
      }

      if (isLive && onAxis(x1)) {
        c.put(x1, y, ARROW_RIGHT, mix(color, glow, 0.5))
      }

      drawColumns(c, factsX, y, facts, agent, took, run.defaultModel)

      // What the agent is doing, or what it answered, after the bar. Never
      // before it: the row is read left to right as the clock, and text ahead
      // of a bar says the agent was busy before it started.
      const tail = tailOf(agent, nowMs)
      const after = x1 + 2
      const afterRoom = factsX - 2 - after

      if (tail && afterRoom >= 6 && onAxis(x1)) {
        c.text(after, y, truncate(tail, afterRoom), tailColorOf(agent, nowMs, color))
      }

      y++
    }

    y++
  }

  paintGrid(
    c,
    top,
    Math.min(y, floor),
    axisX,
    axisW,
    startMs,
    span,
    step,
    cellOf,
    mix(COLORS.track, COLORS.text, 0.14),
  )

  // Where the clock stands, down the rows the agents took, in the cells no bar
  // claimed: a bar that reaches it is still going, one that stops short landed.
  //
  // A run that has ended gets no such line. `run.endedMs` is when the run's
  // status flipped, which is not when its agents stopped reporting — a line
  // there would sit a third of the way along bars that visibly continue past
  // it, and claim a moment the drawing contradicts. What happened to each
  // agent is a word in its own column instead.
  if (running && onAxis(nowX)) {
    paintNow(c, nowX, top, Math.min(y, floor))
  }

  c.window()
  inWindow(hotspots, headerSpots, { x: 0, y: top, w: width, h: floor - top })

  if (pending.length > 0) {
    // Centred between the last bar and the rows kept back for it, for the
    // reason the graph centres it: against either end it reads as the seat's
    // furniture rather than as the run's last section.
    const at = Math.max(barRows, Math.min(floor, y + Math.floor(Math.max(0, floor - y) / 2)))

    paintAheadBand(c, pending, run.plan, at, aheadRows, overOf(run))
  }

  if (railed) {
    paintBodyRail(c, columns - 1, top, floor - top, atY, spanY, hotspots)
  }

  if (footed && spanX > 0) {
    paintFootRail(c, c.rows - 1, columns, atX, spanX, axisW, hotspots)
  }

  return {
    hotspots,
    ...(spanY > 0 || spanX > 0 ? { body: { x: atX, y: atY, spanX, spanY } } : {}),
    ...(front ? { front: front.phase } : {}),
  }
}

/**
 * One line of the detail list, and the colour it is drawn in.
 *
 * `fields` is for a line that says two things in two colours — a call's name in
 * its state's tone beside the argument it was passed in the quieter one — and
 * `right` for what belongs against the block's far edge. A line with either is
 * drawn field by field; one with neither is drawn as the string it is.
 */
type DetailLine = {
  text: string
  color: Rgb
  bg?: Rgb
  /**
   * The line as coloured runs set end to end, with no gap between them.
   *
   * `fields` is a row of separate measurements and puts two cells between each
   * of them; this is one piece of text whose parts are told apart by tone. A
   * command's own name, its flags and its quoted strings are one line of shell,
   * not three facts about it.
   *
   * Tone and not hue. Colour in this pane says what state a node is in or that a
   * line is a wire, and a third meaning would cost the first two their meaning —
   * so the runs are the quoted block's own grey at three weights, and the reader
   * who ignores them reads exactly what they read before.
   */
  runs?: Field[]
  fields?: Field[]
  right?: Field[]
  /**
   * The cells of this line a reader can press, and what it presses.
   *
   * `at` is measured from the first cell of the text column rather than from
   * the canvas, since a block does not know where it sits until it is drawn.
   */
  press?: { key: string; at: number; w: number }
}

/** One scrollable block of the dialog, and where its list currently stands. */
export type DetailPane = {
  /** Lines this block holds. */
  total: number
  /** Lines it shows at once. */
  visible: number
  /** The first line shown, after clamping. */
  scroll: number
}

/**
 * Every block of the dialog, in the order their controls are keyed: one entry
 * per tab, and only the tab on top has anything in it.
 *
 * A tab nobody is looking at reports no lines and no room for them, so a press
 * aimed at it can move nothing — which is the truth about a list that is not
 * drawn. Each keeps its own place in `detailScroll`, so coming back to a tab
 * comes back to where it was left.
 */
export type DetailView = {
  panes: DetailPane[]
  tab: number
  /**
   * The opened call's own list, where one is open.
   *
   * Kept apart from `panes` because the tabs' places are what `detailScroll`
   * indexes: a call's scroll written into pane zero would be the Prompt tab's
   * scroll, and coming back from a call would land the prompt wherever the
   * call's payload happened to be left.
   */
  call?: DetailPane
  /**
   * The opened call's output, which is a compartment of its own beside its
   * argument's — its own ground, its own bar, its own place kept.
   */
  out?: DetailPane
  /**
   * The canvas row the shelf between those two compartments stands on.
   *
   * The wheel needs it. A scroll carries rows and nothing else, so which of the
   * two the pointer is over is read from the row it was on, the same way the
   * sideways move is.
   */
  split?: number
  /**
   * The list of a nested run's agents, where a run is open rather than an agent.
   *
   * It is the only pane in its dialog and it keeps its scroll under pane zero,
   * which is safe because the two readings can never be open at once: pressing
   * a row of the list is what closes the run and opens the agent.
   */
  run?: DetailPane
}

/**
 * The key a row in the Calls list presses: one call, opened whole.
 */
export const CALL_OPEN = '@call:'

/**
 * A call's argument as one line: its own line breaks and runs of space closed
 * up, so the whole of it reads as a sentence and what is cut off is cut off the
 * end.
 *
 * The keys are kept. A call's payload is usually two or three fields and only
 * one of them identifies it — `command:` for a shell call, `file_path:` for a
 * read — but which one that is differs by tool, and a row that showed the first
 * value alone read as blank for every tool whose first field is not the
 * interesting one. Keyed, a reader can see what they are looking at and what
 * they are not.
 */
function flatten(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

/**
 * A tool's name as a reader tells it from the tool beside it.
 *
 * An MCP tool is named `mcp__<server>__<tool>`, and one knowledge-base server
 * in this corpus contributes fifteen of them whose first forty cells are
 * identical: cut to fit a column, `mcp__plugin_engineering-knowledge-base_ekb…`
 * is the same string for a file read, a tree walk and a semantic search. The
 * last segment is the part that differs, and it is the part a reader says out
 * loud. The whole name is in the call's own dialog, where there is room for it.
 */
function toolShort(name: string): string {
  const at = name.lastIndexOf('__')

  return at >= 0 && at + 2 < name.length ? name.slice(at + 2) : name
}

/**
 * The keys that say which call this is, in the order they say it.
 *
 * A payload read back from a transcript arrives as every key the tool was
 * handed, in the order the tool's own schema happens to list them, so an `Edit`
 * led with `replace_all: false` — the same six characters on every `Edit` in the
 * run — and the path it edited was cut off the end of the row. A `Bash` led with
 * its command and then spent the rest of the row on `description`, which is the
 * model describing to itself what it had just written.
 */
const NAMES_A_CALL = [
  'command',
  'file_path',
  'notebook_path',
  'path',
  'pattern',
  'query',
  'url',
  'description',
  'prompt',
]

/**
 * The part of a call's payload that says which call it is.
 *
 * The key's own label goes with it. `command:` in front of a command, on a row
 * whose first column already reads `Bash`, is the pane saying the same thing
 * twice in the tool's vocabulary rather than the reader's — and it costs cells
 * the path or the command needs.
 *
 * A payload with no key the pane knows keeps all of it, labels included: a tool
 * this file has never heard of has no identifying argument to pick, and the
 * keys are then the only thing saying what the values are.
 */
function saidOf(input: string): string {
  const lines = input.split('\n')
  const keyed = lines.map(line => {
    const at = line.indexOf(': ')
    const key = at > 0 ? line.slice(0, at) : ''

    return /^[a-z_][a-z0-9_]*$/.test(key) ? key : ''
  })

  if (keyed.every(key => key === '')) {
    return input
  }

  const from = keyed.findIndex(key => NAMES_A_CALL.includes(key))

  if (from < 0) {
    return input
  }

  // Through to the next key, not just the one line: a command written over four
  // lines is four lines of this payload, and only the first of them carries the
  // key.
  let to = from + 1

  while (to < lines.length && keyed[to] === '') {
    to++
  }

  return [lines[from].slice(lines[from].indexOf(': ') + 2), ...lines.slice(from + 1, to)].join('\n')
}

/**
 * A path cut to fit, from the front.
 *
 * Everything else on this pane is cut from the end, because the head of a
 * sentence or a command is what identifies it. A path is the other way round: a
 * run's calls all live under one tree, so the first forty characters of every
 * `Edit` in the list are the same forty characters, and cutting from the end
 * produced a column of identical rows. The file is the last segment, and the
 * directory that gives it meaning is the one before it.
 *
 * Cut on the separators rather than mid-segment, so what is left is a path a
 * reader can read as a path.
 */
function tailPath(path: string, max: number): string {
  if (cells(path) <= max || max < 8) {
    return truncate(path, max)
  }

  const parts = path.split('/')

  for (let from = 1; from < parts.length; from++) {
    const tail = `\u2026/${parts.slice(from).join('/')}`

    if (cells(tail) <= max) {
      return tail
    }
  }

  // One segment longer than the row: keep its end, which is where a file name
  // and its extension are.
  return `\u2026${path.slice(-(max - 1))}`
}

/** Whether what a call was passed is a path, and so cut from the front. */
function isPath(said: string): boolean {
  return /^[~/][^\s]*\/[^\s]+$/.test(said)
}

/**
 * One call as one row: what it was, what it was passed, what it took and spent.
 *
 * It used to be as many rows as the payload wrapped to, with a dashed seam
 * between one call and the next. What that produced on an agent with forty-two
 * calls was a column of ragged blocks two to six rows deep, four of them
 * visible at a time — so the list whose whole job is to be read as a sequence
 * could not be read as one, and finding a call meant scrolling past the text of
 * every call before it.
 *
 * One row each, and the rows are uniform: the tool names line up in a column,
 * the arguments start at one place, the figures hold the right edge, and twenty
 * calls are on screen instead of four. What a call was about in full is a press
 * away, in the call's own dialog, which is where a payload that wants forty
 * lines can have them.
 *
 * What came back is not on the row, a call that failed included. A tool's answer
 * is the agent's material, not the reader's, and the mark already says the call
 * failed, which is the part that belongs in the sequence.
 *
 * A call read back from a transcript is stamped from the recording's own
 * timestamps, so it states its duration like a call this module watched. What a
 * transcript cannot say is whether the last call of a killed agent was still
 * going when the kill landed — an unclosed call on an agent that is no longer
 * running is drawn as a call that finished, not as one still in flight, since
 * the agent it belonged to certainly is not.
 */
function callRow(call: ToolCall, table: CallTable, nowMs: number, live: boolean): DetailLine {
  const running = live && call.startedMs > 0 && call.endedMs === undefined
  const mark = running ? '\u2026' : call.isError ? '\u2716' : '\u2714'
  const color = running ? COLORS.running : call.isError ? COLORS.failed : COLORS.done
  const quiet = mix(COLORS.text, color, 0.3)
  const name = truncate(toolShort(call.name), table.nameW)
  const flat = flatten(saidOf(call.input))
  const said = isPath(flat) ? tailPath(flat, table.room) : truncate(flat, table.room)

  return {
    text: '',
    color,
    // The mark carries the state and stands outside the press. Every cell under
    // a Button comes out in the Button's own plain label, so a mark inside one
    // would lose the colour that is the whole of what it says.
    fields: [
      { text: mark, color },
      { text: `${name}${' '.repeat(Math.max(0, table.nameW - cells(name)))}`, color: quiet },
      { text: said, color: quietOf(COLORS.text) },
    ],
    right: table.tailOf(call, nowMs, live),
    // The whole of the row's own columns, not the cells this argument happened
    // to fill. Every row of the list opens something, and a target that ended
    // where the text did meant the shorter arguments were harder to hit than
    // the longer ones — a list of controls whose targets are all different
    // sizes.
    press: { key: `${CALL_OPEN}${call.id}`, at: 3, w: table.nameW + 2 + table.room },
  }
}

/**
 * A figure set into a fixed column: its mark against the column's left edge,
 * its value against the right.
 *
 * The mark names the measurement and the value is what a reader compares, so
 * the values are what line up. `∑ 1.7k tkns` over `∑  259 tkns` puts both
 * units in one column and both counts in another; right-aligning the pair
 * whole would have set `1.7k` over `259` with the `k` where a digit is.
 */
function inColumn(text: string, w: number): string {
  if (text === '') {
    return ' '.repeat(w)
  }

  const at = text.indexOf(' ')
  const mark = at < 0 ? '' : text.slice(0, at + 1)
  const value = at < 0 ? text : text.slice(at + 1)

  return `${mark}${' '.repeat(Math.max(0, w - cells(mark) - cells(value)))}${value}`
}

/**
 * The columns a list of calls is drawn in, measured once over the whole list.
 *
 * Every row used to measure its own, and the two figures are pinned to the
 * block's right edge — so a call whose token count was never recorded pulled
 * its clock across into the cells the row above it had written tokens in, and
 * the rung of the spelling ladder was chosen from each row's own figures, which
 * set `∑ 259 tkns` under `∑ 1.7k` with the two counts in different columns and
 * spelled two ways. Neither is a fault a reader can do anything about: the row
 * is not saying the call was quicker, it is saying the row next to it knows
 * something this one does not.
 *
 * The whole reason a call is one row is that the list is read as a table — a
 * reader scans one column down it looking for the slow call or the expensive
 * one. So the columns are measured over every row in the list, one spelling is
 * picked for all of them, and every row is drawn in those columns, including
 * the rows with nothing to put in one: a column with no figure is left blank
 * and the columns either side of it do not move.
 */
type CallTable = {
  /** Cells the tool name takes, the same on every row. */
  nameW: number
  /** Cells the argument takes, the same on every row. */
  room: number
  /** The figures of one call, each set into its own column. */
  tailOf: (call: ToolCall, nowMs: number, live: boolean) => Field[]
}

function callTable(calls: ToolCall[], nowMs: number, width: number, live: boolean, nameW: number): CallTable {
  // What the call cost and how long it took, and nothing else. The row used to
  // carry the number of the model request that issued it as well, which is an
  // index into a list the dialog does not draw — a figure a reader can do
  // nothing with, sitting in the row where the two they can are.
  const tookIn = (call: ToolCall, at: number, going: boolean): string => {
    const running = going && call.startedMs > 0 && call.endedMs === undefined
    const until = call.endedMs ?? (running ? at : undefined)

    return call.startedMs > 0 && until !== undefined ? `${CLOCK_MARK} ${elapsed(until - call.startedMs)}` : ''
  }
  const spentIn = (form: (n: number) => string) => (call: ToolCall): string =>
    call.stepTokens === undefined ? '' : form(call.stepTokens)
  /**
   * One column, as wide as the widest row fills it.
   *
   * A running call's clock grows while the pane watches it, so the column is
   * measured at the moment it is drawn rather than kept from the frame before:
   * a width latched at `965ms` would cut `1.2s` short a frame later.
   */
  const columnOf = (of: (call: ToolCall, at: number, going: boolean) => string, color: Rgb) => ({
    widthAt: (at: number, going: boolean) => Math.max(0, ...calls.map(call => cells(of(call, at, going)))),
    cellAt: (call: ToolCall, at: number, going: boolean, w: number): Field => ({
      text: inColumn(of(call, at, going), w),
      color,
    }),
  })
  const clock = columnOf(tookIn, COLORS.clock)
  const spend = (form: (n: number) => string) => columnOf(spentIn(form), COLORS.spend)
  // The argument is the only thing on the row that says which call this is, so
  // it is the last thing to give way. The figures go down a ladder until the
  // argument has twenty-four cells — about a path's last two segments, or a
  // command and its first flag — the unit first, then the count, then the clock
  // with it. Under that the row is a tool name and an ellipsis, and a list of
  // those is a list nobody can find a call in.
  //
  // A narrow pane runs out before the ladder does, and there the last rung is
  // taken: the tool and what it was passed, and the figures in the call's own
  // dialog, where they are three fields on a row of their own.
  const lead = 3 + nameW + 2
  const ladder = [[clock, spend(tokensNamed)], [clock, spend(tokensWide)], [clock], []]
  const spread = (columns: typeof ladder[number]) =>
    columns.map(column => ({ column, w: column.widthAt(nowMs, live) })).filter(one => one.w > 0)
  const spanOf = (kept: ReturnType<typeof spread>) =>
    kept.length > 0 ? kept.reduce((sum, one) => sum + one.w, 0) + (kept.length - 1) * 2 : 0
  const fits = (columns: typeof ladder[number]) => {
    const span = spanOf(spread(columns))

    return lead + (span > 0 ? span + 2 : 0) + 24 <= width
  }
  const kept = spread(ladder.find(fits) ?? ladder[ladder.length - 1])
  const span = spanOf(kept)

  return {
    nameW,
    room: Math.max(4, width - lead - (span > 0 ? span + 2 : 0)),
    tailOf: (call, at, going) => kept.map(one => one.column.cellAt(call, at, going, one.w)),
  }
}

/** The cells a panel owns, its dividing rule included. */
export type Rect = { x: number; y: number; w: number; h: number }

/**
 * The selected agent, in full: what it was asked, every tool call it made
 * with what each was about and what it got back, and what it answered. The
 * graph can only hint at any of it, so this is a list, and the list scrolls:
 * the caller hands in the first line to show and gets back how many there are.
 *
 * `side` puts the panel down the right of the graph rather than across the
 * bottom. A column is the better shape for this content — it is a list of
 * wrapped prose and call results, which wants many short lines rather than few
 * long ones — so where the seat is wide enough the column is what it gets, and
 * the rule dividing the two turns ninety degrees with it.
 */
/** One block of the detail, drawn on its own tab. */
type Section = {
  /** What its tab is called: one or two words, since the strip holds them all. */
  tab: string
  /**
   * The shorter spelling of the name, for a strip that will not hold the full
   * one even with the counts gone.
   *
   * The last rung of the strip's ladder. A tab whose name has gone is a tab
   * nobody can aim at, so a name gives up letters rather than the tab giving up
   * its place.
   */
  short?: string
  lines: (width: number) => DetailLine[]
  /**
   * Whether the block sits on the pane's own ground rather than the quoted one.
   *
   * The quoted ground says *another program wrote this*, which is true of a
   * prompt and of an answer and not of an index the pane built itself.
   */
  plain?: boolean
}

/**
 * The value behind a piece of text, where the text is JSON, and nothing where
 * it is not — including where it is a truncated preview that no longer parses.
 */
function parsedJson(text: string): unknown {
  const trimmed = text.trim()

  if (!/^[[{"]/.test(trimmed)) {
    return undefined
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

/**
 * One line too long for the block, over as many lines as it needs, each
 * continuation set in under the start of the line it came from.
 */
function folded(line: string, width: number, color: Rgb): DetailLine[] {
  if (line.length <= width || width < 8) {
    return [{ text: truncate(line, width), color }]
  }

  const lead = line.length - line.trimStart().length
  const indent = ' '.repeat(Math.min(Math.floor(width / 2), lead + 2))
  const out: DetailLine[] = [{ text: line.slice(0, width), color }]
  let rest = line.slice(width)

  while (rest.length > 0 && out.length < 40) {
    const room = width - indent.length

    out.push({ text: indent + rest.slice(0, room), color })
    rest = rest.slice(room)
  }

  return out
}

/**
 * Somebody else's writing, as lines of a block, with their own lines kept.
 *
 * A prompt and an answer are markdown: headings, list items, table rows and
 * block quotes, and every one of those is a line. Wrapped as one paragraph — as
 * this pane wrapped them until now — the structure does not degrade, it
 * disappears, and what is left is a slab with `#` and `>` and `|` loose in the
 * middle of sentences. A two-hundred-line implementation plan came out as one
 * three-hundred-line paragraph.
 *
 * So the writer's lines are the lines, each wrapped inside itself, the same
 * treatment a call's argument already gets. Blank lines are kept, because the
 * paragraph breaks are the writer's too.
 *
 * A heading line is drawn a step back from the body, which is this pane's rule
 * for structure everywhere else: what the words say is the content, and the
 * scaffolding around it is grey. The body keeps the strength it had, so nothing
 * a reader came to read is quieter than before, and a heading is findable while
 * scrolling because it is the one line in view that is a different colour.
 *
 * That is the whole of the styling. Marking quotes, code spans and emphasis as
 * well would be a syntax highlighter in a pane that is not an editor.
 *
 * The line length is capped short of the block. Prose set the full width of a
 * two-hundred-column pane is prose a reader loses their place in between one
 * line and the next; a table of calls is not, and keeps the whole block.
 */
const MEASURE = 96

/**
 * The most lines a pane of prose may run to.
 *
 * High enough that no prompt in the corpus reaches it, because the text *is* the
 * pane and the reader opened the tab to read it: a ceiling against a runaway,
 * not a budget. The wrapper came from the calls list, where an argument was a
 * block of rows among other blocks and stopping at two hundred was generous; a
 * four-hundred-line plan stopped at two hundred is a document the pane declines
 * to show the end of.
 */
const PROSE_MAX = 2_000

function prose(text: string, width: number, color: Rgb): DetailLine[] {
  const measure = Math.min(width, MEASURE)
  const quiet = mix(color, COLORS.dim, 0.45)

  return written(text, measure, measure, PROSE_MAX)
    .map(line => ({ text: line, color: /^\s{0,3}#{1,6}\s/.test(line) ? quiet : color }))
}

/**
 * What an agent answered, as lines of a block.
 *
 * Most answers are prose and are read as prose, wrapped to the block. An agent
 * given a schema answers JSON instead, and a whole object on one line —
 * `{"lines":423,"files":["hooks/paint.ts",…]}` — is a wall a reader has to
 * parse by eye. So an object is set out the way it would be written in a file,
 * one field to a line, and the block scrolls through it. An answer that is a
 * JSON string is unquoted and read as the prose it is.
 */
function answerLines(answer: string, width: number, color: Rgb): DetailLine[] {
  const value = parsedJson(answer)

  if (value === undefined || typeof value === 'string') {
    return prose(typeof value === 'string' ? value : answer, width, color)
  }

  return JSON.stringify(value, null, 2)
    .split('\n')
    .slice(0, 400)
    .flatMap(line => folded(line, width, color))
}

/**
 * The key a pass on the dialog's own strip presses: one trip through this piece
 * of work, read whole.
 *
 * A key of its own rather than the agent's bare id, which is what a card's pass
 * marks press. The id toggles — pressing the node that is open shuts it — and a
 * strip is not a toggle: a reader picking along ten trips expects the tenth
 * press to show the tenth trip, not to close what they were reading. It also
 * keeps the way back to a nested run's list, which the bare id drops.
 */
export const PASS_OPEN = '@pass:'

/** A pass on the strip: its mark, a cell of air, its number, and the air around it. */
const PASS_SIDES = 5

/**
 * Every trip through this piece of work, along a strip of its own, with the one
 * being read set apart.
 *
 * A phase entered ten times is one row on the drawing with a mark per trip, and
 * the marks are pressable — but only the ones that fit: four of ten on a wide
 * card, none at all on a card whose width has gone to its name. So a reader who
 * opened the last trip had no way to the first, which is the trip a loop is
 * usually read for. The strip is where the dialog carries them all: the same
 * mark-and-number the card draws, at a size where every one of them is there.
 *
 * Set into a shelf of its own, above the tabs. The two strips answer different
 * questions — which trip, then which part of it — and a reader moving along one
 * keeps their place in the other, which is why the tab is not touched when the
 * trip changes. The open one is bracketed rather than coloured: a press target
 * is drawn as a Button and a Button carries no colour, so the marker has to
 * stand outside the cells it marks.
 *
 * Where the strip is too narrow for all of them it shows a window around the
 * open trip, with an arrow at either end that steps to the trip just outside
 * it. Every trip is still reachable; the reader walks to the far ones.
 */
function paintPassStrip(
  c: Canvas,
  rect: Rect,
  y: number,
  edge: Rgb,
  passes: FoldPass[],
  openAt: number,
  tick: number,
  hotspots: Hotspot[],
): void {
  // The count leads the strip, in the mark the drawing already spends on a
  // loop: a reader who has seen `↻10` on the card knows what the numbers after
  // it are counting before reading one of them.
  const lead = loopMark(passes.length)

  paintCrossbar(c, rect, y, edge, lead)

  const rule = quietOf(c.background)
  const first = rect.x + 4 + cells(lead) + 2
  const end = rect.x + rect.w - 2
  const itemW = (at: number) => 2 + cells(String(passes[at].index)) + PASS_SIDES
  const room = end - first + 1
  const whole = passes.reduce((w, _, at) => w + itemW(at), 0)
  /** The cells an arrow and the air either side of it take, at each end. */
  const STEP_W = 3
  const capacity = whole <= room ? room : room - 2 * STEP_W

  let from = openAt
  let to = openAt
  let used = itemW(openAt)
  let grew = true

  // Outward from the trip being read, the later ones first: a loop is read for
  // how it ended, so the window keeps the end of it in view where it can.
  while (grew) {
    grew = false

    if (to + 1 < passes.length && used + itemW(to + 1) <= capacity) {
      used += itemW(to + 1)
      to += 1
      grew = true
    }

    if (from - 1 >= 0 && used + itemW(from - 1) <= capacity) {
      used += itemW(from - 1)
      from -= 1
      grew = true
    }
  }

  const step = (x: number, glyph: number, at: number) => {
    c.put(x - 1, y, 0x20, rule)
    c.put(x, y, glyph, COLORS.dim)
    c.put(x + 1, y, 0x20, rule)
    hotspots.push({ agentId: `${PASS_OPEN}${passes[at].agent.agentId}`, x, y, w: 1 })
  }

  let at = first + (from > 0 ? STEP_W : 0) + 2

  if (from > 0) {
    step(first + 1, ARROW_LEFT, from - 1)
  }

  for (let index = from; index <= to; index++) {
    const pass = passes[index]
    const digits = String(pass.index)
    const w = 2 + cells(digits)

    if (at + w + 1 > end) {
      break
    }

    // The same brackets the tabs mark their open one with, in the same places:
    // the strip never shifts under the pointer, so picking along it is picking
    // along a row of fixed targets.
    if (index === openAt) {
      c.put(at - 2, y, 0x2524, COLORS.accent)
      c.put(at + w + 1, y, 0x251c, COLORS.accent)
    }

    c.put(at - 1, y, 0x20, rule)
    c.put(at + w, y, 0x20, rule)
    // The mark stands outside the target, a cell of air between the two, which
    // is the spacing every mark-and-name on the pane keeps and the only one a
    // Button allows.
    c.put(at, y, markOf(pass.agent.state, tick), colorOf(pass.agent.state))
    c.put(at + 1, y, 0x20, rule)
    c.text(at + 2, y, digits, index === openAt ? COLORS.text : COLORS.dim)
    hotspots.push({ agentId: `${PASS_OPEN}${pass.agent.agentId}`, x: at + 2, y, w: cells(digits) })

    at += w + PASS_SIDES
  }

  if (to < passes.length - 1) {
    step(end - 1, ARROW_RIGHT, to + 1)
  }
}

/**
 * The selected agent, in full, in a dialog over the drawing.
 *
 * The three things worth knowing about an agent — what it was asked, what it
 * did, what it answered — do not belong in one list. Two of them are prose and
 * one is a table of calls, and stacked in a single column the prose pushed the
 * calls off the bottom. So each takes a column of its own, divided by a rule,
 * and the dialog is read across rather than scrolled through.
 *
 * Each column scrolls on its own, from a pair of arrows in its own heading.
 * One position for all of them meant pressing the arrow under a nineteen-line
 * call list emptied the six-line prompt beside it, which reads as a control
 * that does not work.
 */
function paintDetail(
  c: Canvas,
  agent: AgentRow,
  nowMs: number,
  tick: number,
  rect: Rect,
  scroll: number[],
  tab: number,
  hotspots: Hotspot[],
  /** The phases that fed this agent from further back than the band above it. */
  fedBy: string[],
  /** Every trip through this agent's own work, where it was done more than once. */
  passes: FoldPass[],
  model?: string,
  /** Set when this agent was opened out of a nested run's list, to return to. */
  fromRun?: string,
): DetailView {
  const color = colorOf(agent.state)
  const last = rect.y + rect.h - 1
  const right = rect.x + rect.w - 1
  const edge = mix(COLORS.dim, COLORS.text, 0.35)

  // The dialog is a box over the drawing, so it is drawn as one. The graph was
  // painted first and whole, and every cell of it under here has to go: left
  // there they show between the dialog's own words — a node's clock at the end
  // of a sentence, which reads as the dialog saying it.
  c.fill(rect.x, rect.y, rect.w, rect.h, c.background)

  for (let dx = 1; dx < rect.w - 1; dx++) {
    c.put(rect.x + dx, rect.y, LIGHT.across, edge)
    c.put(rect.x + dx, last, LIGHT.across, edge)
  }

  for (let dy = 1; dy < rect.h - 1; dy++) {
    c.put(rect.x, rect.y + dy, LIGHT.down, edge)
    c.put(right, rect.y + dy, LIGHT.down, edge)
  }

  c.put(rect.x, rect.y, LIGHT.tl, edge)
  c.put(right, rect.y, LIGHT.tr, edge)
  c.put(rect.x, last, LIGHT.bl, edge)
  c.put(right, last, LIGHT.br, edge)

  const took = (agent.endedMs ?? nowMs) - agent.startedMs
  const spent = tokensOf(agent)
  const quiet = quietFor(agent, nowMs)
  const calls = agent.calls ?? []
  // The same three colours the graph uses for the clock, the spend and the
  // model, so the dialog reads as the node it was opened from.
  // Which tools, not just how many. The calls are listed in full further down
  // the dialog, but the list scrolls and the foot does not: the two most-used
  // tools say what kind of work this was without the reader moving anything.
  //
  // One field rather than three. The foot sets a stroke between its fields, and
  // the count and the breakdown are one measurement — `⚙ 4 │ 2×Read │ 1×Bash`
  // reads as three, the last two of which have lost the thing they are counts
  // of.
  const toolsFull = toolLine([agent], 2)
  const toolsBare = toolLine([agent], 0)
  // The same word the graph writes, in a row that always has the cells for it.
  // A card fed from further back carries `▾ from Preflight` above it, and gives
  // the word up for the name where the row it shares with an arriving wire is
  // too short for both. The dialog's foot is never that short, so a reader who
  // opened the node to find out what the bare name beside it meant has the
  // answer in the same place as the rest of the node's facts.
  const from = (show: boolean): string => (show && fedBy.length > 0 ? `from ${fedBy.join(', ')}` : '')
  const factsWith = (form: (n?: number) => string, tools: string, fed = true): Field[] => [
      { text: agent.phase, color: COLORS.dim },
      { text: from(fed), color: COLORS.wire },
      { text: `${CLOCK_MARK} ${elapsed(took)}`, color: COLORS.clock },
      { text: quiet > 0 ? `quiet ${elapsed(quiet)}` : '', color: mix(COLORS.failed, COLORS.running, 0.5) },
      // Drawn whether or not there is a figure: this is the same fact the card
      // carries, and the dialog is where a reader comes to find out what the
      // card meant. A blank here would answer the question with nothing.
      { text: form(spent), color: COLORS.spend },
      { text: agent.steps ? `${REQUEST_MARK} ${agent.steps}` : '', color: COLORS.dim },
      { text: tools || (calls.length > 0 ? `${TOOL_MARK} ${calls.length}` : ''), color: COLORS.dim },
      { text: agent.attempt && agent.attempt > 1 ? loopMark(agent.attempt) : '', color: COLORS.running },
      { text: modelName(agent.model ?? model), color: COLORS.model },
  ].filter(f => f.text.length > 0)

  // The unit written out where the row has the cells for it: the dialog is the
  // one place a reader can be looking at a single figure rather than a column
  // of them, so the mark has nothing beside it to be learned from.
  //
  // The spellings are given up in the order a reader would give them up: the
  // tool names first, since the list below names every one of them, then the
  // word on the token count, which nothing else on the row says.
  const footRoom = Math.max(0, right - rect.x - 3)
  const ladder: Field[][] = [
    factsWith(tokensNamed, toolsFull),
    factsWith(tokensNamed, toolsBare),
    factsWith(tokensWide, toolsBare),
    factsWith(tokensWide, toolsBare, false),
  ]
  const factsFor = (room: number) =>
    ladder.find(row => widthOf(divided(row), 1) <= room) ?? ladder[ladder.length - 1]

  // Which agent is open is the dialog's title, and a title goes in the top edge
  // — set in the way a card sets its name in, so the two read as the same kind
  // of thing at two sizes. The figures go on the last row inside, under the
  // reading rather than over it.
  const headY = rect.y
  const footY = last - 1
  // A rule between the reading and the figures under it. They are the dialog's
  // own summary of what is above them, and set straight against the last line of
  // an answer they read as the answer's last line — the blocks each carry a rule
  // over their heading for the same reason.
  const ruleY = footY - 1
  const closeX = right - 4

  const title = truncate(agent.label, Math.max(1, closeX - rect.x - 7))

  paintDialogTitle(
    c,
    rect.x,
    headY,
    right,
    [
      // The same mark the node carries. ▮ said only *a node*, which the reader
      // knows: they pressed one. Whether it came back clean is the fact they
      // opened the dialog with, and a dialog whose title disagrees with the card
      // behind it is a dialog about some other run.
      { text: String.fromCodePoint(markOf(agent.state, tick)), color },
      { text: title, color: COLORS.text },
    ],
    edge,
  )

  // Shutting it is the one thing every reader of it eventually does, so it is a
  // mark at the dialog's own corner rather than a word in the footer under the
  // drawing. Three cells, as the scroll arrows are: the glyph is one cell and a
  // one-cell target is one cell to miss.
  c.put(closeX, headY, 0x20, edge)
  c.put(closeX + 1, headY, CLOSE_MARK, mix(COLORS.dim, COLORS.text, 0.4))
  c.put(closeX + 2, headY, 0x20, edge)
  hotspots.push({ agentId: DETAIL_CLOSE, x: closeX, y: headY, w: 3 })

  // Opened out of a nested run's list, the dialog says so and offers the way
  // back — the same corner, the same word, the same press a call's own dialog
  // uses. Without it a reader who pressed the third of fourteen rows had to
  // shut the dialog, find the run's row in the drawing behind it and press it
  // again to read the fourth.
  if (fromRun !== undefined) {
    paintBack(c, rect.x, headY, closeX, edge, RUN_BACK, hotspots)
  }

  // Both of the dialog's rules are crossbars, the strip the tabs sit on
  // included: they tie into the frame rather than lying between two walls.
  const crossbar = (y: number) => paintCrossbar(c, rect, y, edge)

  if (ruleY > rect.y) {
    crossbar(ruleY)
  }

  /**
   * The figures under the reading, and after them how far down it the reader is.
   *
   * The position used to be written at the right end of the tab strip, which put
   * a measurement on the one row of the dialog that is otherwise all controls —
   * and put it beside the tabs, so a reader picking along them read `1–21/78` as
   * another of them. It belongs with the clock and the spend: this row is where
   * the dialog says how big a thing is.
   *
   * It is the last field, so it is the first to go when the row runs out of
   * cells. Everything else here is a fact about the agent; this is a fact about
   * a reader's own scrolling, and they can see that by looking at the bar.
   */
  const paintFoot = (where: string) => {
    const spare = where.length > 0 ? where.length + 3 : 0
    const room = Math.max(0, footRoom - spare)
    const facts = factsFor(room)
    // Divided where the row has the cells for it. Where it has not, the dividers
    // come out rather than the figures: drawFields stops at the first field that
    // will not fit, and a row that stopped on a divider reads as a frame with a
    // piece broken off.
    const ruled = divided(facts)
    const fits = widthOf(ruled, 1) <= room

    drawFields(c, rect.x + 2, footY, room, fits ? ruled : facts, fits ? 1 : 3)

    if (spare > 0) {
      drawRight(c, right - 1, footY, divided([{ text: '', color: COLORS.dim }, { text: where, color: COLORS.dim }]), 1)
    }
  }

  const sections: Section[] = []

  if (agent.prompt) {
    const prompt = agent.prompt

    sections.push({
      tab: 'Prompt',
      lines: w => prose(prompt, w, COLORS.text),
    })
  }

  if (calls.length > 0) {
    // One column for the names, as wide as the longest of them and no wider. A
    // run of `Bash`, `Edit` and `Read` gets a column of five; the ceilings are
    // there for the one long name among forty short ones, which would otherwise
    // push every argument in the list right to make room for a single row — and
    // for a narrow pane, where a fixed column that was a fifth of the row at a
    // hundred and ten cells is half of it at fifty.
    const longest = Math.max(4, ...calls.map(call => cells(toolShort(call.name))))
    const nameW = (w: number) => Math.min(longest, 18, Math.max(4, Math.floor(w * 0.22)))

    sections.push({
      tab: `Tool Calls (${calls.length})`,
      short: 'Calls',
      // The list is an index rather than quoted material, and every row on it is
      // a control. A Button carries no ground, so a ground painted under these
      // rows is a ground the surface throws away — the block would come out in
      // stripes, quoted where a row happened not to be pressable.
      plain: true,
      // Newest first. A reader opens an agent's detail to see what it is doing
      // or what it did last, and the call that answers that was at the bottom of
      // a list long enough to scroll — so the block opened on the oldest call
      // every time, and the interesting end had to be hunted for.
      lines: w => {
        const table = callTable(calls, nowMs, w, agent.state === 'running', nameW(w))

        return [...calls].reverse().map(call => callRow(call, table, nowMs, agent.state === 'running'))
      },
    })
  } else if (agent.tools.length > 0) {
    const list = agent.tools.map(t => (t.count > 1 ? `${t.name} ×${t.count}` : t.name)).join('   ')

    sections.push({
      tab: 'Tool Calls',
      short: 'Calls',
      lines: w => wrap(list, w, 40).map(text => ({ text, color: mix(COLORS.text, color, 0.3) })),
    })
  } else if (agent.lastTool) {
    // A run this module never watched has no call list, only the summary's
    // last call and its count.
    const count = agent.toolCalls ? `${agent.toolCalls} ${agent.toolCalls === 1 ? 'call' : 'calls'}, last ` : ''

    sections.push({
      tab: 'Tool Calls',
      short: 'Calls',
      lines: w => wrap(`${count}${agent.lastTool}`, w, 40).map(text => ({ text, color: mix(COLORS.text, color, 0.3) })),
    })
  }

  const saying = agent.state === 'running' && agent.isThinking ? agent.saying : undefined
  const answer = agent.result ?? agent.resultPreview

  if (saying) {
    sections.push({
      tab: 'Thinking',
      lines: w => prose(saying, w, mix(COLORS.text, color, 0.25)),
    })
  } else if (answer) {
    sections.push({
      tab: 'Response',
      lines: w => answerLines(answer, w, mix(COLORS.text, color, 0.25)),
    })
  }

  // One row of chrome for the tabs, not two: the strip is set into the rule that
  // used to close the title off from the reading, so naming the blocks costs
  // nothing a five-row dialog cannot pay.
  //
  // A second shelf above it, and only where there is a second question to
  // answer: the trips this piece of work took. It costs the reading a row, so
  // it is drawn for a loop and never for the work that ran once.
  const passAt = passes.findIndex(pass => pass.agent.agentId === agent.agentId)
  const looped = passes.length > 1 && passAt >= 0
  const passY = rect.y + 1
  const tabY = rect.y + (looped ? 2 : 1)
  const bodyY = tabY + 1
  const rows = Math.max(0, ruleY - bodyY)
  const inner: Rect = { x: rect.x + 1, y: bodyY, w: rect.w - 2, h: rows }

  // An empty dialog over a node that was just pressed reads as a dialog that did
  // not open. It says which of the two it is instead.
  const strip = () => {
    if (looped) {
      paintPassStrip(c, rect, passY, edge, passes, passAt, tick, hotspots)
    }
  }

  if (sections.length === 0) {
    strip()
    crossbar(tabY)
    c.text(
      inner.x + 1,
      tabY,
      agent.state === 'running'
        ? 'Nothing recorded yet. What this agent was asked, and every call it makes, appear here as it works.'
        : `No transcript for this agent: agent-${agent.agentId}.jsonl is not in the run's transcript folder.`,
      COLORS.dim,
    )

    paintFoot('')

    return { panes: [], tab: 0 }
  }

  const on = Math.max(0, Math.min(sections.length - 1, Math.floor(tab)))

  if (rows < 1) {
    strip()
    crossbar(tabY)
    paintTabs(c, rect.x + 1, tabY, rect.w - 2, sections, on, hotspots)
    paintFoot('')

    return { panes: sections.map(() => ({ total: 0, visible: 0, scroll: 0 })), tab: on }
  }

  // The block takes the whole dialog. Side by side, three of them shared a
  // hundred columns, so each was about forty-five: a prompt of two hundred lines
  // showed eleven of them, a command wrapped every five words, and the reading
  // the dialog exists for was done through a keyhole. They are one question
  // after another rather than one question compared with another — what it was
  // told, what it did, what it said — so they take turns at full width instead.
  const pane = paintTabBody(c, inner, sections[on], scroll[on] ?? 0, on, hotspots)
  const panes = sections.map((_, i) => (i === on ? pane : { total: 0, visible: 0, scroll: scroll[i] ?? 0 }))

  strip()
  crossbar(tabY)
  paintTabs(c, rect.x + 1, tabY, rect.w - 2, sections, on, hotspots)
  paintFoot(
    pane.total > pane.visible
      ? `${pane.scroll + 1}\u2013${Math.min(pane.total, pane.scroll + pane.visible)}/${pane.total}`
      : '',
  )

  return { panes, tab: on }
}

/**
 * The press a nested run's own name answers to, keyed by the phase it is.
 *
 * A run drawn as one row has no agent of its own. What the row shows is
 * `wholeOf` — the run's name over the clock and the spend of every agent in it,
 * carrying the agent id of the one that decided the trip, because that is the
 * agent whose state the mark reports. Pressed, that id opened that one agent's
 * detail: a reader who asked to see a review panel of fourteen agents was shown
 * the last of them, with nothing on the dialog saying the other thirteen
 * existed.
 *
 * So the row answers to the phase instead, and the phase opens the run.
 */
export const RUN_OPEN = '@run:'

/** The press that leaves an agent's dialog for the nested run it was opened from. */
export const RUN_BACK = '@run-back'

/** The press that leaves a call's own dialog for the list it was opened from. */
export const CALL_BACK = '@call-back'

/**
 * The way back, in the corner the reader came from.
 *
 * The same edge the close mark sits in at the other end, and a word rather than
 * a mark alone: `◂` on its own in a dialog that also scrolls is one more arrow
 * among four, and a reader counting arrows is a reader who has stopped reading.
 *
 * Nothing is drawn where the title would have to give up letters for it. A
 * dialog narrow enough for that is one where the name of the thing being read
 * is worth more than a second way out of it, since `✕` is still in the corner.
 */
function paintBack(
  c: Canvas,
  x: number,
  y: number,
  closeX: number,
  edge: Rgb,
  key: string,
  hotspots: Hotspot[],
): void {
  const back = `${String.fromCodePoint(ARROW_LEFT)} Back`

  if (closeX - x <= cells(back) + 8) {
    return
  }

  for (let cell = x + 1; cell <= x + 2 + cells(back); cell++) {
    c.put(cell, y, 0x20, edge)
  }

  c.text(x + 2, y, back, mix(COLORS.dim, COLORS.text, 0.4))
  hotspots.push({ agentId: key, x: x + 2, y, w: cells(back) })
}

/**
 * The index the opened call's rail keys its arrows with.
 *
 * The rail emits `detail-up:<index>`, and the tabs use zero upward, so the
 * call takes a number no tab can be. Keyed zero it moved the Prompt tab
 * instead, and the payload a reader was scrolling stayed where it was.
 */
export const CALL_PANE = -1

/**
 * The opened call's output block, which scrolls apart from its argument.
 *
 * Numbered past `CALL_PANE` for the same reason that one is numbered past the
 * tabs: the tabs are still behind the call at the lines they were left on, and
 * a number that indexed into them would move one of those instead.
 */
export const CALL_OUT_PANE = -2

/**
 * The index a nested run's rail keys its arrows with.
 *
 * The run's list is one pane, and it is the only pane in its dialog, so it
 * takes zero — which is also the index the dialog's own scroll is kept under,
 * and there is never a tabbed detail open at the same time to confuse it with:
 * pressing a row of the list is what closes the run and opens the agent.
 */
const RUN_PANE = 0

/**
 * Every agent a nested run ran, one to a row, each of them a press.
 *
 * A nested run is drawn as one row because fourteen agents of somebody else's
 * workflow in the middle of this one's graph is a drawing of the wrong run. The
 * cost of that is a row with no detail behind it: the row carries the figures of
 * the agent that decided the trip, so pressing its name opened that agent alone,
 * and a reader who asked *what did the review panel do* was answered with the
 * last of fourteen answers and no sign of the other thirteen.
 *
 * So the name opens the run. The dialog is the same rectangle an agent's is —
 * a run of fourteen is a list, and a list wants the width — and the list is the
 * index: state, name, what it answered, what it took and spent, one row each,
 * every row the same height. Pressing a row opens that agent in full, and
 * `◂ Back` on it returns here.
 *
 * Unfolding the run in the drawing does the other thing this could have done:
 * stands every agent as a node, in the graph, with its wires. The two are for
 * different questions. Unfolded answers *where in the run did this happen*;
 * the list answers *what did it do*, without giving up the shape of the run
 * that called it.
 */
function paintRun(
  c: Canvas,
  phase: string,
  inside: AgentRow[],
  nowMs: number,
  rect: Rect,
  scroll: number,
  tick: number,
  hotspots: Hotspot[],
): DetailPane {
  const state = runStateOf(inside)
  const color = colorOf(state)
  const last = rect.y + rect.h - 1
  const right = rect.x + rect.w - 1
  const edge = mix(COLORS.dim, COLORS.text, 0.35)

  c.fill(rect.x, rect.y, rect.w, rect.h, c.background)

  for (let dx = 1; dx < rect.w - 1; dx++) {
    c.put(rect.x + dx, rect.y, LIGHT.across, edge)
    c.put(rect.x + dx, last, LIGHT.across, edge)
  }

  for (let dy = 1; dy < rect.h - 1; dy++) {
    c.put(rect.x, rect.y + dy, LIGHT.down, edge)
    c.put(right, rect.y + dy, LIGHT.down, edge)
  }

  c.put(rect.x, rect.y, LIGHT.tl, edge)
  c.put(right, rect.y, LIGHT.tr, edge)
  c.put(rect.x, last, LIGHT.bl, edge)
  c.put(right, last, LIGHT.br, edge)

  const closeX = right - 4
  const footY = last - 1
  const ruleY = footY - 1

  paintDialogTitle(
    c,
    rect.x,
    rect.y,
    right,
    [
      { text: String.fromCodePoint(markOf(state, tick)), color },
      // Without the marker the phase name carries. ▸ means *press to unfold*
      // and is the one thing a reader has already done by the time they are
      // looking at this; left on, the title reads as a control.
      {
        text: runName(
          phase.startsWith(FOLD_SHUT) ? phase.slice(FOLD_SHUT.length) : phase,
          Math.max(1, closeX - rect.x - 8),
        ),
        color: COLORS.text,
      },
    ],
    edge,
  )

  c.put(closeX, rect.y, 0x20, edge)
  c.put(closeX + 1, rect.y, CLOSE_MARK, mix(COLORS.dim, COLORS.text, 0.4))
  c.put(closeX + 2, rect.y, 0x20, edge)
  hotspots.push({ agentId: DETAIL_CLOSE, x: closeX, y: rect.y, w: 3 })

  if (ruleY > rect.y) {
    paintCrossbar(c, rect, ruleY, edge)
  }

  // What the whole run came to, in the fields the pane spells these in
  // everywhere else. The count of agents is the one figure that is only true of
  // a run — it is what the row the reader pressed was saying — so it stays on
  // the foot rather than being left to the length of a list they have to
  // scroll to the end of.
  const done = inside.filter(a => a.state === 'done').length
  const from = Math.min(...inside.map(a => a.startedMs))
  const ended = inside.every(a => a.endedMs !== undefined)
  const until = ended ? Math.max(...inside.map(a => a.endedMs ?? a.startedMs)) : nowMs
  const spent = inside
    .map(a => a.tokens ?? a.liveTokens)
    .filter((n): n is number => n !== undefined)
    .reduce((sum, n) => sum + n, 0)
  const facts: Field[] = [
    { text: `${stateWord(state) || 'running'} ${done}/${inside.length}`, color },
    { text: `${CLOCK_MARK} ${elapsed(until - from)}`, color: COLORS.clock },
    { text: spent > 0 ? tokensNamed(spent) : '', color: COLORS.spend },
    { text: `${FLEET_MARK} ${inside.length}`, color: COLORS.dim },
  ].filter(f => f.text.length > 0)
  const footRoom = Math.max(0, right - rect.x - 3)
  const ruled = divided(facts)

  drawFields(
    c,
    rect.x + 2,
    footY,
    footRoom,
    widthOf(ruled, 1) <= footRoom ? ruled : facts,
    widthOf(ruled, 1) <= footRoom ? 1 : 3,
  )

  const bodyY = rect.y + 1
  const rows = Math.max(0, ruleY - bodyY)
  const inner: Rect = { x: rect.x + 1, y: bodyY, w: rect.w - 2, h: rows }

  if (rows < 1) {
    return { total: 0, visible: 0, scroll: 0 }
  }

  const longest = Math.max(4, ...inside.map(a => cells(a.label)))
  const nameW = (w: number) => Math.min(longest, 24, Math.max(4, Math.floor(w * 0.3)))

  return paintTabBody(
    c,
    inner,
    {
      tab: phase,
      plain: true,
      lines: w => inside.map(agent => agentRow(agent, nowMs, tick, w, nameW(w))),
    },
    scroll,
    RUN_PANE,
    hotspots,
  )
}

/**
 * The state a run of several agents is in.
 *
 * The same reckoning the mark on the folded row makes, and for the same reason:
 * one agent of fourteen failing is the run failing, because that is what the
 * workflow that called it does with the answer.
 */
function runStateOf(inside: AgentRow[]): AgentRow['state'] {
  return inside.some(a => a.state === 'failed')
    ? 'failed'
    : inside.some(a => a.state === 'running')
      ? 'running'
      : inside.some(a => a.state === 'stopped')
        ? 'stopped'
        : 'done'
}

/**
 * One agent of a nested run as one row: what it was, what it answered, what it
 * took and spent.
 *
 * Built like a call's row and for the same reason — a list read as a sequence
 * has to have rows of one height — so the two read alike, which is the point:
 * a reader who has used the Calls list knows what pressing one of these does.
 *
 * What it answered rather than what it was asked. The prompts inside one nested
 * run are near-identical by design — a panel hands its six reviewers the same
 * brief with one line changed — so a column of them tells a reader nothing,
 * while the first line of each answer is the one thing that differs.
 */
function agentRow(agent: AgentRow, nowMs: number, tick: number, width: number, nameW: number): DetailLine {
  const running = agent.state === 'running'
  const color = colorOf(agent.state)
  const quiet = mix(COLORS.text, color, 0.3)
  const until = agent.endedMs ?? nowMs
  const tailWith = (form: (n: number) => string): Field[] =>
    [
      { text: `${CLOCK_MARK} ${elapsed(until - agent.startedMs)}`, color: COLORS.clock },
      {
        text: (agent.tokens ?? agent.liveTokens) === undefined ? '' : form((agent.tokens ?? agent.liveTokens) as number),
        color: COLORS.spend,
      },
    ].filter(f => f.text.length > 0)

  const lead = 3 + nameW + 2
  const ladder = [tailWith(tokensNamed), tailWith(tokensWide), tailWith(tokensNamed).slice(0, 1), []]
  const fits = (row: Field[]) => lead + (row.length > 0 ? widthOf(row, 2) + 2 : 0) + 24 <= width
  const tail = ladder.find(fits) ?? ladder[ladder.length - 1]
  const tailW = tail.length > 0 ? widthOf(tail, 2) : 0
  const room = Math.max(4, width - lead - (tailW > 0 ? tailW + 2 : 0))
  const name = truncate(agent.label, nameW)
  // Nothing read back yet says nothing, not a blank: an agent's answer is read
  // from its transcript the first time its own dialog is opened, and a list of
  // fourteen that has never been opened would otherwise be fourteen names and
  // no sign that there is anything behind them.
  const said = truncate(
    flatten(agent.resultPreview ?? agent.result ?? (running ? 'running' : agent.model ?? '')),
    room,
  )

  return {
    text: '',
    color,
    fields: [
      { text: String.fromCodePoint(markOf(agent.state, tick)), color },
      { text: `${name}${' '.repeat(Math.max(0, nameW - cells(name)))}`, color: quiet },
      { text: said, color: quietOf(COLORS.text) },
    ],
    right: tail,
    press: { key: agent.agentId, at: 3, w: Math.max(0, lead - 3 + cells(said)) },
  }
}

/**
 * One tool call, whole: what it was passed, what it answered, what it cost.
 *
 * The Calls list is an index — one row a call, every row the same height, the
 * argument cut where the row runs out — and an index has to be able to hand a
 * reader the thing it indexes. This is that thing. It takes the same rectangle
 * the agent's detail took rather than opening as a smaller box inside it,
 * because what it holds is a command or a patch or a query: the content that
 * most wants width on the whole pane, and the content a box inside a box would
 * have wrapped every five words.
 *
 * So it replaces the detail rather than covering part of it, and says so with
 * the way back in the corner it came from. `◂ Back` returns to the list at the
 * row it was left on — the tab and its scroll are untouched while this is open
 * — and `✕` shuts the reading altogether, which is what a reader who has
 * finished with the agent as well as the call wants.
 *
 * The argument keeps its own line breaks and its paths whole, folded rather
 * than word-wrapped: a command is a thing a reader checks character by
 * character, and one rewrapped at the spaces is a command they cannot check.
 */
function paintCall(
  c: Canvas,
  call: ToolCall,
  nowMs: number,
  rect: Rect,
  scroll: { arg: number; out: number },
  live: boolean,
  hotspots: Hotspot[],
): { arg: DetailPane; out?: DetailPane; split?: number } {
  const running = live && call.startedMs > 0 && call.endedMs === undefined
  const color = running ? COLORS.running : call.isError ? COLORS.failed : COLORS.done
  const last = rect.y + rect.h - 1
  const right = rect.x + rect.w - 1
  const edge = mix(COLORS.dim, COLORS.text, 0.35)

  c.fill(rect.x, rect.y, rect.w, rect.h, c.background)

  for (let dx = 1; dx < rect.w - 1; dx++) {
    c.put(rect.x + dx, rect.y, LIGHT.across, edge)
    c.put(rect.x + dx, last, LIGHT.across, edge)
  }

  for (let dy = 1; dy < rect.h - 1; dy++) {
    c.put(rect.x, rect.y + dy, LIGHT.down, edge)
    c.put(right, rect.y + dy, LIGHT.down, edge)
  }

  c.put(rect.x, rect.y, LIGHT.tl, edge)
  c.put(right, rect.y, LIGHT.tr, edge)
  c.put(rect.x, last, LIGHT.bl, edge)
  c.put(right, last, LIGHT.br, edge)

  const closeX = right - 4
  const footY = last - 1
  const ruleY = footY - 1

  paintDialogTitle(
    c,
    rect.x,
    rect.y,
    right,
    [
      { text: running ? '\u2026' : call.isError ? '\u2716' : '\u2714', color },
      { text: truncate(call.name, Math.max(1, closeX - rect.x - 18)), color: COLORS.text },
    ],
    edge,
  )

  paintBack(c, rect.x, rect.y, closeX, edge, CALL_BACK, hotspots)

  c.put(closeX, rect.y, 0x20, edge)
  c.put(closeX + 1, rect.y, CLOSE_MARK, mix(COLORS.dim, COLORS.text, 0.4))
  c.put(closeX + 2, rect.y, 0x20, edge)
  hotspots.push({ agentId: DETAIL_CLOSE, x: closeX, y: rect.y, w: 3 })

  if (ruleY > rect.y) {
    paintCrossbar(c, rect, ruleY, edge)
  }

  const until = call.endedMs ?? (running ? nowMs : undefined)
  const facts: Field[] = [
    { text: call.isError ? 'failed' : running ? 'running' : 'done', color },
    {
      text: call.startedMs > 0 && until !== undefined ? `${CLOCK_MARK} ${elapsed(until - call.startedMs)}` : '',
      color: COLORS.clock,
    },
    { text: call.stepTokens === undefined ? '' : tokensNamed(call.stepTokens), color: COLORS.spend },
    { text: call.step === undefined ? '' : `${REQUEST_MARK} ${call.step}`, color: COLORS.dim },
  ].filter(f => f.text.length > 0)
  const footRoom = Math.max(0, right - rect.x - 3)
  const ruled = divided(facts)

  drawFields(
    c,
    rect.x + 2,
    footY,
    footRoom,
    widthOf(ruled, 1) <= footRoom ? ruled : facts,
    widthOf(ruled, 1) <= footRoom ? 1 : 3,
  )

  const bodyY = rect.y + 1
  const rows = Math.max(0, ruleY - bodyY)

  if (rows < 1) {
    return { arg: { total: 0, visible: 0, scroll: 0 } }
  }

  const across = { x: rect.x + 1, w: rect.w - 2 }
  const body = (y: number, h: number) => ({ ...across, y, h })

  // A shelf over each compartment and one between them, so the two are
  // compartments of this box rather than two runs of text in one block. Set
  // into the frame at both ends — the idiom the tab strip and the figures rule
  // already use — and standing still while the rows under them move, which a
  // rule drawn into the block itself cannot do: it scrolled away with the
  // fourth line, and what was left was one slab of somebody else's text with no
  // word anywhere saying where the argument stopped and the answer started.
  if (call.result === undefined || rows < 4) {
    return {
      arg: paintTabBody(
        c,
        body(bodyY, rows),
        { tab: call.name, lines: w => callBody(call, w) },
        scroll.arg,
        CALL_PANE,
        hotspots,
      ),
    }
  }

  // The argument takes the rows it needs and no more, up to a third of the box.
  // A command is a line or three and an answer is a hundred, so an even split
  // would stand two blank rows over every diff; and a payload that runs long is
  // still a payload, which is the reading a reader came for less often than the
  // answer. Past the cap it keeps its own bar and scrolls.
  const textW = Math.max(8, across.w - 3)
  const room = rows - 2
  const argH = Math.max(1, Math.min(callArgLines(call, textW).length, Math.max(1, Math.floor(room / 3))))
  const split = bodyY + 1 + argH

  paintCrossbar(c, rect, bodyY, edge, sectionWord(call))
  paintCrossbar(c, rect, split, edge, 'output')

  return {
    arg: paintTabBody(
      c,
      body(bodyY + 1, argH),
      { tab: call.name, lines: w => callArgLines(call, w) },
      scroll.arg,
      CALL_PANE,
      hotspots,
    ),
    out: paintTabBody(
      c,
      body(split + 1, room - argH),
      { tab: call.name, lines: w => callOutLines(call, w) },
      scroll.out,
      CALL_OUT_PANE,
      hotspots,
    ),
    split,
  }
}

/**
 * One line of a call's text, as the coloured runs it reads in.
 *
 * Tone and not hue, and three weights at most. Colour in this pane says what
 * state a node is in or that a line is a wire; a third meaning taken on here
 * would cost the first two theirs. So a line is the block's own grey, lifted
 * for the part that identifies the line and dropped for the punctuation holding
 * it together — and a reader who does not notice reads exactly the text that
 * was there before, in the weight it was in.
 */
type Lighter = (line: string, width: number, tone: Rgb) => DetailLine[]

/**
 * The three weights a call's text is set in, off whatever tone it is given.
 *
 * The drop is a third of the way to `dim` rather than half. At half it fell
 * below 3.0 against the block's ground in four themes, which is the bar a
 * reader has to lean in past; a third keeps it above 4.0 everywhere the block's
 * own tone is above 4.0, so the setback costs nobody the words.
 */
function weightsOf(tone: Rgb): { lift: Rgb; base: Rgb; drop: Rgb } {
  return {
    lift: mix(tone, COLORS.text, 0.55),
    base: tone,
    drop: mix(tone, COLORS.dim, 0.35),
  }
}

/**
 * The runs of one line, folded to the width, with each run cut at the fold.
 *
 * `folded` wraps a line and indents what carries over; this does the same and
 * carries the weights over with it, so a path that spans two rows is the same
 * path on both of them.
 *
 * A colour per character rather than a walk over the runs: the runs are built by
 * one matcher a line, the folds are decided by another rule entirely, and
 * keeping the two in step by arithmetic is how an off-by-one puts a command's
 * own name in the weight of its flags.
 */
function litLines(runs: Field[], width: number, tone: Rgb): DetailLine[] {
  const whole = runs.map(r => r.text).join('')
  const paint: Rgb[] = []

  for (const run of runs) {
    for (let i = 0; i < run.text.length; i++) {
      paint.push(run.color)
    }
  }

  /** One row's characters as the fewest runs that say the same thing. */
  const runsOf = (from: number, to: number, pad: string): Field[] => {
    const out: Field[] = pad.length > 0 ? [{ text: pad, color: tone }] : []

    for (let i = from; i < to; i++) {
      const color = paint[i] ?? tone
      const last = out[out.length - 1]

      if (last && last.color === color && !(pad.length > 0 && out.length === 1)) {
        last.text += whole[i]
      } else {
        out.push({ text: whole[i] ?? '', color })
      }
    }

    return out
  }

  if (whole.length <= width || width < 8) {
    const to = Math.min(whole.length, width)

    return [{ text: truncate(whole, width), color: tone, runs: runsOf(0, to, '') }]
  }

  const lead = whole.length - whole.trimStart().length
  const indent = ' '.repeat(Math.min(Math.floor(width / 2), lead + 2))
  const out: DetailLine[] = [{ text: whole.slice(0, width), color: tone, runs: runsOf(0, width, '') }]
  let at = width

  while (at < whole.length && out.length < 40) {
    const room = width - indent.length
    const to = Math.min(whole.length, at + room)

    out.push({ text: indent + whole.slice(at, to), color: tone, runs: runsOf(at, to, indent) })
    at = to
  }

  return out
}

/**
 * A path, with everything before the last slash dropped back a weight.
 *
 * The directory is context and the file is the answer: a list of twelve reads
 * off one repository is twelve rows whose first sixty cells are the same sixty
 * cells, and the name a reader is looking for is the tail of each.
 */
function pathRuns(text: string, weights: ReturnType<typeof weightsOf>): Field[] {
  const cut = text.lastIndexOf('/')

  return cut <= 0
    ? [{ text, color: weights.lift }]
    : [
        { text: text.slice(0, cut + 1), color: weights.drop },
        { text: text.slice(cut + 1), color: weights.lift },
      ]
}

/**
 * A shell line as its parts: what runs, what it is told, and what joins them.
 *
 * The word after the start of a line or after an operator is the command being
 * run and stands a weight up; the operators and redirections that join them drop
 * a weight, since they are the sentence's punctuation and a reader scanning for
 * what ran is scanning past them. A quoted string is one thing however many
 * words are inside it, so it keeps its own weight all through rather than having
 * its first word lifted as a command.
 */
function shellRuns(text: string, weights: ReturnType<typeof weightsOf>): Field[] {
  const out: Field[] = []
  // A word begins a command where the line begins, or where an operator left
  // off. `git status && git diff` runs two things and names both.
  let heads = true

  for (const [piece] of text.matchAll(/"[^"]*"|'[^']*'|[|&;<>]+|\s+|[^\s|&;<>]+/g)) {
    if (/^\s+$/.test(piece)) {
      out.push({ text: piece, color: weights.base })

      continue
    }

    if (/^[|&;<>]+$/.test(piece)) {
      out.push({ text: piece, color: weights.drop })
      heads = true

      continue
    }

    if (/^["']/.test(piece)) {
      out.push({ text: piece, color: weights.base })
      heads = false

      continue
    }

    if (heads) {
      out.push({ text: piece, color: weights.lift })
      heads = false

      continue
    }

    // A flag is the one part of an argument list that is the tool's own word
    // rather than the caller's, so it reads with the punctuation.
    out.push({ text: piece, color: /^-/.test(piece) ? weights.drop : weights.base })
  }

  return out.length > 0 ? out : [{ text, color: weights.base }]
}

/**
 * A line of a call's payload: its key set back, its value set in what it is.
 *
 * A payload is `key: value` a line, and the keys are the same handful over and
 * over — `command`, `file_path`, `pattern`. They say which field a reader is
 * looking at and nothing about the call, so they go back a weight and the value
 * comes forward.
 */
function payloadLines(line: string, width: number, tone: Rgb): DetailLine[] {
  const weights = weightsOf(tone)
  const keyed = /^(\s*)([A-Za-z_][\w.]*):\s(.*)$/.exec(line)

  if (!keyed) {
    return litLines(valueRuns(line, weights), width, tone)
  }

  const [, lead, key, value] = keyed as unknown as [string, string, string, string]

  return litLines(
    [
      { text: `${lead}${key}: `, color: weights.drop },
      ...valueRuns(value, weights, key),
    ],
    width,
    tone,
  )
}

/** A payload value, read as the kind of thing its key says it is. */
function valueRuns(value: string, weights: ReturnType<typeof weightsOf>, key?: string): Field[] {
  if (key === 'command') {
    return shellRuns(value, weights)
  }

  if (value.startsWith('/') || /path$/.test(key ?? '')) {
    return pathRuns(value, weights)
  }

  return [{ text: value, color: weights.base }]
}

/**
 * A line of what a tool printed back.
 *
 * Two things are set apart and nothing else is. A `Read` answers with its own
 * line numbers down the left, which are the tool's counting and not the file's
 * text; and the first column of a status or a diff is a mark rather than a word.
 * The rest is left exactly as the tool wrote it, because a pane that decides
 * which parts of somebody else's output matter is a pane editing it.
 */
function outputLines(line: string, width: number, tone: Rgb): DetailLine[] {
  const weights = weightsOf(tone)
  const gutter = /^(\s*\d+\t)(.*)$/.exec(line)

  if (gutter) {
    const [, number, rest] = gutter as unknown as [string, string, string]

    return litLines([{ text: number, color: weights.drop }, { text: rest, color: weights.base }], width, tone)
  }

  // `git status --porcelain` answers in two columns of mark and a space, and a
  // diff in one. Both say what happened to the file named after them, which is
  // the part of the row a reader scans down.
  const marked = /^(?![ ]{2})([ MADRCU?!]{2} |[-+] )(?=\S)(.*)$/.exec(line)

  if (marked) {
    const [, mark, rest] = marked as unknown as [string, string, string]

    return litLines([{ text: mark, color: weights.lift }, { text: rest, color: weights.base }], width, tone)
  }

  return litLines([{ text: line, color: weights.base }], width, tone)
}

/**
 * How much of a long value is kept at each end of it, in rows of the block.
 *
 * A tool that answers with four hundred lines is answering a question the
 * reader did not ask twice. What they came for is at one end or the other — the
 * command that ran and what it printed first, or the error it ended on — and
 * the middle is what the scroll bar is for everywhere else in this dialog. Here
 * the value is one run of text rather than a reading with a shape, so scrolling
 * it is scrolling a wall.
 */
const KEEP_ROWS = 12

/**
 * A rule with a word set into it, opening a section of the call's reading.
 */
function sectionRule(word: string, width: number, tone: Rgb): DetailLine {
  const rule = String.fromCodePoint(LIGHT.across)
  const said = ` ${word} `

  return {
    text: `${rule.repeat(2)}${said}${rule.repeat(Math.max(0, width - 2 - said.length))}`,
    color: tone,
  }
}

/**
 * One value's lines, with the middle of a long one left out and said so.
 *
 * The first and last of it rather than the first of it: a build log's last line
 * is the verdict, and a value cut off at the front kept the part a reader had
 * already guessed and dropped the one they opened the call for. What is left
 * out is counted in the rule that stands where it was, so nothing goes missing
 * quietly.
 */
function valueLines(text: string, width: number, tone: Rgb, lit?: Lighter): DetailLine[] {
  const keep = width * KEEP_ROWS
  const draw = (part: string): DetailLine[] => {
    const out: DetailLine[] = []

    for (const line of part.split('\n')) {
      if (!line.trim()) {
        if (out.length > 0) {
          out.push({ text: '', color: tone })
        }

        continue
      }

      out.push(...(lit ? lit(line, width, tone) : folded(line, width, tone)))
    }

    return out
  }

  if (text.length <= keep * 2) {
    return draw(text)
  }

  // Cut where the value already breaks. A slice taken at the character lands
  // mid-word and mid-token, and the first row after the elision reads as
  // nonsense until a reader works out it is the tail of something.
  const head = text.lastIndexOf('\n', keep) + 1 || keep
  const foot = text.indexOf('\n', text.length - keep) + 1 || text.length - keep
  const gone = foot - head

  return [
    ...draw(text.slice(0, head)),
    sectionRule(`\u2026 ${tokens(gone)} characters not shown \u2026`, width, tone),
    ...draw(text.slice(foot)),
  ]
}

/**
 * A call's argument and its answer as the lines of one reading, in two sections.
 *
 * Each is under a rule naming it rather than run straight on: a payload and a
 * result are both somebody else's text, and set against each other with only a
 * blank between them the second reads as more of the first. The payload's rule
 * says `command` where the tool took one and `argument` where it took anything
 * else, because a reader looking at a shell call is looking at a command and
 * calling it an argument is calling it by the wrong name.
 *
 * The result's rule used to be the only one, and said `answered`. Two sections
 * with one heading between them reads as one section with a note in the middle:
 * what is above the heading is the part with no name, and a reader has to work
 * out that it is the call.
 */
/**
 * What the first compartment is called.
 *
 * `command` where the call is a shell line and `argument` where it takes named
 * fields: those are two different things to read, and a reader who sees
 * `command` knows before reading a word that what follows is one.
 */
function sectionWord(call: ToolCall): string {
  return /^command:/.test(call.input) ? 'command' : 'argument'
}

/** The lines of what a call was passed. */
function callArgLines(call: ToolCall, width: number): DetailLine[] {
  return valueLines(call.input, width, quietOf(COLORS.text), payloadLines)
}

/** The lines of what it answered. */
function callOutLines(call: ToolCall, width: number): DetailLine[] {
  return valueLines(call.result ?? '', width, quietOf(COLORS.text), outputLines)
}

/**
 * Both readings in one block, for a dialog too short to give each a shelf.
 *
 * Three rows is a compartment, a shelf and a compartment with nothing in
 * either. Below that the box goes back to one block with the sections ruled off
 * inside it: the words still say which half a row belongs to, and the division
 * scrolls with them rather than standing still.
 */
function callBody(call: ToolCall, width: number): DetailLine[] {
  const tone = quietOf(COLORS.text)
  const out: DetailLine[] = [sectionRule(sectionWord(call), width, tone), ...callArgLines(call, width)]

  if (call.result) {
    out.push({ text: '', color: tone })
    out.push(sectionRule('output', width, tone))
    out.push(...callOutLines(call, width))
  }

  return out
}

/** The key that shows one of the dialog's tabs. */
export const DETAIL_TAB = '@tab:'

/** The press that unfolds a nested run's band, or folds it back to one row. */
export const BAND_OPEN = '@band:'

/**
 * The handle that opens a nested run and folds it back, set into its caption.
 *
 * It used to be a mark and, once the run was open, the word `collapse`. Two
 * faults in that. The mark alone is one cell at the head of a name in the middle
 * of a rule running the width of the pane — a target a reader hits by luck, and
 * a coloured cell besides, which a Button turns into plain text and so strips of
 * the one thing it was saying. And the word only existed in the open state, so
 * the control changed shape the moment it was used: a verb in a rule that
 * otherwise holds nothing but marks, names and counts, arriving from nowhere the
 * first time a reader pressed the mark.
 *
 * So there is one handle, the same shape in both states, and only its mark
 * flips. It says what the row standing for the whole run says — `▸ 8 agents`,
 * the same press in the same words in the two places a reader would try it —
 * and, opened, `▾ 8 agents`, which is that sentence with its state changed
 * rather than a different sentence.
 *
 * It gives way down its own ladder: the count with its unit, the count alone,
 * then the mark. Every rung is drawn on cleared cells with a blank at each end,
 * and the whole cleared span is the press, so even the last rung is three cells
 * wide and nothing coloured is given up to make it pressable.
 */
/**
 * The cells of rule left between a caption and its handle.
 *
 * Set hard against the count the handle read as a fourth field of the caption —
 * mark, name, count, handle — and the name lost the comparison. Two strokes of
 * the rule put it back where it belongs: a second thing set into the same line,
 * which is what it is.
 */
const HANDLE_GAP = 3

function foldRungs(shut: boolean, agents: number): string[] {
  const mark = shut ? FOLD_SHUT : FOLD_OPEN

  return [`${mark}${agents} agents`, `${mark}${agents}`, mark.trimEnd()]
}

/** The widest rung that fits the cells left beside the caption, or none. */
function foldHandle(shut: boolean, agents: number, room: number): string {
  return foldRungs(shut, agents).find(rung => rung.length + 2 <= room) ?? ''
}

/** Draws it, and says whether there was room — a caller with none marks the mark instead. */
function paintFoldHandle(
  c: Canvas,
  phase: string,
  x: number,
  y: number,
  room: number,
  tone: Rgb,
  shut: boolean,
  agents: number,
  hotspots: Hotspot[],
): boolean {
  const text = foldHandle(shut, agents, room)

  if (text === '' || x < 0) {
    return false
  }

  // Cleared before the text goes in, its own blanks included: `c.text` writes no
  // blank, so a rule showing through between the caption and the handle would
  // join them into one token with a line in it.
  for (let dx = 0; dx <= text.length + 1; dx++) {
    c.put(x + dx, y, 0x20, tone)
  }

  c.text(x + 1, y, text, COLORS.dim)
  hotspots.push({ agentId: `${BAND_OPEN}${phase}`, x, y, w: text.length + 2 })

  return true
}

/**
 * The cells a nested run's own mark answers to.
 *
 * Three rather than one, the way the dialog's close mark is three: the glyph is
 * one cell, and a one-cell target is one cell to miss. The two beside it are the
 * blank the caption clears either side of its name and the gap between the mark
 * and the name, so nothing coloured is given up to make them pressable.
 */
function markSpot(phase: string, x: number, y: number, left: number): Hotspot {
  const from = Math.max(left, x - 1)

  return { agentId: `${BAND_OPEN}${phase}`, x: from, y, w: x + 1 - from + 1 }
}


/**
 * The tabs, set into the rule under the title, and where the open one stands.
 *
 * A tab is a Button and a Button carries no colour and no ground, so which one
 * is open cannot be said by tinting it. It is said by the rule instead: the open
 * tab is bracketed out of it, `─┤ Tool Calls (20) ├─`, the way a card is framed
 * rather than filled, and the brackets are cells the Button does not cover.
 *
 * Where the strip will not fit, the tabs give up their counts before any of them
 * gives up a letter of its name, and shorten their names before any of them
 * gives up its place: `Tool Calls (106)` says one more thing than `Tool Calls`,
 * which says one more thing than `Calls`, and a tab whose name has gone is a tab
 * nobody can aim at.
 *
 * The count is in brackets because it is a count of the things behind the tab
 * and not part of what the tab is called. `Calls 106` read as a name with a
 * number loose on the end of it, next to `Prompt` and `Response`, which have
 * none.
 */
function paintTabs(
  c: Canvas,
  x: number,
  y: number,
  width: number,
  sections: Section[],
  on: number,
  hotspots: Hotspot[],
): void {
  const rule = quietOf(c.background)

  for (let dx = 0; dx < width; dx++) {
    c.put(x + dx, y, LIGHT.across, rule)
  }

  // Every tab takes the same cells whether it is open or not — `  name  `, with
  // the open one's brackets standing in the outer two — so the strip never
  // shifts under the pointer at the moment somebody is picking along it.
  const SIDES = 5
  const end = x + width
  const room = width - 2
  const bare = (n: string) => n.replace(/\s+\(\d+\)$/, '')
  // The counts go before any name does, and a name is shortened before a tab is
  // dropped: a tab whose name has gone is a tab nobody can aim at.
  const ladder = [
    sections.map(s => s.tab),
    sections.map(s => bare(s.tab)),
    sections.map(s => bare(s.short ?? s.tab)),
  ]
  const strip = (list: string[]) => list.reduce((w, n) => w + cells(n) + SIDES, 0)
  const shown = ladder.find(list => strip(list) <= room) ?? ladder[ladder.length - 1]!

  let at = x + 3

  shown.forEach((name, i) => {
    const w = cells(name)

    if (at + w + 1 > end) {
      return
    }

    if (i === on) {
      c.put(at - 2, y, 0x2524, COLORS.accent)
      c.put(at + w + 1, y, 0x251c, COLORS.accent)
    }

    c.put(at - 1, y, 0x20, rule)
    c.put(at + w, y, 0x20, rule)
    c.text(at, y, name, i === on ? COLORS.text : COLORS.dim)
    hotspots.push({ agentId: `${DETAIL_TAB}${i}`, x: at, y, w })

    at += w + SIDES
  })
}

/**
 * The open tab's list, the whole width of the dialog, with its bar down the
 * right edge.
 */
function paintTabBody(
  c: Canvas,
  rect: Rect,
  section: Section,
  scroll: number,
  index: number,
  hotspots: Hotspot[],
): DetailPane {
  // The bar stands in the block's last cell and a line wrapped to the whole of
  // the block would end hard against it, which reads as one run of characters.
  const text = Math.max(8, rect.w - 3)
  const lines = section.lines(text)
  const total = lines.length
  const first = Math.max(0, Math.min(scroll, Math.max(0, total - rect.h)))
  const pane: DetailPane = { total, visible: rect.h, scroll: first }

  // The block's own ground, a step up from the pane's: what an agent was asked
  // and what it answered is quoted material, and quoted material set straight on
  // the pane reads as the pane talking. The bar stays outside it — its arrows
  // are press targets, and a press target is emitted as a Button, which carries
  // no ground of its own.
  if (section.plain !== true) {
    c.fill(rect.x, rect.y, text + 2, rect.h, quoteOf(c.background))
  }

  lines.slice(first, first + rect.h).forEach((line, row) => {
    const y = rect.y + row
    const at = rect.x + 1

    if (line.press && line.press.w > 0) {
      hotspots.push({ agentId: line.press.key, x: at + line.press.at, y, w: Math.min(line.press.w, text - line.press.at) })
    }

    if (line.runs) {
      let dx = 0

      for (const run of line.runs) {
        if (dx >= text) {
          break
        }

        c.text(at + dx, y, run.text, run.color, line.bg, text - dx)
        dx += cells(run.text)
      }

      return
    }

    if (!line.fields && !line.right) {
      c.text(at, y, line.text, line.color, line.bg, text)

      return
    }

    const tail = line.right ?? []
    const tailW = tail.length > 0 ? widthOf(tail, 2) : 0

    drawFields(c, at, y, Math.max(0, text - (tailW > 0 ? tailW + 2 : 0)), line.fields ?? [], 2)

    if (tailW > 0 && text > tailW + 4) {
      drawRight(c, at + text, y, tail, 2)
    }
  })

  if (total > rect.h) {
    paintScrollbar(c, rect.x + rect.w - 1, rect.y, rect.h, pane, index, hotspots)
  }

  return pane
}

/**
 * The bar down a block's right edge: an arrow at each end of the list and the
 * thumb between them.
 *
 * The arrows are where the list runs out, which is where a reader looking for
 * more of it is already looking — the top arrow above the first line, the
 * bottom one under the last. Spent, an arrow stays in place and goes grey
 * rather than disappearing, which would shift the other one under the pointer
 * at the moment someone is pressing it repeatedly.
 *
 * They are drawn in code points and colour alone, with no ground of their own.
 * A press target is emitted as a Button, a Button carries no background, and
 * the cells it covers are the cells a tint would have gone in — so the tint
 * was drawn into the canvas and then thrown away, leaving one row of the dialog
 * a shade off from the rows around it.
 */
/**
 * What a scroll rail costs the drawing beside it: the rail itself, and a
 * column of air, so a node's last cell never touches the thumb.
 */
const RAIL_W = 2

/** Track a rail needs between its two arrows before it can say anything. */
const RAIL_MIN = 2

/**
 * Where the thumb sits on a track, and how long it is.
 *
 * A rail says two things at once: how much of the drawing is on the pane, and
 * whereabouts in it. The thumb is never shorter than a cell, so a very long run
 * still has something to look at, and it reaches the end of the track exactly
 * when the drawing does.
 */
function thumbOn(track: number, at: number, span: number, shown: number): { from: number; size: number } {
  const whole = span + shown
  const size = Math.max(1, Math.min(track, Math.round((shown / Math.max(1, whole)) * track)))

  return { from: span === 0 ? 0 : Math.round((at / span) * (track - size)), size }
}

/**
 * The rail down the right of the body, and the presses that move it.
 *
 * The pane used to answer a drawing too tall for it with `… 38 more` on the
 * last row: a number the reader could read and not act on. A rail is the same
 * fact told as a place, and the place can be moved.
 */
function paintBodyRail(
  c: Canvas,
  x: number,
  y: number,
  rows: number,
  at: number,
  span: number,
  hotspots: Hotspot[],
): void {
  // The rail owns its column and the one before it. Full-width furniture — a
  // band's rule, the dashes over the phases the run skipped — is drawn to the
  // pane's own edge, and a rule running under the thumb reads as one line, not
  // as a drawing and a control beside it.
  c.fill(x - RAIL_W + 1, y, RAIL_W, rows, c.background)

  const key = (row: number, glyph: number, live: boolean, id: string) => {
    c.put(x, row, glyph, live ? COLORS.accent : COLORS.idle)

    if (live) {
      hotspots.push({ agentId: id, x, y: row, w: 1 })
    }
  }

  key(y, ARROW_UP, at > 0, 'body-up')
  key(y + rows - 1, ARROW_DOWN, at < span, 'body-down')

  const track = rows - 2

  if (track < 1) {
    return
  }

  const thumb = thumbOn(track, at, span, rows)

  for (let row = 0; row < track; row++) {
    const filled = row >= thumb.from && row < thumb.from + thumb.size

    c.put(x, y + 1 + row, filled ? 0x2588 : 0x2502, filled ? COLORS.dim : COLORS.track)
  }
}

/**
 * The rail along the foot of the body, for a drawing wider than the pane.
 *
 * Only the flow layout can overrun sideways — a stack divides the width it is
 * given — so this row is given up rarely, and only where the alternative is a
 * run whose later phases are off the edge with nothing to say so.
 */
function paintFootRail(
  c: Canvas,
  y: number,
  width: number,
  at: number,
  span: number,
  shown: number,
  hotspots: Hotspot[],
): void {
  const key = (x: number, glyph: number, live: boolean, id: string) => {
    c.put(x, y, glyph, live ? COLORS.accent : COLORS.idle)

    if (live) {
      hotspots.push({ agentId: id, x, y, w: 1 })
    }
  }

  c.fill(0, y, width, 1, c.background)
  key(0, ARROW_LEFT, at > 0, 'body-left')
  key(width - 1, ARROW_RIGHT, at < span, 'body-right')

  const track = width - 2

  if (track < 1) {
    return
  }

  const thumb = thumbOn(track, at, span, shown)

  for (let col = 0; col < track; col++) {
    const filled = col >= thumb.from && col < thumb.from + thumb.size

    c.put(1 + col, y, filled ? 0x2588 : 0x2500, filled ? COLORS.dim : COLORS.track)
  }
}

function paintScrollbar(
  c: Canvas,
  x: number,
  y: number,
  rows: number,
  pane: DetailPane,
  index: number,
  hotspots: Hotspot[],
): void {
  const key = (at: number, glyph: number, live: boolean, id: string) => {
    c.put(x, at, glyph, live ? COLORS.accent : COLORS.idle)

    if (live) {
      hotspots.push({ agentId: id, x, y: at, w: 1 })
    }
  }

  key(y, ARROW_UP, pane.scroll > 0, `detail-up:${index}`)
  key(y + rows - 1, ARROW_DOWN, pane.scroll + pane.visible < pane.total, `detail-down:${index}`)

  // Between the arrows, the thumb: how much of the list is on screen, and
  // whereabouts in it. Two rows is both arrows and no track to draw it on.
  const track = rows - 2

  if (track < 1) {
    return
  }

  const thumb = Math.max(1, Math.round((pane.visible / pane.total) * track))
  const at = Math.round((pane.scroll / Math.max(1, pane.total - pane.visible)) * (track - thumb))

  for (let row = 0; row < track; row++) {
    const filled = row >= at && row < at + thumb

    c.put(x, y + 1 + row, filled ? 0x2588 : 0x2502, filled ? COLORS.dim : COLORS.track)
  }
}

/** The colour a run's status reads in. */
/**
 * Which models the run's agents ran on, commonest first, as the tags the nodes
 * themselves carry, with the count in front where a multiplier belongs.
 */
/**
 * Which tools were called, and how many times each, over a set of agents.
 *
 * Two sources say this and they do not overlap. The live chain counts a call
 * the moment it is made, so a run being watched has the tally on every agent;
 * a run read back from disk has the calls themselves for whichever agents the
 * reader has opened, and nothing for the rest. Each agent is asked for the one
 * it has, so a watched run and a replayed one both say what they know rather
 * than one of them saying nothing.
 */
function toolsOf(agents: AgentRow[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()

  for (const agent of agents) {
    const used =
      agent.tools.length > 0
        ? agent.tools.map(t => ({ name: t.name, count: t.count }))
        : (agent.calls ?? []).map(call => ({ name: call.name, count: 1 }))

    for (const tool of used) {
      counts.set(tool.name, (counts.get(tool.name) ?? 0) + tool.count)
    }
  }

  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/**
 * The tools as a row of fields: how many calls in all, then the ones called
 * most, each with its own count.
 *
 * The same shape the models are given, because it answers the same kind of
 * question: the total is what the run did, and the breakdown is what it did it
 * with. `⚙ 24` alone says an agent was busy; `5×Read 3×Bash` says it was reading
 * the repository, which is the part a reader can act on.
 */
function toolFields(agents: AgentRow[], most: number): Field[] {
  const tools = toolsOf(agents)
  // The journal's own per-agent figure, which is a count with no names against
  // it. It is the only thing a run read back off disk knows about the agents
  // whose transcripts nobody has opened, and a total that counts those agents
  // is a truer total than one that quietly leaves them out.
  const counted = agents.reduce((sum, agent) => sum + (agent.toolCalls ?? 0), 0)
  const calls = Math.max(
    tools.reduce((sum, tool) => sum + tool.count, 0),
    counted,
  )

  if (calls === 0) {
    return []
  }

  return [
    { text: `${TOOL_MARK} ${calls}`, color: COLORS.dim },
    ...tools.slice(0, most).map(tool => ({
      text: tools.length === 1 && tool.count === calls ? tool.name : `${tool.count}×${tool.name}`,
      color: mix(COLORS.dim, COLORS.accent, 0.5),
    })),
  ]
}

/** The same tally on one row, for a place that sets a stroke between its fields. */
function toolLine(agents: AgentRow[], most: number): string {
  return toolFields(agents, most)
    .map(field => field.text)
    .join('  ')
}

function modelsOf(run: RunState): { name: string; count: number }[] {
  const counts = new Map<string, number>()

  for (const agent of run.agents) {
    const name = modelName(agent.model ?? run.defaultModel)

    if (name) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }

  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * A phase caption's colour. A phase with work in it is read at full strength,
 * one with an agent still going takes the selection colour, and one nothing has
 * entered yet is drawn at the weight of the thing it is: nothing yet.
 */
function captionTone(active: boolean, agents: number, skipped: boolean): Rgb {
  return skipped ? COLORS.stopped : active ? COLORS.accent : agents > 0 ? COLORS.text : COLORS.idle
}

/**
 * Whether the run is over.
 *
 * What it settles is everything the pane says about work that never started.
 * While the run is going, a phase nothing has entered is ahead of it. Once the
 * run stops, that phase is not ahead of anything — the pane calling it ahead is
 * the pane saying the run will get to it, and it will not. It was skipped, and
 * a reader looking at a finished run needs to be able to tell at a glance which
 * of its phases did work and which never ran.
 */
function overOf(run: RunState): boolean {
  return run.status !== 'running'
}

function runColorOf(run: RunState): Rgb {
  return run.status === 'running'
    ? COLORS.running
    : run.status === 'completed'
      ? COLORS.done
      : run.status === 'stopped'
        ? COLORS.stopped
        : COLORS.failed
}

/**
 * One measurement on the run line: what it is called, what it says, and what it
 * says when the pane is too narrow to say all of it.
 *
 * Every group names what it measures, because a row of bare numbers is a row a
 * reader decodes from position alone, and the positions move as the figures
 * change width. Which end the name goes is not a matter of taste: where the
 * unit is a word it follows the figure, as anyone would say it — `2.8k tokens`,
 * `10 agents` — and where the figure carries its own unit the name has to come
 * first, since `1m28s run time` is not a phrase anyone uses.
 */
type Group = {
  /** Drawn quiet, ahead of the fields. Empty where the fields name themselves. */
  name: string
  fields: Field[]
  /**
   * The same fact in fewer cells, widest first. Each is tried in turn before
   * the group is dropped, so a figure with three spellings gives up two of them
   * before it gives up the row.
   */
  short?: Field[][]
  /** The order the groups give way in: the highest goes first. */
  drop: number
}

/**
 * The groups with a stroke set between each, so one measurement cannot be read
 * as part of the next. A top line of figures separated by spaces alone reads as
 * one long figure with gaps in it: the strokes say where each ends, and what
 * belongs to one measurement — `10 agents  7×Haiku 4.5` — is what sits between
 * one stroke and the next.
 */
function ruled(groups: Group[]): Field[] {
  // The tone every other divider on the pane takes. It used to be its own mix,
  // seven hundredths off `quietOf`, which is a difference nobody can see and
  // one more number to keep in step.
  const tone = quietOf(DEFAULT_COLOR)
  const out: Field[] = []

  groups.forEach((group, i) => {
    if (i > 0) {
      out.push({ text: ` ${String.fromCodePoint(SEP_V)} `, color: tone })
    }

    if (group.name) {
      out.push({ text: `${group.name} `, color: COLORS.dim })
    }

    group.fields.forEach((field, j) => {
      if (j > 0) {
        out.push({ text: '  ', color: tone })
      }

      out.push(field)
    })
  })

  return out
}

/**
 * The groups that fit, in order, with the ones that do not given up — first by
 * saying less where a group has a shorter form, then by dropping the group
 * outright. Both go by the same rank, so the sparkline gives way before the
 * fleet, the fleet before what it spent, and the clock never gives way at all.
 */
function fitted(groups: Group[], room: number): Group[] {
  // The ladders are copied, not shared: `fitted` walks down them as it squeezes,
  // and the groups it was handed are drawn again on the next frame.
  const kept: Group[] = groups.map(g => ({ ...g, short: g.short ? [...g.short] : undefined }))
  const worst = (gs: Group[], want: (g: Group) => boolean) =>
    gs.filter(want).sort((a, b) => b.drop - a.drop)[0]

  while (kept.length > 0 && widthOf(ruled(kept), 0) > room) {
    const shrink = worst(kept, g => (g.short?.length ?? 0) > 0)

    if (shrink?.short) {
      shrink.fields = shrink.short.shift() as Field[]

      if (shrink.short.length === 0) {
        shrink.short = undefined
      }

      continue
    }

    const gone = worst(kept, () => true)

    kept.splice(kept.indexOf(gone), 1)
  }

  return kept
}

/** The width a row of fields takes, drawn with `gap` cells between each. */

function widthOf(fields: Field[], gap: number): number {
  return fields.reduce((sum, f) => sum + cells(f.text), 0) + Math.max(0, fields.length - 1) * gap
}

/** Draws fields right to left, so the last of them ends against `endX`. */
function drawRight(c: Canvas, endX: number, y: number, fields: Field[], gap: number): number {
  let x = endX - widthOf(fields, gap)
  const from = x

  for (const field of fields) {
    x += c.text(x, y, field.text, field.color) + gap
  }

  return from
}

/**
 * The top line, in two halves that behave differently on purpose.
 *
 * On the left, what the run is called and what it is doing — text that grows
 * and shrinks as agents start and land. On the right, what it has cost, in a
 * fixed order, right-aligned. A figure that slides sideways every time the
 * status word changes length is a figure a reader has to find again on every
 * frame; pinned to the right edge it stays in the cells the eye last left it.
 *
 * Narrow, the figures give way by rank rather than by position: see `fitted`.
 *
 * The row above this one stops two columns short of the pane's edge: the
 * surface draws its own close control over that corner, and a rule under it is
 * a rule with a button sitting on its end.
 */
function paintRunLine(
  c: Canvas,
  run: RunState,
  nowMs: number,
  tick: number,
  y: number,
  columns = c.columns,
  hotspots?: Hotspot[],
  picker?: 'shut' | 'open',
): void {
  const running = run.status === 'running'
  const color = runColorOf(run)
  const done = run.agents.filter(a => a.state === 'done').length
  const failed = run.agents.filter(a => a.state === 'failed').length
  const busy = run.agents.filter(a => a.tools.some(t => t.isRunning)).length
  const thinking = run.agents.filter(a => a.state === 'running' && a.isThinking).length
  const quiet = run.agents.filter(a => quietFor(a, nowMs) > 0).length
  const spent = run.totalTokens ?? run.agents.reduce((sum, a) => sum + (tokensOf(a) ?? 0), 0)

  c.put(0, y, running ? spinnerAt(tick) : BULLET, color)

  // Landed, failed, busy, thinking, quiet — the state of the fleet, in the one
  // place it changes. It sits by the name because it is prose about the run,
  // not a measurement of it.
  const state: Field[] = []

  if (running) {
    const live = run.agents.filter(a => a.state === 'running').length

    // Each count carries the mark the rest of the pane gives the same thing: a
    // tick for an agent that landed, a node's own arrow for one still going,
    // and the dialog's own marks for a tool call and for thinking. The word
    // `landed` went with the tick — a tick beside `6/10` is not ambiguous, and
    // the cells it cost were the ones the run's name wanted.
    state.push({ text: `\u2714 ${done}/${run.agents.length}`, color: COLORS.dim })

    if (live > 0) {
      state.push({ text: `\u25b8 ${live} running`, color: COLORS.running })
    }

    if (busy > 0) {
      state.push({ text: `${TOOL_MARK} ${busy} using tools`, color: mix(COLORS.dim, COLORS.accent, 0.5) })
    }

    if (thinking > 0) {
      state.push({ text: `${THINK_MARK} ${thinking} thinking`, color: mix(COLORS.dim, COLORS.running, 0.5) })
    }

    if (quiet > 0) {
      state.push({ text: `${quiet} quiet`, color: mix(COLORS.failed, COLORS.running, 0.5) })
    }
  } else {
    state.push({
      text: `${run.status} ${done + failed}/${run.agents.length}`,
      color,
    })
  }

  if (failed > 0) {
    state.push({ text: `\u2716 ${failed} failed`, color: COLORS.failed })
  }

  // How many agents, and what they ran on, as one measurement rather than
  // three. The total and its breakdown are the same fact at two grains, and
  // read apart — `7×Haiku 4.5 │ 3×Sonnet 5 │ 10 agents` — a reader has to add
  // the parts up to see whether they account for the whole.
  const models = modelsOf(run)
  const tools = toolFields(run.agents, 2)
  const fleet: Field[] = [
    { text: `${FLEET_MARK} ${run.agents.length}`, color: COLORS.text },
    ...models.slice(0, 3).map(m => ({
      text: models.length === 1 ? m.name : `${m.count}×${m.name}`,
      color: COLORS.model,
    })),
  ]

  // Both figures are marked, and this is where the pane teaches the marks the
  // cards use: the widest row it has, with a clear cell between each mark and
  // its figure. Squeezed, the space goes and the pair closes up the way a card
  // writes it.
  const figures: Group[] = [
    {
      name: '',
      drop: 0,
      fields: [{ text: `${CLOCK_MARK} ${elapsed((run.endedMs ?? nowMs) - run.startedMs)}`, color: COLORS.clock }],
    },
    {
      name: '',
      drop: 1,
      fields: [{ text: spent > 0 ? tokensNamed(spent) : '', color: COLORS.spend }],
      short: [
        [{ text: spent > 0 ? tokensWide(spent) : '', color: COLORS.spend }],
        [{ text: spent > 0 ? tokensLong(spent) : '', color: COLORS.spend }],
      ],
    },
    // What the run called, beside what it ran on. It gives way first of the
    // four: a reader who has room for one breakdown wants the models, since a
    // run's tools are the same handful whatever it was asked to do.
    {
      name: '',
      drop: 3,
      fields: tools,
      short: [tools.slice(0, 2), tools.slice(0, 1)],
    },
    {
      name: '',
      drop: 2,
      fields: run.agents.length > 0 ? fleet : [],
      short: [fleet.slice(0, 1)],
    },
  ].filter(g => g.fields.some(f => f.text.length > 0))

  // The left half is never squeezed below the run's name and the first thing
  // said about it: a pane that has to choose between saying which run this is
  // and saying what it spent should say which run this is. Past that the
  // figures have the line, and the rest of the state gives way to them.
  const name = truncate(run.name, 24)
  const floor = Math.min(38, name.length + (state[0] ? 3 + state[0].text.length : 0))
  const edgeX = columns
  const kept = fitted(figures, edgeX - (2 + floor + 2))
  const figuresX = kept.length > 0 ? drawRight(c, edgeX, y, ruled(kept), 0) : edgeX

  let x = 2
  const room = figuresX - 2
  const tone = quietOf(c.background)
  // The caret says the name opens something, and which way it is: shut it
  // points at the list that would appear, open it points back at the name.
  const caret = picker === 'open' ? CARET_UP : picker === 'shut' ? CARET_DOWN : 0
  const nameX = x

  x += c.text(x, y, truncate(name, Math.max(6, room - 2)), COLORS.text)

  if (caret > 0) {
    c.put(x + 1, y, caret, picker === 'open' ? COLORS.accent : COLORS.dim)
    x += 2

    // A pane narrow enough to clip the name clipped the caret with it, and a
    // press target over cells that were never drawn is a press that lands on
    // nothing.
    const w = Math.min(x, c.columns) - nameX

    if (w > 0) {
      hotspots?.push({ agentId: RUN_PICKER, x: nameX, y, w })
    }
  }

  for (const field of state) {
    if (x + 3 + field.text.length > room) {
      break
    }

    c.put(x + 1, y, SEP_V, tone)
    x += 3 + c.text(x + 3, y, field.text, field.color)
  }

  // What the run returned is not said here. A workflow returns a value, not a
  // sentence, and the first line of one — `.claude-plugin/plugin.json: 0
  // finding(s) in 1 pass(es)` — is a fragment of a data structure sitting in
  // the one row that says what the run is. Whoever wants the answer opens the
  // agent that wrote it, where the whole of it is set out and scrolls.
}

/**
 * The clock's own column, down the rows the agents took.
 *
 * Drawn only into the cells no bar claimed, so it runs in pieces: a bar that
 * reaches it is still going, one that stops short landed, and the marker
 * disappears behind both. It is a scale rather than a line anything travels
 * along, which is why it has a name of its own — `dev/lines.ts` reads the
 * painter off the stack, and the lines that are meant to end in blank cells are
 * the ones it knows by name.
 */
function paintNow(c: Canvas, x: number, top: number, floor: number): void {
  for (let row = top; row < floor; row++) {
    const cell = c.at(x, row)

    if (cell === 0x20 || cell === 0 || cell === DASH_V) {
      c.put(x, row, DASH_V, mix(COLORS.track, COLORS.running, 0.35))
    }
  }
}

/** How far a phase has got, and how that is written wherever it is written. */
type PhaseFacts = {
  name: string
  count: string
  loop: string
  landed: number
  total: number
  active: boolean
  /** True where the run stopped without ever entering this phase. */
  skipped: boolean
  tone: Rgb
}

function phaseFactsOf(
  phase: string,
  index: number,
  agents: AgentRow[],
  passes: Map<string, Pass>,
  /** Whether the run is over: see `overOf`. */
  over = false,
): PhaseFacts {
  const skipped = over && agents.length === 0

  // An agent the run took down with it never landed; counting it as landed
  // would say a phase finished work it never did.
  const landed = agents.filter(a => a.state === 'done' || a.state === 'failed').length
  const active = agents.some(a => a.state === 'running')

  return {
    name: phase || `phase ${index + 1}`,
    // A phase nothing has entered says so by its colour, so the word `pending`
    // is not written beside it: seven cells of it truncated `Verify` to `Ver…`,
    // which spends the name to repeat what the grey already said.
    //
    // A phase nothing entered before the run stopped is the other case. Grey
    // there is ambiguous — it is the colour of both a phase still to come and a
    // phase that will never come — so that one is named.
    count: skipped ? 'skipped' : agents.length > 0 ? `${landed}/${agents.length}` : '',
    // A phase that went round says how many times, beside the count of what
    // landed: without it three agents against one file read as three lenses
    // opened at once rather than as one file dug at three times.
    loop: loopMark(deepest(agents, passes) || undefined),
    landed,
    total: agents.length,
    active,
    skipped,
    tone: captionTone(active, agents.length, skipped),
  }
}

/**
 * A phase's name centred in the cells it is given, with its count after it.
 *
 * Centred because the name titles the band or the column under it, and a title
 * set to one end of something drifts away from what it names as that thing
 * changes width. Answers the cells it wrote in, so a rule it is set into can
 * keep a space either side of it.
 *
 * The *name* takes the middle, not the caption. The count, the loop mark and a
 * nested run's handle trail off its right, so a reader running down a stack of
 * bands finds every name on the same column — which is what a centred title is
 * for. Centring the group instead balanced the block on its rule and moved the
 * name by half of whatever came after it, so `Setup 1/1` and `Lint ∥ Build ∥
 * Unit Test 3/3` started their names three cells apart and the column a reader
 * was scanning down wandered from band to band.
 */
function paintPhaseLabel(
  c: Canvas,
  x: number,
  y: number,
  width: number,
  facts: PhaseFacts,
  /** Cells kept for the blanks either side of a label set into a rule. */
  inset = 0,
  /**
   * Cells something else will write immediately after the label.
   *
   * Counted when the label is placed and not when it is drawn, so a caption
   * carrying the handle that folds its run back is centred as the group it
   * reads as. Left out, the name sat where it would have sat alone and the
   * handle hung off its right, which left the rule longer on one side of the
   * group than the other — the one measurement a centred title has.
   *
   * Asked for and not taken if the name would have to give up cells for it: a
   * phase column narrow enough to be truncating already has nowhere to put the
   * handle, and shortening the name further to reserve room nothing can use
   * loses letters twice over.
   */
  extra = 0,
): { x: number; w: number; used: number } {
  const tail = (facts.count ? facts.count.length + 1 : 0) + (facts.loop ? facts.loop.length + 1 : 0)
  const fields: Field[] = [
    { text: runName(facts.name, Math.max(1, width - tail - inset)), color: facts.tone },
    ...(facts.count ? [{ text: facts.count, color: COLORS.dim }] : []),
    ...(facts.loop ? [{ text: facts.loop, color: mix(COLORS.dim, COLORS.accent, 0.5) }] : []),
  ]
  const used = Math.min(width, widthOf(fields, 1))
  const w = used + extra <= width ? used + extra : used
  const at = x + Math.max(0, Math.floor((width - w) / 2))

  // A label set into a rule clears the cells it stands in, its own gaps
  // included: a stroke showing through between the name and the count joins
  // them into one word with a line in it.
  if (inset > 0) {
    for (let dx = -1; dx <= used; dx++) {
      c.put(at + dx, y, 0x20, facts.tone)
    }
  }

  drawFields(c, at, y, width - (at - x), fields, 1)

  return { x: at, w, used }
}

/**
 * The block at the top of the pane: a bar three rows deep carrying what the run
 * is and what it has spent, and under it the phases.
 *
 * The bar is a bar and not a line. Its own rules close it above and below, so
 * the line of figures sits between two edges rather than against the pane's
 * top; the lower rule is the border between the run and its phases. Flowing,
 * the phase names take the row under that border and their progress the row
 * after it, each over the column it belongs to. Stacked, every band carries its
 * own name on its own rule, so the header ends at the border.
 */
/**
 * The pane's own name across the top, with a light travelling through it.
 *
 * A reader meeting this pane for the first time is looking at a diagram drawn
 * in glyphs with no key: the title is the one row that says what the thing is
 * before any of it is worked out. It is centred because it names the whole
 * pane rather than anything in a column, and it is drawn quieter than the run
 * line under it — a heading that outshouts the figures it heads is a heading
 * read twice and a measurement read once.
 *
 * The shine is the reason it can afford to be quiet. One cell at a time is
 * lifted toward the accent, with two cells of falloff behind it, and the sweep
 * rests for a stretch at the end of each pass: a highlight that restarts the
 * instant it finishes reads as a loading bar, which is a claim about progress
 * this row has no business making. A finished run is painted at `tick = -1`,
 * where the sweep stops and the title is simply drawn — nothing on this pane
 * moves once the work has.
 */
function paintTitle(c: Canvas, tick: number, columns: number): void {
  const full = `${NAME} - ${TAGLINE}`
  const text = cells(full) + 4 <= columns ? full : NAME
  const width = cells(text)

  if (width + 2 > columns) {
    return
  }

  const left = Math.floor((columns - width) / 2)
  const base = mix(quietOf(c.background), COLORS.text, 0.55)
  // The sweep crosses the word and then waits: the rest is what keeps it a
  // shine rather than a bar filling.
  const REST = 24
  const head = tick < 0 ? -1 : Math.floor(tick / 2) % (width + REST)
  const glyphs = [...text]

  for (let i = 0; i < glyphs.length; i++) {
    const behind = head - i
    const lit = head < 0 || behind < 0 || behind > 2 ? 0 : 1 - behind * 0.35

    c.put(left + i, 0, glyphs[i]!.codePointAt(0)!, lit > 0 ? mix(base, glowOf(), lit) : base)
  }
}

function paintBar(
  c: Canvas,
  run: RunState,
  nowMs: number,
  tick: number,
  barRows: number,
  columns = c.columns,
  hotspots?: Hotspot[],
  picker?: 'shut' | 'open',
): void {
  const quiet = quietOf(c.background)
  // The title takes the pane's first row, and the bar begins under it.
  const top = barRows >= 4 ? 1 : 0

  if (top > 0) {
    paintTitle(c, tick, columns)
  }

  if (barRows - top >= 3) {
    for (let x = 0; x < Math.max(0, columns - CLOSE_W); x++) {
      c.put(x, top, RULE_LEFT, quiet)
    }
  }

  paintRunLine(c, run, nowMs, tick, barRows - top >= 3 ? top + 1 : top, columns, hotspots, picker)

  for (let x = 0; x < columns; x++) {
    c.put(x, barRows - 1, RULE_LEFT, quiet)
  }
}

function paintHeader(
  c: Canvas,
  run: RunState,
  lanes: LaneBox[],
  laneAgents: FoldedLane[],
  nowMs: number,
  tick: number,
  orientation: 'horizontal' | 'vertical',
  headerRows: number,
  columns = c.columns,
  passes: Map<string, Pass> = new Map(),
  hotspots?: Hotspot[],
  picker?: 'shut' | 'open',
): void {
  const barRows = Math.max(2, headerRows - (orientation === 'horizontal' ? 2 : 1))
  const quiet = quietOf(c.background)

  paintBar(c, run, nowMs, tick, barRows, columns, hotspots, picker)

  if (lanes.length === 0) {
    c.text(0, barRows, 'Waiting for the first agent to start.', COLORS.dim)

    return
  }

  // Stacked, each band opens with a rule of its own carrying its name: see
  // `paintSections`. There is nothing left for the header to say about them.
  if (orientation === 'vertical') {
    return
  }

  const captionRow = barRows
  const ruleRow = barRows + 1
  const borders = bordersOf(lanes, orientation)

  for (let x = 0; x < columns; x++) {
    c.put(x, ruleRow, RULE_LEFT, quiet)
  }

  for (const at of borders) {
    if (at >= 0) {
      c.put(at, ruleRow, TEE_LEFT, quiet)
    }
  }

  lanes.forEach((lane, place) => {
    const fold = laneAgents[lane.index]
    // The same mark, the same press and the same state as a stacked band's:
    // see `paintSections`. A phase's caption is the one row of it that says
    // what the phase *is* rather than what ran in it, so a nested run's way in
    // belongs on the caption in every layout that draws one — across the pane
    // it is a column head, down the pane it is a rule, and a reader who learns
    // the ▸ in one should not have to find it again in the other.
    const open = fold?.nested === true && fold.shut !== true
    const facts = phaseFactsOf(
      open ? FOLD_OPEN + lane.phase.slice(FOLD_SHUT.length) : lane.phase,
      lane.index,
      fold?.agents ?? [],
      passes,
      overOf(run),
    )
    const handle = fold?.nested === true ? foldHandle(!open, fold.agents.length, lane.w) : ''
    const label = paintPhaseLabel(
      c,
      lane.x,
      captionRow,
      lane.w,
      facts,
      0,
      handle.length > 0 ? HANDLE_GAP + handle.length + 1 : 0,
    )

    if (fold?.nested && hotspots) {
      const after = label.x + label.used + HANDLE_GAP
      const drew = paintFoldHandle(
        c,
        lane.phase,
        after,
        captionRow,
        lane.x + lane.w - after,
        facts.tone,
        !open,
        fold.agents.length,
        hotspots,
      )

      if (!drew) {
        hotspots.push(markSpot(lane.phase, label.x, captionRow, lane.x))
      }
    }

    // A phase's length of the rule is its own progress, filled to the fraction
    // that has landed, which ties the measurement to the column it measures.
    const filled = facts.total > 0 ? Math.round((facts.landed / facts.total) * lane.w) : 0
    const nested = fold?.nested === true

    // Only a nested phase redraws the length it did not fill: the rule was laid
    // down the whole width before the lanes were walked, and the stroke it was
    // laid in is the one every other phase wants.
    for (let dx = nested ? 0 : filled; dx < (nested ? lane.w : filled); dx++) {
      c.put(lane.x + dx, ruleRow, ruleOf(nested, dx < filled), quiet)
    }

    // The joint between a filled length of rule and the border under it is
    // drawn heavy too, so the fill reads as one stroke rather than as two that
    // stop either side of the gutter.
    const next = borders[place + 1] ?? -1

    if (filled > 0 && filled >= lane.w && next >= 0) {
      for (let x = lane.x + lane.w; x <= next; x++) {
        c.put(x, ruleRow, x === next ? TEE_DONE : ruleOf(nested, true), quiet)
      }
    }
  })
}

export { COLORS }
