/**
 * What the pane says about itself when there is no pane: the same facts the
 * About dialog draws, as the lines `/flowpane about` prints.
 *
 * The dialog is drawn into cells and is tested there. This is the other seat
 * the same facts are read in, and the one where a fact that was never filled in
 * — a release date left at the value the last release had — reads as true.
 */

import { expect, test } from 'claude-code/testing'

import { aboutRows, aboutText, NAME, RELEASED, VERSION } from '../hooks/about'

/**
 * What the release before this one said about itself, and the pair to update
 * when a release goes out.
 *
 * The version and the date move together or not at all. Bumping the version is
 * the visible half of a release and the date is the half nobody looks at, so
 * 0.3.0, 0.3.1 and 0.5.0 all shipped claiming the 15th — and the row read as
 * true, because a date left behind is still a well-formed date. Read against
 * the release before it, a date that never moved is the one thing that shows.
 */
const LAST_RELEASE = { version: '0.5.0', released: '17-09-2026' }

/** A day-first date as a string that sorts by day. */
function sortable(date: string): string {
  const [day, month, year] = date.split('-')

  return `${year}-${month}-${day}`
}

test('the day this build went out is later than the day the last one did', () => {
  const after = sortable(RELEASED) > sortable(LAST_RELEASE.released)

  expect(`${VERSION} on ${RELEASED}, after ${LAST_RELEASE.version} on ${LAST_RELEASE.released}: ${after}`)
    .toBe(`${VERSION} on ${RELEASED}, after ${LAST_RELEASE.version} on ${LAST_RELEASE.released}: true`)
})

test('the version this build names is not the version the last one named', () => {
  // The other half of the pair. A date moved with the version left behind is
  // the same fault the other way round, and the About row is the one place
  // either of them is read.
  expect(VERSION).not.toBe(LAST_RELEASE.version)
})

test('the day the build was released is a real day, written as one', () => {
  const [day, month, year] = RELEASED.split('-').map(Number)

  // Written day-first, so a date read as a month-first one is a different day
  // rather than an error: the parts are checked as the ranges they stand for.
  expect(RELEASED).toMatch(/^\d{2}-\d{2}-\d{4}$/)
  expect(day >= 1 && day <= 31).toBe(true)
  expect(month >= 1 && month <= 12).toBe(true)
  expect(year >= 2025 && year <= 2100).toBe(true)
})

test('the printed lines carry the release date the build was made on', () => {
  expect(aboutText()).toContain(RELEASED)
})

test('the printed lines name the plugin and the version they came from', () => {
  const text = aboutText()

  expect(text).toContain(NAME)
  expect(text).toContain(VERSION)
})

test('every fact the dialog draws is a fact the printed lines say', () => {
  const text = aboutText()

  // Two seats for one set of facts, and a reader with no pane open sees only
  // the second. A row added to the dialog and left out of here is a fact that
  // exists at one size of terminal.
  for (const row of aboutRows()) {
    const said = (row as { value?: unknown }).value

    if (typeof said === 'string' && said.trim()) {
      expect(`${said} :: ${text.includes(said)}`).toBe(`${said} :: true`)
    }
  }
})
