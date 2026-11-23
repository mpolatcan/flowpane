/**
 * `dev/contrast.ts`, run in this process rather than as one of its own.
 *
 * The floors themselves are read in `palette.test.ts` through `standingOf`.
 * What is left to the script is its verdict: the line it ends on, and the exit
 * status a sweep reads. The runner has no `process` at all, so a script that
 * reached `process.exitCode = 1` here would throw while loading and this file
 * would not load; that it loads is the exit status read.
 */

import { expect, test } from 'claude-code/testing'

import { real, said } from './contrast.capture'
import '../dev/contrast'
import { standingOf, THEMES } from '../hooks/theme'

globalThis.console = real

test('the contrast sweep ends by saying every role clears its floor, and exits clean', () => {
  expect(THEMES.every(theme => standingOf(theme).every(row => row.ratio >= row.floor))).toBe(true)

  const lines = said.join('\n').split('\n').filter(line => line.trim() !== '')

  expect(lines.length > THEMES.length).toBe(true)
  expect(lines.filter(line => line.includes('  under ') && !line.includes('under 45'))).toEqual([])
  expect(lines[lines.length - 1]).toBe('every role clears its floor')
  expect(typeof (globalThis as { process?: unknown }).process).toBe('undefined')
})
