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
 * agent along a clock, which `paint` draws without this layout; `list` is the
 * flat list, which runs down the pane like `vertical` and draws a row per agent
 * in place of the bands.
 *
 * The list used to be reached only by making the pane small enough that a band
 * could not be drawn as cards. It is a reader's choice now, for the reason
 * every other size-driven device was given up: the pane's size decides what a
 * reader can see at once, not which drawing they are looking at.
 */
export type Orientation = 'auto' | 'horizontal' | 'vertical' | 'timeline' | 'list'

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
 * Columns take the width the pane gives them; the cap is the point past which
 * a wider node stops carrying more label and starts carrying air. A card holds
 * a label, a clock with a token count, and a model name — the longest of those
 * is the label, and past thirty-two columns the frame grows and the words do
 * not.
 */
const MAX_COL = 32
/**
 * The width every node is drawn at, in every layout, at every size of pane.
 *
 * A node used to be measured against the room there was for it: across, the
 * phases divided the pane between them and a column took a share; down, a band
 * wrapped so that its nodes could keep a width they were legible at; and past a
 * certain height every node in the drawing flattened from a card to a row. Three
 * devices, all of them answering the same question with the node's own size —
 * so the same run on the same machine was a different picture in a narrow
 * window than in a wide one, and a reader who dragged the pane's edge watched
 * the drawing redraw itself rather than move.
 *
 * A node is the same size whatever the pane is now. What the pane cannot hold
 * it scrolls to: the drawing runs past the edge and the rails say which way.
 * `MAX_COL` is the width to fix it at because that is the width the columns
 * already grew to wherever there was room — the point past which a wider node
 * carries no more label, only air.
 */
