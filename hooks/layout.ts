/**
 * Lays the run out as a layered graph, along whichever axis the pane's shape
 * (or the person's setting) calls for.
 *
 * `flow` puts one phase per column and reads left to right, which is how a
 * pipeline is usually drawn and what a wide seat wants. `stack` puts one phase
 * per row and reads top to bottom, which is what a tall narrow seat wants — a
 * pane docked beside the transcript is often forty columns wide, and a
 * five-phase run drawn across it would be five columns of eight characters.
 *
 * The layout answers to the body it is given either way: as the widest lane
 * outgrows the room, nodes drop first their stat line and then their frames, so
 * a forty-agent run still reads as a graph rather than scrolling out of view.
 */

import type { AgentRow, RunState } from './journal'
import { orderedLanes, type Fold, type FoldedLane, type FoldPass } from './shape'

/**
 * Which way the phases run. `auto` picks from the pane's proportions; `time`
 * is not a direction for the graph but the timeline in its place, one row per
 * agent along a clock, which `paint` draws without this layout.
 */
export type Orientation = 'auto' | 'horizontal' | 'vertical' | 'timeline'

export type NodeBox = {
  /**
   * The agent the box draws: where the work was done more than once, the last
   * pass of it. Its figures are that pass's, not the sum — a reader comparing
   * two cards is comparing two agents, and a row that silently totalled three
   * of them would make the comparison a lie.
   */
  agent: AgentRow
  /**
   * Every time this piece of work ran, where it ran more than once. Drawn as a
   * mark per pass beside the name; absent where the work ran once.
   */
  passes?: FoldPass[]
  /**
   * The row's own name, where it is not the agent's: a box standing for a whole
   * nested run is named after that run, not after whichever of its agents is
   * carrying its figures.
   */
  name?: string
  /**
   * What the box stands for, where it stands for a whole nested run rather than
   * one agent: how many agents are folded inside it, and the phase a press on
   * the count unfolds.
   *
   * `alone` marks the boxes that carry that press themselves. A shut nested run
   * is a phase, so its band has a rule with a caption on it and the caption
   * carries the handle; a wave folded back inside an opened run is a row in the
   * middle of a band and has no rule of its own, so the row is the only place
   * its own way back out can go.
   */
  inside?: { agents: number; phase: string; alone?: boolean }
  x: number
  y: number
  w: number
  h: number
}

export type LaneBox = {
  phase: string
  index: number
  x: number
  y: number
  w: number
  h: number
  /** Which row a stacked band's name rule takes, over the band it names. */
  captionRow?: number
  /**
   * Where the boundary before this lane is drawn, laid out across: the cell
   * halfway between this lane's cards and the ones before them. -1 for the
   * first lane, which opens at the edge of the pane, and for a stacked band,
   * whose boundary is its own name rule.
   */
  edgeAt: number
  /** Where the barrier's spine stands, in the gutter before this lane. */
  busAt: number
  nodes: NodeBox[]
  /**
   * True for a nested run a reader has opened: its rows are a run of their own
   * and are drawn one step in, behind a gutter of their own, with the row at
   * the foot of the lane given to what the whole of that run came to.
   */
  inset?: boolean
  /** Where a declared-but-unentered phase draws its outline. */
  ghost?: { x: number; y: number; w: number; h: number }
}

export type Layout = {
  lanes: LaneBox[]
  density: 'card' | 'row'
  headerRows: number
  /** Which axis this layout used, after `auto` resolved. */
  orientation: 'horizontal' | 'vertical'
  /** Phases the pane had no room to draw, named beside or under it instead. */
  pending: string[]
  /** The strip at the end of the drawing those phases are named in, if any. */
  ahead?: { x: number; w: number }
  /**
   * Rows the drawing gave up at its foot to name those phases instead, where
   * there was no room for a strip beside it.
   */
  aheadRows?: number
  /**
   * True where the drawing is the flat list: sections of one-line rows, in the
   * run's own order, with no edges between them. A pane too narrow for a node
   * of any kind falls back to it, and the painter draws no wires, barriers or
   * rails there — the order down the page is the only thing left to say them
   * with.
   */
  list?: boolean
}

/** A phase and what ran in it, numbered by where it falls in the run. */
type Lane = FoldedLane & { index: number }

/** Cells a nested run's own rows stand in from the run that called them. */
export const INSET_W = 2

/**
 * What a fold contributes to the box that draws it, wherever the box is placed.
 *
 * The passes ride along only where there is more than one of them: a node whose
 * work ran once has nothing to say about passes, and an array of one would have
 * every painter checking its length before drawing nothing.
 */
function boxOf(fold: Fold): Pick<NodeBox, 'agent' | 'name' | 'passes' | 'inside'> {
  return {
    agent: fold.agent,
    ...(fold.label === fold.agent.label ? {} : { name: fold.label }),
    ...(fold.passes.length > 1 ? { passes: fold.passes } : {}),
    ...(fold.inside ? { inside: fold.inside } : {}),
  }
}

/** A card: its top border with the name in it, its figures, its bottom border. */
export const CARD_H = 3

/**
 * The cells the pane's own title needs, and the pane it is worth spending them
 * on.
 *
 * `FlowPane - Dynamic Workflow Visualizer` is thirty-eight, and a title with
 * nothing either side of it reads as a label stuck to the top edge rather than
 * as a heading, so the row is only taken where there are a few cells to spare.
 * The height bar is the harder one: the title says the same thing on every
 * frame, and a row that never changes is the first row a short pane should give
 * up to one that does.
 */
