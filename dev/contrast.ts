/**
 * How far every role in every theme stands off the ground it is drawn on, and
 * how far the edges stand off the states in hue.
 *
 *   bun dev/contrast.ts
 *
 * WCAG's own ratio, which is the only number anyone can check the pane against.
 * Each role is held to its own floor — 7 for the text, 4.5 for every other word,
 * 3.0 for a mark or a line — and the run exits non-zero when one falls short.
 *
 * The second table is a different question with the same shape: an edge that
 * shares a hue with `done`, `running` or `failed` reads as a state, and no
 * contrast ratio catches that.
 */

import { hexOf, paletteOf, standingOf, THEMES } from '../hooks/theme'

/**
 * The theme's own colour each role is taken straight from, where it is one. A
 * role printed with `from` beside it is one the derivation changed.
 */
const SOURCES: Record<string, 'yellow' | 'green' | 'red' | 'fg' | 'blue' | 'purple' | 'cyan'> = {
  running: 'yellow',
  done: 'green',
  failed: 'red',
  text: 'fg',
  accent: 'blue',
  spend: 'purple',
  model: 'cyan',
}

let short = 0

for (const theme of THEMES) {
  console.log(`\n${theme.name}  bg ${hexOf(theme.bg)}`)

  for (const row of standingOf(theme)) {
    const flag = row.ratio < row.floor ? `  under ${row.floor.toFixed(1)}` : ''

    short += flag ? 1 : 0

    const source = SOURCES[row.role]
    const own = source === undefined ? undefined : theme[source]
    const moved = own === undefined || own === row.color ? '' : `  from ${hexOf(own)}`

    console.log(`  ${row.role.padEnd(9)} ${hexOf(row.color)}  ${row.ratio.toFixed(2)}${flag}${moved}`)
  }
}

const hue = (color: number) => {
  const [r, g, b] = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map(c => c / 255) as [
    number,
    number,
    number,
  ]
  const top = Math.max(r, g, b)
  const span = top - Math.min(r, g, b)

  if (span === 0) {
    return -1
  }

  const sixth = top === r ? ((g - b) / span) % 6 : top === g ? (b - r) / span + 2 : (r - g) / span + 4

  return (sixth * 60 + 360) % 360
}

const turn = (a: number, b: number) => {
  const [x, y] = [hue(a), hue(b)]

  if (x < 0 || y < 0) {
    return 180
  }

  const gap = Math.abs(x - y) % 360

  return gap > 180 ? 360 - gap : gap
}

console.log('\nhow far the edges stand off the states, in degrees of hue')

for (const theme of THEMES) {
  const palette = paletteOf(theme)
  const gaps = (['done', 'running', 'failed'] as const).map(role => ({
    role,
    gap: turn(palette.wire, palette[role]),
  }))
  const worst = gaps.reduce((a, b) => (a.gap <= b.gap ? a : b))
  const read = gaps.map(g => `${g.role} ${String(Math.round(g.gap)).padStart(3)}`).join('  ')

  console.log(`  ${theme.name.padEnd(18)} ${hexOf(palette.wire)}  ${read}${worst.gap < 45 ? '  under 45' : ''}`)
}

console.log(`\n${short === 0 ? 'every role clears its floor' : `${short} role(s) under their floor`}`)

if (short > 0) {
  process.exitCode = 1
}
