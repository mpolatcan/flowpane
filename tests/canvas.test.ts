/**
 * What a cell outside the window reads as.
 *
 * The window is what lets the layout be done whole and moved under a header
 * that stays put, and reading a cell is the half of it nothing else checks: a
 * line drawn up to the edge of the body asks the cell beyond it what is there
 * before deciding what to draw, and a cell that answers with the glyph it held
 * before the window was set makes the line join something on the other side of
 * a boundary it is not allowed to cross.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'

const BLANK = 0x20
const LINE_H = 0x2500

test('a cell outside the window reads blank even when a glyph was written there first', () => {
  const c = new Canvas(10, 3)

  // Written with the whole pane open, so the cell really does hold the glyph:
  // what is being checked is the reading, not the writing.
  c.put(7, 1, LINE_H, 0xffffff)
  c.window(0, 0, 4, 3)

  expect(c.at(7, 1)).toBe(BLANK)
})

test('a cell inside the window reads the glyph it holds', () => {
  const c = new Canvas(10, 3)

  c.put(2, 1, LINE_H, 0xffffff)
  c.window(0, 0, 4, 3)

  expect(c.at(2, 1)).toBe(LINE_H)
})

test('a cell hidden by the window reads its glyph again once the window is cleared', () => {
  const c = new Canvas(10, 3)

  c.put(7, 1, LINE_H, 0xffffff)
  c.window(0, 0, 4, 3)
  c.window()

  // The window is a view on the buffer rather than an edit of it, so a painter
  // that set one and a painter that did not see the same cells.
  expect(c.at(7, 1)).toBe(LINE_H)
})

test('a cell off the buffer altogether reads blank', () => {
  const c = new Canvas(10, 3)

  expect(c.at(10, 0)).toBe(BLANK)
  expect(c.at(0, -1)).toBe(BLANK)
})