export const TITLE_MIN_COLUMNS = 46
export const TITLE_MIN_ROWS = 16

/** Whether this pane carries the title row at all. */
export function titledPane(rows: number, columns: number): boolean {
  return rows >= TITLE_MIN_ROWS && columns >= TITLE_MIN_COLUMNS
}

/**
 * How deep the bar at the top of the pane is.
 *
 * Three rows: a rule, the run's line, a rule. The line sits between two edges
 * rather than against the pane's own, and what comes after it starts under a
 * border rather than after a gap. A pane too short for that gives up the bar's
 * opening rule first — the closing one is the border, and the border stays.
 *
 * A fourth row above all of it carries the pane's own name, where the pane is
 * big enough to spare it — see `titledPane`.
 */
export function barRowsOf(rows: number, columns: number): number {
  return (rows >= 10 ? 3 : 2) + (titledPane(rows, columns) ? 1 : 0)
}

/**
 * The gutter between two phases, laid out across.
 *
 * Seven columns rather than five, because three things share it and each needs
 * a clear cell either side: the boundary between the two phases, the barrier's
 * spine, and the wires running between them. At five the boundary stood in the
 * spine's own column, so a reader could not tell the edge of a phase from the
 * line every agent of it feeds.
 */
const GUTTER = 7
const MIN_COL = 12
/**
 * The narrowest a card can be drawn and still close its own frame.
 *
 * `╭─ ✔ n ─╮` is eight cells: two corners, the dash either side of the name and
 * the mark, the space either side of them, and one cell of name. Narrower than
 * that the name is set into the edge over the corner it is supposed to stop
 * before, and the card is drawn without a right-hand side.
 */
const CARD_W = 8
/**
 * How many cards the body has to hold before cards are worth drawing at all.
 *
 * The height's answer to `two` in the across layout: the pane keeps the device
 * while it has enough room for the reader to move between two of them, and
 * gives it up below that rather than draw one card and a sliver.
 */
const CARDS_MIN = 2
/**
 * What a node spends on itself before a letter of its name is drawn.
 *
 * A card is a row inside a frame: `╭─ ✔ name ─╯` spends eight cells — two
 * corners, the dash either side of the name and the mark, and the space either
 * side of them — where `▌✔ name ` spends five: the state rule, the mark, and
 * the air that keeps those two apart and the name off the figures.
 *
 * MIN_COL is a floor on the *column*, not on the name, so a twelve-cell column
 * of cards left four cells of name and a phase called `Base Branch Health`
 * came out `Bas…` on every card in it. The floor was being paid to the frame.
 */
const NODE_COST = { card: CARD_W, row: 5 } as const
/**
 * The fewest cells of name a node may have before the pane stops dividing
 * itself between its sections.
 *
 * Eight is where the run this was built for stops colliding with itself:
 * `Preflig…`, `Pre-comm…` and `security` are three phases a reader can tell
 * apart at eight cells and cannot at six. Above it the division stands, even
 * where a wider column would read better — nineteen cells is a card with
 * eleven of name, and calling that too narrow would spend a scroll to buy
 * cells nobody asked for.
 */
const NAME_MIN = 8
/**
 * Columns take the width the pane gives them; the cap is the point past which
 * a wider node stops carrying more label and starts carrying air. A card holds
 * a label, a clock with a token count, and a model name — the longest of those
 * is the label, and past thirty-two columns the frame grows and the words do
 * not.
 */
const MAX_COL = 32

/**
 * Picks the axis from the pane's proportions: a seat wide enough to give every
 * phase a legible column reads left to right, anything squarer or taller reads
 * downward.
 */
export function resolveOrientation(
  setting: Orientation,
  columns: number,
  rows: number,
  phases: number,
): 'horizontal' | 'vertical' {
  if (setting === 'horizontal' || setting === 'vertical') {
    return setting
  }

  // One phase has no direction to read in; keep the familiar one.
  if (phases <= 1) {
    return 'horizontal'
  }

  const fits = phases * (MIN_COL + GUTTER)

  return columns >= fits && columns >= rows * 2 ? 'horizontal' : 'vertical'
}

