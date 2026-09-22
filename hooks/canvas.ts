/**
 * A truecolor cell buffer and the drawing primitives the graph is painted with.
 *
 * A Raster's cells are `columns * rows` little-endian u32 triplets
 * `[codePoint, foreground, background]`, base64 of that buffer. Every code
 * point has to be one printable width-1 BMP character, so the whole vocabulary
 * here is box drawing, blocks and braille — which is enough for state rules
 * down a node's edge, orthogonal edge routing and a row of bars.
 */

/** The terminal's own color, as bit 24 alone rather than an RGB value. */
export const DEFAULT_COLOR = 0x01000000

/**
 * What stands in for a character this grid cannot hold: the terminal's own sign
 * for a glyph it has nothing to draw.
 *
 * Every cell of a Raster is one column wide, and every measurement on this pane
 * — a card's frame, a label's room, the column a wire turns in — counts cells.
 * A character the terminal gives two columns to breaks that: the glyph is
 * drawn, and every cell after it on the row is drawn one column right of where
 * the drawing put it, so a card's right edge lands outside the card and the
 * pane's own edge lands outside the pane. One wide glyph in one label is enough
 * to do it, and agent labels come from whatever a workflow script called them.
 *
 * So the grid is what holds and the glyph is what gives way. A label in a
 * script that is written in Japanese comes out as boxes, which is the same
 * thing a terminal with no font for it would show, and the drawing around it is
 * still a drawing.
 */
const TOFU = 0x25a1

/**
 * Whether a terminal gives this code point two columns instead of one.
 *
 * The East Asian Wide and Fullwidth blocks, and the handful of symbols outside
 * them that default to an emoji presentation. Not the ambiguous-width ones: the
 * marks this pane is drawn with — `\u2714`, `\u2298`, `\u2211` — are ambiguous, and
 * refusing those would leave nothing to draw with.
 */
export function wide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    // The symbols a terminal draws as emoji whether or not it is asked to.
    (code >= 0x231a && code <= 0x231b) ||
    (code >= 0x23e9 && code <= 0x23ec) ||
    code === 0x23f0 ||
    code === 0x23f3 ||
    (code >= 0x25fd && code <= 0x25fe) ||
    (code >= 0x2614 && code <= 0x2615) ||
    (code >= 0x2648 && code <= 0x2653) ||
    code === 0x267f ||
    code === 0x2693 ||
    code === 0x26a1 ||
    (code >= 0x26aa && code <= 0x26ab) ||
    (code >= 0x26bd && code <= 0x26be) ||
    (code >= 0x26c4 && code <= 0x26c5) ||
    code === 0x26ce ||
    code === 0x26d4 ||
    code === 0x26ea ||
    (code >= 0x26f2 && code <= 0x26f3) ||
    code === 0x26f5 ||
    code === 0x26fa ||
    code === 0x26fd ||
    code === 0x2705 ||
    (code >= 0x270a && code <= 0x270b) ||
    code === 0x2728 ||
    code === 0x274c ||
    code === 0x274e ||
    (code >= 0x2753 && code <= 0x2755) ||
    code === 0x2757 ||
    (code >= 0x2795 && code <= 0x2797) ||
    code === 0x27b0 ||
    code === 0x27bf ||
    (code >= 0x2b1b && code <= 0x2b1c) ||
    code === 0x2b50 ||
    code === 0x2b55
  )
}

/**
 * Whether a terminal gives this code point no column at all: a combining mark,
 * a variation selector, a zero-width joiner or space.
 *
 * Written into a cell of its own, one of these takes a column the terminal does
 * not give it back — and a variation selector does worse, since what it does is
 * turn the character before it into a wide one after that character has already
 * been measured and placed.
 */
export function hidden(code: number): boolean {
  return (
    (code >= 0x0300 && code <= 0x036f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x20d0 && code <= 0x20f0) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0xfe00 && code <= 0xfe0f) ||
    (code >= 0xfe20 && code <= 0xfe2f) ||
    (code >= 0x2060 && code <= 0x2064) ||
    code === 0xfeff
  )
}

