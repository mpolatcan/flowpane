/**
 * The palettes the pane can be drawn in.
 *
 * A theme is declared as the ten colours a terminal theme actually ships — a
 * ground, a surface, a foreground, a grey, and the six hues — and the palette
 * the drawing uses is derived from those. Declaring the derived roles per theme
 * would be sixty values to keep in step, and the first time one of them drifted
 * the pane would read as a different theme in one corner.
 */

import { mix, rgb, type Rgb } from './canvas'

export type Theme = {
  name: string
  /** What the pane is painted on. */
  bg: Rgb
  /** One step up from the ground: rules, empty tracks, a card's far edge. */
  surface: Rgb
  fg: Rgb
  grey: Rgb
  blue: Rgb
  green: Rgb
  yellow: Rgb
  red: Rgb
  purple: Rgb
  cyan: Rgb
}

/** The roles the drawing asks for, by what each one says rather than by hue. */
export type Palette = {
  /** An agent that is still going. */
  running: Rgb
  /** One that landed. */
  done: Rgb
  /** One that did not. */
  failed: Rgb
  /** One the run was killed out from under: cut off, not broken. */
  stopped: Rgb
  /** One that never started. */
  idle: Rgb
  /** Text that is there to be looked past. */
  dim: Rgb
  text: Rgb
  accent: Rgb
  /** The ground of an empty meter, and of a rule. */
  track: Rgb
  /** How long it took. */
  clock: Rgb
  /** What it spent. */
  spend: Rgb
  /** What it ran on. */
  model: Rgb
  /**
   * What one agent feeding another is drawn in.
   *
   * A connector used to take the colours of the two agents it joined, which put
   * it in the same hue as the frames it ran between and made the two read as
   * one mark. What an edge has to say is that it is an edge; which agents it
   * joins, and how they ended, is said by the cards at its ends.
   *
   * It is the one line on the pane with a hue of its own. Rules, borders and
   * empty tracks are grey, so a line that carries work is told from a line that
   * divides the drawing by colour alone, before either is traced.
   */
  wire: Rgb
}