export function layout(
  run: RunState,
  columns: number,
  rows: number,
  setting: Orientation = 'auto',
  reservedRows = 0,
  /** Nested runs the reader has unfolded; the rest draw as one row each. */
  opened?: Set<string>,
): Layout {
  const lanes = orderedLanes(run, opened)
  const barRows = barRowsOf(rows, columns)
  // What follows the bar is the phases, and where they are written depends on
  // which way they run: across, their names take a row under the bar and their
  // progress the row after it; downward, each band carries its own name over
  // itself, so the header ends with the row the first of those takes.
  const probe = Math.max(1, rows - barRows - 3 - reservedRows)
  const orientation = resolveOrientation(setting, columns, probe, lanes.length)
  const headerRows = barRows + (orientation === 'horizontal' ? 2 : 1)

  if (lanes.length === 0) {
    return { lanes: [], density: 'card', headerRows, orientation: 'horizontal', pending: [] }
  }

  const body = Math.max(1, rows - headerRows - 1 - reservedRows)
  const widest = Math.max(1, ...lanes.map(l => l.folds.length))
  const numbered = lanes.map((lane, index) => ({ ...lane, index }))
  // A phase left out is named rather than dropped, and the naming costs the
  // drawing something: across, a strip at the end of the phases, where the run
  // would have reached it; down, a row under the drawing. What is left over is
  // laid out again, so the sections divide what the naming leaves rather than
  // what it took.
  const whole = fitting(numbered, orientation, columns, body)
  const left = numbered.filter(lane => !whole.includes(lane))
  const probeStrip = orientation === 'horizontal' ? aheadWidth(left.map(lane => lane.phase), columns) : 0
  const room = Math.max(1, body - (probeStrip > 0 ? 0 : aheadDepth(left.length, body)))
  const shown = fitting(numbered, orientation, columns - probeStrip, room)
  const pending = numbered.filter(lane => !shown.includes(lane)).map(lane => lane.phase)
  const strip = orientation === 'horizontal' ? aheadWidth(pending, columns) : 0
  const depth = strip > 0 ? 0 : aheadDepth(pending.length, body)

  const view =
    orientation === 'horizontal'
      ? flowLayout(shown, columns, room, headerRows, widest, strip)
      : stackLayout(shown, columns, room, headerRows, widest)

  // The strip names what the run has not reached, so it belongs after what the
  // run has. It stands at the pane's own right edge, where the drawing ends
  // with the pane; where the drawing runs past the pane it goes after the last
  // phase instead, because pinned to the edge it would sit in the middle of the
  // drawing, between two phases that did run.
  const drawnTo = Math.max(
    0,
    ...view.lanes.flatMap(lane => [lane.x + lane.w, ...lane.nodes.map(n => n.x + n.w)]),
  )
  const stripAt = drawnTo > columns - strip ? drawnTo + GUTTER : columns - strip

  return {
    ...view,
    pending,
    ...(strip > 0 ? { ahead: { x: stripAt, w: strip } } : {}),
    ...(depth > 0 ? { aheadRows: depth } : {}),
  }
}

/**
 * The strip at the end of the drawing the phases still to come are named in.
 *
 * A phase the run has not reached has nothing to draw, so it is named instead
 * — and named where the run will reach it, after the phases that are drawn,
 * rather than in a rule under them, where it read as a note about the pane.
 *
 * It costs width, so it is taken only where the drawing can spare it: enough
 * for the longest name, never more than a fifth of the pane, and never at the
 * price of the phases that have work in them. A pane too narrow for that names
 * them in the row under the drawing, which costs a line instead.
 */
const AHEAD_NAME = 14

/**
 * The rows the drawing gives up at its foot to name them instead.
 *
 * Down the pane, along a timeline, and across a pane too narrow for a strip,
 * the naming costs height rather than width — and there it is drawn as the band
 * it stands for: the caption set into its own rule, dashed rather than solid
 * because nothing has run in it, and the names on the row it opens.
 *
 * A body with nothing to spare gives up the caption: at one row the names take
 * its place inside the rule, which is the same line a band's own name is set
 * into, and says the same thing in the room a short pane has.
 */
/** The caption's own rule, plus a row for the first phase under it. */
const AHEAD_ROWS = 2

export function aheadDepth(pending: number, body: number): number {
  if (pending === 0) {
    return 0
  }

  // Never a third of the body: a drawing that spent two of its five rows on
  // what has not happened yet is a drawing about the wrong thing.
  if (body < AHEAD_ROWS * 3) {
    return 1
  }

  // A row each, within that third. The band used to be two rows whatever it
  // held, so every phase in it was squeezed onto one line as a run of names
  // with arrows between them — a device the pane uses nowhere else, for the
  // only part of the drawing that is not a node. A row each is the same row
  // the list layout gives an agent, which is a shape the reader already knows.
  return Math.max(AHEAD_ROWS, Math.min(1 + pending, Math.floor(body / 3)))
}

function aheadWidth(phases: string[], columns: number): number {
  if (phases.length === 0) {
    return 0
  }

  const longest = Math.min(AHEAD_NAME, Math.max(...phases.map(phase => phase.length)))
  // The boundary and a clear cell after it, then the node: its state rule, its
  // mark, the cell between the mark and the name, the name, and the cell that
  // closes it off. Every other one-row node on the pane is built the same way,
  // and the strip holds nodes now rather than a column of bare names.
  const want = longest + 7

  return want <= Math.floor(columns / 5) && columns - want >= MIN_COL * 2 + GUTTER ? want : 0
}

/**
 * The phases the pane has room to draw properly.
 *
 * Every phase gets a section of the same size, so each one costs the same
 * whether ten agents ran in it or none ever will. A phase nothing has entered
 * is an outline and a name, and it is the first thing to do without: under
 * pressure the sections fall to the height of their own cards, which puts the
 * wires leaving one through the rule opening the next.
 *
 * Empty phases give their section up from the end of the run backward, since a
 * run reaches its last phase last. What survives is drawn at a size worth
 * reading; a phase dropped here appears the moment an agent starts in it.
 */
