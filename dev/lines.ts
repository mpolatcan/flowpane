/**
 * Every line the pane draws, checked against what a line is supposed to do.
 *
 * Four faults, hunted over the same sweep the size audit uses. A wire written
 * through a word, or a word written over a wire: either is a cell whose two
 * owners both thought it was theirs. An arrowhead with nothing behind it, which
 * is a mark pointing out of empty space. And a line piece with an arm running
 * into a blank cell, which is a wire that stops in the middle of the pane
 * without saying why — the shape a rubbed-out wire leaves behind, so the arm
 * catches the erasures too, and says where the reader sees one.
 *
 * Each cell remembers which function drew the line in it, read off the stack,
 * because five painters draw lines that are supposed to give way. A card's own
 * edge carries the card's name set into it; the bar's top rule stops short of
 * the surface's close control; the borders and band rules go into blank cells
 * only; and on the timeline the ruler's ticks and the grid under them are a
 * scale rather than a line anything travels along, so each stops wherever a bar
 * or a word already stands. Those five are quiet by default and `--all` shows
 * them.
 *
 *   bun dev/lines.ts            every journal, every layout, the size sweep
 *   bun dev/lines.ts --quick    the widest journal, one size
 *   bun dev/lines.ts --all      the painters that are meant to give way, too
 */

import { basename } from 'node:path'

import { Canvas, HOP, PORT, armsOf, ARM } from '../hooks/canvas'
import type { RunState } from '../hooks/journal'
import type { Orientation } from '../hooks/layout'
import { paint } from '../hooks/paint'
import { journalRun, runDirs } from './load'

const COLUMNS = [20, 26, 34, 46, 60, 74, 88, 102, 120, 148, 180, 220]
const ROWS = [6, 9, 12, 16, 22, 28, 34, 44, 60, 80]
const LAYOUTS: Orientation[] = ['horizontal', 'vertical', 'timeline']

const ARROWS = new Set([0x25b8, 0x25be, 0x25b4, 0x25c2])
/**
 * The pieces only a wire is ever drawn with.
 *
 * A card's edge, a band's rule and the gutter's border are lines too, and they
 * are drawn to be broken: a name is set into an edge, a label into a rule. They
 * are made of the plain pieces, so a word landing on one of these is the thing
 * worth reporting and a word landing on a plain piece is not.
 */
const WIRE_ONLY = new Set([
  HOP, PORT, 0x2504, 0x2506, 0x251c, 0x2524, 0x252c, 0x2534, 0x253c, ...ARROWS,
])
/** Which way is behind each arrowhead: the cell its own stem should be in. */
const BEHIND: Record<number, { dx: number; dy: number }> = {
  0x25b8: { dx: -1, dy: 0 },
  0x25c2: { dx: 1, dy: 0 },
  0x25be: { dx: 0, dy: -1 },
  0x25b4: { dx: 0, dy: 1 },
}

const blank = (code: number) => code === 0 || code === 0x20

/** Whether a cell holds a word rather than a wire: something a reader reads. */
function ink(code: number): boolean {
  return !blank(code) && armsOf(code) === undefined && code !== PORT && !ARROWS.has(code)
}

/** Whether a cell holds a piece of wire, which nothing written may land on. */
const wire = (code: number) => armsOf(code) !== undefined || code === PORT || ARROWS.has(code)

/** The painters whose lines are drawn to be broken, and are not faults. */
const GIVES_WAY = new Set(['paintNode', 'paintBar', 'ink', 'paintRuler', 'paintGrid'])

type Clash = { x: number; y: number; over: number; under: number; kind: string; by: string }
const clashes: Clash[] = []
const writers = new Map<number, string>()
/**
 * The cells a name cleared to stand in a line.
 *
 * A card's name is set into its top edge and a band's into its rule, each with
 * a blank either side, so the line either side of the name ends against a cell
 * the name emptied. That is the shape a name in a line has, not a wire that
 * stops: a line ending against one of these is no fault.
 */
const cleared = new Set<number>()
let watching = false
let inText = false

