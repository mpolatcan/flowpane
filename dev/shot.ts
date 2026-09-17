/**
 * The pane in a browser, working: the same drawing the plugin paints, with the
 * same presses landing on it, in a page that can be reloaded in a keystroke.
 *
 * A terminal is a poor place to debug a terminal drawing. Escape sequences and
 * the picture share one stream, the scrollback cuts the tall sizes in half, and
 * two widths cannot be held side by side. Worse, until this the only way to
 * press anything was to start a real workflow and wait for it: a layout that
 * broke on the third press took a minute of somebody's run to see once.
 *
 * So this is not a screenshot tool. It holds the same view object the plugin
 * holds, paints with `paint()`, hands the presses to `hooks/press.ts`, and
 * draws the footer's controls as the surface would draw them. Clicking a node
 * opens its detail, the arrows scroll it, the name drops the run menu, the
 * button under the drawing opens the settings — where the layout and the
 * palette are picked by name, on the canvas — and the frames run on a clock.
 *
 *   bun dev/shot.ts                              serve on http://127.0.0.1:8731
 *   bun dev/shot.ts --port 9000
 *   bun dev/shot.ts --journal <transcript dir>   what the page opens on
 *
 * The page opens on whatever the query says — `?cols=120&rows=40&theme=nord`,
 * or `?q=cols=120;rows=40;theme=nord` where a tool mangles `&` — and every one
 * of those is a control on the page afterwards.
 */

import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { NAME, VERSION } from '../hooks/about'
import { Canvas, DEFAULT_COLOR, type Rgb } from '../hooks/canvas'
import type { RunState } from '../hooks/journal'
import type { Orientation } from '../hooks/layout'
import { paint, useTheme, type DetailView, type Hotspot, type RunEntry } from '../hooks/paint'
import {
  applyPress,
  drew,
  type BodyScroll,
  MAX_DETAIL,
  MIN_DETAIL,
  SETTING_MENUS,
  type PaneView,
  type SettingMenu,
  wheel,
} from '../hooks/press'
import { themeOf, THEMES } from '../hooks/theme'
import { journalRun, siblingRuns, syntheticRun } from './load'

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)

  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback)
}

const port = Number(arg('port', '8731'))

/**
 * The whole of what the page is looking at: the plugin's view, plus the things
 * a session would have decided for it — which run, how big the pane is, and
 * where the clock has got to.
 */
const view: PaneView & {
  journal: string
  columns: number
  rows: number
  tick: number
  quiet: boolean
} = {
  journal: arg('journal') ?? '',
  columns: 120,
  rows: 40,
  tick: 0,
  quiet: false,
  orientation: 'auto',
  theme: 'tokyo-night',
  detailRows: 24,
  selectedId: null,
  fromRun: null,
  openCall: null,
  callScroll: 0,
  detailScroll: [],
  detailTab: 0,
  bodyScroll: { x: 0, y: 0 },
  following: true,
  front: null,
  opened: [],
  picking: false,
  settings: false,
  menu: null,
  about: false,
}

/** The run last read off disk, and where it was read from. */
let loaded: { dir: string; run: RunState } | null = null

/**
 * Where the synthetic run's clock stands. The made-up run counts from zero, so
 * the frame has to be timed against that and not against the wall clock: an
 * agent still running would otherwise be shown as having run since 1970.
 */
const SYNTHETIC_AT = 8000

async function runOf(reload: boolean): Promise<RunState> {
  if (!view.journal) {
    return syntheticRun(SYNTHETIC_AT, view.quiet)
  }

  if (reload || loaded?.dir !== view.journal) {
    loaded = { dir: view.journal, run: await journalRun(view.journal) }
  }

  return loaded.run
}

/**
 * The transcript directories beside the one being looked at, so the page can
 * offer the session's other runs without anyone pasting a path.
 */
function siblings(dir: string): string[] {
  if (!dir) {
    return []
  }

  try {
    const parent = dirname(dir.replace(/\/$/, ''))

    return readdirSync(parent)
      .filter(name => name.startsWith('wf_'))
      .map(name => join(parent, name))
      .filter(path => statSync(path).isDirectory())
      .sort()
  } catch {
    return []
  }
}