function fitting(
  lanes: Lane[],
  orientation: 'horizontal' | 'vertical',
  columns: number,
  body: number,
): Lane[] {
  // Across, a section is a column and wants a card wide enough to carry a
  // label rather than the truncation of one — twice the floor; downward it is a band, and wants its card, the
  // rule that opens the band below, the bundle's row, the arrowheads' row, and
  // the row the wires leaving the card turn in.
  const roomy = (count: number) =>
    orientation === 'horizontal'
      ? Math.floor((columns - GUTTER * Math.max(0, count - 1) - 1) / Math.max(1, count)) >=
        MIN_COL * 2
      : Math.floor(body / Math.max(1, count)) >= CARD_H + 4

  const shown = [...lanes]

  // The phases the run has not reached give up their sections however much room
  // the pane has, and go together rather than one at a time. A section is a rule
  // and the nodes under it; a phase with no agents has no nodes, so its section
  // is a rule with blank rows under it — which reads as a band that failed to
  // draw. Named together in the strip beside the drawing or the band at its
  // foot, they read as what they are: the rest of the run, in order.
  while (shown.length > 1 && shown[shown.length - 1].folds.length === 0) {
    shown.pop()
  }

  if (roomy(shown.length)) {
    return shown
  }

  // Still short: a phase in the middle that nothing entered gives its section
  // up too, from the end of the run backward.
  while (shown.length > 1 && !roomy(shown.length)) {
    const spare = [...shown].reverse().find(lane => lane.folds.length === 0)

    if (!spare) {
      break
    }

    shown.splice(shown.indexOf(spare), 1)
  }

  return shown
}

/**
 * Where a band with nothing in it puts the one node it draws.
 *
 * Its own width, not the lane width. A band's cards are cut to whatever divides
 * the widest band between its agents — five across a narrow pane leaves eleven
 * cells a card — and a band with one node in it was cut to the same eleven, so
 * a phase that never ran said `⊘ Veri…` in a band with sixty columns spare
 * either side of it.
 *
 * It is a row rather than a card, so the ceiling is the one the band at the foot
 * holds its rows to — a name, the line the phase wrote about itself and a model,
 * in seven tenths of the pane — rather than the one a card is held to. A card's
 * ceiling on a row left the detail cut to `only what …` with half the pane
 * empty beside it.
 */
function plannedBox(columns: number, colW: number, y: number): { x: number; y: number; w: number; h: number } {
  const room = Math.max(8, columns - 2)
  const w = Math.max(colW, Math.min(room, Math.max(MAX_COL, Math.floor(columns * 0.7))))

  return { x: Math.max(1, Math.floor((columns - w) / 2)), y, w, h: 1 }
}

/**
 * A card, or a row each.
 *
 * A card is three rows: a border with the agent's name in it, what the agent
 * cost, and the border's other side. The frame is what says where one node ends
 * and the next begins on every side of it — a fill said so too, but only in the
 * rows a Raster draws, and a node's name row is drawn as elements, so the fill
 * broke across it.
 *
 * A card plus the row between it and the next is four, which is what a lane
 * needs per agent before boxes beat a list.
 *
 * The test is whether the body can stand two whole cards, not whether it can
 * stand every node of the tallest lane. It used to be the second: one nested
 * run opened to thirteen agents turned every card in the drawing into a row,
 * so a reader who asked to see inside one phase paid for it with the frames,
 * the models and the clocks on all sixteen of the others. That is the trade the
 * width already refuses — past the point where a column can carry a name the
 * columns take the width they need and the body scrolls sideways to the rest —
 * and the height now refuses it the same way: the nodes keep their height, the
 * drawing runs past the pane's foot, and the body scrolls down to the rest.
 *
 * Two, because two is what it takes to have anything to scroll between. A body
 * with room for one card and a sliver of the next is a pane that shows a node
 * at a time, and there a list of rows says more.
 */
function densityOf(widest: number, room: number): Layout['density'] {
  return Math.min(widest, CARDS_MIN) * 4 <= room ? 'card' : 'row'
}

