import { Canvas, DEFAULT_COLOR } from '../hooks/canvas'
import { applyJournal, applyRunFile, runFileOf, type RunState } from '../hooks/journal'
import { paint } from '../hooks/paint'
import { rowsOf, segmentsOf } from '../hooks/tree'

const dir = process.argv[2]
const runId = dir.split('/').pop()!
const run: RunState = {
  runId, name: runId, summary: '', transcriptDir: dir, runFile: runFileOf(dir, runId),
  startedMs: 0, status: 'running', phases: [], agents: [], consumed: 0,
}
applyJournal(run, await Bun.file(`${dir}/journal.jsonl`).text(), 1000)
const f = Bun.file(run.runFile)
if (await f.exists()) applyRunFile(run, await f.text(), 3000)

const canvas = new Canvas(110, 26)
const drawn = paint(canvas, run, { nowMs: Date.now(), tick: 5 })

// Rebuild each row from the segments the fallback emits and compare with the canvas.
let mismatches = 0
for (let y = 0; y < canvas.rows; y++) {
  const fromCanvas = Array.from({ length: canvas.columns }, (_, x) =>
    String.fromCodePoint(canvas.cell(x, y).code || 0x20)).join('').trimEnd()
  const fromSegments = segmentsOf(canvas, y, drawn.hotspots).map(s => s.text).join('').trimEnd()
  if (fromCanvas !== fromSegments) {
    mismatches++
    console.log(`row ${y} differs:\n  canvas:   ${JSON.stringify(fromCanvas)}\n  segments: ${JSON.stringify(fromSegments)}`)
  }
}

const pressed: string[] = []
const tree = rowsOf(
  canvas,
  {
    Box: (p: any) => ({ type: 'Box', props: p }),
    Text: (p: any) => ({ type: 'Text', props: p }),
    Button: (p: any) => ({ type: 'Button', props: p }),
  },
  drawn.hotspots,
  (id: string) => pressed.push(id),
) as any[]
const texts = tree.flatMap(r => r.props.children)
const colored = texts.filter((t: any) => t.props.color !== undefined).length
const buttons = texts.filter((t: any) => t.type === 'Button')

// Pressing every node button must name every agent exactly once.
buttons.forEach((b: any) => b.props.onPress())
console.log(`hotspots: ${drawn.hotspots.length}, buttons: ${buttons.length}, presses: ${pressed.length}, unique: ${new Set(pressed).size}, agents: ${run.agents.length}`)
console.log('button labels:', buttons.slice(0, 3).map((b: any) => JSON.stringify(b.props.label)).join(' '))

console.log(`rows: ${tree.length}, text elements: ${texts.length}, coloured: ${colored}, row mismatches: ${mismatches}`)
console.log('sample row 9 segments:', JSON.stringify(segmentsOf(canvas, 9).slice(0, 4), null, 1))