function escaped(s: string): string {
  return s.replace(/[&<>"]/g, ch => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;'))
}

function hex(color: Rgb): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`
}

/**
 * The canvas as spans: one per run of cells that share both colours.
 *
 * Cells left on the terminal's own colour get no style at all, so the page's
 * own ground shows through exactly where a terminal's would.
 */
function spansOf(canvas: Canvas): string {
  const out: string[] = []

  for (let y = 0; y < canvas.rows; y++) {
    let run = ''
    let fg: Rgb = DEFAULT_COLOR
    let bg: Rgb = DEFAULT_COLOR
    const flush = () => {
      if (run.length === 0) {
        return
      }

      const style = [
        fg === DEFAULT_COLOR ? '' : `color:${hex(fg)}`,
        bg === DEFAULT_COLOR ? '' : `background:${hex(bg)}`,
      ]
        .filter(Boolean)
        .join(';')

      out.push(style ? `<span style="${style}">${escaped(run)}</span>` : escaped(run))
      run = ''
    }

    for (let x = 0; x < canvas.columns; x++) {
      const cell = canvas.cell(x, y)

      if (cell.fg !== fg || cell.bg !== bg) {
        flush()
        fg = cell.fg
        bg = cell.bg
      }

      run += String.fromCodePoint(cell.code || 0x20)
    }

    flush()
    out.push('\n')
  }

  return out.join('')
}

/** What the last frame said the drawing overruns the body by, for clamping. */
let lastBody: BodyScroll | null = null

/** One frame, and everything the page needs to press into it. */
async function frame(reload: boolean): Promise<{
  html: string
  ground: string
  hotspots: Hotspot[]
  detail: DetailView | null
  name: string
  runs: RunEntry[]
}> {
  const run = await runOf(reload)
  const theme = themeOf(view.theme)

  useTheme(theme.name)

  const canvas = new Canvas(view.columns, view.rows, theme.bg)
  const runs = siblingRuns(view.journal || undefined, run.runId, run.name)
  const drawn = paint(canvas, run, {
    nowMs: view.journal ? (run.endedMs ?? Date.now()) : SYNTHETIC_AT,
    tick: view.tick,
    orientation: view.orientation,
    selectedId: view.selectedId ?? undefined,
    fromRun: view.fromRun ?? undefined,
    openCall: view.openCall ?? undefined,
    callScroll: view.callScroll,
    detailRows: view.detailRows,
    detailScroll: view.detailScroll,
    detailTab: view.detailTab,
    bodyScroll: view.bodyScroll,
    follow: view.following,
    opened: view.opened,
    runPicker: view.picking ? 'open' : 'shut',
    runs: view.picking ? runs : undefined,
    settings: view.settings,
    menu: view.menu ?? undefined,
    about: view.about,
  })

  lastBody = drawn.body ?? null
  // The same bookkeeping the plugin does, so the page behaves as the pane does.
  drew(view, drawn)

  return {
    html: spansOf(canvas),
    // Cells the pane leaves alone keep the terminal's own colour, and so does
    // the sliver between one line box and the next. Both have to stand on the
    // theme's ground, or a light theme reads as stripes of the page's dark.
    ground: hex(theme.bg),
    hotspots: drawn.hotspots,
    detail: drawn.detail ?? null,
    name: run.name,
    runs,
  }
}

/**
 * The wheel, against the same rules the plugin's own answers it with: the rail
 * along the foot is on the canvas's last row, so a tick over that row scrolls
 * sideways and a tick anywhere else scrolls the way the drawing can go.
 */
function turn(by: number, row: number, detail: DetailView | null): void {
  const foot = (lastBody?.spanX ?? 0) > 0 ? view.rows - 1 : null

  wheel(view, { detail, body: lastBody, foot }, by, row)
}

/** The press, against the same rules the plugin's own controls go through. */
async function press(key: string, detail: DetailView | null): Promise<void> {
  const run = await runOf(false)
  const result = applyPress(view, key, { hasRun: true, detail, body: lastBody })

  if (result.run !== undefined && result.run !== run.runId) {
    // The menu lists the runs beside this one by directory name; the page is
    // looking at a path, so the name goes back to the path it came from.
    const found = siblings(view.journal).find(path => path.endsWith(`/${result.run}`))

    if (found) {
      view.journal = found
      view.selectedId = null
      view.fromRun = null
      view.openCall = null
      view.detailScroll = []
    }
  }
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>flowpane</title>
<style>
  :root { color-scheme: dark }
  body { margin: 0; background: #0d0f14; color: #9aa4b2;
         font: 13px/1.4 ui-sans-serif, system-ui, sans-serif }
  header { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center;
           padding: 10px 16px; border-bottom: 1px solid #1e232c; position: sticky; top: 0;
           background: #0d0f14; z-index: 2 }
  label { display: flex; gap: 5px; align-items: center }
  input, select, button { background: #161b22; color: #d5dae2; border: 1px solid #2a313c;
                          border-radius: 3px; padding: 3px 5px; font: inherit }
  button { padding: 3px 10px; cursor: pointer }
  button:hover { border-color: #4d5666 }
  button[data-on="true"] { border-color: #7aa2f7; color: #cdd6f4 }
  .sheet { display: flex; padding: 16px; gap: 10px; align-items: flex-start }
  pre { margin: 0; font: 16px/1.25 Menlo, "DejaVu Sans Mono", "Cascadia Mono", Consolas, monospace;
        white-space: pre }
  .gutter, .ruler { color: #3c4453; user-select: none }
  .drawing { display: flex; flex-direction: column; position: relative }
  #paper { cursor: pointer }
  #ring { position: absolute; border: 1px solid #7aa2f7; border-radius: 2px;
          pointer-events: none; display: none }
  footer { display: flex; gap: 14px; align-items: center; padding: 8px 16px;
           border-top: 1px solid #1e232c; font-family: Menlo, monospace }
  footer .state { color: #5a6474 }
  .fail { padding: 12px 16px; color: #f2635f; white-space: pre-wrap; font-family: Menlo, monospace }
  .hint { color: #5a6474 }
</style></head>
<body>
<header>
  <label>run <select id="journal"></select></label>
  <label>cols <input id="columns" size="4"></label>
  <label>rows <input id="rows" size="4"></label>
  <label>tick <input id="tick" size="4"></label>
  <label><input type="checkbox" id="play"> play</label>
  <label><input type="checkbox" id="follow"> follow</label>
  <label><input type="checkbox" id="ruler" checked> ruler</label>
  <button id="reload">reload run</button>
  <span class="hint">click a node · wheel scrolls · tab moves · enter presses · esc closes the dialog</span>
</header>
<div class="sheet">
  <pre class="gutter" id="gutter"></pre>
  <div class="drawing">
    <pre class="ruler" id="ruler-row"></pre>
    <pre id="paper"></pre>
    <div id="ring"></div>
  </div>
</div>
<footer id="controls"></footer>
<div class="fail" id="fail" hidden></div>
<script>
const $ = id => document.getElementById(id)
let shot = { hotspots: [], view: {} }
let focus = -1

async function send(body) {
  const answer = await fetch('/frame', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const data = await answer.json()

  if (data.error) {
    $('fail').hidden = false
    $('fail').textContent = data.error
    return
  }

  $('fail').hidden = true
  shot = data
  draw()
}

function draw() {
  $('paper').innerHTML = shot.html
  $('paper').style.background = shot.ground
  $('gutter').textContent = ['', '', ...Array.from({ length: shot.view.rows }, (_, y) => String(y).padStart(3))].join('\\n')
  $('ruler-row').textContent = $('ruler').checked ? rulerOf(shot.view.columns) : ''
  for (const [name, value] of Object.entries(shot.view)) {
    const field = $(name)
    if (field && document.activeElement !== field) {
      if (field.type === 'checkbox') field.checked = !!value
      else field.value = value
    }
  }
  $('journal').innerHTML = shot.runs.map(r =>
    '<option value="' + r.path + '"' + (r.path === shot.view.journal ? ' selected' : '') + '>' + r.id + '</option>').join('')
  // An entry with no key is the state the row says rather than a control: a
  // disabled button would read as a setting that cannot be changed.
  $('controls').innerHTML = shot.controls.map(c => c.key
    ? '<button data-key="' + c.key + '" data-on="' + c.on + '"' + (c.live ? '' : ' disabled') + '>' + c.label + '</button>'
    : '<span class="state">' + c.label + '</span>').join('')
  for (const button of $('controls').children) {
    if (button.dataset.key) button.onclick = () => send({ key: button.dataset.key })
  }
  ring()
}

function rulerOf(columns) {
  let tens = '', ones = ''
  for (let x = 0; x < columns; x++) {
    tens += x % 10 === 0 ? String(Math.floor(x / 10) % 10) : ' '
    ones += String(x % 10)
  }
  return tens + '\\n' + ones
}

function cell() {
  const box = $('paper').getBoundingClientRect()
  return { box, w: box.width / shot.view.columns, h: box.height / shot.view.rows }
}

function ring() {
  const spot = shot.hotspots[focus]
  const mark = $('ring')
  if (!spot) { mark.style.display = 'none'; return }
  const { box, w, h } = cell()
  const paper = $('paper')
  mark.style.display = 'block'
  mark.style.left = (paper.offsetLeft + spot.x * w - 1) + 'px'
  mark.style.top = (paper.offsetTop + spot.y * h - 1) + 'px'
  mark.style.width = (spot.w * w) + 'px'
  mark.style.height = h + 'px'
}

$('paper').onwheel = event => {
  event.preventDefault()
  const { box, w, h } = cell()
  const row = Math.floor((event.clientY - box.top) / h)
  send({ wheel: { by: Math.sign(event.deltaY) * Math.max(1, Math.round(Math.abs(event.deltaY) / 40)), row } })
}

$('paper').onclick = event => {
  const { box, w, h } = cell()
  const x = Math.floor((event.clientX - box.left) / w)
  const y = Math.floor((event.clientY - box.top) / h)
  const at = shot.hotspots.findIndex(s => s.y === y && x >= s.x && x < s.x + s.w)
  if (at >= 0) { focus = at; send({ key: shot.hotspots[at].agentId }) }
}

document.onkeydown = event => {
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') return
  if (event.key === 'Tab') {
    event.preventDefault()
    const count = shot.hotspots.length
    if (count === 0) return
    focus = ((focus + (event.shiftKey ? -1 : 1)) % count + count) % count
    ring()
  } else if (event.key === 'Enter' && shot.hotspots[focus]) {
    send({ key: shot.hotspots[focus].agentId })
  } else if (event.key === 'Escape') {
    send({ key: '@close' })
  } else if (event.key === 'ArrowRight') {
    send({ tick: shot.view.tick + 1 })
  } else if (event.key === 'ArrowLeft') {
    send({ tick: Math.max(0, shot.view.tick - 1) })
  }
}

for (const name of ['columns', 'rows', 'tick']) {
  $(name).onchange = () => send({ set: { [name]: Number($(name).value) } })
}
$('journal').onchange = () => { focus = -1; send({ set: { journal: $('journal').value } }) }
$('ruler').onchange = draw
$('reload').onclick = () => send({ reload: true })

let clock = null
$('play').onchange = () => {
  clearInterval(clock)
  clock = $('play').checked ? setInterval(() => send({ tick: shot.view.tick + 1, reload: $('follow').checked }), 120) : null
}

send({ query: location.search })
</script>
</body></html>`

Bun.serve({
  port,
  idleTimeout: 60,
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/') {
      return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }

    if (url.pathname !== '/frame') {
      return new Response('not here', { status: 404 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      query?: string
      key?: string
      wheel?: { by: number; row: number }
      tick?: number
      reload?: boolean
      set?: Record<string, string | number | boolean>
    }

    try {
      if (body.query) {
        applyQuery(new URLSearchParams(body.query))
      }

      for (const [name, value] of Object.entries(body.set ?? {})) {
        setField(name, value)
      }

      if (typeof body.tick === 'number') {
        view.tick = body.tick
      }

      if (body.key) {
        const before = await frame(false)

        await press(body.key, before.detail)
      }

      if (body.wheel) {
        const before = await frame(false)

        turn(body.wheel.by, body.wheel.row, before.detail)
      }

      const drawn = await frame(body.reload === true)

      return Response.json({
        html: drawn.html,
        ground: drawn.ground,
        hotspots: drawn.hotspots,
        runs: siblings(view.journal).map(path => ({ path, id: path.split('/').pop() })),
        controls: controls(),
        view: {
          journal: view.journal,
          columns: view.columns,
          rows: view.rows,
          tick: view.tick,
          orientation: view.orientation,
          theme: view.theme,
          detailRows: view.detailRows,
          selectedId: view.selectedId,
          picking: view.picking,
          settings: view.settings,
          menu: view.menu,
          about: view.about,
          name: drawn.name,
        },
      })
    } catch (thrown) {
      return Response.json({ error: String((thrown as Error)?.stack ?? thrown) })
    }
  },
})

/**
 * The row the surface draws under the pane: the way into the settings, the
 * state beside it, the run menu, and the pane's own name at the far end.
 *
 * The state is not a control here either. Every setting is picked inside the
 * dialog, which is painted into the canvas — so the presses that change one
 * land as hotspots on the drawing, not as buttons under it.
 */
function controls(): { key: string; label: string; on: boolean; live: boolean }[] {
  const words: Record<Orientation, string> = {
    horizontal: 'horizontal',
    vertical: 'vertical',
    timeline: 'timeline',
    auto: 'fits',
  }
  const state = [
    `Layout: ${words[view.orientation]}`,
    `Theme: ${view.theme}`,
    `Detail height: ${view.detailRows} rows`,
  ].join(' \u2502 ')

  return [
    { key: '@settings', label: '\u2699 Settings', on: view.settings, live: true },
    { key: '', label: `\u2502 ${state}`, on: false, live: false },
    { key: '@runs', label: '\u25be Runs', on: view.picking, live: true },
    { key: '@about', label: `${NAME} ${VERSION}`, on: view.about, live: true },
  ]
}

function setField(name: string, value: string | number | boolean): void {
  if (name === 'journal' && typeof value === 'string') {
    view.journal = value
    view.selectedId = null
    view.fromRun = null
    view.openCall = null
    view.detailScroll = []
  } else if (name === 'columns' || name === 'rows') {
    view[name] = Math.max(20, Math.min(400, Number(value) || 0))
  } else if (name === 'tick') {
    view.tick = Math.max(0, Number(value) || 0)
  } else if (name === 'theme' && typeof value === 'string' && THEMES.some(t => t.name === value)) {
    view.theme = value
  } else if (name === 'orientation' && typeof value === 'string') {
    view.orientation = value as Orientation
  } else if (name === 'detailRows') {
    view.detailRows = Math.max(MIN_DETAIL, Math.min(MAX_DETAIL, Number(value) || MIN_DETAIL))
  } else if (name === 'quiet') {
    view.quiet = value === true || value === 'on'
  } else if (name === 'select' && typeof value === 'string' && value) {
    view.selectedId = value
  } else if (name === 'picking') {
    view.picking = value === true || value === 'on'
  } else if (name === 'settings') {
    view.settings = value === true || value === 'on'
  } else if (name === 'menu') {
    const want = String(value)

    view.menu = SETTING_MENUS.includes(want as SettingMenu) ? (want as SettingMenu) : null
  } else if (name === 'about') {
    view.about = value === true || value === 'on'
  }
}

/**
 * The query the page was opened with. The old tool took every `preview.ts`
 * flag this way and the habit is worth keeping: a size and a theme in a link
 * is how one of these pictures gets shared.
 */
function applyQuery(params: URLSearchParams): void {
  for (const pair of (params.get('q') ?? '').split(';').filter(Boolean)) {
    const at = pair.indexOf('=')

    params.set(at === -1 ? pair : pair.slice(0, at), at === -1 ? 'on' : pair.slice(at + 1))
  }

  const names: Record<string, string> = { cols: 'columns', rows: 'rows', detailRows: 'detailRows' }

  for (const [name, value] of params) {
    if (name !== 'q') {
      setField(names[name] ?? name, value)
    }
  }
}

console.log(`http://127.0.0.1:${port}/`)
