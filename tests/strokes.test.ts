/**
 * The heavy stroke a recorded carry runs in, and what it does where another
 * line meets it.
 *
 * A carry the run's files record is drawn heavy and one read off labels light,
 * but only the straights come in both weights. Where a heavy piece meets
 * another line the cell becomes a light junction or a hop, the same as two
 * light pieces would give, because a heavy junction would say the line it
 * joins is recorded too.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas, cross, edge, HOP, line } from '../hooks/canvas'

const GREY = 0x808080
const H = 0x2500
const V = 0x2502
const HEAVY_H = 0x2501
const HEAVY_V = 0x2503
const CROSS = 0x253c

function row(c: Canvas, y: number, from: number, to: number): string {
  let s = ''

  for (let x = from; x <= to; x++) {
    s += String.fromCodePoint(c.at(x, y))
  }

  return s
}

test('a light line drawn down through a heavy one joins it as a light cross', () => {
  const c = new Canvas(3, 3)

  c.put(1, 1, HEAVY_H, GREY)
  line(c, 1, 1, V, GREY)

  expect(c.at(1, 1)).toBe(CROSS)
})

test('a heavy line drawn along a heavy one stays heavy', () => {
  const c = new Canvas(3, 3)

  c.put(1, 1, HEAVY_H, GREY)
  line(c, 1, 1, HEAVY_H, GREY)

  expect(c.at(1, 1)).toBe(HEAVY_H)
})

test('a light line crossing a heavy one hops over it', () => {
  const c = new Canvas(3, 3)

  c.put(1, 1, HEAVY_V, GREY)
  cross(c, 1, 1, H, GREY)

  expect(c.at(1, 1)).toBe(HOP)
})

test('a recorded carry is drawn in heavy strokes that turn on light corners', () => {
  const c = new Canvas(12, 6)

  edge(c, 0, 1, 10, 4, GREY, GREY, false)

  expect(row(c, 1, 0, 5)).toBe('━━━━━╮')
  expect(row(c, 2, 5, 5)).toBe('┃')
  expect(row(c, 3, 5, 5)).toBe('┃')
  expect(row(c, 4, 5, 10)).toBe('╰━━━━▸')
})

test('a guessed carry is drawn in light strokes', () => {
  const c = new Canvas(12, 6)

  edge(c, 0, 1, 10, 4, GREY, GREY, true)

  expect(row(c, 1, 0, 5)).toBe('─────╮')
  expect(row(c, 2, 5, 5)).toBe('│')
  expect(row(c, 3, 5, 5)).toBe('│')
  expect(row(c, 4, 5, 10)).toBe('╰────▸')
})