export const THEMES: Theme[] = [
  {
    name: 'tokyo-night',
    bg: rgb(0x15, 0x18, 0x1e),
    surface: rgb(0x2e, 0x34, 0x40),
    fg: rgb(0xdf, 0xe3, 0xea),
    grey: rgb(0x7b, 0x84, 0x92),
    blue: rgb(0x7a, 0xa2, 0xf7),
    green: rgb(0x4c, 0xc3, 0x8a),
    yellow: rgb(0xf2, 0xb3, 0x3d),
    red: rgb(0xf2, 0x63, 0x5f),
    purple: rgb(0xa8, 0x8f, 0xd6),
    cyan: rgb(0x5f, 0xa8, 0xb8),
  },
  {
    name: 'catppuccin',
    bg: rgb(0x1e, 0x1e, 0x2e),
    surface: rgb(0x31, 0x32, 0x44),
    fg: rgb(0xcd, 0xd6, 0xf4),
    grey: rgb(0x7f, 0x84, 0x9c),
    blue: rgb(0x89, 0xb4, 0xfa),
    green: rgb(0xa6, 0xe3, 0xa1),
    yellow: rgb(0xf9, 0xe2, 0xaf),
    red: rgb(0xf3, 0x8b, 0xa8),
    purple: rgb(0xcb, 0xa6, 0xf7),
    cyan: rgb(0x94, 0xe2, 0xd5),
  },
  {
    name: 'gruvbox',
    bg: rgb(0x28, 0x28, 0x28),
    surface: rgb(0x3c, 0x38, 0x36),
    fg: rgb(0xeb, 0xdb, 0xb2),
    grey: rgb(0x92, 0x83, 0x74),
    blue: rgb(0x83, 0xa5, 0x98),
    green: rgb(0xb8, 0xbb, 0x26),
    yellow: rgb(0xfa, 0xbd, 0x2f),
    red: rgb(0xfb, 0x49, 0x34),
    purple: rgb(0xd3, 0x86, 0x9b),
    cyan: rgb(0x8e, 0xc0, 0x7c),
  },
  {
    name: 'nord',
    bg: rgb(0x2e, 0x34, 0x40),
    surface: rgb(0x3b, 0x42, 0x52),
    fg: rgb(0xe5, 0xe9, 0xf0),
    grey: rgb(0x7b, 0x88, 0x9c),
    blue: rgb(0x88, 0xc0, 0xd0),
    green: rgb(0xa3, 0xbe, 0x8c),
    yellow: rgb(0xeb, 0xcb, 0x8b),
    red: rgb(0xbf, 0x61, 0x6a),
    purple: rgb(0xb4, 0x8e, 0xad),
    cyan: rgb(0x8f, 0xbc, 0xbb),
  },
  {
    name: 'dracula',
    bg: rgb(0x28, 0x2a, 0x36),
    surface: rgb(0x44, 0x47, 0x5a),
    fg: rgb(0xf8, 0xf8, 0xf2),
    grey: rgb(0x62, 0x72, 0xa4),
    blue: rgb(0xbd, 0x93, 0xf9),
    green: rgb(0x50, 0xfa, 0x7b),
    yellow: rgb(0xf1, 0xfa, 0x8c),
    red: rgb(0xff, 0x55, 0x55),
    purple: rgb(0xff, 0x79, 0xc6),
    cyan: rgb(0x8b, 0xe9, 0xfd),
  },
  {
    name: 'solarized',
    bg: rgb(0x00, 0x2b, 0x36),
    surface: rgb(0x07, 0x36, 0x42),
    fg: rgb(0x93, 0xa1, 0xa1),
    grey: rgb(0x58, 0x6e, 0x75),
    blue: rgb(0x26, 0x8b, 0xd2),
    green: rgb(0x85, 0x99, 0x00),
    yellow: rgb(0xb5, 0x89, 0x00),
    red: rgb(0xdc, 0x32, 0x2f),
    purple: rgb(0x6c, 0x71, 0xc4),
    cyan: rgb(0x2a, 0xa1, 0x98),
  },
  {
    name: 'monokai',
    bg: rgb(0x27, 0x28, 0x22),
    surface: rgb(0x3e, 0x3d, 0x32),
    fg: rgb(0xf8, 0xf8, 0xf2),
    grey: rgb(0x75, 0x71, 0x5e),
    blue: rgb(0x66, 0xd9, 0xef),
    green: rgb(0xa6, 0xe2, 0x2e),
    yellow: rgb(0xfd, 0x97, 0x1f),
    red: rgb(0xf9, 0x26, 0x72),
    purple: rgb(0xae, 0x81, 0xff),
    cyan: rgb(0xa1, 0xef, 0xe4),
  },
  {
    name: 'vscode-dark',
    bg: rgb(0x1e, 0x1e, 0x1e),
    surface: rgb(0x2d, 0x2d, 0x30),
    fg: rgb(0xd4, 0xd4, 0xd4),
    grey: rgb(0x80, 0x80, 0x80),
    blue: rgb(0x3b, 0x8e, 0xea),
    green: rgb(0x23, 0xd1, 0x8b),
    yellow: rgb(0xf5, 0xf5, 0x43),
    red: rgb(0xf1, 0x4c, 0x4c),
    purple: rgb(0xd6, 0x70, 0xd6),
    cyan: rgb(0x29, 0xb8, 0xdb),
  },
  // What insiderone.com is actually set in: near-black type colour `#261a28`,
  // the warm off-white `#efebe4` it sets that type on rather than plain white,
  // and orange as the one accent — the `#f4482b` glow behind its cards and the
  // `#ff6900` of its calls to action.
  //
  // The `--blue` and `--navyblue` custom properties the page also declares are
  // Bootstrap's own defaults carried through the theme, not the brand: nothing
  // on the page is drawn in either. Read off the declarations rather than off
  // what the page uses them for, this theme came out indigo on navy, which is
  // not a palette anyone would recognise as this site's.
  //
  // Orange crowds three of the pane's roles at once — the accent, the running
  // tone and the failed tone are all warm — so the accent keeps the brand's
  // orange and the other two are pushed apart from it: gold for running, a true
  // red for failed. A drawing where *this agent is running* and *this one broke*
  // are two shades of the same orange says neither.
  {
    name: 'insider-one',
    bg: rgb(0x26, 0x1a, 0x28),
    surface: rgb(0x3b, 0x2b, 0x3d),
    fg: rgb(0xef, 0xeb, 0xe4),
    grey: rgb(0x8d, 0x83, 0x91),
    blue: rgb(0xff, 0x69, 0x00),
    green: rgb(0x28, 0xa7, 0x45),
    yellow: rgb(0xfc, 0xb9, 0x00),
    red: rgb(0xdc, 0x35, 0x45),
    purple: rgb(0x6f, 0x42, 0xc1),
    cyan: rgb(0x4e, 0xdc, 0xce),
  },
  // Light grounds. Every role is pulled toward the foreground until it clears
  // the ground it is drawn on, and on these the foreground is the dark one —
  // so a theme's own bright colours come out darkened here rather than washed
  // out, and `paletteOf` needs no case for which way round the pane is.
  {
    name: 'github-light',
    bg: rgb(0xff, 0xff, 0xff),
    surface: rgb(0xd8, 0xde, 0xe4),
    fg: rgb(0x1f, 0x23, 0x28),
    grey: rgb(0x65, 0x6d, 0x76),
    blue: rgb(0x09, 0x69, 0xda),
    green: rgb(0x1a, 0x7f, 0x37),
    yellow: rgb(0x9a, 0x67, 0x00),
    red: rgb(0xcf, 0x22, 0x2e),
    purple: rgb(0x82, 0x50, 0xdf),
    cyan: rgb(0x11, 0x77, 0x79),
  },
  {
    name: 'solarized-light',
    bg: rgb(0xfd, 0xf6, 0xe3),
    surface: rgb(0xee, 0xe8, 0xd5),
    fg: rgb(0x58, 0x6e, 0x75),
    grey: rgb(0x93, 0xa1, 0xa1),
    blue: rgb(0x26, 0x8b, 0xd2),
    green: rgb(0x85, 0x99, 0x00),
    yellow: rgb(0xb5, 0x89, 0x00),
    red: rgb(0xdc, 0x32, 0x2f),
    purple: rgb(0x6c, 0x71, 0xc4),
    cyan: rgb(0x2a, 0xa1, 0x98),
  },
  // The same brand tokens the other way up: their warm off-white as the ground
  // and the plum they set their dark type in as the foreground.
  // The site's own pairing, the way the site itself uses it: the warm off-white
  // as the ground, the near-black as the type, and orange as the one accent.
  {
    name: 'insider-one-light',
    bg: rgb(0xef, 0xeb, 0xe4),
    surface: rgb(0xde, 0xd7, 0xcc),
    fg: rgb(0x26, 0x1a, 0x28),
    grey: rgb(0x6b, 0x64, 0x70),
    blue: rgb(0xd2, 0x41, 0x0a),
    green: rgb(0x1f, 0x7a, 0x3d),
    yellow: rgb(0x8a, 0x5a, 0x00),
    red: rgb(0xc1, 0x27, 0x2d),
    purple: rgb(0x6f, 0x42, 0xc1),
    cyan: rgb(0x00, 0x80, 0x7a),
  },
]

