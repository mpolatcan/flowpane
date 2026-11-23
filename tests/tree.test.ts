/**
 * How a drawing is cut into Rasters. The ticker blits into the bands the last
 * render mounted, so the cut it computes has to name them the way the render
 * did.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas, rgb } from '../hooks/canvas'
import { bandsOf, pictureOf, stripLines, type RowElements } from '../hooks/tree'

const elements: RowElements = {
  Box: props => props,
  Text: props => props,
  Button: props => props,
  Raster: props => props,
}

test('a drawing with nothing to press is one band under the key the render mounts it with', () => {
  const canvas = new Canvas(40, 12)
  const mounted = pictureOf(canvas, elements, []).bands

  expect(bandsOf(12, [])).toEqual([{ key: 'dag', from: 0, rows: 12 }])
  expect(bandsOf(12, [])).toEqual(mounted)
})

test('a drawing with a label to press is cut at its row, and the bands around it are keyed by the row they start at', () => {
  expect(bandsOf(12, [{ agentId: 'a1', x: 2, y: 4, w: 6 }])).toEqual([
    { key: 'dag:0', from: 0, rows: 4 },
    { from: 4, rows: 1 },
    { key: 'dag:5', from: 5, rows: 7 },
  ])
})

test('a drawing with the strip held at its foot hands those rows to the strip’s own band', () => {
  expect(bandsOf(12, [], { from: 8, rows: 4 })).toEqual([
    { key: 'dag', from: 0, rows: 8 },
    { from: 8, rows: 4, client: true },
  ])
})

test('the held rows are the strip’s element, after one Raster for the drawing above them', () => {
  const canvas = new Canvas(40, 12)
  const picture = pictureOf(canvas, elements, [], undefined, { from: 8, rows: 4, element: 'E' })
  const raster = picture.children[0] as { key: string; rows: number }

  expect(picture.children).toHaveLength(2)
  expect(picture.children.at(-1)).toBe('E')
  expect(raster.key).toBe('dag')
  expect(raster.rows).toBe(8)
})

test('a strip held from the top row is no cut at all', () => {
  const canvas = new Canvas(40, 12)
  const picture = pictureOf(canvas, elements, [], undefined, { from: 0, rows: 4, element: 'E' })

  expect(bandsOf(12, [], { from: 0, rows: 4 })).toEqual([{ key: 'dag', from: 0, rows: 12 }])
  expect(picture.bands).toEqual([{ key: 'dag', from: 0, rows: 12 }])
  expect(picture.children).not.toContain('E')
})

test('the strip’s lines carry each run of cells in its colours, as hex', () => {
  const canvas = new Canvas(10, 2)

  canvas.text(0, 0, 'ab', rgb(0x11, 0x22, 0x33), rgb(0x44, 0x55, 0x66))
  canvas.text(2, 0, 'cd', rgb(0xaa, 0xbb, 0xcc))

  expect(stripLines(canvas, 0, 2)).toEqual([
    [
      { t: 'ab', fg: '#112233', bg: '#445566' },
      { t: 'cd', fg: '#aabbcc' },
    ],
    [],
  ])
})
