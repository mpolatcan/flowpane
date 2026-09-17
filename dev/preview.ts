/**
 * Draws the pane outside Claude Code, so the visuals can be iterated on without
 * an interactive session: it builds a run (synthetic, or replayed from a real
 * `journal.jsonl`), paints it, and decodes the cells back to truecolor ANSI.
 *
 *   bun dev/preview.ts                       one frame of a synthetic run
 *   bun dev/preview.ts --animate             the run playing out
 *   bun dev/preview.ts --journal <dir>       a real run's transcript directory
 *   bun dev/preview.ts --cols 120 --rows 30
 *   bun dev/preview.ts --orientation timeline  the timeline instead of the graph
 *   bun dev/preview.ts --quiet               with one agent gone quiet
 *   bun dev/preview.ts --select verify:perf  with that agent's detail dialog open
 *   bun dev/preview.ts --pick | --picking    with the run menu shut, or open
 *   bun dev/preview.ts --settings            with the settings dialog open
 *   bun dev/preview.ts --menu theme          with that setting's list unrolled
 *   bun dev/preview.ts --about               with the About dialog open
 *   bun dev/preview.ts --scrolly 12          the drawing scrolled down 12 cells
 *   bun dev/preview.ts --follow              the window on the phase the run is in
 *   bun dev/preview.ts --open '▸ name'       with that nested run unfolded
 *   bun dev/preview.ts --plain               the glyphs only, no colour
 */

import { Canvas, DEFAULT_COLOR } from '../hooks/canvas'
import { paint, useTheme } from '../hooks/paint'
import { themeOf } from '../hooks/theme'
import { journalRun, siblingRuns, syntheticRun } from './load'

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)

  return i === -1 ? fallback : process.argv[i + 1] ?? fallback
}

const has = (name: string) => process.argv.includes(`--${name}`)

const columns = Number(arg('cols', '110'))
const rows = Number(arg('rows', '30'))

/** Decodes a canvas back to its glyphs, one line per row, with no colour. */
function toPlain(canvas: Canvas): string {
  const words = new Uint32Array(
    Uint8Array.from(Buffer.from(canvas.encode(), 'base64')).buffer,
  )

  const lines: string[] = []

  for (let y = 0; y < canvas.rows; y++) {
    let line = ''

    for (let x = 0; x < canvas.columns; x++) {
      line += String.fromCodePoint(words[(y * canvas.columns + x) * 3] || 0x20)
    }

    lines.push(line.replace(/\s+$/, ''))
  }

  return lines.join('\n')
}

/** Decodes a canvas back to ANSI, one line per row. */
function toAnsi(canvas: Canvas): string {
  const words = new Uint32Array(
    Uint8Array.from(Buffer.from(canvas.encode(), 'base64')).buffer,
  )

  const color = (value: number, layer: 38 | 48) =>
    value === DEFAULT_COLOR
      ? `\x1b[${layer + 1}m`
      : `\x1b[${layer};2;${(value >> 16) & 0xff};${(value >> 8) & 0xff};${value & 0xff}m`

  const lines: string[] = []

  for (let y = 0; y < canvas.rows; y++) {
    let line = ''

    for (let x = 0; x < canvas.columns; x++) {
      const i = (y * canvas.columns + x) * 3

      line += color(words[i + 1], 38) + color(words[i + 2], 48) + String.fromCodePoint(words[i])
    }

    lines.push(`${line}\x1b[0m`)
  }

  return lines.join('\n')
}


// The same ground the plugin clears to, so the preview shows what ships; the
// palette is drawn for it, and a preview on the terminal's own colour flattered
// the contrast.
const theme = themeOf(arg('theme', ''))

useTheme(theme.name)

// The palette's own ground, as the plugin paints on: the six palettes are drawn
// for a dark ground, and a pane left on the terminal's colour is a pane in
// colours nobody picked.
const canvas = new Canvas(columns, rows, theme.bg)
const journalDir = arg('journal')

if (has('animate')) {
  process.stdout.write('\x1b[?25l')

  for (let frame = 0; frame < 220; frame++) {
    const atMs = frame * 90
    const run = journalDir ? await journalRun(journalDir) : syntheticRun(atMs, has('quiet'))

    paint(canvas, run, {
      nowMs: journalDir ? (run.endedMs ?? Date.now()) : atMs,
      tick: frame,
      orientation: (arg('orientation', 'auto') as any),
    })
    process.stdout.write(`\x1b[H\x1b[2J${has('plain') ? toPlain(canvas) : toAnsi(canvas)}\n`)
    await Bun.sleep(60)
  }

  process.stdout.write('\x1b[?25h')
} else {
  const atMs = Number(arg('at', '8000'))
  const run = journalDir ? await journalRun(journalDir) : syntheticRun(atMs, has('quiet'))
  const pick = arg('select')
  const selectedId = pick
    ? (run.agents.find(a => a.label.includes(pick) || a.agentId === pick)?.agentId ?? pick)
    : undefined

  paint(canvas, run, {
    nowMs: journalDir ? (run.endedMs ?? Date.now()) : atMs,
    tick: Number(arg('tick', '7')),
    orientation: (arg('orientation', 'auto') as any),
    selectedId,
    detailRows: Number(arg('detailRows', '24')),
    detailTab: Number(arg('tab', '0')),
    openCall: arg('call'),
    callScroll: Number(arg('callscroll', '0')),
    callOutScroll: Number(arg('outscroll', '0')),
    fromRun: arg('fromrun'),
    bodyScroll: { x: Number(arg('scrollx', '0')), y: Number(arg('scrolly', '0')) },
    follow: has('follow'),
    // A step inside a nested run is keyed with a null between the run's name and
    // the step's number, which nothing can type. `--open '▸ name#2'` says
    // the same thing.
    opened: arg('open', '')
      .split(',')
      .filter(Boolean)
      .map(name => name.replace(/#(\d+)$/, '\u0000$1')),
    detailScroll: arg('scroll', '')
      .split(',')
      .filter(Boolean)
      .map(Number),
    runPicker: has('picking') ? 'open' : has('pick') ? 'shut' : undefined,
    runs: has('picking') ? siblingRuns(journalDir, run.runId, run.name) : undefined,
    settings: has('settings'),
    menu: arg('menu') as any,
    about: has('about'),
  })
  console.log(has('plain') ? toPlain(canvas) : toAnsi(canvas))
}