export const DEFAULT_THEME = THEMES[0].name

export function themeOf(name: string | undefined): Theme {
  return THEMES.find(t => t.name === name) ?? THEMES[0]
}

/** The name after this one, so one control can walk the list. */
export function nextTheme(name: string): string {
  const at = THEMES.findIndex(t => t.name === name)

  return THEMES[(at + 1 + THEMES.length) % THEMES.length].name
}

/**
 * How far apart two colours are, by the ratio WCAG defines.
 *
 * The only measure of legibility anyone can check the pane against: 4.5 is the
 * bar for text, 3.0 for a line or a glyph. A terminal theme is not designed
 * against it — several of the ones here put their own grey under 3.0 on their
 * own ground — so the pane measures what it derives and lifts what falls short.
 */
function apart(a: Rgb, b: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255

    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const light = (c: Rgb) =>
    0.2126 * channel((c >> 16) & 0xff) + 0.7152 * channel((c >> 8) & 0xff) + 0.0722 * channel(c & 0xff)
  const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x)

  return (hi + 0.05) / (lo + 0.05)
}

/**
 * A role pulled away from the ground until it clears it.
 *
 * Away from the ground rather than toward the foreground, and one small step at
 * a time, so a colour that already reads keeps its hue exactly and one that
 * does not gives up the least it can. Toward the foreground was the rule once,
 * and on a light theme the foreground is a dark blue-grey: solarized's yellow
 * mixed with it cleared the bar as `#827a40`, which is olive. A reader who
 * picked a palette by name should get that palette's hues, lighter or darker
 * where the theme itself is not legible, not a second palette derived from its
 * text colour.
 *
 * Which way is away is read off the ground: black on a light one, white on a
 * dark one, so the same rule serves both without a special case.
 */
function readable(color: Rgb, bg: Rgb, floor: number): Rgb {
  const white = rgb(0xff, 0xff, 0xff)
  const black = rgb(0, 0, 0)
  const away = apart(white, bg) >= apart(black, bg) ? white : black
  let lifted = color

  for (let step = 1; step <= 20 && apart(lifted, bg) < floor; step++) {
    lifted = mix(color, away, step / 20)
  }

  return lifted
}

