/**
 * How far every role in every theme stands off the ground it is drawn on, and
 * how far the edges stand off the states in hue.
 *
 *   bun dev/contrast.ts
 *
 * WCAG's own ratio, which is the only number anyone can check the pane against.
 * 4.5 is the bar for body text, 3.0 for a large glyph or a line. A role under
 * 3.0 is one a reader has to lean in for.
 *
 * The second table is a different question with the same shape: an edge that
 * shares a hue with `done`, `running` or `failed` reads as a state, and no
 * contrast ratio catches that.
 */

import { paletteOf, THEMES, hexOf } from '../hooks/theme'

const channel = (v: number) => {
  const s = v / 255

  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

const luminance = (c: number) =>
  0.2126 * channel((c >> 16) & 0xff) + 0.7152 * channel((c >> 8) & 0xff) + 0.0722 * channel(c & 0xff)

const ratio = (a: number, b: number) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)

  return (hi + 0.05) / (lo + 0.05)
}

for (const theme of THEMES) {
  const palette = paletteOf(theme)
  const rows = Object.entries(palette)
    .map(([role, color]) => ({ role, color, r: ratio(color as number, theme.bg) }))
    .sort((a, b) => a.r - b.r)

  console.log(`\n${theme.name}  bg ${hexOf(theme.bg)}`)

  for (const row of rows) {
    const flag = row.r < 3 ? '  under 3.0' : row.r < 4.5 ? '  under 4.5' : ''

    console.log(`  ${row.role.padEnd(9)} ${hexOf(row.color as number)}  ${row.r.toFixed(2)}${flag}`)
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