/** Phases as columns, agents stacked inside them, the run reading rightward. */
function flowLayout(
  lanes: Lane[],
  columns: number,
  full: number,
  headerRows: number,
  tallest: number,
  /** Cells kept at the end for the phases the run has not reached. */
  ahead = 0,
): Layout {
  const body = full

  const width = Math.max(1, columns - ahead)
  const gutters = GUTTER * Math.max(0, lanes.length - 1)
  const spare = Math.max(0, width - gutters - 1)
  const wanted = Math.floor(spare / Math.max(1, lanes.length))
  // MIN_COL is a floor on legibility, not on fit: a body too narrow for every
  // lane at that width loses the lanes past its edge, which is better than a
  // column of two characters.
  const packed = Math.max(4, Math.min(MAX_COL, Math.max(MIN_COL, wanted), spare))
  const cost = NODE_COST[densityOf(tallest, body)]
  /** What a column gets if every phase keeps a share of the pane. */
  const shared = Math.min(MAX_COL, Math.floor((width - gutters) / lanes.length))
  /**
   * Whether the pane has stopped dividing itself between its phases.
   *
   * Seventeen phases divided into a hundred and ten columns is seventeen
   * ellipses, each of which has to be opened to find out what it is — and the
   * drawing overran the pane at that width anyway, since seventeen columns of
   * twelve cells and their gutters is three hundred and twenty-three. The
   * squeeze bought nothing it did not also scroll for.
   *
   * So past the point where a column can carry a name the phases take the
   * width they need, the drawing runs past the pane's edge, and the body
   * scrolls to the rest. Four phases a reader can read and thirteen they can
   * scroll to is the same pane saying more — and a live run's window is
   * already centred on the phase at work, so the reader arrives where the run
   * is rather than at the start of an hour-old one.
   */
  const squeezed = shared < cost + NAME_MIN
  /**
   * What a column that survives the cut is given: the cells MIN_COL promised,
   * with what the node spends on itself paid on top. A drawing that is going
   * to be scrolled anyway should scroll to something worth reading.
   */
  const floorW = cost + MIN_COL
  /**
   * The width the columns divide between them.
   *
   * The strip naming what the run has not reached costs the drawing width only
   * while the drawing ends inside the pane. Where the columns run past that
   * edge the strip goes after the last of them instead — which is what
   * `stripAt` does with it — so the columns divide the pane itself, and a pane
   * a hundred and ten wide is not budgeted as eighty-nine.
   */
  const budget = squeezed ? columns : width
  /**
   * Whether the pane can show two whole columns, which is what it takes to
   * have anything to scroll between: half a card and a wire leaving the edge
   * is worse than a narrow card whole, and one lane has nothing to divide
   * with at all.
   */
  const two = lanes.length > 1 && columns >= (MIN_COL + GUTTER) * 2
  /** How many columns the pane holds at that width, gutters and all. */
  const held = squeezed
    ? Math.max(two ? 2 : 1, Math.floor((budget + GUTTER) / (floorW + GUTTER)))
    : lanes.length
  /**
   * Each phase owns an equal slice of the width and stands its cards in the
   * middle of it.
   *
   * The cards used to be packed at a fixed gutter and the block centred, which
   * left the drawing's spare width pooled at its two ends — so the first
   * phase's cards sat well right of the middle of everything drawn around
   * them, and its name with them, while the last phase's sat well left. A
   * section that divides the pane puts every column of cards, and every name
   * over one, in the middle of the section it belongs to, and the boundary
   * between two phases halfway between their cards.
   */
  const slice = width / lanes.length
  // Divided only while every phase can have a legible slice of it. Past that
  // the slices are the wrong device: they would set a twenty-cell card in a
  // thirteen-cell section, and what pays is the gutter the wires run down.
  const tiled = !squeezed && Math.floor(slice) - GUTTER >= MIN_COL
  // The pane's own edge and the strip's are not the same edge. A column wider
  // than the pane loses its tail to the frame, which is what the floor on
  // legibility is for; a column wider than what the strip leaves is drawn over
  // the phases the strip is there to name, and the two run into each other with
  // no gap between them. Where the strip is there the columns take what is left
  // and no more.
  const ceiling = ahead > 0 ? Math.max(4, Math.floor(spare / Math.max(1, lanes.length))) : MAX_COL
  // The width at which `held` columns fill the pane exactly, so the drawing is
  // cut between two columns rather than through one: a fifth column showing
  // three cells of its frame at the edge is a card a reader can neither read
  // nor tell is there.
  const evenly = Math.min(MAX_COL, Math.max(MIN_COL, Math.floor((budget - GUTTER * (held - 1)) / held)))
  const legible = two ? (squeezed ? evenly : MIN_COL) : 4
  const colW = Math.max(
    legible,
    Math.min(ceiling, tiled ? Math.max(MIN_COL, Math.min(MAX_COL, Math.floor(slice) - GUTTER)) : packed),
  )

  // A card is a frame with a name set into its top edge, and under CARD_W the
  // name takes the frame's own corner: at six cells the card came back as
  // `╭ ✔ r` with nothing closing it, which is a box the reader has to finish
  // themselves. A row that narrow still carries the state, the mark and the
  // first letters of the name, so the question the density asks about height is
  // asked about width as well.
  const density = densityOf(tallest, body) === 'card' && colW >= CARD_W ? 'card' : 'row'
  const nodeH = density === 'card' ? CARD_H : 1
  // Room the tallest lane leaves over goes between its nodes rather than into
  // margins at the two ends: a lane of three boxes in thirty rows read as a
  // clump with half the pane blank around it. Capped, so a lane of two does not
  // put its nodes at opposite corners.
  const tightGap = density === 'row' ? 0 : 1
  const slack = tallest > 1 ? Math.floor((body - tallest * nodeH) / (tallest - 1)) : 0
  const nodeGap = Math.max(tightGap, Math.min(density === 'row' ? 2 : 3, slack))

  const boxes: LaneBox[] = []
  const graphW = colW * lanes.length + gutters
  const packedAt = Math.max(0, Math.min(1, width - graphW), Math.floor((width - graphW) / 2))
  const sliceAt = (i: number) => Math.round(i * slice)
  const placeOf = (i: number) =>
    tiled
      ? sliceAt(i) + Math.max(0, Math.floor((sliceAt(i + 1) - sliceAt(i) - colW) / 2))
      : packedAt + i * (colW + GUTTER)

  // The tallest lane sets the block every other lane centres inside, so a
  // fan-out still reads as a fan, and the block centres in the body so every
  // column reads as a section of the same height with its nodes in the middle
  // of it. The leftover splits above and below rather than pooling under the
  // graph, which read as a drawing that had run out rather than one placed.
  const blockH = tallest * nodeH + Math.max(0, tallest - 1) * nodeGap
  const blockTop = headerRows + Math.max(0, Math.floor((body - blockH) / 2))

  lanes.forEach((lane, place) => {
    const height = lane.folds.length * nodeH + Math.max(0, lane.folds.length - 1) * nodeGap
    const top = blockTop + Math.max(0, Math.floor((blockH - height) / 2))
    const x = placeOf(place)
    const before = boxes[boxes.length - 1]
    const gapAt = before === undefined ? -1 : before.x + before.w
    // Halfway between the cards either side of it, so each phase's section is
    // as wide on one side of its cards as on the other.
    const edgeAt = gapAt < 0 ? -1 : gapAt + Math.max(0, Math.floor((x - gapAt - 1) / 2))

    boxes.push({
      phase: lane.phase,
      index: lane.index,
      x,
      y: headerRows,
      w: colW,
      h: body,
      edgeAt,
      // The spine stands between the boundary and the cards it feeds, clear of
      // both: a line in the boundary's own column reads as the boundary, and
      // one against the cards reads as their edge.
      busAt:
        place === 0
          ? x - 1
          : Math.min(x - 2, edgeAt + Math.max(1, Math.ceil((x - 1 - edgeAt) / 2))),
      nodes: lane.folds.map((fold, i) => ({
        ...boxOf(fold),
        x,
        y: top + i * (nodeH + nodeGap),
        w: colW,
        h: nodeH,
      })),
      // One row, wherever the nodes beside it are cards: a phase that never ran
      // has a name, a line about itself and a model, and a card drawn round
      // three facts to sit level with cards that carry four is a frame around
      // blank cells. The same row the strip and the foot band name it in.
      ghost:
        lane.folds.length === 0
          ? { x, y: blockTop + Math.max(0, Math.floor((blockH - 1) / 2)), w: colW, h: 1 }
          : undefined,
    })
  })

  return { lanes: boxes, density, headerRows, orientation: 'horizontal', pending: [] }
}

