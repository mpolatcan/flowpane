/**
 * How a drawing is cut into Rasters. The ticker blits into the bands the last
 * render mounted, so the cut it computes has to name them the way the render
 * did.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import { bandsOf, pictureOf, type RowElements } from '../hooks/tree'

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
