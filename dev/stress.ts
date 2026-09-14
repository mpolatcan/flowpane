/**
 * Renders the pane at sizes and run shapes the synthetic preview does not
 * reach: a wide fan-out that forces the compact and dense densities, and a
 * narrow body that forces labels to truncate.
 *
 *   bun dev/stress.ts
 */

import { Canvas, DEFAULT_COLOR } from '../hooks/canvas'
import type { RunState } from '../hooks/journal'
import { paint } from '../hooks/paint'

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

function fanOut(width: number, phases: string[]): RunState {
  const run: RunState = {
    runId: 'wf_stress',
    name: 'index-repository',
    summary: '',
    transcriptDir: '',
    runFile: '',
    startedMs: 0,
    status: 'running',
    phases,
    agents: [],
    consumed: 0,
  }

  phases.forEach((phase, p) => {
    const count = p === 0 ? width : p === 1 ? Math.ceil(width / 2) : 1

    for (let i = 0; i < count; i++) {
      const done = p === 0 || (p === 1 && i % 3 !== 0)

      run.agents.push({
        agentId: `${phase}-${i}`,
        label: `${phase.toLowerCase()}:module-${i}`,
        phase,
        state: done ? 'done' : 'running',
        startedMs: p * 2000,
        endedMs: done ? p * 2000 + 1400 + i * 90 : undefined,
        resultPreview: done ? 'ok' : undefined,
        tokens: done ? 18_400 : undefined,
        tools: [],
      })
    }
  })

  return run
}

const cases: { title: string; columns: number; rows: number; run: RunState }[] = [
  { title: 'compact — 7 wide in 26 rows', columns: 108, rows: 26, run: fanOut(7, ['Scan', 'Index', 'Merge']) },
  { title: 'dense — 14 wide in 24 rows', columns: 108, rows: 24, run: fanOut(14, ['Scan', 'Index', 'Merge']) },
  { title: 'narrow body — 46 columns', columns: 46, rows: 22, run: fanOut(4, ['Scan', 'Index', 'Merge']) },
]

for (const c of cases) {
  const canvas = new Canvas(c.columns, c.rows)

  paint(canvas, c.run, { nowMs: 9000, tick: 5 })
  console.log(`\n\x1b[1m── ${c.title} ──\x1b[0m`)
  console.log(toAnsi(canvas))
}