/** Which painter is putting this cell, read off the stack: name and line. */
function writer(): string {
  const stack = (new Error().stack ?? '').split('\n')
  const frame = stack.find(
    (line, i) => i > 2 && !line.includes('Canvas.put') && !line.includes('Canvas.text'),
  )
  const named = /at (\S+) \(.*\/(\w+\.ts):(\d+)/.exec(frame ?? '')

  return named ? `${named[1]} ${named[2]}:${named[3]}` : '?'
}

const rawPut = Canvas.prototype.put
const rawText = Canvas.prototype.text

Canvas.prototype.text = function (this: Canvas, ...args: Parameters<Canvas['text']>) {
  const was = inText
  inText = true
  try {
    return rawText.apply(this, args)
  } finally {
    inText = was
  }
}

Canvas.prototype.put = function (this: Canvas, x, y, code, fg, bg) {
  if (watching && x >= 0 && y >= 0 && x < this.columns && y < this.rows) {
    const under = this.at(x, y)

    const held = writers.get(y * this.columns + x)

    if (!blank(code) && inText && WIRE_ONLY.has(under)) {
      clashes.push({ x, y, over: code, under, kind: 'word over wire', by: `${held} under ${writer()}` })
    } else if (!inText && wire(code) && ink(under)) {
      clashes.push({ x, y, over: code, under, kind: 'wire over word', by: writer() })
    }

    if (wire(code)) {
      writers.set(y * this.columns + x, writer())
      cleared.delete(y * this.columns + x)
    } else {
      writers.delete(y * this.columns + x)

      if (blank(code)) {
        cleared.add(y * this.columns + x)
      }
    }
  }

  return rawPut.call(this, x, y, code, fg, bg)
}

type Fault = { x: number; y: number; what: string; by: string }

/**
 * Arrowheads with no stem, and line arms that run into a blank cell.
 *
 * `rows` are the rows a card's own name is on, read off the press targets. Two
 * cards a single row apart leave one cell between them, and one cell is the
 * whole edge: the head stands on it with the card it comes out of directly
 * behind. That is an edge as short as an edge can be drawn, not a head with a
 * missing stem, so a stem cell on a card's row is no fault.
 */
function loose(c: Canvas, rows: Set<number>): Fault[] {
  const out: Fault[] = []

  for (let y = 0; y < c.rows; y++) {
    for (let x = 0; x < c.columns; x++) {
      const code = c.at(x, y)

      // An arrowhead written as part of a string is a mark in a sentence — the
      // strip names its phases `Verify \u25b8 Escalate` — and not the end of a
      // line, so it has no stem to look for.
      if (ARROWS.has(code) && !(writers.get(y * c.columns + x) ?? '').startsWith('text ')) {
        const back = BEHIND[code] as { dx: number; dy: number }
        const stem = c.at(x + back.dx, y + back.dy)

        const behind = (y + back.dy) * c.columns + x + back.dx

        if (
          blank(stem) && !cleared.has(behind) && !rows.has(y + back.dy) &&
          x + back.dx >= 0 && y + back.dy >= 0 && x + back.dx < c.columns && y + back.dy < c.rows
        ) {
          out.push({
            x, y,
            by: writers.get(y * c.columns + x) ?? '?',
            what: `arrowhead U+${code.toString(16)} with nothing behind it, drawn by ${writers.get(y * c.columns + x) ?? '?'}`,
          })
        }

        continue
      }

      const arms = armsOf(code)

      if (arms === undefined || code === HOP) {
        continue
      }

      const steps: [number, number, number][] = [
        [ARM.up, 0, -1],
        [ARM.right, 1, 0],
        [ARM.down, 0, 1],
        [ARM.left, -1, 0],
      ]

      for (const [arm, dx, dy] of steps) {
        if ((arms & arm) === 0) {
          continue
        }

        const nx = x + dx
        const ny = y + dy

        // An arm at the pane's edge points off it, which is where the pane ends
        // and not a wire stopping short.
        if (nx < 0 || ny < 0 || nx >= c.columns || ny >= c.rows) {
          continue
        }

        if (blank(c.at(nx, ny)) && !cleared.has(ny * c.columns + nx)) {
          out.push({
            x, y,
            by: writers.get(y * c.columns + x) ?? '?',
            what: `U+${code.toString(16)} arm into a blank cell, drawn by ${writers.get(y * c.columns + x) ?? '?'}`,
          })
        }
      }
    }
  }

  return out
}

const quick = process.argv.includes('--quick')
const all = process.argv.includes('--all')
const cases: { run: RunState; name: string }[] = []

for (const dir of runDirs()) {
  cases.push({ run: await journalRun(dir), name: basename(dir) })
}

if (cases.length === 0) {
  console.error(
    'no runs on disk for this directory: run a workflow here first, or point FLOWPANE_RUNS at a copied corpus',
  )
  process.exit(1)
}

cases.sort((a, b) => b.run.agents.length - a.run.agents.length)

const picked = quick ? cases.slice(0, 1) : cases
const widths = quick ? [120] : COLUMNS
const heights = quick ? [34] : ROWS
const counts = new Map<string, { n: number; where: string }>()
let frames = 0

const tally = (what: string, where: string) => {
  const held = counts.get(what)

  if (held) {
    held.n++
  } else {
    counts.set(what, { n: 1, where })
  }
}

for (const { run, name } of picked) {
  for (const orientation of LAYOUTS) {
    for (const columns of widths) {
      for (const rows of heights) {
        const canvas = new Canvas(columns, rows)
        const what = `${name} ${orientation} ${columns}×${rows}`

        clashes.length = 0
        writers.clear()
        cleared.clear()
        watching = true
        const drawn = paint(canvas, run, { nowMs: run.startedMs + 40_000, tick: 3, orientation })
        watching = false
        frames++

        for (const clash of clashes) {
          if (!all && GIVES_WAY.has(clash.by.split(' ')[0] as string)) {
            continue
          }

          tally(
            `${clash.kind}: ${String.fromCodePoint(clash.over)} over ${String.fromCodePoint(clash.under)}, ${clash.by}`,
            `${what} at ${clash.x},${clash.y}`,
          )
        }

        for (const fault of loose(canvas, new Set(drawn.hotspots.map(h => h.y)))) {
          if (!all && GIVES_WAY.has(fault.by.split(' ')[0] as string)) {
            continue
          }

          tally(fault.what, `${what} at ${fault.x},${fault.y}`)
        }
      }
    }
  }
}

console.log(`${frames} frames, ${picked.length} runs, ${LAYOUTS.length} layouts`)

const found = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)

if (found.length === 0) {
  console.log('every line lands on a blank cell, every arrowhead has a stem, every arm reaches something')
  process.exit(0)
}

console.log(`\n${found.length} kinds:`)
for (const [what, { n, where }] of found.slice(0, 60)) {
  console.log(`  ${String(n).padStart(6)}  ${what}   e.g. ${where}`)
}