const NODE_W = MAX_COL

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

  // The list runs down the pane, so it reads on the vertical axis and takes the
  // header that axis takes. What makes it a list is which layout is called, not
  // which way it is read.
  if (setting === 'list') {
    return 'vertical'
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
  // what the sections are laid out in.
  //
  // This used to be measured twice — what fits, what the naming leaves, what
  // fits in that — because how many phases the pane could hold depended on how
  // wide the pane was. It does not any more: a phase is left out only for
  // being ahead of the run, which no amount of dragging the pane's edge
  // changes.
  const shown = fitting(numbered)
  const pending = numbered.filter(lane => !shown.includes(lane)).map(lane => lane.phase)
  const strip = orientation === 'horizontal' ? aheadWidth(pending, columns) : 0
  const depth = strip > 0 ? 0 : aheadDepth(pending.length, body)
  const room = Math.max(1, body - depth)

  const view =
    setting === 'list'
      ? listLayout(shown, columns, room, headerRows)
      : orientation === 'horizontal'
        ? flowLayout(shown, columns, room, headerRows, widest, strip)
        : stackLayout(shown, columns, room, headerRows)

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
 * The phases the drawing holds, which is every phase the run has reached.
 *
 * The pane's size used to decide this as well: a section wanted a column wide
 * enough for a label or a band deep enough for its card, and where there were
 * more phases than the pane could give that to, the empty ones gave their
 * sections up from the end of the run backward. It made the number of phases a
 * reader could see a function of how wide their window was, and a phase that
 * vanished when the pane narrowed looked like a phase the run had lost.
 *
 * Size is answered by scrolling now, so what is left here is the one reason to
 * leave a phase out that has nothing to do with the pane: the run has not
 * reached it. A phase with no agents in it is a rule with blank rows under it,
 * which reads as a band that failed to draw, and the phases at the end of a run
 * are all like that at once. Named together in the strip beside the drawing or
 * the band at its foot, they read as what they are — the rest of the run, in
 * order — and each reappears the moment an agent starts in it.
 */
function fitting(lanes: Lane[]): Lane[] {
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
  /**
   * Every column is the same width, and it is the width a node is drawn at.
   *
   * The pane used to divide itself between the phases and give each one a
   * share, falling back to a floor once the share stopped carrying a name and
   * letting the drawing overrun from there. Two devices, and the reader met
   * both of them by dragging one edge: the cards narrowed, the labels turned to
   * ellipses, and at some width the whole drawing changed shape. Past that
   * width it scrolled instead — which is what it does at every width now.
   */
  const colW = NODE_W
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
  // Divided only while a slice can hold a whole node and the gutter its wires
  // run down. Past that the slices are the wrong device — they would set a
  // thirty-two-cell card in a thirteen-cell section — so the columns stand at
  // the gutter they need, the drawing runs past the pane's edge, and the body
  // scrolls to the rest.
  const tiled = Math.floor(slice) - GUTTER >= colW

  const density: Layout['density'] = 'card'
  const nodeH = CARD_H
  // Room the tallest lane leaves over goes between its nodes rather than into
  // margins at the two ends: a lane of three boxes in thirty rows read as a
  // clump with half the pane blank around it. Capped, so a lane of two does not
  // put its nodes at opposite corners.
  const slack = tallest > 1 ? Math.floor((body - tallest * nodeH) / (tallest - 1)) : 0
  const nodeGap = Math.max(1, Math.min(3, slack))

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
function stackLayout(lanes: Lane[], columns: number, body: number, headerRows: number): Layout {
  // One column between neighbours reads them apart on its own — each node opens
  // with a rule in its own state's colour, a harder edge than any amount of
  // blank. Two is better where the width allows it: an edge that has to pass a
  // band needs a clear column to run down, and with a single one there is none,
  // so it falls out to the margin and draws three sides of a rectangle round
  // the band instead.
  // Two, always. It used to fall back to one where the wider gap left the band
  // too narrow to name its nodes, which was the gap paying for a width the
  // nodes no longer give up: a node is the same size at every pane size now, so
  // the only thing a narrower gap buys is a tighter band, and a band that does
  // not fit is scrolled to rather than squeezed.
  const nodeGap = 2

  // Every phase gets a band of the same depth, and a band carries its node, the
  // rule that opens the band under it, and the two rows the wires arriving need:
  // one to gather on and one for the arrowheads. A run whose first phase took
  // only the rows its cards needed crushed those cards against the rule opening
  // the phase below, and every wire leaving them crossed that rule in the row it
  // left in.
  const bands = Math.max(1, lanes.length)
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
   * The bands stand cards, at every size of pane.
   *
   * This was a plan the layout drew up twice, once per density, because what a
   * node spends on itself before a letter of its name is drawn depends on which
   * one it is — a card pays for its frame, a row does not — and the body's depth
   * chose between them: a run of seventeen phases in a body of thirty flattened
   * every node in the drawing to a row. The height has stopped bargaining. A
   * node is a card whatever the pane is, the bands keep the depth they need, the
   * drawing runs past the foot of the pane, and the body scrolls to the rest.
   */
  const density: Layout['density'] = 'card'
  const nodeH = CARD_H
  const colW = NODE_W

  // A body with no room for one card is the one pane a card cannot be drawn on
  // at all, and there the list is the honest drawing: a row per agent, in the
  // run's own order. Every deeper body keeps its cards and scrolls to what is
  // past the foot.
  //
  // This used to catch far more than that — a band too narrow to stand two
  // legible nodes side by side fell back to the list as well — because the
  // nodes were sized to the pane and a narrow pane made them illegible. They
  // are not sized to it any more, so a narrow pane is a drawing that runs off
  // the edge, not a drawing that has to become something else.
  if (body < CARD_H) {
    return listLayout(lanes, columns, body, headerRows)
  }
  /**
   * What a band is given down the pane: its own node with the air a band keeps
   * around it, and never less than an even share of the body.
   *
   * Equal shares are what give the stack its rhythm — every phase the same
   * depth, every card in the middle of its own band. A band is one node deep
   * whatever it holds, so every band asks the same of the body.
   */
  const depthOf = (_lane: Lane) => Math.max(airyAs(nodeH), Math.floor(body / bands))
  /** Where each band opens, which is where the one before it ended. */
  const tops: number[] = []
  let at = headerRows

  for (const lane of lanes) {
    tops.push(at)
    at += depthOf(lane)
  }

  const boxes: LaneBox[] = []

  lanes.forEach((lane, place) => {
    const top = tops[place] as number
    const bandH = depthOf(lane)
    const blockH = nodeH
    // A band's last row carries the next band's name rule, so the card centres
    // in what is left over. The last band has no rule under it and centres in
    // the whole of its own.
    const room = bandH - (place === lanes.length - 1 ? 0 : 1)
    const slack = Math.max(0, room - blockH)
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
    const shown = Math.max(1, lane.folds.length)
    const width = shown * colW + Math.max(0, shown - 1) * nodeGap
    // Centred, which is what makes a fan read as a fan — and what a band of one
    // needs, since a lone card pinned to the left edge of a pane it has all of
    // is a drawing that ran out rather than one placed. A band wider than the
    // pane has nothing to centre in, so it opens at the left like the run does
    // and runs off the right edge; the body scrolls to the rest of it.
    const left = Math.max(1, Math.floor((columns - width) / 2))

    boxes.push({
      phase: lane.phase,
      index: lane.index,
      x: 0,
      y,
      w: columns,
      h: blockH,
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