/**
 * Phases as rows, agents side by side inside them, the run reading downward.
 *
 * Each band opens with a rule across the pane carrying its own name, which is
 * both the boundary between two phases and the label of the one below it. The
 * captions took a rail down the left before, and a rail is fourteen columns
 * spent on six words: on a pane docked beside a transcript those columns are
 * the difference between boxes and a list.
 */
function stackLayout(
  lanes: Lane[],
  columns: number,
  body: number,
  headerRows: number,
  widest: number,
): Layout {
  // One column between neighbours reads them apart on its own — each node opens
  // with a rule in its own state's colour, a harder edge than any amount of
  // blank. Two is better where the width allows it: an edge that has to pass a
  // band needs a clear column to run down, and with a single one there is none,
  // so it falls out to the margin and draws three sides of a rectangle round
  // the band instead.
  const usable = Math.max(8, columns - 2)
  const widthAt = (gap: number) => {
    const spare = Math.max(0, usable - gap * Math.max(0, widest - 1))

    return Math.min(MAX_COL, Math.floor(spare / Math.max(1, widest)))
  }

  const gaps = [2, 1]
  const nodeGap = gaps.find(g => widthAt(g) >= MIN_COL) ?? 1
  const wide = widthAt(nodeGap)

  // Below the width a label needs, side-by-side boxes stop being a graph and
  // start being confetti. The band becomes a list instead: one agent per row,
  // which is what a pane forty columns wide can actually carry.
  if (wide < MIN_COL) {
    return listLayout(lanes, columns, body, headerRows)
  }

  // Every phase gets a band of the same depth, and a band carries its node, the
  // rule that opens the band under it, and the two rows the wires arriving need:
  // one to gather on and one for the arrowheads. A run whose first phase took
  // only the rows its cards needed crushed those cards against the rule opening
  // the phase below, and every wire leaving them crossed that rule in the row it
  // left in.
  const bands = Math.max(1, lanes.length)
  /**
   * The least a band can be: its node, the rule opening the band under it, and
   * the two rows the wires arriving need — one to gather on and one for the
   * arrowheads.
   *
   * This is the floor the pane is tested against, not the depth a band is given.
   */
  const deepAs = (nodeH: number) => nodeH + 3
  /**
   * The depth a band is actually given: the floor, plus the two rows under the
   * node that make it centred — the row a card's exit point stands on and one
   * of air below that — plus one more above it, which is the row a card fed
   * from further back writes that phase's name on.
   *
   * At the floor a band is two rows of wire, the node, and then the next band's
   * rule — so the node sits hard against that rule with all of the band's air
   * above it, and a reader looking down the pane sees every card lying on the
   * line under it rather than standing in its own band. The exit point had
   * nowhere to go either: it landed on the rule, where the caption clears its
   * own cells, so the one mark saying which card a wire left was rubbed out
   * whenever it fell under the name.
   *
   * The third row above the node is what lets the written source stand centred
   * on its card with the mark and the word, the way the same label stands
   * across the pane. With two, the only row above a card was the one the
   * arrowheads land on, and an arrowhead stands in the middle of it: the label
   * had half a card's width, gave up its word for its name, and on a narrow
   * pane said nothing at all — the same run, the same card, said in one layout
   * and not the other. The wire gives way for the label on that row and runs
   * whole above and below it, which is what a band's own caption does to the
   * wire it covers.
   */
  const airyAs = (nodeH: number) => nodeH + 6
  /**
   * Whether the bands stand cards, which is the height's half of the bargain
   * the width already keeps.
   *
   * It used to be whether the body divided by the number of phases left room
   * for a card — so a run of seventeen phases in a body of thirty flattened
   * every node in the drawing to a row, and the same run laid out across kept
   * its cards and scrolled sideways to the rest. The same run on the same seat
   * was a graph under one setting and a list under the other.
   *
   * The test now is the one `densityOf` makes of the width: whether the body
   * can stand two whole bands of cards. Past that the bands keep the depth
   * their cards need, the drawing runs past the foot of the pane, and the body
   * scrolls down to the rest.
   */
  const density: Layout['density'] =
    Math.min(bands, CARDS_MIN) * deepAs(CARD_H) <= body ? 'card' : 'row'
  const nodeH = density === 'card' ? CARD_H : 1

  // Below even one band, a band is a rule with its node against it and every
  // wire into it drawn through one, so the pane reads better as a list.
  if (body < deepAs(nodeH)) {
    return listLayout(lanes, columns, body, headerRows)
  }

  // What a band does not spend on its card it spends on the wires arriving at
  // it, so room the pane has to spare goes where the drawing is rather than
  // into a margin at the foot of it.
  const bandH = Math.max(airyAs(nodeH), Math.floor(body / bands))
  /**
   * The narrowest node that still carries a name.
   *
   * MIN_COL is a floor on the node's whole width, and a card spends CARD_W of
   * it on its own frame and its state mark before a letter of the name is
   * drawn — so a band of eight agents across a hundred and ten columns gave
   * each card twelve cells, four of which were the name, and every one of them
   * came back `Bas…`. A row pays no frame and keeps the floor it always had.
   */
  /**
   * How many nodes a band stands side by side, once dividing the pane between
   * all of them has stopped carrying a name.
   *
   * Past that the band takes the width it needs, the drawing runs past the
   * pane's edge, and the body scrolls sideways to the rest — the same rule the
   * across layout keeps for its columns, so the two settings give way the same
   * way and a reader who learns one has learned the other.
   *
   * Never fewer than two, and never narrower than dividing the pane already
   * gave: a pane that cannot stand two nodes at MIN_COL came back as a list
   * several steps ago, and this is here to stop a band spreading itself thin,
   * not to take width off one that had room to spare.
   */
  const cost = NODE_COST[density]
  const held = Math.max(2, Math.floor((usable + nodeGap) / (cost + MIN_COL + nodeGap)))
  const colW =
    wide >= cost + NAME_MIN || widest <= held
      ? wide
      : Math.max(wide, Math.min(MAX_COL, Math.floor((usable - nodeGap * (held - 1)) / held)))
  /** What the widest band takes at that width, which is what the drawing reaches. */
  const spread = widest * colW + Math.max(0, widest - 1) * nodeGap

  const boxes: LaneBox[] = []

  lanes.forEach((lane, place) => {
    const top = headerRows + place * bandH
    // A band's last row carries the next band's name rule, so the card centres
    // in what is left over. The last band has no rule under it and centres in
    // the whole of its own.
    const room = bandH - (place === lanes.length - 1 ? 0 : 1)
    const slack = Math.max(0, room - nodeH)
    // Centred in what the band has, and never nearer the rule above than three
    // rows: the first carries the bundle every wire into this band turns on, the
    // last the arrowheads, and the one between them is where a card fed from
    // further back writes the name of the phase that fed it. With one row for
    // the bundle and the heads, the bundle is drawn over the very heads it
    // arrives with; with none, both land in the rule itself and the band's own
    // name is drawn through with wire.
    //
    // A band is deep enough for three rows above its node and two below, so
    // centring and that floor no longer pull against each other. They used to:
    // at the old depth the halves came to one row, the floor won, and every node
    // in the drawing sat as low in its band as it could go. Where a band has
    // more depth than the floor asks for, the halves win again and the node
    // stands in the middle of it.
    const lift = slack === 0 ? 0 : Math.max(Math.min(slack, 3), Math.floor(slack / 2))
    const y = top + lift
    const width = lane.folds.length * colW + Math.max(0, lane.folds.length - 1) * nodeGap
    // Centred while the drawing fits the pane, which is what makes a fan read
    // as a fan. Where the widest band runs past the edge every band goes left
    // instead: centred, a band of two would stand in the middle of a drawing
    // whose own first column is off at the left, and a reader scrolling to the
    // wide band's tail would lose the narrow bands on the way. From the left,
    // every band opens on its own first agent.
    const left =
      spread > columns ? 1 : Math.max(1, Math.floor((columns - width) / 2))

    boxes.push({
      phase: lane.phase,
      index: lane.index,
      x: 0,
      y,
      w: columns,
      h: nodeH,
      // The band's name rule is the line between it and the band before it: the
      // last row of that band, and for the first the row the header keeps back.
      edgeAt: -1,
      captionRow: Math.max(0, top - 1),
      // The spine takes the row under that rule, so the arrowheads always have
      // a row of their own beneath it. Sharing the arrowheads' row, a bundle
      // drawn there rubbed out the very heads it was arriving with — and in a
      // gap that narrow every crossing drawn as its own line turned on one row
      // and ran over the others.
      busAt: lift > 1 ? top : Math.max(0, top - 1),
      nodes: lane.folds.map((fold, i) => ({
        ...boxOf(fold),
        x: left + i * (colW + nodeGap),
        y,
        w: colW,
        h: nodeH,
      })),
      // On the row a card in this band would have its middle on, not the row a
      // card would start at: one row set against the top of a three-row block
      // sits high in a band laid out to centre what it holds.
      ghost:
        lane.folds.length === 0
          ? plannedBox(columns, colW, y + Math.floor((nodeH - 1) / 2))
          : undefined,
    })
  })

  return { lanes: boxes, density, headerRows, orientation: 'vertical', pending: [] }
}

