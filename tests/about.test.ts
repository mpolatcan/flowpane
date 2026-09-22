/**
 * What the pane says about itself when there is no pane: the same facts the
 * About dialog draws, as the lines `/flowpane about` prints.
 *
 * The dialog is drawn into cells and is tested there. This is the other seat
 * the same facts are read in, and the one where a fact that was never filled in
 * — a release date left at the value the last release had — reads as true.
 */

import { expect, test } from 'claude-code/testing'

import { aboutRows, aboutText, NAME, noteShipped, RELEASED, shippedVersion, VERSION } from '../hooks/about'

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
const LAST_RELEASE = { version: '0.8.0', released: '22-09-2026' }

/** A day-first date as a string that sorts by day. */
function sortable(date: string): string {
  const [day, month, year] = date.split('-')

  return `${year}-${month}-${day}`
}

test('the day this build went out is not earlier than the day the last one did', () => {
  // Not strictly later. A version bumped so the engine's version-keyed cache
  // lets go of the build before it is a release of its own, and several of
  // those can fall on one day — 0.6.0, 0.7.0 and 0.8.0 all went out on the
  // 22nd. What the row still catches is the fault it was written for: a date
  // that went backwards, and, below, a version that did not move at all.
  const kept = sortable(RELEASED) >= sortable(LAST_RELEASE.released)

  expect(`${VERSION} on ${RELEASED}, against ${LAST_RELEASE.version} on ${LAST_RELEASE.released}: ${kept}`)
    .toBe(`${VERSION} on ${RELEASED}, against ${LAST_RELEASE.version} on ${LAST_RELEASE.released}: true`)
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

test('the pane names the version the manifest it was installed by states', () => {
  // The constant in the module is what this build was written with, and the
  // manifest is what the engine installed. They drifted by hand for three
  // releases, and no test could hold them together: a test runs with no `fs`
  // noun and no `plugin` noun on `$`, so the manifest is not a file it can
  // open. The session reads it and hands it over instead, and what the pane
  // says is what it was handed.
  noteShipped('{"name":"flowpane","version":"9.9.9"}')

  expect(shippedVersion()).toBe('9.9.9')
  expect(aboutText()).toContain(`${NAME} 9.9.9`)

  noteShipped(undefined)
})

test('a manifest the session could not read leaves the version the build was written with', () => {
  // Four ways to end up with nothing, one answer. A read that was refused or
  // found no file hands over nothing at all; a manifest from some other build
  // states no version; and a file that is not JSON is a file that was not read
  // whatever it holds. A pane that answered an empty string to any of them
  // would draw `FlowPane ` with the name of the version rubbed out.
  for (const manifest of [undefined, '{}', '{"version":"  "}', 'not json at all']) {
    noteShipped(manifest)

    expect(`${manifest}: ${shippedVersion()}`).toBe(`${manifest}: ${VERSION}`)
  }
})

test('the version a session read is forgotten when the next one reads nothing', () => {
  noteShipped('{"version":"9.9.9"}')
  noteShipped(undefined)

  // The module holds what it was told for as long as the session lasts, so a
  // reading that failed has to clear the one before it rather than leave the
  // pane naming a version this install is not.
  expect(shippedVersion()).toBe(VERSION)
})
