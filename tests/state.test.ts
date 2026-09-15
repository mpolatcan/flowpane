/**
 * What a state's colour is allowed to be, measured rather than looked at.
 *
 * Two of these facts are a single number each — how far a card's frame is
 * carried toward the state of the agent it encloses, and what the cut-off tone
 * is mixed from — and a number is the easiest thing in the drawing to change by
 * accident. Both have a range rather than a value: a frame tinted too little is
 * a grey box with a coloured tick in it, a frame tinted the whole way is a slab
 * that is read before the name it frames, and a cut-off state drawn in a red
 * says an agent the run stopped did something wrong.
 *
 * Every palette is checked, because the ground a frame is mixed against is the
 * theme's own and a tint that reads on one can vanish on the next.
 */

import { expect, test } from 'claude-code/testing'

import { frameOf, quietOf, useTheme } from '../hooks/paint'
import { DEFAULT_THEME, paletteOf, THEMES } from '../hooks/theme'

const STATES = ['done', 'running', 'failed', 'stopped'] as const

/** How far apart two colours are, straight across the cube. */
function apart(a: number, b: number): number {
  return Math.hypot(
    ((a >> 16) & 0xff) - ((b >> 16) & 0xff),
    ((a >> 8) & 0xff) - ((b >> 8) & 0xff),
    (a & 0xff) - (b & 0xff),
  )
}

/**
 * The share of the way from the plain border tone to the state colour that a
 * frame actually travels. One is the state colour itself, zero is a plain
 * border.
 */
function carried(state: (typeof STATES)[number], theme: (typeof THEMES)[number]): number {
  const plain = quietOf(theme.bg)
  const full = apart(plain, paletteOf(theme)[state])

  return full === 0 ? 1 : apart(frameOf(state, theme.bg), plain) / full
}

/** How much colour is in a tone at all: zero is a grey, one is the hue itself. */
function chroma(color: number): number {
  const channels = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff]
  const top = Math.max(...channels)

  return top === 0 ? 0 : (top - Math.min(...channels)) / top
}

/** How light a tone is, weighted the way an eye weighs the three channels. */
function light(color: number): number {
  return 0.2126 * ((color >> 16) & 0xff) + 0.7152 * ((color >> 8) & 0xff) + 0.0722 * (color & 0xff)
}

test('a card frame stops short of the state colour it carries', () => {
  // A frame encloses a name and a row of figures, and at full strength it is
  // the brightest thing inside its own card — the border is read first and the
  // agent second. Four fifths of the way leaves it a boundary that says
  // something; the whole way leaves it a slab.
  for (const theme of THEMES) {
    useTheme(theme.name)

    for (const state of STATES) {
      expect(`${theme.name} ${state} ${carried(state, theme) <= 0.85}`).toBe(`${theme.name} ${state} true`)
    }
  }

  useTheme(DEFAULT_THEME)
})

test('a card frame is carried most of the way to its state', () => {
  // The hue has to survive being drawn one cell wide in a line glyph, which is
  // a fraction of the ink the same colour puts down as a word. Just over half
  // was the first setting and it did not: on a dark ground `done` landed on a
  // muted teal and `running` on an olive. Seven tenths is the floor.
  for (const theme of THEMES) {
    useTheme(theme.name)

    for (const state of STATES) {
      expect(`${theme.name} ${state} ${carried(state, theme) >= 0.7}`).toBe(`${theme.name} ${state} true`)
    }
  }

  useTheme(DEFAULT_THEME)
})

test('every theme draws the cut-off state in a tone with no failure in it', () => {
  // Cut off is neutral: an agent the run never let finish did nothing wrong,
  // and a pane that draws it in a red says two different things in one hue.
  // Measured as colour rather than hue, because on a few palettes the tone is a
  // plain grey and a grey has no hue to compare.
  for (const theme of THEMES) {
    const palette = paletteOf(theme)
    const quiet = chroma(palette.stopped) <= 0.3 && chroma(palette.stopped) <= chroma(palette.failed) / 2

    expect(`${theme.name} ${quiet}`).toBe(`${theme.name} true`)
  }
})

test('every theme puts the cut-off state on the words side of the ground', () => {
  // The other half of neutral: the tone the boundaries are drawn in sits near
  // the ground, so a cut-off card whose frame landed there would read as a rule
  // rather than as work the run stopped. This one is the grey carried toward
  // the text, so it sits nearer what is written than what it is written on.
  for (const theme of THEMES) {
    useTheme(theme.name)

    const palette = paletteOf(theme)
    const stopped = light(palette.stopped)
    const toText = Math.abs(stopped - light(palette.text))
    const toGround = Math.abs(stopped - light(theme.bg))
    const clear = Math.abs(stopped - light(quietOf(theme.bg)))

    expect(`${theme.name} ${toText < toGround && clear >= 40}`).toBe(`${theme.name} true`)
  }

  useTheme(DEFAULT_THEME)
})
