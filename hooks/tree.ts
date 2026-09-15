/**
 * Draws the canvas as elements, and makes its nodes clickable.
 *
 * `Raster` — a cell buffer with a code point and two colours per cell — landed
 * in Claude Code 2.1.271. On a build without it the same canvas is drawn as one
 * Box per row holding a Text per run of same-coloured cells: more elements, and
 * redrawn through `ui.invalidate` rather than `$.ui.blit`, but the same picture.
 *
 * The rows are also where a node becomes clickable. A hotspot names the cells a
 * node's label occupies, and the span covering it is emitted as a Button of the
 * same width instead of a Text, keyed by the agent's id — so the grid keeps its
 * alignment and a press names which node was pressed.
 */

import { Canvas, cellColor, DEFAULT_COLOR, type Rgb } from './canvas'
import type { Hotspot } from './paint'

export type Segment = {
  text: string
  fg: Rgb
  bg: Rgb
  /** Set when these cells are a node's label, and so a Button. */
  agentId?: string
}

/** One element constructor of a surface's table, read loosely. */
type Element = (props: Record<string, unknown>) => unknown

/**
 * One color as an element takes it, rounded to what a Raster would draw it as:
 * the two kinds of row are drawn by different parts of the surface, and a
 * ground that differs by a few values between them bands the pane.
 */
function hex(value: Rgb): string | undefined {
  if (value === DEFAULT_COLOR) {
    return undefined
  }

  return `#${cellColor(value).toString(16).padStart(6, '0')}`
}

/**
 * One row as runs of same-coloured cells, with the trailing default-coloured
 * blanks dropped: a row of spaces is an empty array, and the row still takes its
 * line because the Box that holds it is there.
 *
 * A run also breaks at each hotspot edge, so a label's cells end up in a segment
 * of their own — and only at those edges, since a hotspot becomes one Button and
 * a Button carries no colour. Splitting on a colour change inside one would give
 * the row several Buttons under the same key with nothing to tell them apart.
 */
export function segmentsOf(canvas: Canvas, y: number, hotspots: Hotspot[] = []): Segment[] {
  const onThisRow = hotspots.filter(h => h.y === y && h.w > 0)
  const breaks = new Set<number>()

  for (const spot of onThisRow) {
    breaks.add(spot.x)
    breaks.add(spot.x + spot.w)
  }

  const ownerAt = (x: number) => onThisRow.find(h => x >= h.x && x < h.x + h.w)?.agentId

  const segments: Segment[] = []
  let current: Segment | null = null
  let lastInked = -1

  for (let x = 0; x < canvas.columns; x++) {
    const cell = canvas.cell(x, y)
    const char = String.fromCodePoint(cell.code || 0x20)
    // A space on the canvas's own ground paints nothing the row's Box has not
    // already painted, so it is blank for trimming: every cell carries a
    // background, and without this every row ran the full width in elements the
    // surface then had to draw.
    const isBlank =
      (cell.code === 0x20 || cell.code === 0) &&
      (cell.bg === DEFAULT_COLOR || cell.bg === canvas.background)
    const owner = ownerAt(x)

    if (
      current &&
      !breaks.has(x) &&
      current.agentId === owner &&
      (owner !== undefined || (current.fg === cell.fg && current.bg === cell.bg))
    ) {
      current.text += char
    } else {
      if (current) {
        segments.push(current)
      }

      current = { text: char, fg: cell.fg, bg: cell.bg, agentId: owner }
    }

    // `current` is pushed at index `segments.length`, so that is the index this
    // cell ends up in — known only once the run it joins is settled.
    if (!isBlank) {
      lastInked = segments.length
    }
  }

  if (current) {
    segments.push(current)
  }

  const kept = lastInked < 0 ? [] : segments.slice(0, lastInked + 1)

  return kept.filter(s => s.text.length > 0)
}

export type RowElements = {
  Box: Element
  Text: Element
  /** Absent on a surface without buttons; nodes then draw as plain text. */
  Button?: Element
  /** Present from 2.1.271; the rows that hold no node label are drawn with it. */
  Raster?: Element
}

/**
 * The canvas as a drawing whose node labels can be pressed.
 *
 * `Raster` is a leaf — "no children, `hover` or `onPress`" — so a pane drawn as
 * one Raster has nothing to click: the picture is cells, and a cell is not an
 * element. Nor can a Button be laid over it, since the surface's boxes are a
 * flex column with no way to overlap.
 *
 * So the canvas is cut into bands at the rows that carry a node's label. Those
 * rows are drawn as elements, where the label's cells become a Button; every
 * other row — the frames, the edges, the header, the detail dialog, which is
 * most of the picture — stays in a Raster and costs one element per band.
 *
 * Each Raster is keyed by the row it starts at, so a blit can still name one.
 */
