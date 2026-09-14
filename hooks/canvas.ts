/**
 * A truecolor cell buffer and the drawing primitives the DAG is painted with.
 *
 * A Raster's cells are `columns * rows` little-endian u32 triplets
 * `[codePoint, foreground, background]`, base64 of that buffer. Every code
 * point has to be one printable width-1 BMP character, so the whole vocabulary
 * here is box drawing, blocks and braille — which is enough for rounded node
 * frames, orthogonal edge routing and a progress meter.
 */

/** The terminal's own color, as bit 24 alone rather than an RGB value. */
export const DEFAULT_COLOR = 0x01000000

export type Rgb = number

export function rgb(r: number, g: number, b: number): Rgb {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
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

  clear(background: Rgb = this.background): void {
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

      // Anything outside the BMP, or a control character, would be refused.
      this.put(x + drawn, y, code > 0xffff || code < 0x20 ? 0x20 : code, fg, bg)
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
  encode(): string {
    const bytes = new Uint8Array(this.words.buffer)
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
const SHARP = { tl: 0x250c, tr: 0x2510, br: 0x2518, bl: 0x2514 }
const H = 0x2500
const V = 0x2502
const H_HEAVY = 0x2501
const V_HEAVY = 0x2503

export type FrameStyle = 'round' | 'sharp' | 'heavy'

/** Draws a frame; the interior is left alone unless `bg` is given. */
export function frame(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  fg: Rgb,
  style: FrameStyle = 'round',
  bg?: Rgb,
): void {
  if (w < 2 || h < 2) {
    return
  }

  const corners = style === 'round' ? ROUND : SHARP
  const horizontal = style === 'heavy' ? H_HEAVY : H
  const vertical = style === 'heavy' ? V_HEAVY : V

  if (bg !== undefined) {
    c.fill(x, y, w, h, bg)
  }

  c.put(x, y, corners.tl, fg, bg)
  c.put(x + w - 1, y, corners.tr, fg, bg)
  c.put(x, y + h - 1, corners.bl, fg, bg)
  c.put(x + w - 1, y + h - 1, corners.br, fg, bg)

  for (let dx = 1; dx < w - 1; dx++) {
    c.put(x + dx, y, horizontal, fg, bg)
    c.put(x + dx, y + h - 1, horizontal, fg, bg)
  }

  for (let dy = 1; dy < h - 1; dy++) {
    c.put(x, y + dy, vertical, fg, bg)
    c.put(x + w - 1, y + dy, vertical, fg, bg)
  }
}

/**
 * Joins two line characters that meet in one cell.
 *
 * Edge routes cross constantly; without this a later route would punch a hole
 * through an earlier one. The table covers the four light box pieces a route
 * is made of and answers with the junction that carries both.
 */
const JOIN: Record<number, Record<number, number>> = {
  [H]: { [V]: 0x253c, [0x256d]: 0x252c, [0x256e]: 0x252c, [0x2570]: 0x2534, [0x256f]: 0x2534 },
  [V]: { [H]: 0x253c, [0x256d]: 0x251c, [0x2570]: 0x251c, [0x256e]: 0x2524, [0x256f]: 0x2524 },
}

export function line(c: Canvas, x: number, y: number, code: number, fg: Rgb): void {
  const under = c.at(x, y)

  if (under !== 0x20 && under !== code) {
    const joined = JOIN[code]?.[under] ?? JOIN[under]?.[code]

    c.put(x, y, joined ?? code, fg)
    return
  }

  c.put(x, y, code, fg)
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
): void {
  const points: { x: number; y: number; code: number }[] = []
  const midX = x1 - 2 <= x0 ? x0 + 1 : Math.max(x0 + 1, x1 - Math.floor((x1 - x0) / 2))

  for (let x = x0; x < midX; x++) {
    points.push({ x, y: y0, code: H })
  }

  if (y0 !== y1) {
    points.push({
      x: midX,
      y: y0,
      code: y1 > y0 ? ROUND.tr : ROUND.br,
    })

    const step = y1 > y0 ? 1 : -1

    for (let y = y0 + step; y !== y1; y += step) {
      points.push({ x: midX, y, code: V })
    }

    points.push({
      x: midX,
      y: y1,
      code: y1 > y0 ? ROUND.bl : ROUND.tl,
    })
  } else {
    points.push({ x: midX, y: y0, code: H })
  }

  for (let x = midX + 1; x < x1; x++) {
    points.push({ x, y: y1, code: H })
  }

  points.forEach((p, i) => {
    line(c, p.x, p.y, p.code, mix(from, to, points.length < 2 ? 1 : i / (points.length - 1)))
  })

  // The head sits on the target's own border cell, so it reads as an arrival.
  c.put(x1, y1, 0x25b8, to)
}

/**
 * Routes an edge whose ends have a whole lane of nodes between them.
 *
 * A layered drawing cannot run such an edge straight — it would cross the nodes
 * in the way and overwrite their frames — so it drops into `channel`, one of
 * the rows the layout leaves empty between node rows, runs along it, and climbs
 * back out at the far end. `h` and `v` are the strokes to draw it with, so a
 * proven edge detours solid and a guessed one detours dashed.
 */
export function detour(
  c: Canvas,
  from: { x: number; y: number },
  to: { x: number; y: number },
  channel: number,
  h: number,
  v: number,
  color: Rgb,
): void {
  const turn = from.x + 1
  const land = Math.max(turn + 2, to.x - 1)

  line(c, from.x, from.y, h, color)

  if (channel === from.y) {
    line(c, turn, channel, h, color)
  } else {
    const down = channel > from.y

    c.put(turn, from.y, down ? ROUND.tr : ROUND.br, color)

    for (let y = Math.min(from.y, channel) + 1; y < Math.max(from.y, channel); y++) {
      line(c, turn, y, v, color)
    }

    c.put(turn, channel, down ? ROUND.bl : ROUND.tl, color)
  }

  for (let x = turn + 1; x < land; x++) {
    line(c, x, channel, h, color)
  }

  if (channel === to.y) {
    line(c, land, channel, h, color)
  } else {
    const up = to.y < channel

    c.put(land, channel, up ? ROUND.br : ROUND.tr, color)

    for (let y = Math.min(to.y, channel) + 1; y < Math.max(to.y, channel); y++) {
      line(c, land, y, v, color)
    }

    c.put(land, to.y, up ? ROUND.tl : ROUND.bl, color)
  }

  for (let x = land + 1; x < to.x; x++) {
    line(c, x, to.y, h, color)
  }
}

/**
 * `detour` turned ninety degrees, for a stacked run: out of the bottom of the
 * source, sideways into `channel` — one of the empty columns the layout leaves
 * between nodes — down past the bands in the way, and across into the target.
 */
export function detourDown(
  c: Canvas,
  from: { x: number; y: number },
  to: { x: number; y: number },
  channel: number,
  h: number,
  v: number,
  color: Rgb,
): void {
  const turn = from.y + 1
  const land = Math.max(turn + 2, to.y - 1)

  line(c, from.x, from.y, v, color)

  if (channel === from.x) {
    line(c, channel, turn, v, color)
  } else {
    const right = channel > from.x

    c.put(from.x, turn, right ? ROUND.bl : ROUND.br, color)

    for (let x = Math.min(from.x, channel) + 1; x < Math.max(from.x, channel); x++) {
      line(c, x, turn, h, color)
    }

    c.put(channel, turn, right ? ROUND.tr : ROUND.tl, color)
  }

  for (let y = turn + 1; y < land; y++) {
    line(c, channel, y, v, color)
  }

  if (channel === to.x) {
    line(c, channel, land, v, color)
  } else {
    const right = to.x > channel

    c.put(channel, land, right ? ROUND.bl : ROUND.br, color)

    for (let x = Math.min(to.x, channel) + 1; x < Math.max(to.x, channel); x++) {
      line(c, x, land, h, color)
    }

    c.put(to.x, land, right ? ROUND.tr : ROUND.tl, color)
  }

  for (let y = land + 1; y < to.y; y++) {
    line(c, to.x, y, v, color)
  }
}

const METER = [0x2588, 0x2589, 0x258a, 0x258b, 0x258c, 0x258d, 0x258e, 0x258f]

/**
 * Draws a horizontal meter of `w` cells at `fraction` full, with an eighth-cell
 * partial so short bars still show movement.
 */
export function meter(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  fraction: number,
  fg: Rgb,
  track: Rgb,
): void {
  const filled = Math.max(0, Math.min(1, fraction)) * w
  const whole = Math.floor(filled)
  const partial = filled - whole

  for (let i = 0; i < w; i++) {
    if (i < whole) {
      c.put(x + i, y, METER[0], fg)
    } else if (i === whole && partial > 0.05) {
      c.put(x + i, y, METER[Math.min(7, Math.floor((1 - partial) * 8))], fg)
    } else {
      c.put(x + i, y, 0x2591, track)
    }
  }
}

/** The braille spinner, one frame per 80ms of run time. */
const SPINNER = [0x280b, 0x2819, 0x2839, 0x2838, 0x283c, 0x2834, 0x2826, 0x2827, 0x2807, 0x280f]

export function spinnerAt(tick: number): number {
  return SPINNER[Math.abs(Math.floor(tick)) % SPINNER.length]
}