/**
 * The floor every role but one has to clear.
 *
 * 3.0 rather than 4.5: the pane is a drawing, its text is a glyph at a time
 * against a fixed ground, and the roles under this bar are the ones a reader
 * cannot see at all rather than the ones they have to look at twice. Held to
 * 4.5 the quiet roles stop being quiet, and the layer that is meant to be read
 * past starts competing with the layer that is meant to be read.
 */
const FLOOR = 3

/**
 * The floor for the roles that are read rather than looked past.
 *
 * Four states, three figures and the accent: what a node's rule says happened,
 * what the run cost, what it ran on, and which node the reader picked. These
 * are the answers a reader opened the pane for, and a couple of the palettes
 * put them barely over the graphics bar — solarized drew `done` and `running`
 * at 3.04 and 3.06 on its light ground, two figures a reader has to lean in
 * for. A point of ratio over the bar costs those palettes a little of their
 * softness and buys back the facts.
 *
 * Not 4.5: the roles are glyphs and short figures against one fixed ground,
 * not paragraphs, and 4.5 pulls a muted palette so far toward its own text
 * colour that `done` and `model` stop being green and cyan.
 */
const READ = 4

/**
 * How far the edges have to stand off the state tones, in degrees of hue.
 *
 * Ten of the twelve palettes hold their blue more than 55 degrees off the
 * nearest of green, gold and red, and the two that do not are not close: the
 * Insider palettes set their accent to the brand's orange, which lands 19
 * degrees from their own gold and their own red. So the bar is drawn where the
 * gap actually is, between 45 and 55, and no palette moves except the two.
 */
const APART_H = 45

/** Where a colour sits on the wheel, or -1 for a grey, which has no angle. */
function hueOf(color: Rgb): number {
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

/** The shorter way round the wheel between two colours. A grey is far from everything. */
function turn(a: Rgb, b: Rgb): number {
  const [x, y] = [hueOf(a), hueOf(b)]

  if (x < 0 || y < 0) {
    return 180
  }

  const gap = Math.abs(x - y) % 360

  return gap > 180 ? 360 - gap : gap
}

/**
 * The hue the edges are drawn in.
 *
 * An edge is not a state. What it has to say is that two agents are joined, and
 * a reader who has to decide whether an orange line means *connected* or means
 * *this one is running* is reading the drawing twice. Normally the theme's blue
 * is nowhere near its greens, golds and reds and the question never comes up;
 * where a palette spends its accent on a warm brand colour, the edges take
 * whichever of the two hues left stands furthest from every state instead.
 */
function edgeOf(theme: Theme): Rgb {
  const states = [theme.green, theme.yellow, theme.red]
  const clearance = (color: Rgb) => Math.min(...states.map(state => turn(color, state)))

  if (clearance(theme.blue) >= APART_H) {
    return theme.blue
  }

  return clearance(theme.purple) >= clearance(theme.cyan) ? theme.purple : theme.cyan
}

export function paletteOf(theme: Theme): Palette {
  const lift = (color: Rgb, floor = FLOOR) => readable(color, theme.bg, floor)

  return {
    running: lift(theme.yellow, READ),
    done: lift(theme.green, READ),
    failed: lift(theme.red, READ),
    // Cut off is a kind of red: a run someone killed did not do what it was
    // asked, and a reader scanning a list of runs for the ones that need
    // looking at needs to see it from across the room. It is the red pulled
    // back toward the grey, though, so a run that broke still reads as the
    // worse of the two where both are on screen.
    stopped: lift(mix(theme.red, theme.grey, 0.4), READ),
    // Between the ground and the grey: a state that says nothing happened
    // should sit under the text that says what did. It stays clear of the tone
    // the borders and rules are drawn in, though — a node a reader has to look
    // twice at to tell from the boundary beside it is a node drawn wrong.
    idle: lift(mix(theme.grey, theme.surface, 0.2)),
    dim: lift(theme.grey),
    text: lift(theme.fg, READ),
    accent: lift(theme.blue, READ),
    // The one role that is not lifted. A track is the ground of an empty meter
    // and the tone of a rule: what it has to say is that nothing is there, and
    // a track a reader can see clearly is a meter that looks half full when it
    // is empty.
    track: theme.surface,
    clock: lift(mix(theme.fg, theme.grey, 0.6), READ),
    spend: lift(theme.purple, READ),
    model: lift(theme.cyan, READ),
    wire: lift(mix(edgeOf(theme), theme.grey, 0.2)),
  }
}

export function hexOf(color: Rgb): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`
}