/**
 * Every phase as a section of one-line rows: the shape a pane too narrow for
 * boxes can still carry. Order down the page is the run's order, so the list
 * needs no edges drawn between its rows.
 */
function listLayout(
  lanes: Lane[],
  columns: number,
  body: number,
  headerRows: number,
): Layout {
  const left = 2
  const width = Math.max(8, columns - left - 1)
  // A section per phase, one row per agent, one blank row between — and the
  // rows left over spread through those blanks rather than left in a block at
  // the foot of the pane.
  // A nested run a reader has opened is a run of its own, drawn one step in
  // from the run that called it: its rows take a gutter of their own, and one
  // row more at their foot for what the whole of it came to. Shut, it is a
  // single row of this run's and takes neither.
  const insetOf = (lane: Lane) => lane.nested && lane.shut !== true && lane.folds.length > 0
  const depthOf = (lane: Lane) => Math.max(1, lane.folds.length) + (insetOf(lane) ? 1 : 0)
  const rows = lanes.reduce((sum, lane) => sum + depthOf(lane), 0)
  const gaps = Math.max(0, lanes.length - 1)
  const spare = body - rows - gaps
  const sectionGap = 1 + (gaps > 0 ? Math.max(0, Math.min(2, Math.floor(spare / gaps))) : 0)
  const boxes: LaneBox[] = []
  let y = headerRows

  lanes.forEach(lane => {
    const inset = insetOf(lane)
    const indent = inset ? INSET_W : 0
    const nodes = lane.folds.map((fold, i) => ({
        ...boxOf(fold),
      x: left + indent,
      y: y + i,
      w: Math.max(4, width - indent),
      h: 1,
    }))

    boxes.push({
      phase: lane.phase,
      index: lane.index,
      x: 0,
      y,
      w: columns,
      h: depthOf(lane),
      edgeAt: -1,
      captionRow: Math.max(0, y - 1),
      busAt: y - 1,
      nodes,
      ...(inset ? { inset: true } : {}),
      ghost:
        lane.folds.length === 0 ? { x: left, y, w: width, h: 1 } : undefined,
    })

    y += depthOf(lane) + sectionGap
  })

  return { lanes: boxes, density: 'row', headerRows, orientation: 'vertical', pending: [], list: true }
}