export type Band = {
  /** The Raster's key, or undefined for a band drawn as pressable rows. */
  key?: string
  from: number
  rows: number
}

/**
 * The bands a drawing is cut into: runs of Raster rows, split at every row that
 * carries a node's label.
 *
 * The ticker blits the Raster bands between renders, so it needs the same split
 * the last render used — hence a function of its own rather than a local in the
 * tree builder.
 */
export function bandsOf(rows: number, hotspots: Hotspot[]): Band[] {
  const pressable = [...new Set(hotspots.map(h => h.y))].filter(y => y >= 0 && y < rows).sort((a, b) => a - b)
  const bands: Band[] = []
  let from = 0

  for (const y of pressable) {
    if (y > from) {
      bands.push({ key: `dag:${from}`, from, rows: y - from })
    }

    bands.push({ from: y, rows: 1 })
    from = y + 1
  }

  if (from < rows) {
    bands.push({ key: `dag:${from}`, from, rows: rows - from })
  }

  return bands
}

export type Picture = {
  /** The drawing, as the surface's own elements. */
  children: unknown[]
  /** How it was cut up, so a later frame can blit the same Rasters by key. */
  bands: Band[]
}

export function pictureOf(
  canvas: Canvas,
  elements: RowElements,
  hotspots: Hotspot[] = [],
  onNode?: (agentId: string) => void,
): Picture {
  const { Raster } = elements

  if (!Raster) {
    return { children: rowsOf(canvas, elements, hotspots, onNode), bands: [] }
  }

  const raster = (from: number, rows: number, key: string) =>
    Raster({ key, columns: canvas.columns, rows, cells: canvas.encode(from, rows) })

  // Nothing to press: the whole drawing is one Raster, which is both the
  // cheapest tree and the one a build before 2.1.271 never had.
  if (!elements.Button || !onNode || hotspots.length === 0) {
    return { children: [raster(0, canvas.rows, 'dag')], bands: [{ key: 'dag', from: 0, rows: canvas.rows }] }
  }

  const bands = bandsOf(canvas.rows, hotspots)

  return {
    children: bands.flatMap(band =>
      band.key
        ? [raster(band.from, band.rows, band.key)]
        : rowsOf(canvas, elements, hotspots, onNode, band.from, band.from + band.rows),
    ),
    bands,
  }
}

/**
 * The canvas as a column of rows.
 *
 * @param canvas what to draw
 * @param elements the surface's Box, Text and (for clickable nodes) Button
 * @param hotspots the label spans `paint` reported
 * @param onNode what a press on a node calls, with that node's agent id
 */
export function rowsOf(
  canvas: Canvas,
  elements: RowElements,
  hotspots: Hotspot[] = [],
  onNode?: (agentId: string) => void,
  fromRow = 0,
  toRow = canvas.rows,
): unknown[] {
  const { Box, Text, Button } = elements
  const rows: unknown[] = []

  // The row carries the canvas ground, not just the cells: a Button takes no
  // background of its own, so a node's label would otherwise show the terminal
  // through the pane's ground while the cells around it sat on it.
  const ground = hex(canvas.background)

  for (let y = fromRow; y < toRow; y++) {
    const segments = segmentsOf(canvas, y, hotspots)

    rows.push(
      Box({
        flexDirection: 'row',
        // As wide as the drawing, not as wide as the seat. A row left to itself
        // stretches to the pane's own width, which is the width the surface
        // gives the body rather than the width the canvas was made at — so the
        // rows carrying a node's label ran their ground a few cells past every
        // Raster beside them, and the drawing had a step down its right edge on
        // those rows alone.
        width: canvas.columns,
        ...(ground ? { backgroundColor: ground } : {}),
        children: segments.map(s => {
          if (s.agentId && Button && onNode) {
            const agentId = s.agentId

            return Button({
              // The key names the element, so a `ui.press` hook can tell which
              // node was pressed without keeping a map of paths.
              key: `node:${agentId}`,
              label: s.text,
              plain: true,
              onPress: () => onNode(agentId),
            })
          }

          return Text({
            color: hex(s.fg),
            backgroundColor: hex(s.bg),
            wrap: 'truncate-end',
            children: s.text,
          })
        }),
      }),
    )
  }

  return rows
}