/**
 * How many cells a string takes once it is written: one per code point the grid
 * keeps, and none for the ones it drops.
 *
 * `String.length` counts UTF-16 units, so it reads an astral character as two
 * and a combining mark as one — and every budget measured that way hands out
 * room the text does not use or room it overruns.
 */
export function cells(s: string): number {
  let n = 0

  for (const ch of s) {
    if (!hidden(ch.codePointAt(0) ?? 0x20)) {
      n++
    }
  }

  return n
}

export type Rgb = number

export function rgb(r: number, g: number, b: number): Rgb {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
}

/**
 * The color a Raster cell is drawn in, which is not always the color it was
 * given: the surface keeps four bits a channel there, rounding each to the
 * nearest seventeenth, so `#282828` is painted `#222222`.
 *
 * An element's color is not rounded, so the same ground came out six values
 * apart on the two kinds of row a drawing is cut into, and every row carrying a
 * node's label had a band across the pane. Elements are given the color the
 * cells beside them will be drawn in.
 */
export function cellColor(value: Rgb): Rgb {
  if (value === DEFAULT_COLOR) {
    return value
  }

  const channel = (shift: number) => Math.round(((value >> shift) & 0xff) / 17) * 17

  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

/** Mixes two colors, `t` from 0 (all `a`) to 1 (all `b`). */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  if (a === DEFAULT_COLOR || b === DEFAULT_COLOR) {
    return t < 0.5 ? a : b
  }

  const k = Math.max(0, Math.min(1, t))
  const ch = (shift: number) => {
    const from = (a >> shift) & 0xff
    const to = (b >> shift) & 0xff

    return Math.round(from + (to - from) * k) & 0xff
  }

  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

export class Canvas {
  readonly columns: number
  readonly rows: number

  private readonly words: Uint32Array

  /** The ground every clear paints: the terminal's own, or an opaque colour. */
  readonly background: Rgb

  constructor(columns: number, rows: number, background: Rgb = DEFAULT_COLOR) {
    // A NaN or infinite size would make a buffer with no cells, and a drawing
    // that silently draws nothing; a bad measurement becomes a small canvas.
    this.columns = Math.max(1, Math.min(512, Number.isFinite(columns) ? Math.floor(columns) : 20))
    this.rows = Math.max(1, Math.min(256, Number.isFinite(rows) ? Math.floor(rows) : 6))
    this.words = new Uint32Array(this.columns * this.rows * 3)
    this.background = background

    this.clear()
  }

  /**
   * The rectangle drawing lands in. Everything outside it is dropped.
   *
   * A drawing larger than the pane used to be cut down until it fitted, which
   * meant the run had to be made smaller to be seen at all. With a window, the
   * layout is done whole and moved under a header that stays put: the cells
   * that fall outside simply do not land, so a lane shifted half off the top
   * draws the half that is still in the body and nothing over the header.
   */
  private clip = { x: 0, y: 0, w: 0, h: 0 }

  /**
   * Sets the window, or clears it when called with nothing. Drawing between
   * the two calls is clipped to the rectangle; drawing outside them is not.
   */
  window(x?: number, y?: number, w?: number, h?: number): void {
    this.clip =
      x === undefined
        ? { x: 0, y: 0, w: this.columns, h: this.rows }
        : { x, y: y ?? 0, w: w ?? this.columns, h: h ?? this.rows }
  }

  clear(background: Rgb = this.background): void {
    // Each frame starts with the whole pane open, so a painter that set a
    // window and threw cannot leave the next frame clipped to it.
    this.window()

    for (let i = 0; i < this.columns * this.rows; i++) {
      this.words[i * 3] = 0x20
      this.words[i * 3 + 1] = DEFAULT_COLOR
      this.words[i * 3 + 2] = background
    }
  }

  /** Writes one cell, ignoring anything outside the buffer. */
  put(x: number, y: number, codePoint: number, fg: Rgb, bg?: Rgb): void {
    if (x < 0 || y < 0 || x >= this.columns || y >= this.rows) {
      return
    }

    const clip = this.clip

    if (x < clip.x || y < clip.y || x >= clip.x + clip.w || y >= clip.y + clip.h) {
      return
    }

    const i = (y * this.columns + x) * 3

    this.words[i] = codePoint
    this.words[i + 1] = fg

    if (bg !== undefined) {
      this.words[i + 2] = bg
    }
  }

  /** One cell's code point and colors, for a surface without a Raster. */
  cell(x: number, y: number): { code: number; fg: Rgb; bg: Rgb } {
    const i = (y * this.columns + x) * 3

    return { code: this.words[i], fg: this.words[i + 1], bg: this.words[i + 2] }
  }

  /** The code point at a cell, or a space for one off the buffer. */
  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.columns || y >= this.rows) {
      return 0x20
    }

    // A cell outside the window reads blank, so a line drawn up to the edge of
    // the body joins nothing on the other side of it.
    const clip = this.clip

    if (x < clip.x || y < clip.y || x >= clip.x + clip.w || y >= clip.y + clip.h) {
      return 0x20
    }

    return this.words[(y * this.columns + x) * 3]
  }

  /** Draws text, clipped to `max` columns and to the buffer's width. */
  text(x: number, y: number, s: string, fg: Rgb, bg?: Rgb, max?: number): number {
    const limit = max ?? this.columns - x
    let drawn = 0

    for (const ch of s) {
      if (drawn >= limit) {
        break
      }

      const code = ch.codePointAt(0) ?? 0x20

      // A character the terminal gives no column of its own takes none here
      // either: written into a cell it would consume one and render in the cell
      // before it, which shifts the row by one and leaves the mark doubled.
      if (hidden(code)) {
        continue
      }

      // Anything outside the BMP, a control character, or a character two
      // columns wide would be refused: a cell is one printable column, and
      // every measurement on this pane counts cells. See `TOFU`.
      const held = code < 0x20 ? 0x20 : code > 0xffff || wide(code) ? TOFU : code

      this.put(x + drawn, y, held, fg, bg)
      drawn++
    }

    return drawn
  }

  fill(x: number, y: number, w: number, h: number, bg: Rgb): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.put(x + dx, y + dy, 0x20, DEFAULT_COLOR, bg)
      }
    }
  }

  /**
   * The base64 the `cells` prop and `$.ui.blit` both take.
   *
   * A hooks module runs with neither Node nor a DOM, so this is
   * `Uint8Array.toBase64` — the encoding the Raster's own documentation uses —
   * with a hand-rolled fall-back for a runtime that predates it.
   */
  encode(fromRow = 0, rows = this.rows - fromRow): string {
    const from = Math.max(0, Math.min(this.rows, Math.floor(fromRow)))
    const count = Math.max(0, Math.min(this.rows - from, Math.floor(rows)))
    const bytes = new Uint8Array(
      this.words.buffer,
      from * this.columns * 3 * 4,
      count * this.columns * 3 * 4,
    )
    const native = (bytes as { toBase64?: () => string }).toBase64

    if (typeof native === 'function') {
      return native.call(bytes)
    }

    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let out = ''

    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i]
      const b = bytes[i + 1]
      const c = bytes[i + 2]
      const word = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)

      out += ALPHABET[(word >> 18) & 63] + ALPHABET[(word >> 12) & 63]
      out += b === undefined ? '=' : ALPHABET[(word >> 6) & 63]
      out += c === undefined ? '=' : ALPHABET[word & 63]
    }

    return out
  }
}

