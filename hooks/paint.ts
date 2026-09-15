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
import { aboutRows, NAME, TAGLINE, VERSION, type AboutRow } from './about'
import type { AgentRow, RunState, RunStatus, Step, ToolCall } from './journal'
import { DEFAULT_THEME, paletteOf, themeOf, THEMES, type Palette, type Theme } from './theme'
import {
  aheadDepth,
  barRowsOf,
  entryOf,
  exitOf,
  layout,
  type LaneBox,
  type Layout,
  type NodeBox,
  type Orientation,
  titledPane,
} from './layout'
import {
  chainOf,
  edgesOf,
  follows,
  isPipelineLike,
  orderedLanes,
  passesOf,
  skipsOf,
  type Carry,
  type Pass,
  type Skip,
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
/** The rule down a node's left edge, in place of a frame around it. */
/**
 * The two weights a card's frame is drawn in: light for a node, heavy for the
 * one whose detail is open. Weight rather than colour alone, so the open card
 * is still the open card in a terminal that renders the palette differently.
 */
const LIGHT = { across: 0x2500, down: 0x2502, tl: 0x256d, tr: 0x256e, bl: 0x2570, br: 0x256f }
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
 * The marks the detail dialog's own blocks and figures carry.
 *
 * `\u276f` and `\u276e` are the same mark turned around: what went in, what came
 * back. The rest name what they count — model requests, tool calls — where the
 * word would have taken five times the cells to say the same thing beside a
 * number that is already unambiguous.
 */
const ASK_MARK = '\u276f'
const ANSWER_MARK = '\u276e'
const TOOL_MARK = '\u2699'
const THINK_MARK = '\u25cc'
const REQUEST_MARK = '\u21c4'
/** How many agents: two of a thing joined, because that is what it counts. */
const FLEET_MARK = '\u29c9'

/** Where a phase seam hangs off that rule. */
const TEE_DONE = 0x252f
const TEE_LEFT = 0x252c
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

export type PaintResult = {
  hotspots: Hotspot[]
  orientation: 'flow' | 'stack' | 'time'
  /** The detail list's extent and window, when one is drawn. */
  detail?: DetailView
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
 */
function tokens(n: number): string {
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
function tokensShortWide(n: number): string {
  return tokensShort(n).replace(SPEND_MARK, `${SPEND_MARK} `)
}

/** The same count with the decimal dropped once it buys nothing: `15k`, `9.4k`. */
function tokensShort(n: number): string {
  if (n < 1000) {
    return `${SPEND_MARK}${n}`
  }

  const scaled = n >= 1_000_000 ? n / 1_000_000 : n / 1000
  const unit = n >= 1_000_000 ? 'm' : 'k'
  const figure = scaled >= 10 ? `${Math.round(scaled)}${unit}` : `${scaled.toFixed(1)}${unit}`

  return `${SPEND_MARK}${figure}`
}

/** The count under its mark, the way a card glues its clock to its duration. */
function tokensLong(n: number): string {
  return `${SPEND_MARK}${tokens(n)}`
}

/** The same, with a space, for the two rows wide enough to let it breathe. */
function tokensWide(n: number): string {
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
function tokensNamed(n: number): string {
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
): (n: number) => string {
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

/**
 * A model id as a person would say it: `Haiku 4.5`, `Opus 5`, `Sonnet 3.5`.
 *
 * The engine writes the id it resolved — `claude-haiku-4-5-20251001`, or
 * `claude-opus-5[1m]` with the context window on the end — and neither the
 * date nor the prefix tells anyone anything a node has room to say.
 *
 * The family is capitalised because it is a name. Lower case made it read as a
 * word the drawing had chosen — a card saying `haiku` under an agent that
 * wrote one is a card that has to be read twice.
 */
function modelName(model?: string): string {
  if (!model) {
    return ''
  }

  const id = model.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '').replace(/^claude-/, '')
  const family = /(haiku|sonnet|opus|fable)/.exec(id)?.[1]

  if (!family) {
    return id
  }

  const named = family[0].toUpperCase() + family.slice(1)

  // The version sits either side of the family name, depending on the era the
  // id was minted in: `haiku-4-5` and `3-5-sonnet` are the same shape of fact.
  const version =
    new RegExp(`${family}-(\\d+)(?:-(\\d+))?`).exec(id) ??
    new RegExp(`(\\d+)(?:-(\\d+))?-${family}`).exec(id)

  if (!version) {
    return named
  }

  return `${named} ${version[1]}${version[2] ? `.${version[2]}` : ''}`
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
 * The cells an absolute path may take before it is worth cutting one.
 *
 * About what a project's own root costs: long enough that `/etc/hosts` and
 * `hooks/paint.ts` are left alone, short enough that the home directory and the
 * three folders under it are not.
 */
const PATH_MAX = 28

/**
 * An absolute path cut to the part that tells it from the next one.
 *
 * Every call an agent makes in a repository names a file inside that repository,
 * so every line of the call list opened with the same forty cells of
 * `/Users/<name>/<somewhere>/<project>/` — and in a column wide enough for
 * fifty, the part saying which file it was is the part that fell off the end. A
 * reader who opened the detail to see what the agent did got a column of
 * identical prefixes.
 *
 * The last two segments are what is being read for. The rest is the same for
 * every call in the run, and is already said by which repository the pane is
 * open in.
 */
function briefPath(token: string): string {
  const trail = token.match(/[),.:;]+$/)?.[0] ?? ''
  const path = trail ? token.slice(0, -trail.length) : token

  if (!path.startsWith('/') && !path.startsWith('~/')) {
    return token
  }

  const parts = path.split('/').filter(Boolean)

  if (path.length <= PATH_MAX || parts.length < 3) {
    return token
  }

  const short = `\u2026/${parts.slice(-2).join('/')}`

  // Cut only where the cut is worth making: an elision that saves four cells
  // has spent a glyph of the reader's attention to buy nothing.
  return short.length + 8 <= path.length ? short + trail : token
}

/** Every absolute path in a piece of text, cut to what tells it apart. */
function briefPaths(text: string): string {
  return text.split(/\s+/).map(briefPath).join(' ')
}

/**
 * A running node's border carries a highlight that travels it, which is the
 * only honest progress a running agent has: it says *alive*, and its speed is
 * the same for every node, so a stalled one is told from a busy one by its
 * elapsed time, never by a bar that pretends to know.
 */
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
  const spend: Field[] = spent === undefined ? [] : [{ text: scale.spend(spent), color: COLORS.spend }]
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
      const rest = spent === undefined ? 0 : tokensShort(spent).length + 1

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
  spend: (n: number) => string,
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
    const taken = clock(took).length + (spent === undefined ? 0 : spend(spent).length + 1) + 1

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
  spend: (n: number) => string
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
      ...(spent === undefined ? [] : [spend(spent)]),
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
  const label = nodeLabel(agent)
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

    const shown = Math.min(room, label.length)

    c.text(labelX, box.y, moving ? slide(label, room, tick) : truncate(label, room), labelColor)
    hotspots.push({ agentId: agent.agentId, x: labelX, y: box.y, w: shown })

    const tail = tailOf(agent, nowMs)
    const tailX = labelX + shown + 2
    const tailRoom = factsX - tailX - 2

    if (tail && tailRoom > 4) {
      c.text(tailX, box.y, truncate(tail, tailRoom), tailColorOf(agent, nowMs, color))
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
  const shown = moving ? slide(label, titleRoom, tick) : truncate(label, titleRoom)
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

  hotspots.push({ agentId: agent.agentId, x: labelX, y: box.y, w: drawn })

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
  const named = doing || scale.model(agent.model ?? model)
  const edgeAt = Math.min(
    box.x + 2 + Math.max(1, Math.floor((inner - 2 - named.length) / 2)),
    edgeEnd - named.length,
  )
  const wrote = named.length > 0 && edgeAt >= box.x + 3

  if (wrote) {
    c.put(edgeAt - 1, last, 0x20, frame)
    c.text(edgeAt, last, named, mix(doing ? color : COLORS.model, frame, 0.25))
    c.put(edgeAt + named.length, last, 0x20, frame)
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
  orientation: 'flow' | 'stack',
  /** True where the bus stands for carries read off labels, not for a barrier. */
  inferred = false,
  tick = -1,
  /**
   * The lines the drawing has spoken for but not drawn yet — the border between
   * two phases, laid out across. A feeder that reaches one hops it rather than
   * leaving a hole in it, the same way a carry does.
   */
  ruled: Set<number> = new Set(),
): void {
  if (left.length === 0 || right.length === 0) {
    return
  }

  const along = (p: { x: number; y: number }) => (orientation === 'flow' ? p.y : p.x)
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
  const spine = orientation === 'flow' ? (inferred ? DASH_V : 0x2502) : inferred ? DASH_H : 0x2500
  const feeder = orientation === 'flow' ? (inferred ? DASH_H : 0x2500) : inferred ? DASH_V : 0x2502

  for (let at = from; at <= to; at++) {
    if (orientation === 'flow') {
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
    // card and the same side of it. Where the bus stands hard against the card
    // there is no run to start and the tap is the whole of it.
    const room = (orientation === 'flow' ? busAt - port.x : busAt - port.y) > 1

    if (room) {
      c.put(port.x, port.y, PORT, color)
    }

    if (orientation === 'flow') {
      for (let x = room ? port.x + 1 : port.x; x < busAt; x++) {
        if (ruled.has(x)) {
          c.put(x, port.y, HOP, color)
        } else {
          cross(c, x, port.y, feeder, color)
        }
      }
    } else {
      for (let y = room ? port.y + 1 : port.y; y < busAt; y++) {
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

    if (orientation === 'flow') {
      for (let x = busAt + 1; x < port.x; x++) {
        if (ruled.has(x)) {
          c.put(x, port.y, HOP, color)
        } else {
          cross(c, x, port.y, feeder, color)
        }

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
  const ALONG = orientation === 'flow' ? { back: ARM.up, on: ARM.down } : { back: ARM.left, on: ARM.right }
  const ACROSS = orientation === 'flow' ? { in: ARM.left, out: ARM.right } : { in: ARM.up, out: ARM.down }

  for (const [at, tap] of taps) {
    const arms =
      (at > from ? ALONG.back : 0) |
      (at < to ? ALONG.on : 0) |
      (tap.in ? ACROSS.in : 0) |
      (tap.out ? ACROSS.out : 0)

    const glyph = joint(arms) ?? spine

    if (orientation === 'flow') {
      c.put(busAt, at, glyph, color)
    } else {
      c.put(at, busAt, glyph, color)
    }
  }
}

/**
 * Draws the edges that skip a lane as rails in the margin beside the graph.
 *
 * Such an edge cannot run straight — the band it passes is in the way — and one
 * line per node, routed between the columns, is what made a five-topic run read
 * as a tangle. They are also the least of what the drawing has to say: the
 * layers already carry the order, and a skip only adds that the later phase was
 * fed from further back than the phase above it.
 *
 * So each pair of phases gets one rail, outside the block of nodes, and it
 * joins the graph where a join belongs: the bus in the gutter, which is the
 * line every agent of a phase already feeds into and every agent of the next
 * already leaves from. The rail's own ends are drawn along that bus, so they
 * read as part of it rather than as two lines stopping beside the nodes.
 *
 * A pane with no margin to spare draws none: an omitted rail costs a hint,
 * where one drawn through the nodes costs the graph.
 */
function paintSkips(
  c: Canvas,
  view: Layout,
  skips: Skip[],
  arrows: { x: number; y: number }[],
  tick: number,
): void {
  const nodes = view.lanes.flatMap(l => l.nodes)

  if (skips.length === 0 || nodes.length === 0) {
    return
  }

  // One axis is the run's: the rail travels along it, from the gutter it leaves
  // to the gutter it arrives at. The other is the margin's: the rail stands at
  // an offset on it, clear of every node. Stacked, the run reads downward, so
  // the margin is a column; flowing, the run reads rightward and the margin a
  // row.
  const down = view.orientation === 'stack'
  const put = (offset: number, at: number, code: number, color: Rgb) =>
    down ? c.put(offset, at, code, color) : c.put(at, offset, code, color)
  const stroke = (offset: number, at: number, code: number, color: Rgb) =>
    down ? line(c, offset, at, code, color) : line(c, at, offset, code, color)
  /** Where a node's bus tap stands, on the margin's axis. */
  const portOf = (n: NodeBox) =>
    down ? n.x + Math.floor(n.w / 2) : n.y + Math.floor(n.h / 2)

  const nearSide = down ? Math.min(...nodes.map(n => n.x)) : Math.min(...nodes.map(n => n.y))
  const farSide = down
    ? Math.max(...nodes.map(n => n.x + n.w))
    : Math.max(...nodes.map(n => n.y + n.h))
  // The last row (or column) something else has already claimed: the header,
  // laid out across. Downward the bands are full width and the margin beside
  // them is the pane's own, so nothing is claimed before the rails.
  const taken = down ? -1 : view.headerRows - 1
  const limit = down ? c.columns : c.rows
  const near = nearSide - taken - 1 >= 2 && nearSide - taken - 1 >= limit - farSide - 1
  // Rails are drawn before the nodes, so what is clear is a question about the
  // layout rather than about the canvas: a row (or column) is free where no
  // node box stands on it anywhere along the rail's run.
  const taps = (n: NodeBox) => (down ? [n.x, n.x + n.w - 1] : [n.y, n.y + n.h - 1])
  const spans = (n: NodeBox) => (down ? [n.y, n.y + n.h - 1] : [n.x, n.x + n.w - 1])
  const used: number[] = []
  const heads = arrows.map(p => (down ? { offset: p.x, at: p.y } : { offset: p.y, at: p.x }))
  /**
   * True where another edge has already put its arrowhead. A rail's taps run
   * along the gutter the other edges arrive in, so they cross those heads; a
   * head is not a line glyph, so a stroke over one replaces it rather than
   * joining it, and the edge below it loses the cell that says it arrives.
   * The rail passes behind instead — a dash either side of a head reads as one
   * line crossing another, which is what it is.
   */
  const marked = (offset: number, at: number) => heads.some(h => h.offset === offset && h.at === at)
  /**
   * True where a card's own point stands. A rail's taps run up the gutter the
   * carries leave by, so they pass the point of every card between the one the
   * rail leaves and the line it runs on. The rail goes behind them: a tap with
   * a dot in it reads as a line passing a card, and a tap drawn through one
   * takes the mark that says which card the wire below it comes out of.
   */
  const ported = (offset: number, at: number) => (down ? c.at(offset, at) : c.at(at, offset)) === PORT
  // The arms a line already in the cell would have to share with the rail for
  // the two to read as one line. Crossing arms are fine — that is what a
  // junction glyph is for — so only a run the rail's own way counts.
  const alongArms = down ? ARM.up | ARM.down : ARM.left | ARM.right
  /**
   * True where the cell already holds a line running the rail's own way. The
   * carries are drawn before the rails, so a rail laid along a row an edge
   * already runs down joins onto it end to end, and the two read as one line
   * from that edge's source to the rail's target — which is a claim neither of
   * them makes.
   */
  const inked = (offset: number, at: number) => {
    const arms = armsOf(down ? c.at(offset, at) : c.at(at, offset))

    return arms !== undefined && (arms & alongArms) !== 0
  }

  /**
   * True where a line already crosses the rail's own way at right angles.
   *
   * The taps run across the gutter and pass behind whatever they meet there;
   * the two stretches that join a card to its tap run along it, and meet the
   * same lines the other way round. Written through, they turned each meeting
   * into a junction — a cell that says the rail and a carry are one line.
   */
  const crossed = (offset: number, at: number) => {
    const arms = armsOf(down ? c.at(offset, at) : c.at(at, offset))

    return arms !== undefined && (arms & ~alongArms) !== 0
  }

  /**
   * A clear line for the rail, as close to `want` as the layout allows.
   *
   * The cells the other edges put their arrowheads on are taken: a rail run
   * through one rubs it out, and an edge that arrives at a node without an
   * arrowhead is a line that happens to stop there.
   *
   * Run in the outer margin, a rail leaves the block, crosses the whole of the
   * phase it passes, and comes back in — three sides of a rectangle round that
   * phase, which reads as a box drawn around it rather than as an edge going
   * past it. The gaps between the rows of nodes are clear the whole way across,
   * so the rail takes the one nearest the node it arrives at and each of its
   * two ends is a cell or two long.
   */
  const alreadyDrawn = (offset: number, lo: number, hi: number) => {
    for (let at = lo; at <= hi; at++) {
      if (inked(offset, at)) {
        return true
      }
    }

    return false
  }

  /**
   * The lines the drawing has already spoken for, on the axis a rail taps
   * across: the rule a band is named on, laid out down, and the border between
   * two phases, laid out across. Both go down after the edges do, so nothing is
   * there to read yet and the layout has to be asked instead.
   */
  const ruled = new Set(
    down
      ? view.lanes.flatMap(lane => (lane.captionRow === undefined ? [] : [lane.captionRow]))
      : bordersOf(view.lanes, 'flow').filter(at => at >= 0),
  )

  /** Every line a card stands on, anywhere in the drawing. */
  const occupied = new Set<number>()

  for (const node of nodes) {
    const [from, to] = taps(node)

    for (let at = from; at <= to; at++) {
      occupied.add(at)
    }
  }

  const clearOf = (want: number, first: number, last: number): number | undefined => {
    const offsets: number[] = []
    // Across, the search reaches past the block into the margin the layout kept
    // for these rails. Inside the block every row a rail could take is level
    // with some card, and a rail level with a card is read as a line leaving
    // that card — which is how an edge anchored to the fourth node of a phase
    // came to look like an edge out of the third.
    const from = down ? nearSide : Math.max(0, taken + 1)
    const to = down ? farSide : Math.min(limit - 1, farSide + 1)

    for (let offset = from; offset <= to; offset++) {
      offsets.push(offset)
    }

    // The nearest line to the node the rail arrives at, and of two the same
    // distance off, the one no card stands on anywhere.
    //
    // Clear lines used to come first however far off they were, and with two
    // phases whose cards are staggered there is no line between them that some
    // card somewhere is not level with: the rail went to the margin above the
    // whole drawing and came back down the far side, three sides of a rectangle
    // round everything between its two ends. `clear` already asks the question
    // that matters — whether a card stands on this line anywhere along this
    // rail's own run — so the global answer is a tiebreak, not the rule.
    offsets.sort(
      (p, q) =>
        Math.abs(p - want) - Math.abs(q - want) ||
        (occupied.has(p) ? 1 : 0) - (occupied.has(q) ? 1 : 0),
    )

    const lo = Math.min(first, last)
    const hi = Math.max(first, last)
    const clear = (offset: number) =>
      !used.includes(offset) &&
      !heads.some(head => head.offset === offset && head.at >= lo && head.at <= hi) &&
      !alreadyDrawn(offset, lo, hi) &&
      !nodes.some(n => {
        const [from, to] = taps(n)
        const [start, end] = spans(n)

        return offset >= from && offset <= to && end >= lo && start <= hi
      })

    // A card draws a frame on all four sides, so the two orientations need
    // different room. Laid out downward the rail is vertical, and a column
    // with a card either side of it puts the rail hard against two frames
    // where it reads as a third; laid out across it is horizontal, the rows
    // above and below a card are blank, and one clear row is enough.
    //
    // A column clear on both sides is taken first, wherever the gaps between
    // the cards leave one, so the rail stands off the cards it passes. Failing
    // that one clear side will do — a rail against one frame is still a rail,
    // where no rail at all is an edge the reader never learns about.
    for (const room of down ? [2, 1] : [0]) {
      for (const offset of offsets) {
        const sides = (clear(offset - 1) ? 1 : 0) + (clear(offset + 1) ? 1 : 0)

        if (clear(offset) && sides >= room) {
          used.push(offset)

          return offset
        }
      }
    }

    return undefined
  }

  skips.forEach((skip, i) => {
    const from = view.lanes[skip.fromLane]
    const through = view.lanes[skip.fromLane + 1]
    const to = view.lanes[skip.toLane]

    if (!from || !to || !through || from.nodes.length === 0 || to.nodes.length === 0) {
      return
    }

    // The rail turns where the two buses stand: the gutter the earlier phase
    // feeds, and the gutter the later one is fed from.
    const leaves = through.busAt
    const arrives = to.busAt
    // A rail stands for particular edges, so it is hung off the nodes at their
    // ends rather than off the lanes those sit in. Where none of them is drawn
    // — a pane too small to hold every node — the lanes are the fallback, which
    // is where this started.
    const found = (id: string, lane: LaneBox) => lane.nodes.find(n => n.agent.agentId === id)
    const pairs = skip.edges.flatMap(e => {
      const tail = found(e.fromId, from)
      const head = found(e.toId, to)

      return tail && head ? [[tail, head] as const] : []
    })
    const targets = pairs.length > 0 ? pairs.map(p => p[1]) : to.nodes
    // The rail wants to run beside the node it arrives at, so the first of the
    // nodes it arrives at is what the search for a clear line aims at.
    const inside = clearOf(Math.min(...targets.map(portOf)), leaves, arrives)
    const offset = inside ?? (near ? taken + 1 + i : farSide + 1 + i)
    const outside =
      inside === undefined && (near ? offset >= nearSide - 1 || offset <= taken : offset >= limit - 1)

    if (outside || arrives - leaves < 2) {
      return
    }

    // The same tone as every other join on the pane. Whether the rail is proven
    // or read off the labels is said by its stroke, below, the way it is said
    // for a carry: a rail dimmed toward the ground as well put a third and a
    // fourth grey into a layer that has one thing to say.
    const tone = COLORS.wire
    const run = skip.confirmed ? (down ? 0x2502 : 0x2500) : down ? DASH_V : DASH_H
    const tap = skip.confirmed ? (down ? 0x2500 : 0x2502) : down ? DASH_H : DASH_V
    // Where the tap meets the bus. A rail in the margin comes at the bus from
    // outside, so it lands on the end nearest it; one in a gap between nodes is
    // already alongside, so it lands on whichever tap it is closest to.
    const bankOf = (own: NodeBox[]) => {
      const pick = (best: NodeBox, node: NodeBox) =>
        inside === undefined
          ? (near ? portOf(node) < portOf(best) : portOf(node) > portOf(best))
            ? node
            : best
          : Math.abs(portOf(node) - offset) < Math.abs(portOf(best) - offset)
            ? node
            : best

      return own.reduce(pick)
    }

    // The rail is drawn as whichever of its edges runs closest to the line it
    // took, with the count beside it standing for the rest. Choosing each end
    // on its own put the tail at one edge's source and the head at another
    // edge's target, drawing a line between two agents that never exchanged
    // anything — and with five topics each skipping a phase, that line was
    // wrong about both of them.
    const aside = (n: NodeBox) => Math.abs(portOf(n) - offset)
    const nearest = (best: readonly [NodeBox, NodeBox], pair: readonly [NodeBox, NodeBox]) =>
      aside(pair[0]) + aside(pair[1]) < aside(best[0]) + aside(best[1]) ? pair : best
    const banks = pairs.length > 0 ? pairs.reduce(nearest) : [bankOf(from.nodes), bankOf(to.nodes)]
    const leave = exitOf(banks[0], view.orientation)
    const starts = down ? leave.y : leave.x
    // A rail leaves by the same point a carry does — the middle of the side it
    // is heading for — so a card has one place a line comes out of whatever
    // kind of line it is. Which line the rail then turns on is the question
    // `apart` answers.
    const bank = portOf(banks[0])

    /**
     * Whether the rail can turn off its card's line here.
     *
     * Three questions. Whether the drawing has already spoken for the line —
     * the rule a band is named on, the border between two phases — which
     * nothing can be read off the canvas for, since those go down after the
     * edges do. Then one for each of the two runs the turn joins: whether the
     * stretch from the card to this line is clear of anything running the same
     * way, and whether the tap up to the rail is clear of anything running
     * across it. A line crossing either at right angles is not in the way —
     * that is what a rail passing behind is for.
     */
    const apart = (at: number) => {
      if (ruled.has(at)) {
        return false
      }

      for (let step = starts; step < at; step++) {
        if (inked(bank, step)) {
          return false
        }
      }

      for (let line = Math.min(offset, bank) + 1; line < Math.max(offset, bank); line++) {
        if (crossed(line, at)) {
          return false
        }
      }

      return true
    }

    /**
     * Where the rail turns off the line it leaves its first card on.
     *
     * The bus by preference: the line there is the rail's own, and where the
     * phase it leaves ends in a barrier the turn lands on that barrier's spine
     * and joins it.
     *
     * A card one line tall has no spare edge for a rail to leave by, so the
     * rail leaves on the line its card's name is on — which is the line the
     * carries of the next band arrive on. Sharing it, the rail and an arriving
     * carry are drawn one over the other, in one colour, for every cell between
     * the card and the bus, and the pair reads as a single edge running from
     * the rail's card to the carry's. The turn comes back toward the card until
     * it finds a line free of both, and the rail crosses the gutter above the
     * wires rather than along one of them.
     */
    let opens = leaves

    while (opens > starts && !apart(opens)) {
      opens--
    }

    const ends: { at: number; bank: number; toward: number }[] = [
      { at: opens, bank, toward: 0 },
      { at: arrives, bank: portOf(banks[1]), toward: 0 },
    ].map(end => ({ ...end, toward: Math.sign(end.bank - offset) }))

    // Each corner is built from the two arms that meet in it: the one the rail
    // carries on along, and the one its own tap runs off on. In the margin both
    // taps run the same way; in a gap between nodes one can run back and the
    // other on, and a corner written out case by case had two of those four
    // pointing the wrong way.
    const ALONG = down ? { on: ARM.down, back: ARM.up } : { on: ARM.right, back: ARM.left }
    const ACROSS = down ? { plus: ARM.right, minus: ARM.left } : { plus: ARM.down, minus: ARM.up }
    const corner = (at: number, toward: number) =>
      joint((at === opens ? ALONG.on : ALONG.back) | (toward > 0 ? ACROSS.plus : ACROSS.minus)) ?? run

    /**
     * One cell of the rail's own run.
     *
     * Laid out across, the rail is the horizontal of every crossing it makes,
     * so it is the one that hops: over a carry turning in the gutter, over the
     * border between two phases. Laid out down it is the vertical, the line
     * across is the one that steps over, and the cell is left to it — so the
     * rail reads as the one going behind. An arrowhead is neither. Nothing is
     * drawn over a head, because a head rubbed out is an edge that stops at a
     * card rather than one that arrives at it.
     */
    const rail = (line: number, at: number) => {
      if (marked(line, at) || ported(line, at)) {
        return
      }

      if (!crossed(line, at) && !(!down && ruled.has(at))) {
        stroke(line, at, run, tone)

        return
      }

      if (!down) {
        put(line, at, HOP, tone)
      }
    }

    // Strokes rather than puts: a rail that turns onto a bus another phase
    // already drew has to join it. Written over the bus, the corner said the
    // line stopped there, and a `╯` in the middle of a run reads as one line
    // ending and another starting in the same cell.
    for (const end of ends) {
      stroke(offset, end.at, end.toward === 0 ? run : corner(end.at, end.toward), tone)
    }

    for (let at = opens + 1; at < arrives; at++) {
      rail(offset, at)
    }

    for (const end of ends) {
      // The tap runs to the bus and into it: the cell it lands on takes the arm
      // the tap arrives by on top of whatever the barrier already drew there,
      // so the rail joins the bus instead of stopping a cell short of it.
      for (let side = offset + end.toward; side !== end.bank; side += end.toward) {
        // Behind whatever already crosses here, not through it. A tap runs
        // across the gutter the other wires turn in, so it meets them at right
        // angles — and a `┼` written where two lines cross says they meet,
        // which is a junction between two agents that exchanged nothing. The
        // cell is left to the line that was already in it, and a tap with a gap
        // in it where another line passes reads as the one going behind.
        if (!marked(side, end.at) && !inked(side, end.at) && !ported(side, end.at)) {
          stroke(side, end.at, tap, tone)
        }
      }

      // The cell the tap lands on is a corner, not more tap: the rail turns
      // there and goes into the node. Left as a straight piece the rail ends in
      // the middle of a row of other lines, with nothing to say which of the
      // cards above it came out of. Strokes rather than puts, so where a
      // barrier already drew its bus through that cell the corner joins it.
      if (end.toward !== 0 && !marked(end.bank, end.at)) {
        // A corner standing on the cell the card is left by has no line to turn
        // from: the stretch back to the card is nothing at all, and the arm
        // that would run along it points into the blank beside the card's name.
        // The point is drawn instead. It says what that arm was there to say —
        // the rail starts at this card — in the mark every other edge leaves a
        // card by, and the tap above it carries on as before.
        if (end.at === opens && opens === starts) {
          put(end.bank, end.at, PORT, tone)

          continue
        }

        stroke(
          end.bank,
          end.at,
          joint((end.at === opens ? ALONG.back : ALONG.on) | (end.toward > 0 ? ACROSS.minus : ACROSS.plus)) ?? tap,
          tone,
        )
      }
    }

    // The first of it: out of the node it leaves and up to the tap. The tap
    // stands mid-gutter, so without this the rail starts two cells clear of the
    // card, as a line that happens to begin there rather than an edge leaving.
    if (opens > starts) {
      put(ends[0].bank, starts, PORT, tone)
    }

    for (let at = starts + 1; at < opens; at++) {
      rail(ends[0].bank, at)
    }

    // The last of it: out of the tap and into the node it feeds, with the head
    // on the node's own entry cell. Stopping at the tap left the rail ending
    // beside a card with an arrow halfway along it pointing at nothing, which
    // is a line that happens to stop there rather than an edge arriving.
    const port = entryOf(banks[1], view.orientation)
    const head = down ? ARROW_DOWN : ARROW_RIGHT
    const reach = down ? port.y : port.x

    for (let at = arrives + 1; at < reach; at++) {
      rail(ends[1].bank, at)
    }

    if (reach >= arrives) {
      put(ends[1].bank, reach, head, tone)
    }

    // A rail carries work like any other edge, and until now it was the one
    // edge that never showed it: a reader watching a phase being fed from two
    // phases back saw the light travel every wire but that one. The route is
    // walked in the order the work goes — out of the card, across the margin,
    // into the node it feeds — so the light says which way as well as that.
    if (banks[1].agent.state === 'running') {
      const route: { x: number; y: number }[] = []
      const step = (line: number, at: number) => route.push(down ? { x: line, y: at } : { x: at, y: line })

      for (let at = starts + 1; at <= opens; at++) {
        step(ends[0].bank, at)
      }

      for (let side = ends[0].bank - ends[0].toward; side !== offset; side -= ends[0].toward) {
        step(side, opens)
      }

      if (ends[0].toward !== 0) {
        step(offset, opens)
      }

      for (let at = opens + 1; at <= arrives; at++) {
        step(offset, at)
      }

      for (let side = offset + ends[1].toward; side !== ends[1].bank; side += ends[1].toward) {
        step(side, arrives)
      }

      if (ends[1].toward !== 0) {
        step(ends[1].bank, arrives)
      }

      for (let at = arrives + 1; at <= reach; at++) {
        step(ends[1].bank, at)
      }

      paintFlowing(c, route, tick)
    }

    // How many edges the rail stands for, written along the rail itself — the
    // line beside it is a column wide, and a figure dropped there reads as a
    // stray mark rather than as a count. Written along means across the pane
    // where the rail runs across it and down it where the rail runs down, which
    // is two cells of one column rather than a label with nowhere to go. The
    // `×` is what tells it from the figures on the cards it passes.
    const count = `×${skip.count}`

    if (skip.count > 1 && arrives - leaves >= count.length + 4) {
      const at = leaves + Math.floor((arrives - leaves - count.length) / 2)
      const tint = mix(tone, COLORS.text, 0.6)

      for (let i = 0; i < count.length; i++) {
        put(offset, at + i, count.codePointAt(i) ?? 0x20, tint)
      }
    }
  })
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
function bordersOf(lanes: LaneBox[], orientation: 'flow' | 'stack'): number[] {
  return lanes.map(lane =>
    orientation === 'flow' && lane.edgeAt >= 0 && lane.edgeAt < lane.busAt && lane.edgeAt < lane.x - 1
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
function paintSections(
  c: Canvas,
  view: Layout,
  laneAgents: { phase: string; agents: AgentRow[] }[],
  passes: Map<string, Pass>,
  bottom: number,
  tick: number,
  over: boolean,
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

  if (view.orientation === 'flow') {
    const bandBottom = Math.max(
      ...view.lanes.map(l => Math.max(l.y + l.h, ...l.nodes.map(n => n.y + n.h))),
    )

    bordersOf(view.lanes, view.orientation).forEach(x => {
      if (x < 0) {
        return
      }

      for (let y = Math.max(0, view.headerRows); y < Math.min(bottom, bandBottom); y++) {
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

    const facts = phaseFactsOf(lane.phase, lane.index, laneAgents[lane.index]?.agents ?? [], passes, over)
    const filled = facts.total > 0 ? Math.round((facts.landed / facts.total) * c.columns) : 0
    /** The columns of this rule a wire is in, which its name has to keep off. */
    const wired: number[] = []

    for (let x = 0; x < c.columns; x++) {
      const landed = x < filled

      // Laid out down the pane the wires run down and the rule runs across, so
      // here it is the rule that hops: the same arc, drawn in the rule's own
      // quiet, saying a wire passes under it rather than ending there.
      if (armsOf(c.at(x, y)) === (ARM.up | ARM.down)) {
        c.put(x, y, HOP, tone)
        wired.push(x)

        continue
      }

      // A point standing in a rule breaks it, and reads as a bullet someone set
      // on the line rather than as the cell a wire leaves a card by. Where the
      // band is tight enough that a card's exit cell is the next band's rule,
      // one cell has two marks to carry and the rule is the one that has to be
      // whole: it runs the width of the pane, and a gap in it reads as a gap in
      // the phase. The point is the one that can be spared, because a wire
      // leaving the cell directly under a card says which card it left without
      // being told.
      if (c.at(x, y) === PORT) {
        c.put(x, y, landed ? RULE_DONE : RULE_LEFT, tone)
        wired.push(x)

        continue
      }

      ink(x, y, landed ? RULE_DONE : RULE_LEFT, tone)
    }

    // The name is set into the rule the way a card's is set into its top edge:
    // centred, with a blank cell either side of it, so the rule reads as one
    // line broken by a word rather than as two lines with a word between them.
    const label = paintPhaseLabel(c, 0, y, c.columns, facts, 2, w => clearOf(c, y, w, wired))

    c.put(label.x - 1, y, 0x20, tone)
    c.put(label.x + label.w, y, 0x20, tone)
  })
}

/**
 * Where a band's name can stand in its rule without rubbing out a wire.
 *
 * The rule has already given way to every wire that crosses it: those cells
 * hold the wire's own arc, and the cells where a card's exit point fell on the
 * rule hold the rule in the point's place. A name set into the rule clears the
 * cells it stands in, so a name standing on one of them takes a carry's only
 * cell in that row — the wire above the rule and the wire below it stop dead
 * against a word, with nothing to say they are one line.
 *
 * So the name moves instead. It starts centred and steps out a cell at a time
 * until the window it needs, its own blanks included, holds nothing but rule.
 * A rule with no such window anywhere keeps the name centred: a band whose
 * every column carries a wire has nowhere better, and the name is the thing
 * that has to be readable.
 */
function clearOf(c: Canvas, y: number, w: number, wired: number[]): number {
  const centred = Math.max(0, Math.floor((c.columns - w) / 2))
  const taken = new Set(wired)
  const free = (x: number) => {
    for (let dx = -1; dx <= w; dx++) {
      const code = c.at(x + dx, y)

      if (taken.has(x + dx) || (code !== RULE_DONE && code !== RULE_LEFT && code !== 0x20)) {
        return false
      }
    }

    return true
  }

  if (free(centred)) {
    return centred
  }

  for (let step = 1; step <= c.columns; step++) {
    for (const x of [centred - step, centred + step]) {
      if (x >= 0 && x + w <= c.columns && free(x)) {
        return x
      }
    }
  }

  return centred
}

function along(view: Layout, p: { x: number; y: number }): number {
  return view.orientation === 'flow' ? p.y : p.x
}

/**
 * True where the gutter has room for a bundle: a line of its own, clear of the
 * row the arrowheads land on. Drawn in a one-row gutter the bundle's junctions
 * land on its own arrowheads and rub them out.
 */
function deeper(view: Layout, right: LaneBox): boolean {
  const ports = right.nodes.map(n => entryOf(n, view.orientation))

  return ports.length > 0 && Math.min(...ports.map(p => (view.orientation === 'flow' ? p.x : p.y))) > right.busAt
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

export function paint(c: Canvas, run: RunState, options: PaintOptions): PaintResult {
  const { nowMs, selectedId } = options
  // A run that has ended draws no more frames, so anything that moves has to
  // stop on a frame that reads: the still tick holds every label at its start
  // and every spinner where it was.
  const tick = run.status === 'running' ? options.tick : -1

  c.clear()

  const selected = run.agents.find(a => a.agentId === selectedId)
  const panel: Rect | null = selected ? dialogOf(c, options.detailRows ?? 0) : null

  if (options.orientation === 'time') {
    const hotspots = paintTimeline(c, run, nowMs, tick, selectedId, 0, c.columns, options.runPicker)

    onCanvas(c, hotspots, c.rows)
    modal(hotspots, panel !== null && selected !== undefined, menuKeeps(options))

    const detail = panel && selected
      ? paintDetail(c, selected, nowMs, panel, options.detailScroll ?? [], hotspots, run.defaultModel)
      : undefined

    onCanvas(c, hotspots, c.rows)

    // Drawn in the order they stack, then the drawing pushed back behind
    // whichever of them ended up in front.
    const menu = paintRunMenu(c, run, options, hotspots)
    const settings = paintSettings(c, options, hotspots)
    const about = paintAbout(c, options, hotspots)

    shade(c, frontOf(about, settings, menu, detail && panel))

    return { hotspots, orientation: 'time', detail }
  }

  const view = layout(run, c.columns, c.rows, options.orientation ?? 'auto', 0)
  const lanes = orderedLanes(run)
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

  // The flat list, and not merely a stack of one-row nodes: a band of rows still
  // has gutters to route through and still says which node fed which, so it is
  // drawn with every wire a band of cards gets.
  const isList = view.list === true

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
    (view.orientation === 'flow'
      ? exitOf(from, 'flow').y === entryOf(to, 'flow').y
      : exitOf(from, 'stack').x === entryOf(to, 'stack').x)

  /** The gutters drawn as one bundle, whose carries are not drawn again. */
  const bundled = new Set<number>()
  /** Where every edge put its arrowhead, so a rail can be kept off them. */
  const arrows: { x: number; y: number }[] = []

  // Barriers first, so a node always wins the cells it shares with one.
  /** The border columns, for the feeders that reach one: see `paintBarrier`. */
  const edges = new Set(
    view.orientation === 'flow' ? bordersOf(view.lanes, 'flow').filter(at => at >= 0) : [],
  )

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
    const wants = askew.length > 0 && deeper(view, right) && crowded(view, crossing, byId)
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
        edges,
      )
    }

    // Two phases that ran side by side have no barrier between them, whatever
    // order they were declared in. Drawing one says the later waited for the
    // earlier, which a reader can disprove from the two clocks on screen.
    if (!follows(lanes[i - 1], lanes[i])) {
      if (wants) {
        bundle()
      }

      continue
    }

    if (!isPipelineLike(lanes[i - 1], lanes[i], carries)) {
      // A chain is entered at its head and left from its tail. Feeding every
      // pass of it from the phase above draws four arrows into work that was
      // handed along, and the line each pass gave the next — the only line that
      // says it was a sequence — is lost among them.
      const ends = (chain: AgentRow[] | null, pick: (c: AgentRow[]) => AgentRow, nodes: NodeBox[]) => {
        if (!chain) {
          return nodes
        }

        const node = byId.get(pick(chain).agentId)

        return node ? [node] : nodes
      }

      paintBarrier(
        c,
        ends(chains[i - 1], chain => chain[chain.length - 1], left.nodes),
        ends(chains[i], chain => chain[0], right.nodes),
        right.busAt,
        view.orientation,
        false,
        tick,
        edges,
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
    const flow = view.orientation === 'flow'
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
        ? bordersOf(view.lanes, 'flow').filter(at => at >= 0)
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
  /**
   * The lines a run crosses that are not on the canvas yet.
   *
   * The border between two phases is painted after the wires, into the cells
   * they left empty, so a run cannot see it coming and would leave a hole in it
   * a cell wide. A run that reaches one of these columns hops it, the same way
   * it hops a wire, and the border is drawn whole either side of the arc.
   */
  const ruled = new Set(
    view.orientation === 'flow' ? bordersOf(view.lanes, 'flow').filter(at => at >= 0) : [],
  )

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
     * One cell of a run laid across the pane, hopped where something crosses.
     *
     * Whatever is already on the canvas `cross` finds for itself. The border
     * between two phases is not drawn yet, so that crossing has to be known
     * rather than seen.
     */
    const acrossAt = (x: number, y: number) => {
      if (ruled.has(x)) {
        c.put(x, y, HOP, stroke)

        return
      }

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
      const flow = view.orientation === 'flow'
      const gap = flow ? to.y - (from.y + from.h) : to.x - (from.x + from.w)
      const at = flow ? from.x + Math.floor(from.w / 2) : from.y + Math.floor(from.h / 2)

      const abreast = flow ? to.x === from.x : to.y === from.y

      if (abreast && gap >= 1 && gap <= 3) {
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

    if (view.orientation === 'flow' && start.y === end.y) {
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
    } else if (view.orientation === 'stack' && start.x === end.x) {
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
    } else if (view.orientation === 'flow' && end.x - start.x >= 2) {
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
    } else if (view.orientation === 'flow') {
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

  // An edge over more than one lane has a whole band of nodes in its way. One
  // such edge per node drew a thicket of lines threading between the columns,
  // so they are gathered by the pair of phases they join and drawn once, as a
  // rail in the margin the layout kept for them. Drawn last of the edges, so a
  // rail meeting a carry can say so with a junction rather than crossing it.
  if (!isList) {
    paintSkips(c, view, skipsOf(run), arrows, tick)
  }

  const bottom = c.rows

  const over = overOf(run)

  paintSections(c, view, lanes, passes, bottom, tick, over)

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
        node.agent.agentId === selectedId,
        hotspots,
        scale,
        run.defaultModel,
        passes.get(node.agent.agentId),
        claim,
        feet,
      )
    }
  }

  // A pane too small for the run drew the agents that fitted and said nothing
  // about the rest, which reads as a run with fewer agents in it than it has.
  const placed = view.lanes.flatMap(l => l.nodes)
  const past = (edge: number) =>
    placed.filter(n => n.y + n.h > edge || n.x + n.w > c.columns).length
  // The notice takes the last row, so it hides one more node than the pane did.
  const hidden = past(bottom) > 0 ? past(bottom - 1) : 0

  if (hidden > 0) {
    c.fill(0, bottom - 1, c.columns, 1, c.background)
    c.text(0, bottom - 1, `… ${hidden} more`, COLORS.dim)
  }

  if (hidden === 0 && view.pending.length > 0) {
    if (view.ahead) {
      paintAhead(c, view, run.plan, bottom, over)
    } else {
      // Centred in what the drawing left, not pinned to either end of it. Down
      // the pane the end of the run is the foot of the drawing, and a section
      // held against the seat's own bottom edge reads as part of the pane's
      // furniture rather than as the next thing the run will do — but held
      // against the last node instead, the same blank rows simply moved
      // underneath it. Between the two it reads as the drawing's own last
      // section, which is what it is.
      const foot = placed.length > 0 ? Math.max(...placed.map(n => n.y + n.h)) : view.headerRows
      const depth = Math.max(1, Math.min(view.aheadRows ?? 1, bottom - foot - 1))
      const slack = Math.max(0, bottom - foot - 1 - depth)
      const top = Math.min(bottom - depth, foot + 1 + Math.floor(slack / 2))

      paintAheadBand(c, view.pending, run.plan, top, depth, over)
    }
  }

  onCanvas(c, hotspots, hidden > 0 ? bottom - 1 : bottom)
  modal(hotspots, panel !== null && selected !== undefined, menuKeeps(options))

  const detail = panel && selected
    ? paintDetail(c, selected, nowMs, panel, options.detailScroll ?? [], hotspots, run.defaultModel)
    : undefined

  onCanvas(c, hotspots, c.rows)

  const menu = paintRunMenu(c, run, options, hotspots)
  const settings = paintSettings(c, options, hotspots)
  const about = paintAbout(c, options, hotspots)

  shade(c, frontOf(about, settings, menu, detail && panel))

  return { hotspots, orientation: view.orientation, detail }
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

  // The header's rule runs over the strip too, and meets the boundary the way
  // it meets the ones between the sections.
  if (view.headerRows >= 2) {
    c.put(strip.x, view.headerRows - 1, TEE_LEFT, tone)

    // Centred over the column it captions, which is how every other phase's
    // caption sits over its cards. It was flush left while the names were flush
    // left: two left edges a couple of cells apart read as a caption that
    // missed, so the two move together rather than one of them alone.
    const caption = truncate(over ? 'Skipped' : 'Ahead', inner)
    const capAt = strip.x + 1 + Math.max(0, Math.floor((inner - cells(caption)) / 2))

    c.text(capAt, view.headerRows - 2, caption, aheadTone(over))
  }

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
function paintRunMenu(c: Canvas, run: RunState, options: PaintOptions, hotspots: Hotspot[]): Rect[] {
  const runs = options.runs ?? []

  if (options.runPicker !== 'open' || runs.length === 0) {
    return []
  }

  // Under the bar, not through it: the name the menu drops from sits on the
  // bar's own middle row, so a menu opening there would cut the bar's closing
  // rule in half and take the run's name with it.
  const top = barRowsOf(c.rows, c.columns)
  // What the menu can show is what stands below the bar — and it leaves the
  // last row alone, where the graph says how much of itself it had to leave
  // out. A pane with no room for one entry and its frame gets no menu;
  // `/flowpane runs` is the list that needs no room at all.
  const room = c.rows - top - 3
  const across = c.columns - 4

  if (room < 1 || across < 6) {
    return []
  }

  const listed = listOf(runs, options.nowMs)
  // Captions cost rows, and a row spent on a caption is a run the reader
  // cannot see. Below the height that holds every run as well as its headings
  // the headings go and the order they described stays.
  const rows = listed.rows.length <= room ? listed.rows : listed.bare
  const shown = rows.length <= room ? rows.length : room - 1
  const cut = rows.slice(0, Math.max(1, shown))
  const more = rows.filter(r => r.id !== undefined).length - cut.filter(r => r.id !== undefined).length
  const drawn: MenuRow[] = [...cut, ...(more > 0 ? [{ text: `\u2026 ${more} more \u2014 /flowpane runs` }] : [])].slice(0, room)

  // Every clock ends in the same column, so the times can be read down the
  // menu rather than hunted for at the end of each name.
  const clockW = drawn.reduce((w, r) => Math.max(w, r.clock?.length ?? 0), 0)
  const widest = drawn.reduce((w, r) => Math.max(w, r.text.length + (r.clock ? clockW + 2 : 0)), 0)
  const inner = Math.max(4, Math.min(across, widest + 4))
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

  drawn.forEach((row, i) => {
    const y = top + 1 + i
    const current = row.id === run.runId
    const nameW = inner - 4 - (clockW > 0 ? clockW + 2 : 0)

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
        c.text(x + 4, y, truncate(row.text, inner - 4), COLORS.dim)

        return
      }

      const caption = truncate(row.text, Math.max(1, inner - 8))

      c.text(x + 4, y, row.mark, row.color ?? COLORS.dim)
      c.text(x + 6, y, caption, row.color ?? COLORS.dim)

      // Stopping where the clocks stop, so the rule ends on the column every
      // row on the menu ends on rather than running into the frame.
      for (let at = x + 7 + caption.length; at < x + inner; at++) {
        c.put(at, y, LIGHT.across, tone)
      }

      return
    }

    c.put(x + 2, y, current ? SHOWN_MARK : 0x20, COLORS.accent)
    c.text(x + 4, y, row.mark ?? '', row.color ?? COLORS.text)
    c.text(x + 6, y, truncate(row.body ?? row.text, Math.max(1, nameW - 2)), current ? COLORS.accent : COLORS.text)

    if (row.clock) {
      c.text(x + inner - row.clock.length, y, row.clock, COLORS.clock)
    }

    hotspots.push({ agentId: `run:${row.id}`, x: x + 2, y, w: inner - 2 })
  })

  hotspots.push(...covered)

  return [{ x, y: top, w: width, h: height }]
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
  { value: 'flow', label: 'across' },
  { value: 'stack', label: 'down' },
  { value: 'time', label: 'timeline' },
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
    [{ text: truncate(`${NAME} ${VERSION}`, Math.max(1, closeX - x - 4)), color: COLORS.text }],
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
 * @returns the cells each run's line occupies, so the rows become Buttons
 */
export function paintIdle(c: Canvas, runs: RunEntry[], nowMs: number, options?: PaintOptions): Hotspot[] {
  const hotspots = idleRuns(c, runs, nowMs)

  // The foot row is under the pane whether or not a run is drawing, so both of
  // its buttons have to open onto something here too. A settings button that
  // does nothing until a workflow starts is a button that looks broken, and the
  // idle pane is exactly where somebody asks what this is.
  if (options) {
    const settings = paintSettings(c, options, hotspots)

    shade(c, frontOf(paintAbout(c, options, hotspots), settings, [], null))
  }

  return hotspots
}

/** The idle pane itself: the bar, the session's runs, and the line under them. */
function idleRuns(c: Canvas, runs: RunEntry[], nowMs: number): Hotspot[] {
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
    return hotspots
  }

  if (runs.length === 0) {
    // Nothing to list and nothing to press: the room goes to saying what the
    // pane will do once there is.
    c.text(2, top, 'No workflow has run in this session yet.', COLORS.text)

    if (room > 2) {
      c.text(2, top + 2, 'Start one and its graph draws itself here as it goes.', COLORS.dim)
    }

    return hotspots
  }

  // The invitation takes the last row and a blank above it, and the list takes
  // what is left. On a pane too short for both, the list wins: it is the thing
  // that can be acted on.
  const hint = 'Press a run to draw it.'
  const hasHint = room >= 4
  const listRoom = hasHint ? room - 2 : room
  const { rows: grouped, bare } = listOf(runs, nowMs)
  const list = grouped.length <= listRoom ? grouped : bare
  const shown = list.length <= listRoom ? list.length : listRoom - 1
  const cut = list.slice(0, Math.max(1, shown))
  const hidden = list.filter(r => r.id !== undefined).length - cut.filter(r => r.id !== undefined).length
  const drawn: MenuRow[] = [
    ...cut,
    ...(hidden > 0 ? [{ text: `\u2026 ${hidden} more \u2014 /flowpane runs` }] : []),
  ].slice(0, listRoom)

  const clockW = drawn.reduce((w, r) => Math.max(w, r.clock?.length ?? 0), 0)
  const widest = drawn.reduce((w, r) => Math.max(w, r.text.length + (r.clock ? clockW + 2 : 0)), 0)
  // The list is a block, not a table stretched over an empty pane: the clock
  // ends where the widest line does rather than at the pane's far edge.
  const width = Math.min(c.columns - 4, Math.max(widest, hint.length))

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

      const caption = truncate(row.text, Math.max(1, width - 4))

      c.text(2, y, row.mark, row.color ?? COLORS.dim)
      c.text(4, y, caption, row.color ?? COLORS.dim)

      for (let at = 5 + caption.length; at < 2 + width; at++) {
        c.put(at, y, LIGHT.across, quiet)
      }

      return
    }

    c.text(2, y, row.mark ?? '', row.color ?? COLORS.text)
    c.text(4, y, truncate(row.body ?? row.text, Math.max(1, width - 2 - (clockW > 0 ? clockW + 2 : 0))), COLORS.text)

    if (row.clock) {
      c.text(2 + width - row.clock.length, y, row.clock, COLORS.clock)
    }

    hotspots.push({ agentId: `run:${row.id}`, x: 2, y, w: width })
  })

  // Under the list rather than at the pane's foot: the runs and what to do with
  // them are one block, and a line stranded ten rows below what it refers to is
  // read as being about the pane instead.
  if (hasHint) {
    c.text(2, top + drawn.length + 1, hint, COLORS.dim)
  }

  return hotspots
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
function listOf(runs: RunEntry[], nowMs: number): { rows: MenuRow[]; bare: MenuRow[] } {
  const rows: MenuRow[] = []
  const bare: MenuRow[] = []
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
      bare.push(row)
    }
  }

  return { rows, bare }
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
  form: (n: number) => string
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

  const columnFor = (form: (n: number) => string) =>
    Math.max(
      0,
      ...run.agents.map(agent => {
        const spent = tokensOf(agent)

        return spent === undefined ? 0 : form(spent).length
      }),
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
  columns: { state: number; time: number; spend: number; model: number; form: (n: number) => string },
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
    [columns.spend, spent === undefined ? '' : columns.form(spent), COLORS.spend, 'right'],
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
function paintTimeline(
  c: Canvas,
  run: RunState,
  nowMs: number,
  tick: number,
  selectedId: string | undefined,
  reservedRows: number,
  columns = c.columns,
  picker?: 'shut' | 'open',
): Hotspot[] {
  const hotspots: Hotspot[] = []
  const lanes = orderedLanes(run)
  const passes = passesOf(run)
  const barRows = barRowsOf(c.rows, c.columns)

  paintBar(c, run, nowMs, tick, barRows, columns, hotspots, picker)

  if (run.agents.length === 0) {
    c.text(0, barRows, 'Waiting for the first agent to start.', COLORS.dim)

    return hotspots
  }

  // What the names need, not a fixed share of the row.
  //
  // A third of the pane, capped at twenty-eight, is what this column used to
  // take whatever was on it: a run of short names left two thirds of the column
  // empty, and a run of long ones cut every name at twenty-eight however wide
  // the pane was — so at a hundred and forty columns the bars ran on for a
  // hundred cells beside `review:journal:correctne…`. The column asks for the
  // longest name it has to carry and is held to a share of the row, because the
  // bar beside it is the other half of what a reader came here to read.
  const wants = Math.max(0, ...run.agents.map(a => cells(a.label))) + 3
  const ceiling = Math.max(10, Math.min(Math.floor(columns * 0.45), columns - 44))
  const labelW = Math.max(10, Math.min(wants, Math.max(Math.floor(columns / 3), ceiling)))
  const axisX = labelW + 1
  // The numbers take a column of their own against the right edge rather than
  // riding after each bar. Down a run of thirty agents that is the difference
  // between thirty figures a reader has to find and three columns they can
  // compare — and no bar can reach far enough to shoulder them off the row.
  const facts = factsColumns(run, nowMs, Math.max(0, columns - axisX - 12))
  const axisW = Math.max(4, columns - axisX - 1 - (facts.width > 0 ? facts.width + 2 : 0))
  const factsX = columns - facts.width
  const startMs = Math.min(run.startedMs, ...run.agents.map(a => a.startedMs))
  const endMs = Math.max(run.endedMs ?? nowMs, ...run.agents.map(a => a.endedMs ?? nowMs))
  const span = Math.max(1000, endMs - startMs)
  const cellOf = (ms: number) =>
    axisX + Math.min(axisW - 1, Math.max(0, Math.floor(((ms - startMs) / span) * axisW)))

  const bottom = c.rows - reservedRows
  const running = run.status === 'running'
  const nowX = cellOf(nowMs)
  // Where a bar ends when its agent never reported one. While the run is going
  // that is the clock; once it has ended it is the end of the run, or the bars
  // of the agents it took down with it kept growing after it died.
  const openEnd = running
    ? nowMs
    : (run.endedMs ?? Math.max(nowMs, ...run.agents.map(a => a.endedMs ?? 0)))

  // No axis. Every bar is scaled to the one span the header already states, so
  // a ruled row of `0  15s  30s  45s` repeats that fact a dozen times to say
  // what one figure said once — and costs two of the rows the bars wanted.
  let y = barRows
  let remaining = run.agents.length
  // A phase nothing has entered has no bars to draw, so its band is a rule with
  // an empty row under it — which reads as a band that failed to draw rather
  // than as work still to come. They are gathered into a section at the foot
  // instead, the way the other layouts name them, and the rows it takes are
  // kept back before a bar is drawn: taken afterwards they would have been rows
  // an agent was already on.
  const pending = lanes.filter(lane => lane.agents.length === 0).map(lane => lane.phase)
  const aheadRows = aheadDepth(pending.length, bottom - barRows)
  const floor = bottom - aheadRows

  outer: for (const lane of lanes) {
    if (y >= floor) {
      break
    }

    if (lane.agents.length === 0) {
      continue
    }

    // The same rule a stacked band opens with, for the same reason: it says
    // where a phase starts, what it is called and how far it has got, and the
    // rows under it are that phase's agents.
    const band = phaseFactsOf(lane.phase, lanes.indexOf(lane), lane.agents, passes, overOf(run))
    const filled = band.total > 0 ? Math.round((band.landed / band.total) * columns) : 0
    const quiet = quietOf(c.background)

    for (let x = 0; x < columns; x++) {
      const landed = x < filled

      c.put(x, y, landed ? RULE_DONE : RULE_LEFT, quiet)
    }

    const label = paintPhaseLabel(c, 0, y, columns, band, 2)

    c.put(label.x - 1, y, 0x20, quiet)
    c.put(label.x + label.w, y, 0x20, quiet)

    y++

    for (const agent of lane.agents) {
      // The last row is kept for the count of what did not fit.
      if (y >= floor - 1 && remaining > 1) {
        c.text(0, Math.min(y, floor - 1), `… ${remaining} more`, COLORS.dim)
        break outer
      }

      if (y >= floor) {
        break outer
      }

      const isSelected = agent.agentId === selectedId
      const color = colorOf(agent.state)
      const took = (agent.endedMs ?? openEnd) - agent.startedMs
      const room = labelW - 3

      const moving = agent.state === 'running' || isSelected

      c.put(1, y, markOf(agent.state, tick), color)
      c.text(
        3,
        y,
        moving ? slide(agent.label, room, tick) : truncate(agent.label, room),
        isSelected ? COLORS.accent : COLORS.text,
      )
      hotspots.push({ agentId: agent.agentId, x: 3, y, w: Math.min(room, cells(agent.label)) })

      const x0 = cellOf(agent.startedMs)
      const x1 = cellOf(agent.endedMs ?? openEnd)
      const length = x1 - x0 + 1
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

      for (let x = x0; x <= x1; x++) {
        const tone = isLive
          ? mix(color, glow, pulse(x - x0, Math.max(2, length * 2), tick))
          : isSelected
            ? mix(color, COLORS.accent, 0.35)
            : color

        c.put(x, y, block, tone)
      }

      if (isLive) {
        c.put(x1, y, ARROW_RIGHT, mix(color, glow, 0.5))
      }

      drawColumns(c, factsX, y, facts, agent, took, run.defaultModel)

      // What the agent is doing, or what it answered, after the bar. Never
      // before it: the row is read left to right as the clock, and text ahead
      // of a bar says the agent was busy before it started.
      const tail = tailOf(agent, nowMs)
      const after = x1 + 2
      const afterRoom = factsX - 2 - after

      if (tail && afterRoom >= 6) {
        c.text(after, y, truncate(tail, afterRoom), tailColorOf(agent, nowMs, color))
      }

      remaining--
      y++
    }

    if (y < floor) {
      y++
    }
  }

  if (pending.length > 0) {
    // Centred between the last bar and the rows kept back for it, for the
    // reason the graph centres it: against either end it reads as the seat's
    // furniture rather than as the run's last section.
    const at = Math.min(floor, y + Math.floor(Math.max(0, floor - y) / 2))

    paintAheadBand(c, pending, run.plan, at, aheadRows, overOf(run))
  }

  // Where the clock stands, down the rows the agents took, in the cells no bar
  // claimed: a bar that reaches it is still going, one that stops short landed.
  //
  // A run that has ended gets no such line. `run.endedMs` is when the run's
  // status flipped, which is not when its agents stopped reporting — a line
  // there would sit a third of the way along bars that visibly continue past
  // it, and claim a moment the drawing contradicts. What happened to each
  // agent is a word in its own column instead.
  if (running) {
    for (let row = barRows; row < Math.min(y, bottom); row++) {
      if (c.at(nowX, row) === 0x20) {
        c.put(nowX, row, DASH_V, mix(COLORS.track, COLORS.running, 0.35))
      }
    }
  }

  return hotspots
}

/**
 * One line of the detail list, and the colour it is drawn in.
 *
 * `fields` is for a line that says two things in two colours — a call's name in
 * its state's tone beside the argument it was passed in the quieter one — and
 * `right` for what belongs against the block's far edge. A line with either is
 * drawn field by field; one with neither is drawn as the string it is.
 */
type DetailLine = { text: string; color: Rgb; bg?: Rgb; fields?: Field[]; right?: Field[] }

/** One scrollable block of the dialog, and where its list currently stands. */
export type DetailPane = {
  /** Lines this block holds. */
  total: number
  /** Lines it shows at once. */
  visible: number
  /** The first line shown, after clamping. */
  scroll: number
}

/** Every block of the dialog, in the order their controls are keyed. */
export type DetailView = { panes: DetailPane[] }

/**
 * The lines a call takes: what it was and what it was passed.
 *
 * What came back is not listed, a call that failed included. A tool's answer is
 * the agent's material, not the reader's — a file the agent read, a directory it
 * listed — and a list of them buried the calls themselves: what an agent did is
 * the sequence of its calls, and that sequence has to be readable down the
 * column. A failed call's reason was the one exception, and it was three lines
 * of an engine's own wording in a list of one-line rows; the mark says the call
 * failed, which is the part that belongs in the sequence.
 *
 * The payload wraps rather than truncates — what a call was *about* is usually
 * the reason the detail was opened, and one elided line of it says little — so
 * the column scrolls instead of cutting.
 *
 * A call read back from a transcript is stamped from the recording's own
 * timestamps, so it states its duration like a call this module watched. What a
 * transcript cannot say is whether the last call of a killed agent was still
 * going when the kill landed — an unclosed call on an agent that is no longer
 * running is drawn as a call that finished, not as one still in flight, since
 * the agent it belonged to certainly is not.
 */
function callLines(call: ToolCall, nowMs: number, width: number, live: boolean): DetailLine[] {
  const running = live && call.startedMs > 0 && call.endedMs === undefined
  const mark = running ? '…' : call.isError ? '✖' : '✔'
  const color = running ? COLORS.running : call.isError ? COLORS.failed : COLORS.done
  const name = `${mark}  ${call.name}`
  const quiet = mix(COLORS.text, color, 0.3)
  // What the call cost and how long it took, and nothing else. It used to carry
  // the number of the model request that issued it as well, which is an index
  // into a list the dialog does not draw — a figure a reader can do nothing
  // with, sitting in the row where the two they can are.
  const until = call.endedMs ?? (running ? nowMs : undefined)
  const lead = cells(name) + 2
  const tailWith = (form: (n: number) => string): Field[] =>
    [
      {
        text: call.startedMs > 0 && until !== undefined ? `${CLOCK_MARK} ${elapsed(until - call.startedMs)}` : '',
        color: COLORS.clock,
      },
      { text: call.stepTokens === undefined ? '' : form(call.stepTokens), color: COLORS.spend },
    ].filter(f => f.text.length > 0)

  // The count says what the request that issued this call wrote, and `∑ 4.2k`
  // on its own is a figure a reader has to be told the unit of. The word goes
  // in wherever the row still leaves the call's own argument something to be
  // read in — eight cells, which is the floor the wrap is given below.
  const named = tailWith(tokensNamed)
  const tail = lead + widthOf(named, 2) + 2 + 8 <= width ? named : tailWith(tokensWide)
  const tailW = tail.length > 0 ? widthOf(tail, 2) : 0
  const body = Math.max(8, width - lead)
  const said = briefPaths(call.input)
  const chunks = said ? wrapAfter(said, Math.max(8, body - (tailW > 0 ? tailW + 2 : 0)), body, 8) : []

  // The tool's name and what it was called with on one row. They were two rows
  // — the name, then the argument indented under it — which doubled the height
  // of a list whose whole job is to be read as a sequence, and set the name of
  // every call in a column of its own with nothing else in it.
  const lines: DetailLine[] = [
    {
      text: '',
      color,
      fields: [{ text: name, color }, ...(chunks[0] ? [{ text: chunks[0], color: quiet }] : [])],
      right: tail,
    },
  ]

  chunks.slice(1).forEach(text => {
    lines.push({ text: `${' '.repeat(lead)}${text}`, color: quiet })
  })

  return lines
}

/**
 * The line between one call and the next.
 *
 * A call is a heading and however many lines its payload wrapped to, so the
 * block is a column of ragged groups with nothing between them: the last line
 * of one call's input sat directly above the next call's name, and where a
 * call's payload was itself a list the two ran together. The rule is the same
 * device the block's own heading is ruled with and the same tone every other
 * structural line on the pane takes, so it divides without being read as
 * content — and it is drawn between calls only, never above the first or below
 * the last, where it would close the block a second time.
 */
const CALL_SEAM = 0x2508

function callSeam(c: Canvas, width: number): DetailLine {
  return { text: String.fromCodePoint(CALL_SEAM).repeat(Math.max(0, width)), color: quietOf(c.background) }
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
/** One titled block of the detail, laid out as a column of its own. */
type Section = {
  title: string
  lines: (width: number) => DetailLine[]
  /**
   * True where the lines cannot change while the run is going.
   *
   * Only a block like that may give width to its neighbours: a block still
   * being written would give a few cells away, grow past the rows it now fits
   * in, take them back, and re-wrap every column in the dialog on a frame the
   * reader was in the middle of reading.
   */
  fixed?: boolean
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
    return wrap(typeof value === 'string' ? value : answer, width, 200).map(text => ({ text, color }))
  }

  return JSON.stringify(value, null, 2)
    .split('\n')
    .slice(0, 400)
    .flatMap(line => folded(line, width, color))
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
  rect: Rect,
  scroll: number[],
  hotspots: Hotspot[],
  model?: string,
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
  const factsWith = (form: (n: number) => string, tools: string): Field[] => [
      { text: agent.phase, color: COLORS.dim },
      { text: `${CLOCK_MARK} ${elapsed(took)}`, color: COLORS.clock },
      { text: quiet > 0 ? `quiet ${elapsed(quiet)}` : '', color: mix(COLORS.failed, COLORS.running, 0.5) },
      { text: spent === undefined ? '' : form(spent), color: COLORS.spend },
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
  ]
  const facts = ladder.find(row => widthOf(divided(row), 1) <= footRoom) ?? ladder[ladder.length - 1]

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
      { text: String.fromCodePoint(agent.state === 'running' ? ARROW_RIGHT : BULLET), color },
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

  if (ruleY > rect.y) {
    for (let dx = 1; dx < rect.w - 1; dx++) {
      c.put(rect.x + dx, ruleY, LIGHT.across, quietOf(c.background))
    }
  }

  // Divided where the row has the cells for it. Where it has not, the dividers
  // come out rather than the figures: drawFields stops at the first field that
  // will not fit, and a row that stopped on a divider reads as a frame with a
  // piece broken off.
  const ruled = divided(facts)

  drawFields(
    c,
    rect.x + 2,
    footY,
    footRoom,
    widthOf(ruled, 1) <= footRoom ? ruled : facts,
    widthOf(ruled, 1) <= footRoom ? 1 : 3,
  )

  const sections: Section[] = []

  if (agent.prompt) {
    const prompt = agent.prompt

    sections.push({
      title: `${ASK_MARK}  Prompt`,
      lines: w => wrap(prompt, w, 200).map(text => ({ text, color: COLORS.text })),
      // An agent is given its prompt once and never again, so this is the one
      // block in the dialog whose height at a given width is settled before the
      // dialog is opened.
      fixed: true,
    })
  }

  if (calls.length > 0) {
    sections.push({
      title: `${TOOL_MARK}  Tool Calls  ${calls.length}`,
      // Newest first. A reader opens an agent's detail to see what it is doing
      // or what it did last, and the call that answers that was at the bottom of
      // a list long enough to scroll — so the block opened on the oldest call
      // every time, and the interesting end had to be hunted for.
      lines: w =>
        [...calls]
          .reverse()
          .flatMap((call, i) =>
            (i === 0 ? [] : [callSeam(c, w)]).concat(callLines(call, nowMs, w, agent.state === 'running')),
          ),
    })
  } else if (agent.tools.length > 0) {
    const list = agent.tools.map(t => (t.count > 1 ? `${t.name} ×${t.count}` : t.name)).join('   ')

    sections.push({
      title: `${TOOL_MARK}  Tool Calls`,
      lines: w => wrap(list, w, 40).map(text => ({ text, color: mix(COLORS.text, color, 0.3) })),
    })
  } else if (agent.lastTool) {
    // A run this module never watched has no call list, only the summary's
    // last call and its count.
    const count = agent.toolCalls ? `${agent.toolCalls} ${agent.toolCalls === 1 ? 'call' : 'calls'}, last ` : ''

    sections.push({
      title: `${TOOL_MARK}  Tool Calls`,
      lines: w => wrap(`${count}${agent.lastTool}`, w, 40).map(text => ({ text, color: mix(COLORS.text, color, 0.3) })),
    })
  }

  const saying = agent.state === 'running' && agent.isThinking ? agent.saying : undefined
  const answer = agent.result ?? agent.resultPreview

  if (saying) {
    sections.push({
      title: `${THINK_MARK}  Thinking`,
      lines: w => wrap(saying, w, 200).map(text => ({ text, color: mix(COLORS.text, color, 0.25) })),
    })
  } else if (answer) {
    sections.push({
      title: `${ANSWER_MARK}  Response`,
      lines: w => answerLines(answer, w, mix(COLORS.text, color, 0.25)),
    })
  }

  const bodyY = rect.y + 1
  const rows = Math.max(0, ruleY - bodyY)
  const inner: Rect = { x: rect.x + 1, y: bodyY, w: rect.w - 2, h: rows }

  if (rows < 2) {
    return { panes: [] }
  }

  // An empty dialog over a node that was just pressed reads as a dialog that did
  // not open. It says which of the two it is instead.
  if (sections.length === 0) {
    c.text(
      inner.x + 1,
      bodyY,
      agent.state === 'running'
        ? 'Nothing recorded yet: no prompt, no call, no answer.'
        : 'No transcript was written for this agent.',
      COLORS.dim,
    )

    return { panes: [] }
  }

  // What the agent was given and what it did are two halves of the same
  // question and read side by side. What it answered is the outcome of both,
  // so it takes a row of its own underneath, the full width of the dialog: an
  // answer is prose, and prose in a third of a pane wraps every four words.
  const tail = sections.length > 1 && rows >= 7 ? sections[sections.length - 1] : null
  const head = tail ? sections.slice(0, -1) : sections
  // As many rows as it has lines, up to a share of the dialog. It took the
  // share whatever it held, so a one-line answer sat at the top of six blank
  // rows while the prompt and the call list above it were scrolling nine lines
  // at a time — the dialog was giving its room to the block with nothing to
  // put in it. What the block does not need goes back to the two above it.
  const share = Math.max(3, Math.round(rows * 0.4))
  const need = tail ? tail.lines(Math.max(8, inner.w - 3)).length + 1 : 0
  const tailRows = tail ? Math.max(2, Math.min(share, need)) : 0
  const headRows = rows - tailRows - (tail ? 1 : 0)

  const top = paintColumns(c, { ...inner, h: headRows }, head, scroll, 0, hotspots)

  if (!tail) {
    return { panes: top }
  }

  const bottom = paintColumns(
    c,
    { ...inner, y: bodyY + headRows + 1, h: tailRows },
    [tail],
    scroll,
    top.length,
    hotspots,
  )

  return { panes: [...top, ...bottom] }
}

/**
 * A block's heading: what it is, a rule to the width of the block, and where
 * its list stands. What moves the list is the bar down the block's right edge,
 * not this.
 */
function paintHeading(c: Canvas, x: number, y: number, width: number, title: string, pane: DetailPane): void {
  const scrolls = pane.total > pane.visible
  const where = scrolls ? `${pane.scroll + 1}\u2013${Math.min(pane.total, pane.scroll + pane.visible)}/${pane.total}` : ''
  const whereW = where.length > 0 && width >= where.length + 10 ? where.length + 2 : 0
  const room = Math.max(1, width - whereW - 1)
  const drawn = c.text(x, y, truncate(title, room), COLORS.dim)

  for (let dx = drawn + 1; dx < width - whereW; dx++) {
    c.put(x + dx, y, 0x2500, quietOf(c.background))
  }

  if (whereW > 0) {
    c.text(x + width - whereW + 1, y, where, COLORS.dim)
  }
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

/**
 * A row of the dialog: its sections side by side, each with its own heading,
 * its own scroll position, its own scrollbar, and a rule between it and the
 * next.
 *
 * `base` is where this row's blocks start in the dialog's list of them, so a
 * block's controls keep the same key wherever the row is drawn.
 */
function paintColumns(
  c: Canvas,
  rect: Rect,
  sections: Section[],
  scroll: number[],
  base: number,
  hotspots: Hotspot[],
): DetailPane[] {
  const rows = rect.h - 1

  if (sections.length === 0 || rows < 1) {
    return []
  }

  // Each column gets an equal share; the rules between them and the scrollbar
  // each cost a cell, which comes out before the share is struck. A dialog too
  // narrow for one column per section stacks the leftovers into the last one
  // rather than dropping them — a detail that silently omits what an agent
  // called is worse than one that asks for a scroll.
  const count = columnsFor(rect.w, sections.length)
  const groups: Section[][] = Array.from({ length: count }, () => [])

  sections.forEach((s, i) => groups[Math.min(i, count - 1)].push(s))

  const share = Math.floor((rect.w - 2 - (count - 1) * 3) / count)
  // What the division left over goes to the last column, so its bar stands in
  // the dialog's own last cell. Split evenly it stood two or three cells short
  // of the edge, and a bar that stops before the frame reads as a bar that
  // belongs to something narrower than the block it moves.
  const spare = Math.max(0, rect.w - 2 - (count - 1) * 3 - count * share)
  const spans = groups.map(() => share)

  spans[count - 1] += spare

  // A block that already fits its rows gains nothing from another cell of
  // width, and the block beside it may be scrolling through eighty lines. An
  // equal split gave the prompt half a dialog to say nine lines in and left the
  // call list to be read seventeen at a time; what the prompt does not need
  // goes to the column that does.
  //
  // Only where there is a column that does. Where everything fits as it is,
  // narrowing the prompt buys the block beside it nothing and costs the reader
  // a column of four-word lines beside one of white space.
  const fair = Math.max(8, share - 2)
  const give = count > 1 && linesOf(groups[count - 1], fair).length > rows ? slackOf(groups[0], fair, rows) : 0

  spans[0] -= give
  spans[count - 1] += give

  const bodies = spans.map(span => Math.max(8, span - 1))
  // The scrollbar stands in the last cell of the block, and a line wrapped to
  // the whole of the block ends hard against it — a sentence and a bar with
  // nothing between them read as one run of characters.
  const texts = bodies.map(body => Math.max(8, body - 1))
  const lists = groups.map((group, i) => linesOf(group, texts[i]))
  const panes: DetailPane[] = []
  const starts = spans.map((_, i) => rect.x + 1 + spans.slice(0, i).reduce((at, w) => at + w + 3, 0))

  groups.forEach((group, i) => {
    const colX = starts[i]
    const each = spans[i]
    const text = texts[i]
    const block = bodies[i]
    const lines = lists[i]
    const total = lines.length
    const first = Math.max(0, Math.min(scroll[base + i] ?? 0, total - rows))
    const pane: DetailPane = { total, visible: rows, scroll: first }

    panes.push(pane)
    paintHeading(c, colX, rect.y, block, group[0].title, pane)
    // The block's own ground, a step up from the pane's: what an agent was
    // asked, what it called and what it answered is quoted material, and quoted
    // material set straight on the pane reads as the pane talking. The heading
    // stays outside it — that is the drawing's label for the block, not part of
    // what is quoted — and so does the bar, whose arrows are press targets, and
    // a press target is emitted as a Button, which carries no ground of its own.
    c.fill(colX - 1, rect.y + 1, text + 2, rows, quoteOf(c.background))

    lines.slice(first, first + rows).forEach((line, row) => {
      const y = rect.y + 1 + row

      if (!line.fields && !line.right) {
        c.text(colX, y, line.text, line.color, line.bg, text)

        return
      }

      const tail = line.right ?? []
      const tailW = tail.length > 0 ? widthOf(tail, 2) : 0

      drawFields(c, colX, y, Math.max(0, text - (tailW > 0 ? tailW + 2 : 0)), line.fields ?? [], 2)

      if (tailW > 0 && text > tailW + 4) {
        drawRight(c, colX + text, y, tail, 2)
      }
    })

    if (total > rows) {
      paintScrollbar(c, colX + block, rect.y + 1, rows, pane, base + i, hotspots)
    }

    // The rule between two columns runs the height of the row, so the blocks
    // read as columns rather than as text that happens to line up.
    if (i < count - 1) {
      for (let row = 0; row < rect.h; row++) {
        c.put(colX + each + 1, rect.y + row, 0x2502, COLORS.track)
      }
    }
  })

  return panes
}

/**
 * Every block of a column, one after another, each under its own heading.
 *
 * The first block's heading is the column's own, drawn in the rule above it, so
 * only the ones after it carry a heading in the text — with a blank line before
 * it, since a heading against the last line of the block above reads as part of
 * it.
 */
function linesOf(group: Section[], text: number): DetailLine[] {
  return group.flatMap((s, i) =>
    i === 0
      ? s.lines(text)
      : [{ text: '', color: COLORS.dim }, { text: s.title, color: COLORS.dim }, ...s.lines(text)],
  )
}

/**
 * The narrowest a block's prose is still worth reading at.
 *
 * Below this a wrapped sentence breaks about every four words, which costs more
 * rows than the narrowing saved and reads as a column of fragments.
 */
const MIN_TEXT = 30

/**
 * How many cells a column can give up without needing another row to say the
 * same thing in.
 *
 * Only a block whose lines are settled may give anything: see `Section.fixed`.
 * The count of wrapped lines never falls as the width narrows, so the narrowest
 * width that still fits is found by halving rather than by trying each one —
 * this runs on every frame of a live run.
 */
function slackOf(group: Section[], text: number, rows: number): number {
  const only = group.length === 1 ? group[0] : undefined

  if (!only || only.fixed !== true || text <= MIN_TEXT || only.lines(text).length > rows) {
    return 0
  }

  let narrow = MIN_TEXT
  let wide = text

  while (narrow < wide) {
    const mid = Math.floor((narrow + wide) / 2)

    if (only.lines(mid).length <= rows) {
      wide = mid
    } else {
      narrow = mid + 1
    }
  }

  return text - narrow
}

/**
 * How many of the sections fit side by side. Each needs about forty cells to
 * carry a wrapped line without breaking mid-phrase; below that the dialog shows
 * fewer blocks rather than three unreadable ones.
 */
function columnsFor(width: number, sections: number): number {
  return Math.max(1, Math.min(sections, Math.floor((width - 2) / BLOCK_W)))
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
 */
function paintPhaseLabel(
  c: Canvas,
  x: number,
  y: number,
  width: number,
  facts: PhaseFacts,
  /** Cells kept for the blanks either side of a label set into a rule. */
  inset = 0,
  /** Where to stand the label, given how wide it turned out. */
  place?: (w: number) => number,
): { x: number; w: number } {
  const tail = (facts.count ? facts.count.length + 1 : 0) + (facts.loop ? facts.loop.length + 1 : 0)
  const fields: Field[] = [
    { text: truncate(facts.name, Math.max(1, width - tail - inset)), color: facts.tone },
    ...(facts.count ? [{ text: facts.count, color: COLORS.dim }] : []),
    ...(facts.loop ? [{ text: facts.loop, color: mix(COLORS.dim, COLORS.accent, 0.5) }] : []),
  ]
  const w = Math.min(width, widthOf(fields, 1))
  const at = place ? place(w) : x + Math.max(0, Math.floor((width - w) / 2))

  // A label set into a rule clears the cells it stands in, its own gaps
  // included: a stroke showing through between the name and the count joins
  // them into one word with a line in it.
  if (inset > 0) {
    for (let dx = -1; dx <= w; dx++) {
      c.put(at + dx, y, 0x20, facts.tone)
    }
  }

  drawFields(c, at, y, width - (at - x), fields, 1)

  return { x: at, w }
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
  laneAgents: { phase: string; agents: AgentRow[] }[],
  nowMs: number,
  tick: number,
  orientation: 'flow' | 'stack',
  headerRows: number,
  columns = c.columns,
  passes: Map<string, Pass> = new Map(),
  hotspots?: Hotspot[],
  picker?: 'shut' | 'open',
): void {
  const barRows = Math.max(2, headerRows - (orientation === 'flow' ? 2 : 1))
  const quiet = quietOf(c.background)

  paintBar(c, run, nowMs, tick, barRows, columns, hotspots, picker)

  if (lanes.length === 0) {
    c.text(0, barRows, 'Waiting for the first agent to start.', COLORS.dim)

    return
  }

  // Stacked, each band opens with a rule of its own carrying its name: see
  // `paintSections`. There is nothing left for the header to say about them.
  if (orientation === 'stack') {
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
    const agents = laneAgents[lane.index]?.agents ?? []
    const facts = phaseFactsOf(lane.phase, lane.index, agents, passes, overOf(run))

    paintPhaseLabel(c, lane.x, captionRow, lane.w, facts)

    if (facts.total === 0) {
      return
    }

    // A phase's length of the rule is its own progress, filled to the fraction
    // that has landed, which ties the measurement to the column it measures.
    const filled = Math.round((facts.landed / facts.total) * lane.w)

    for (let dx = 0; dx < filled; dx++) {
      c.put(lane.x + dx, ruleRow, RULE_DONE, quiet)
    }

    // The joint between a filled length of rule and the border under it is
    // drawn heavy too, so the fill reads as one stroke rather than as two that
    // stop either side of the gutter.
    const next = borders[place + 1] ?? -1

    if (filled >= lane.w && next >= 0) {
      for (let x = lane.x + lane.w; x <= next; x++) {
        c.put(x, ruleRow, x === next ? TEE_DONE : RULE_DONE, quiet)
      }
    }
  })
}

export { COLORS }
