/**
 * Checks the clickable picture: the bands must cover every row of the canvas
 * exactly once, in order, and every agent must still have a Button to press.
 *
 *   bun dev/checkpic.ts <transcriptDir>
 */

import { NAME, VERSION } from '../hooks/about'
import { Canvas, DEFAULT_COLOR } from '../hooks/canvas'
import { applyJournal, applyRunFile, runFileOf, type RunState } from '../hooks/journal'
import { paint } from '../hooks/paint'
import { pictureOf } from '../hooks/tree'

const dir = process.argv[2]
const runId = dir.split('/').pop()!
const run: RunState = {
  runId, name: runId, summary: '', transcriptDir: dir, runFile: runFileOf(dir, runId),
  startedMs: 0, status: 'running', phases: [], agents: [], consumed: 0,
}
applyJournal(run, await Bun.file(`${dir}/journal.jsonl`).text(), 1000)
const f = Bun.file(run.runFile)
if (await f.exists()) applyRunFile(run, await f.text(), 3000)

const columns = Number(process.argv[3] ?? 110)
const rows = Number(process.argv[4] ?? 34)
const canvas = new Canvas(columns, rows)
// The run's name is a hotspot too, on the top row: `runPicker` puts it there.
const drawn = paint(canvas, run, { nowMs: Date.now(), tick: 5, runPicker: 'shut' })

const pressed: string[] = []
const picture = pictureOf(
  canvas,
  {
    Box: (p: any) => ({ type: 'Box', props: p }),
    Text: (p: any) => ({ type: 'Text', props: p }),
    Button: (p: any) => ({ type: 'Button', props: p }),
    Raster: (p: any) => ({ type: 'Raster', props: p }),
  },
  drawn.hotspots,
  (id: string) => pressed.push(id),
)

let at = 0
let gaps = 0
for (const band of picture.bands) {
  if (band.from !== at) { gaps++; console.log(`band starts at ${band.from}, expected ${at}`) }
  at = band.from + band.rows
}
if (at !== canvas.rows) { gaps++; console.log(`bands end at ${at}, canvas has ${canvas.rows} rows`) }

const flat = (node: any): any[] => [node, ...(Array.isArray(node?.props?.children) ? node.props.children.flatMap(flat) : [])]
const all = picture.children.flatMap(flat)
const rasters = all.filter(n => n.type === 'Raster')
const buttons = all.filter(n => n.type === 'Button')
const drawnRows = picture.children.filter(n => n.type === 'Box').length + rasters.reduce((sum, r) => sum + r.props.rows, 0)

buttons.forEach(b => b.props.onPress())

console.log(`agents ${run.agents.length}  hotspots ${drawn.hotspots.length}  buttons ${buttons.length}  unique presses ${new Set(pressed).size}`)
console.log(`bands ${picture.bands.length}  rasters ${rasters.length}  element rows ${picture.children.length - rasters.length}  rows drawn ${drawnRows}/${canvas.rows}  gaps ${gaps}`)
console.log(`raster keys ${rasters.map(r => r.props.key).join(' ')}`)

// A hotspot's cells are emitted as a Button, and a Button carries no
// background: a colour painted under one is a colour the surface throws away,
// which leaves that row a shade off from every row around it.
let swallowed = 0
for (const spot of drawn.hotspots) {
  for (let x = spot.x; x < spot.x + spot.w; x++) {
    const bg = canvas.cell(x, spot.y).bg

    if (bg !== DEFAULT_COLOR && bg !== canvas.background) {
      swallowed++
    }
  }
}
console.log(`cells coloured under a button ${swallowed}`)

// Again with a node selected, so the detail dialog's own controls are checked.
const open = paint(canvas, run, {
  nowMs: Date.now(),
  tick: 5,
  selectedId: run.agents[0]?.agentId,
  detailRows: Math.min(16, Math.floor(rows / 2)),
  runPicker: 'open',
  runs: [
    { id: runId, mark: '\u25b8', name: runId, tally: '4/6', status: 'running' as const, startedMs: Date.now() - 60_000 },
    { id: 'wf_other', mark: '\u2714', name: 'another run', tally: '6/6', status: 'completed' as const, startedMs: Date.now() - 600_000 },
  ],
})
let swallowedOpen = 0
for (const spot of open.hotspots) {
  for (let x = spot.x; x < spot.x + spot.w; x++) {
    const bg = canvas.cell(x, spot.y).bg

    if (bg !== DEFAULT_COLOR && bg !== canvas.background) {
      swallowedOpen++
    }
  }
}
// The detail dialog and the run menu are modal too: a node left pressable
// behind either is a node drawn at full strength over a drawing that was
// pushed back, because a Button carries a label and no colour.
const behindOpen = open.hotspots.filter(h => !/^(@close|detail-|run:|@runs)/.test(h.agentId))

console.log(
  `with the dialog open: hotspots ${open.hotspots.length}  pressable behind ${behindOpen.length}  cells coloured under a button ${swallowedOpen}`,
)

// And again with the settings up, and once more with a list of them unrolled:
// both draw press targets over cells the dialog painted, and a theme's swatch
// has to stand outside its own target in the shut control and in the list.
for (const menu of [undefined, 'theme' as const]) {
  const settings = paint(canvas, run, {
    nowMs: Date.now(),
    tick: 5,
    detailRows: 24,
    settings: true,
    menu,
  })
  let swallowedSettings = 0
  for (const spot of settings.hotspots) {
    for (let x = spot.x; x < spot.x + spot.w; x++) {
      const cell = canvas.cell(x, spot.y)

      if (cell.bg !== DEFAULT_COLOR && cell.bg !== canvas.background) {
        swallowedSettings++
      }
    }
  }
  const lists = settings.hotspots.filter(h => h.agentId.startsWith('open:'))
  const choices = settings.hotspots.filter(h => h.agentId.startsWith('set:'))
  // The drawing behind the dialog is mixed toward the ground, and nothing
  // behind it takes a press: a node that still answered one would be a node
  // the reader cannot see they are pressing.
  const behind = settings.hotspots.filter(h => !/^(@settings-close|open:|set:|detail-)/.test(h.agentId))
  console.log(
    `with the settings ${menu ? `open on ${menu}` : 'shut'}: hotspots ${settings.hotspots.length}  lists ${lists.length}  choices ${choices.length}  pressable behind ${behind.length}  cells coloured under a button ${swallowedSettings}`,
  )
}

/** The canvas as lines of glyphs, for reading a dialog's words back. */
function rowsOf(c: Canvas): string[] {
  const out: string[] = []

  for (let y = 0; y < c.rows; y++) {
    let line = ''

    for (let x = 0; x < c.columns; x++) {
      line += String.fromCodePoint(c.cell(x, y).code)
    }

    out.push(line)
  }

  return out
}

// And with the pane saying what it is: the same modal rule, and the name and
// version on screen where a reader who has never seen this before will look.
const about = paint(canvas, run, {
  nowMs: Date.now(),
  tick: 5,
  detailRows: 24,
  about: true,
})
const titled = rowsOf(canvas).filter(line => line.includes(`${NAME} ${VERSION}`)).length
const behindAbout = about.hotspots.filter(h => h.agentId !== '@about-close')
console.log(
  `with the About dialog open: hotspots ${about.hotspots.length}  titled rows ${titled}  pressable behind ${behindAbout.length}`,
)