/** Where an edge leaves a node, on the axis the layout runs along. */
export function exitOf(node: NodeBox, orientation: 'horizontal' | 'vertical'): { x: number; y: number } {
  return orientation === 'horizontal'
    ? { x: node.x + node.w, y: portRow(node) }
    : { x: node.x + Math.floor(node.w / 2), y: node.y + node.h }
}

/**
 * The row an edge leaves and arrives on, laid out across.
 *
 * A two-row card has no middle row, and `h / 2` rounds to the second — the one
 * with the figures on it. The edge then reads as a line drawn to a token count
 * rather than to an agent, so it goes to the row with the name on it.
 */
function portRow(node: NodeBox): number {
  return node.y + (node.h > 2 ? Math.floor(node.h / 2) : 0)
}

/** Where an edge arrives. */
export function entryOf(node: NodeBox, orientation: 'horizontal' | 'vertical'): { x: number; y: number } {
  return orientation === 'horizontal'
    ? { x: node.x - 1, y: portRow(node) }
    : { x: node.x + Math.floor(node.w / 2), y: node.y - 1 }
}

/** How far a laid-out drawing reaches, in cells from the pane's own origin. */
export function extentOf(view: Layout): { w: number; h: number } {
  const boxes = view.lanes.flatMap(lane => [
    { x: lane.x, y: lane.y, w: lane.w, h: lane.h },
    ...lane.nodes,
    ...(lane.ghost ? [lane.ghost] : []),
  ])

  return {
    // The strip and the band naming the phases the run has not reached are part
    // of the drawing, not furniture around it: a reader scrolling to the end of
    // a long run is scrolling to see what is still to come.
    w: Math.max(0, ...boxes.map(b => b.x + b.w), view.ahead ? view.ahead.x + view.ahead.w : 0),
    h: Math.max(0, ...boxes.map(b => b.y + b.h)) + (view.aheadRows ? view.aheadRows + 1 : 0),
  }
}

/**
 * The same drawing, moved.
 *
 * Scrolling happens after the layout rather than inside it, and it moves the
 * boxes rather than the cells: every wire, barrier, rail and arrowhead the
 * painter draws is derived from where the boxes are, so moving the boxes moves
 * the whole picture and keeps it consistent with itself. The painter's window
 * then drops whatever falls outside the body.
 */
export function scrolled(view: Layout, dx: number, dy: number): Layout {
  if (dx === 0 && dy === 0) {
    return view
  }

  const move = <T extends { x: number; y: number }>(box: T): T => ({ ...box, x: box.x + dx, y: box.y + dy })
  // The spine is a column across the pane and a row down it, so which way it
  // moves is which way the drawing runs. Moved by `dx` in both, a band scrolled
  // down the pane kept its spine on the row it was laid out at while its cards
  // went with the scroll, and every wire into that band ran from a card at the
  // top of the drawing to a spine forty rows below it — through every card in
  // between. Nothing caught it while the stacked layout could not scroll.
  const along = view.orientation === 'horizontal' ? dx : dy

  return {
    ...view,
    lanes: view.lanes.map(lane => ({
      ...move(lane),
      ...(lane.captionRow !== undefined ? { captionRow: lane.captionRow + dy } : {}),
      edgeAt: lane.edgeAt < 0 ? lane.edgeAt : lane.edgeAt + dx,
      busAt: lane.busAt < 0 ? lane.busAt : lane.busAt + along,
      nodes: lane.nodes.map(move),
      ...(lane.ghost ? { ghost: move(lane.ghost) } : {}),
    })),
    ...(view.ahead ? { ahead: { ...view.ahead, x: view.ahead.x + dx } } : {}),
  }
}