const ROUND = { tl: 0x256d, tr: 0x256e, br: 0x256f, bl: 0x2570 }
const H = 0x2500
const V = 0x2502

/**
 * Which way each line character points, as up | right | down | left.
 *
 * Edge routes cross constantly, so a cell has to be able to say what is already
 * in it before a second route decides what to put there. The dashed pieces
 * carry the same arms as the solid ones: a guessed edge crossing a proven one
 * still needs a junction, and the junction is drawn solid because half of what
 * meets there is.
 */
const UP = 0b0001
const RIGHT = 0b0010
const DOWN = 0b0100
const LEFT = 0b1000

/** The four directions a line piece can point, for callers that build one. */
export const ARM = { up: UP, right: RIGHT, down: DOWN, left: LEFT }

/**
 * The arc a run makes over a line it merely passes.
 *
 * Drawn as a junction the two lines look joined, and a reader following one arm
 * of a `\u253c` has no way to tell which of the other three continues it. Drawn
 * as a gap the run looks like it stops. The arc is what wiring diagrams have
 * always used instead: the run steps over, and what it steps over is whole on
 * both sides.
 */
export const HOP = 0x25e0

/**
 * The point a line leaves a card by: one to a side, in the middle of it.
 *
 * A line that simply begins against a frame reads as part of the frame, and a
 * card with four lines coming off four different rows reads as four cards. The
 * dot says where a card connects and the run starts a cell past it. Nothing is
 * ever drawn over one — a line crossing a card's own point would take the one
 * mark that says which card it belongs to.
 */
