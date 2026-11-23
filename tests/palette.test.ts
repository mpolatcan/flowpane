/**
 * How a theme's own colour becomes a role, measured on the wheel.
 *
 * A colour that falls short of its floor is moved along its own lightness, so
 * the palette's yellow is still that yellow, only lighter or darker. Mixing it
 * with white or black greyed it, which is why the floors were once held lower.
 * The states are turned apart in hue, and the way they turn matters as much as
 * how far: a green that sat too near gold has to become a truer green, not an
 * orange.
 */

import { expect, test } from 'claude-code/testing'

import { cellColor, mix } from '../hooks/canvas'
import { quietOf, quoteOf, tintOf, useTheme } from '../hooks/paint'
import { FLOOR, paletteOf, READ, standingOf, TEXT_FLOOR, THEMES } from '../hooks/theme'

function hsl(color: number): [number, number, number] {
  const [r, g, b] = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map(c => c / 255) as [
    number,
    number,
    number,
  ]
  const top = Math.max(r, g, b)
  const low = Math.min(r, g, b)
  const l = (top + low) / 2
  const span = top - low

  if (span === 0) {
    return [0, 0, l]
  }

  const sat = span / (1 - Math.abs(2 * l - 1))
  const sixth = top === r ? ((g - b) / span) % 6 : top === g ? (b - r) / span + 2 : (r - g) / span + 4

  return [(sixth * 60 + 360) % 360, sat, l]
}

function signedTurn(from: number, to: number): number {
  return ((hsl(to)[0] - hsl(from)[0] + 540) % 360) - 180
}

test('the floors are the WCAG bars: four and a half for words, seven for the text', () => {
  expect(READ).toBe(4.5)
  expect(TEXT_FLOOR).toBe(7)
})

test('a role lifted from one theme colour keeps that colour’s hue and saturation', () => {
  const sources = [
    ['running', 'yellow'],
    ['accent', 'blue'],
    ['spend', 'purple'],
    ['model', 'cyan'],
  ] as const
  let moved = 0

  for (const theme of THEMES) {
    const palette = paletteOf(theme)

    for (const [role, key] of sources) {
      if (palette[role] === theme[key]) {
        continue
      }

      moved++

      const saturationOff = Math.abs(hsl(palette[role])[1] - hsl(theme[key])[1])
      const hueOff = Math.abs(signedTurn(theme[key], palette[role]))

      expect(`${theme.name} ${role} ${saturationOff <= 0.05 && hueOff <= 3}`).toBe(`${theme.name} ${role} true`)
    }
  }

  expect(moved > 0).toBe(true)
})

test('a state turned away from the running colour turns the way it already leaned', () => {
  const pairs = [
    ['done', 'green'],
    ['failed', 'red'],
  ] as const
  let turned = 0

  for (const theme of THEMES) {
    const palette = paletteOf(theme)

    for (const [role, key] of pairs) {
      if (Math.abs(signedTurn(theme[key], palette[role])) < 1) {
        continue
      }

      turned++

      const leaned = Math.sign(signedTurn(theme.yellow, theme[key]))
      const now = Math.sign(signedTurn(theme.yellow, palette[role]))

      expect(`${theme.name} ${role} ${now === leaned}`).toBe(`${theme.name} ${role} true`)
    }
  }

  expect(turned > 0).toBe(true)
})

test('gruvbox draws its wires in a hue of their own, not the grey of the boundaries', () => {
  const theme = THEMES.find(t => t.name === 'gruvbox')

  expect(theme).toBeDefined()

  if (!theme) {
    return
  }

  const palette = paletteOf(theme)
  const source = [theme.blue, theme.purple, theme.cyan].reduce((best, c) =>
    Math.abs(signedTurn(c, palette.wire)) < Math.abs(signedTurn(best, palette.wire)) ? c : best,
  )
  const greyed = mix(source, theme.grey, 0.2)

  expect(hsl(palette.wire)[1] > hsl(greyed)[1]).toBe(true)
  expect(Math.abs(hsl(palette.wire)[1] - hsl(source)[1]) <= 0.05).toBe(true)
})

test('every role of every theme clears the floor it is held to, the text at seven and a line at three', () => {
  for (const theme of THEMES) {
    const standing = standingOf(theme)
    const floorOf = (role: string) => standing.find(row => row.role === role)?.floor

    expect(standing.length).toBe(Object.keys(paletteOf(theme)).length)
    expect(floorOf('text')).toBe(TEXT_FLOOR)
    expect(floorOf('done')).toBe(READ)
    expect(floorOf('wire')).toBe(FLOOR)
    expect(floorOf('track')).toBe(0)

    for (const row of standing) {
      expect({ theme: theme.name, role: row.role, clears: row.ratio >= row.floor }).toEqual({
        theme: theme.name,
        role: row.role,
        clears: true,
      })
    }
  }
})

/** WCAG's contrast ratio, as `apart` in theme.ts measures it. */
function ratio(a: number, b: number): number {
  const channel = (v: number) => {
    const s = v / 255

    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const light = (c: number) => 0.2126 * channel((c >> 16) & 0xff) + 0.7152 * channel((c >> 8) & 0xff) + 0.0722 * channel(c & 0xff)
  const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x)

  return (hi! + 0.05) / (lo! + 0.05)
}

test('a call’s hues read on its block, and a diff’s two tints stay apart and keep its text readable, as a Raster draws them', () => {
  for (const theme of THEMES) {
    useTheme(theme.name)

    const palette = paletteOf(theme)
    const quote = cellColor(quoteOf(theme.bg))
    const added = cellColor(tintOf('added', quoteOf(theme.bg)))
    const removed = cellColor(tintOf('removed', quoteOf(theme.bg)))
    const text = cellColor(quietOf(palette.text))

    expect(new Set([quote, added, removed]).size).toBe(3)

    for (const hue of [palette.syntaxKey, palette.syntaxString, palette.syntaxNumber]) {
      expect(ratio(cellColor(hue), quote)).toBeGreaterThanOrEqual(4.5)
    }

    expect(ratio(text, added)).toBeGreaterThanOrEqual(4)
    expect(ratio(text, removed)).toBeGreaterThanOrEqual(4)
  }

  useTheme('tokyo-night')
})
