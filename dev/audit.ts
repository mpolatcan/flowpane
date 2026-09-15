/**
 * Every run this machine has kept, drawn at every size the pane is ever given,
 * in every layout — and timed.
 *
 * Three questions, one sweep. Whether any of them throws. Whether any of them
 * writes outside the canvas or leaves a cell the terminal cannot show. And how
 * long the slowest frame takes, because the pane redraws on a timer while a
 * workflow runs and a frame that costs more than the gap between frames is a
 * pane that falls behind the run it is drawing.
 *
 *   bun dev/audit.ts            every journal, both layouts, the size sweep
 *   bun dev/audit.ts --quick    the widest journal only
 */

import { basename } from 'node:path'

import { Canvas } from '../hooks/canvas'
import type { RunState } from '../hooks/journal'
import type { Orientation } from '../hooks/layout'
import { paint } from '../hooks/paint'
import { journalRun, runDirs } from './load'

/** The widths a docked pane is given, from a split terminal to a full screen. */
const COLUMNS = [20, 26, 34, 46, 60, 74, 88, 102, 120, 148, 180, 220]
/** The heights, from a pane squeezed under a long transcript to a tall window. */
const ROWS = [6, 9, 12, 16, 22, 28, 34, 44, 60, 80]
const LAYOUTS: Orientation[] = ['flow', 'stack', 'time']

type Case = { run: RunState; name: string }

/** A run far larger than anything in the journals, to see where the cost goes. */
function madeUp(phases: number, each: number): RunState {
  const names = [...Array(phases).keys()].map(i => `Phase ${i + 1}`)
  const run: RunState = {
    runId: 'wf_audit',
    name: 'audit',
    summary: '',
    transcriptDir: '',
    runFile: '',
    startedMs: 0,
    status: 'running',
    phases: names,
    agents: [],
    consumed: 0,
  }

  names.forEach((phase, p) => {
    for (let i = 0; i < each; i++) {
      run.agents.push({
        agentId: `${p}-${i}`,
        label: `${phase.toLowerCase().replace(' ', '')}:module-${i}`,
        phase,
        state: p < phases - 1 ? 'done' : 'running',
        startedMs: p * 2_000,
        endedMs: p < phases - 1 ? p * 2_000 + 1_400 : undefined,
        tokens: 18_400,
        tools: [],
      })
    }
  })

  return run
}

/** Whether every cell holds something a terminal can put in one column. */
function legible(c: Canvas): string | null {
  for (let y = 0; y < c.rows; y++) {
    for (let x = 0; x < c.columns; x++) {
      const code = c.at(x, y)

      if (code === 0) {
        continue
      }

      // A control character has no width and a surrogate half is not a
      // character at all: either one shifts every cell after it along the row.
      if (code < 0x20 || (code >= 0x7f && code < 0xa0) || (code >= 0xd800 && code <= 0xdfff)) {
        return `${x},${y} holds U+${code.toString(16).padStart(4, '0')}`
      }
    }
  }

  return null
}

const quick = process.argv.includes('--quick')
const cases: Case[] = []

for (const dir of runDirs()) {
  cases.push({ run: await journalRun(dir), name: basename(dir) })
}

if (cases.length === 0) {
  // The made-up runs below still exercise the painters, so this is a warning
  // rather than a stop: a clone with no runs of its own can still be checked.
  console.error('no runs on disk for this directory — the made-up ones only. FLOWPANE_RUNS points at a copied corpus.')
}

cases.sort((a, b) => b.run.agents.length - a.run.agents.length)

if (!quick) {
  cases.push({ run: madeUp(6, 12), name: 'made-up 6×12' })
  cases.push({ run: madeUp(10, 24), name: 'made-up 10×24' })
}

const picked = quick ? cases.slice(0, 1) : cases
const times: { ms: number; what: string }[] = []
const broken: string[] = []
let frames = 0

for (const { run, name } of picked) {
  for (const orientation of LAYOUTS) {
    for (const columns of COLUMNS) {
      for (const rows of ROWS) {
        const canvas = new Canvas(columns, rows)
        const what = `${name} ${orientation} ${columns}×${rows}`
        const at = performance.now()

        try {
          paint(canvas, run, { nowMs: run.startedMs + 40_000, tick: 3, orientation })
        } catch (error) {
          broken.push(`${what}: ${error instanceof Error ? error.message : String(error)}`)

          continue
        }

        times.push({ ms: performance.now() - at, what })
        frames++

        const wrong = legible(canvas)

        if (wrong) {
          broken.push(`${what}: ${wrong}`)
        }
      }
    }
  }
}

times.sort((a, b) => a.ms - b.ms)

const at = (q: number) => times[Math.min(times.length - 1, Math.floor(times.length * q))] as { ms: number; what: string }

console.log(`${frames} frames, ${picked.length} runs, ${LAYOUTS.length} layouts`)

if (times.length === 0) {
  console.error('nothing to draw: no runs on disk, and --quick leaves out the made-up ones')
  process.exit(1)
}

console.log(`  p50 ${at(0.5).ms.toFixed(2)}ms   p95 ${at(0.95).ms.toFixed(2)}ms   p99 ${at(0.99).ms.toFixed(2)}ms`)

for (const slow of times.slice(-5).reverse()) {
  console.log(`  ${slow.ms.toFixed(2)}ms  ${slow.what}`)
}

if (broken.length > 0) {
  console.log(`\n${broken.length} broken:`)
  broken.slice(0, 40).forEach(line => console.log(`  ${line}`))
  process.exit(1)
}

console.log('\nnothing threw, every cell legible')