export const PORT = 0x2022

/**
 * The marks in the gutter that no line may be drawn over, the port among them.
 *
 * A line drawn through one takes a fact off the pane rather than a cell of a
 * line that is drawn again a cell along: the port says which card a run belongs
 * to, and the double stroke says the two phases either side of it ran at the
 * same time. Both stand in the gutter, which is exactly where the wires are, so
 * a wire meeting one breaks rather than crosses.
 */
const KEPT = new Set([PORT, 0x2550, 0x2551])

const ARMS: Record<number, number> = {
  [H]: LEFT | RIGHT,
  [V]: UP | DOWN,
  0x2504: LEFT | RIGHT,
  0x2506: UP | DOWN,
  [ROUND.tl]: RIGHT | DOWN,
  [ROUND.tr]: LEFT | DOWN,
  [ROUND.br]: UP | LEFT,
  [ROUND.bl]: UP | RIGHT,
  0x251c: UP | RIGHT | DOWN,
  0x2524: UP | DOWN | LEFT,
  0x252c: RIGHT | DOWN | LEFT,
  0x2534: UP | RIGHT | LEFT,
  0x253c: UP | RIGHT | DOWN | LEFT,
  [HOP]: LEFT | RIGHT,
}

/** The character for a set of arms, for every set worth more than one piece. */
const JOINED = new Map<number, number>(
  Object.entries(ARMS)
    // A dashed piece has the arms of its solid twin, and the solid one is the
    // answer: the entries are read in order, so the solid pieces come first and
    // the dashed ones do not displace them.
    .map(([code, arms]) => [arms, Number(code)] as const)
    .filter(([arms]) => arms !== (LEFT | RIGHT) && arms !== (UP | DOWN))
    .concat([
      [LEFT | RIGHT, H],
      [UP | DOWN, V],
    ]),
)

/**
 * The line character pointing exactly these ways, or `undefined` where no
 * single character does — a stub of one arm, or nothing at all.
 */
export function joint(arms: number): number | undefined {
  return JOINED.get(arms)
}

/** The ways a line character points, or nothing where the cell holds no line. */
export function armsOf(code: number): number | undefined {
  return ARMS[code]
}

/**
 * Draws one piece of a line, joining whatever is already in the cell.
 *
 * Without this a later route punches a hole through an earlier one. The old
 * table of pairs got the common crossings right and quietly overwrote the rest:
 * a route arriving at a cell that had already become a junction found no entry
 * for it and replaced it, which turned the `┤` where four agents fed a bus into
 * the `╭` of whichever edge left it last.
 *
 * A card's point is not joined but kept. A corner standing on one says what the
 * point already says — a run starts in this cell — and takes with it the one
 * mark that says which card the run belongs to, leaving the corner's other arm
 * pointing into the blank between the card's name and the gutter.
 */
