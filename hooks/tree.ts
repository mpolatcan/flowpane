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

import { Canvas, DEFAULT_COLOR, type Rgb } from './canvas'
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

function hex(value: Rgb): string | undefined {
  if (value === DEFAULT_COLOR) {
    return undefined
  }

  return `#${value.toString(16).padStart(6, '0')}`
}

/**
 * One row as runs of same-coloured cells, with the trailing default-coloured
 * blanks dropped: a row of spaces is an empty array, and the row still takes its
 * line because the Box that holds it is there.
 *
 * A run also breaks at each hotspot edge, so a label's cells end up in a segment
 * of their own.
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
    // already painted, so it is blank for trimming: on a backdrop every cell
    // carries a background, and without this every row ran the full width in
    // elements the surface then had to draw.
    const isBlank =
      (cell.code === 0x20 || cell.code === 0) &&
      (cell.bg === DEFAULT_COLOR || cell.bg === canvas.background)
    const owner = ownerAt(x)

    if (
      current &&
      !breaks.has(x) &&
      current.fg === cell.fg &&
      current.bg === cell.bg &&
      current.agentId === owner
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
): unknown[] {
  const { Box, Text, Button } = elements
  const rows: unknown[] = []

  // The row carries the canvas ground, not just the cells: a Button takes no
  // background of its own, so a node's label would otherwise show the terminal
  // through the backdrop while the cells around it sat on it.
  const ground = hex(canvas.background)

  for (let y = 0; y < canvas.rows; y++) {
    const segments = segmentsOf(canvas, y, hotspots)

    rows.push(
      Box({
        flexDirection: 'row',
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