export function line(c: Canvas, x: number, y: number, code: number, fg: Rgb): void {
  const under = c.at(x, y)

  if (KEPT.has(under)) {
    return
  }

  const held = ARMS[under]
  const adding = ARMS[code]

  if (held === undefined || adding === undefined || held === adding) {
    c.put(x, y, code, fg)

    return
  }

  c.put(x, y, JOINED.get(held | adding) ?? code, fg)
}

/**
 * One piece of a line, arced over whatever already crosses the cell.
 *
 * `line` joins what it meets, which is what a junction is for and wrong for
 * everything else: two runs that share a cell on their way somewhere else are
 * two runs, not a fork. Where the piece being drawn points across what is
 * already there — a horizontal over a vertical or the other way about — the
 * cell is drawn as a hop instead of a cross.
 */
export function cross(c: Canvas, x: number, y: number, code: number, fg: Rgb): void {
  const under = c.at(x, y)

  if (KEPT.has(under)) {
    return
  }

  const held = ARMS[under]
  const adding = ARMS[code]

  if (held !== undefined && adding !== undefined && (held & adding) === 0) {
    c.put(x, y, HOP, fg)

    return
  }

  line(c, x, y, code, fg)
}

/**
 * Routes an orthogonal edge from one point to another: out to a mid column,
 * down or up, then in. The color runs from `from` to `to` along the route, so
 * an edge reads its direction without an arrowhead at every step.
 */
export function edge(
  c: Canvas,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  from: Rgb,
  to: Rgb,
  /** True for an edge read off labels, which is drawn in the dashed register. */
  dashed = false,
): { x: number; y: number }[] {
  const points: { x: number; y: number; code: number }[] = []
  const midX = x1 - 2 <= x0 ? x0 + 1 : Math.max(x0 + 1, x1 - Math.floor((x1 - x0) / 2))
  // The corners stay solid either way. A dashed corner is one cell with one
  // dash in it, which reads as a gap in the line rather than as a turn.
  const across = dashed ? 0x2504 : H
  const down = dashed ? 0x2506 : V

  for (let x = x0; x < midX; x++) {
    points.push({ x, y: y0, code: across })
  }

  if (y0 !== y1) {
    points.push({
      x: midX,
      y: y0,
      code: y1 > y0 ? ROUND.tr : ROUND.br,
    })

    const step = y1 > y0 ? 1 : -1

    for (let y = y0 + step; y !== y1; y += step) {
      points.push({ x: midX, y, code: down })
    }

    points.push({
      x: midX,
      y: y1,
      code: y1 > y0 ? ROUND.bl : ROUND.tl,
    })
  } else {
    points.push({ x: midX, y: y0, code: across })
  }

  for (let x = midX + 1; x < x1; x++) {
    points.push({ x, y: y1, code: across })
  }

  points.forEach((p, i) => {
    line(c, p.x, p.y, p.code, mix(from, to, points.length < 2 ? 1 : i / (points.length - 1)))
  })

  // The head sits on the target's own border cell, so it reads as an arrival.
  c.put(x1, y1, 0x25b8, to)

  // The route it took, in the order it took it, for anything that has to follow
  // the line afterwards — a light travelling along it, say.
  return [...points.map(p => ({ x: p.x, y: p.y })), { x: x1, y: y1 }]
}

/**
 * The braille spinner, one frame per 80ms of run time.
 *
 * Seven dots of eight, with the hole travelling round: a cell nearly full,
 * which is as large as a glyph gets. The four-dot spinner it replaced was a
 * quarter of a cell of ink beside a name drawn in a whole one, so the one mark
 * on the card that changes was the faintest thing on it.
 */
const SPINNER = [0x28fe, 0x28fd, 0x28fb, 0x28bf, 0x287f, 0x28df, 0x28ef, 0x28f7]

export function spinnerAt(tick: number): number {
  return SPINNER[Math.abs(Math.floor(tick)) % SPINNER.length]
}
