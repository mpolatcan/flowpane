/**
 * The settings dialog: every setting the pane has, each one saying what it is
 * set to, with the rest of its choices one press away.
 *
 * The settings used to be a row of cycles under the drawing. A cycle can only
 * be read by pressing it — `Theme: gruvbox` says where you are and gives no way
 * to ask for `nord` except five more presses past it — and the row cost a line
 * of graph in every session to serve the few seconds a reader spends setting
 * the pane up. What is checked here is what replaced it: four lines that answer
 * "what is this pane set to", a list behind each of them, and a press that says
 * what it does rather than what it moves on from.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas, DEFAULT_COLOR } from '../hooks/canvas'
import type { RunState } from '../hooks/journal'
import { paint, paintIdle, useTheme, type PaintOptions, type RunEntry } from '../hooks/paint'
import { applyPress, type PaneView } from '../hooks/press'
import { paletteOf, themeOf, THEMES } from '../hooks/theme'

const NOW = new Date(2026, 8, 15, 14, 30).getTime()
const STARTED = NOW - 20_000

function run(): RunState {
  return {
    runId: 'wf_a',
    name: 'review-changes',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_a',
    runFile: '/session/workflows/wf_a.json',
    startedMs: STARTED,
    status: 'running',
    phases: ['Review', 'Verify'],
    agents: [
      {
        agentId: 'a1',
        label: 'bugs',
        phase: 'Review',
        state: 'done',
        startedMs: STARTED,
        endedMs: STARTED + 5_000,
        tools: [],
        steps: 2,
      },
      {
        agentId: 'a2',
        label: 'perf',
        phase: 'Verify',
        state: 'running',
        startedMs: STARTED + 6_000,
        tools: [],
        steps: 1,
      },
    ],
  } as RunState
}

/** The pane with the dialog open: its rows, and what can be pressed on them. */
function open(
  options: Partial<PaintOptions> = {},
  columns = 110,
  rows = 32,
): { lines: string[]; text: string; pressable: string[]; canvas: Canvas; spots: { agentId: string; x: number; y: number; w: number }[] } {
  const canvas = new Canvas(columns, rows)
  const drawn = paint(canvas, run(), {
    nowMs: NOW,
    tick: 0,
    orientation: 'horizontal',
    detailRows: 24,
    settings: true,
    ...options,
  })

  const lines: string[] = []

  for (let y = 0; y < canvas.rows; y++) {
    let line = ''

    for (let x = 0; x < canvas.columns; x++) {
      line += String.fromCodePoint(canvas.at(x, y) || 0x20)
    }

    lines.push(line.trimEnd())
  }

  return {
    lines,
    text: lines.join('\n'),
    pressable: drawn.hotspots.map(h => h.agentId),
    canvas,
    spots: drawn.hotspots,
  }
}

function view(): PaneView {
  return {
    orientation: 'horizontal',
    theme: 'tokyo-night',
    detailRows: 16,
    selectedId: null,
    detailScroll: [],
    picking: false,
    settings: false,
    menu: null,
    about: false,
  }
}

test('the dialog says what it is and how to shut it', () => {
  const { text, pressable } = open()

  expect(text).toContain('⚙ Settings')
  expect(text).toContain('✕')
  expect(pressable).toContain('@settings-close')
})

test('shut, every setting says what the pane is set to', () => {
  const { lines, pressable } = open({ orientation: 'horizontal' })

  // Brackets, not a colour. A press target is drawn by the surface as a
  // Button's own label, and a Button's label takes no colour at all — so the
  // value the pane is set to has to be legible as that value in plain text.
  expect(lines.find(l => l.includes('Layout'))).toContain('[horizontal')
  expect(lines.find(l => l.includes('Theme'))).toContain('[tokyo-night')
  expect(lines.find(l => l.includes('Detail height'))).toContain('[24 rows]')

  // One press target a setting, and the mark that says there is a list behind
  // it. Nothing is being chosen between until one is opened.
  expect(pressable).toContain('open:layout')
  expect(pressable).toContain('open:theme')
  expect(pressable.filter(id => id.startsWith('set:'))).toEqual([])
  expect(open().text).toContain('▾')
})

test('a list unrolls from the control that says what the setting is set to', () => {
  const themes = open({ menu: 'theme' })

  for (const theme of THEMES) {
    expect(themes.text).toContain(theme.name)
    expect(themes.pressable).toContain(`set:theme:${theme.name}`)
  }

  // The mark on the control turns over, so the dialog says which way the list
  // went as well as that there is one.
  expect(themes.lines.find(l => l.includes('Theme'))).toContain('▴')

  const layouts = open({ menu: 'layout' })

  for (const [label, value] of [
    ['horizontal', 'horizontal'],
    ['vertical', 'vertical'],
    ['timeline', 'timeline'],
    ['fits', 'auto'],
  ]) {
    expect(layouts.text).toContain(label)
    expect(layouts.pressable).toContain(`set:orientation:${value}`)
  }

  // One list at a time: what a theme's list covers is the theme list's while
  // it is open, so the settings under it take no presses aimed at a palette.
  expect(themes.pressable).not.toContain('set:orientation:flow')
})

test('a theme is shown in its own colours, outside the press target', () => {
  // Shut: the colours of the palette the pane is painted in, beside the control.
  const shut = open()
  const control = shut.spots.find(h => h.agentId === 'open:theme')

  expect(control).toBeDefined()

  const beside: number[] = []

  for (let x = control!.x - 4; x < control!.x - 1; x++) {
    beside.push(shut.canvas.cell(x, control!.y).fg)
  }

  expect(new Set(beside).size).toBe(3)

  // And in the list, where every palette shows its own three: a Button laid
  // over them would have arrived as three grey rectangles.
  const listed = open({ menu: 'theme' })
  const spot = listed.spots.find(h => h.agentId === 'set:theme:gruvbox')

  expect(spot).toBeDefined()

  const swatch: number[] = []

  for (let x = spot!.x - 5; x < spot!.x - 2; x++) {
    swatch.push(listed.canvas.cell(x, spot!.y).fg)
  }

  expect(new Set(swatch).size).toBe(3)
})

test('a step past the end of the detail range is drawn but cannot be pressed', () => {
  expect(open({ detailRows: 24 }).pressable).toContain('detail-shorter')
  expect(open({ detailRows: 24 }).pressable).toContain('detail-taller')

  const shortest = open({ detailRows: 5 })

  expect(shortest.text).toContain('[5 rows]')
  expect(shortest.pressable).not.toContain('detail-shorter')
  expect(shortest.pressable).toContain('detail-taller')

  const tallest = open({ detailRows: 32 })

  expect(tallest.pressable).toContain('detail-shorter')
  expect(tallest.pressable).not.toContain('detail-taller')
})

test('nothing behind the dialog takes a press', () => {
  const own = (id: string) =>
    id.startsWith('open:') || id.startsWith('set:') || id.startsWith('detail-') || id === '@settings-close'

  // The graph is painted first and whole, so a node under an open dialog is
  // still in the list of things that can be pressed unless it is taken out of
  // it — and it has to be, or a press aimed at a setting lands on a node.
  expect(open({ settings: false }).pressable).toContain('a1')

  for (const menu of [undefined, 'theme' as const]) {
    expect(open({ menu }).pressable.filter(id => !own(id))).toEqual([])
  }

  // And what a list covers is the list's: the settings under it take no
  // presses aimed at a palette either. Theme is the last setting with a list,
  // so the row its list covers is the detail height under it.
  expect(open({ menu: 'theme' }).pressable).not.toContain('detail-taller')
  expect(open().pressable).toContain('detail-taller')
})

test('the drawing behind the dialog is pushed back, and the dialog is not', () => {
  useTheme('tokyo-night')

  const ground = themeOf('tokyo-night').bg
  const shut = open({ settings: false })
  const lit = open()
  const top = Math.min(...lit.spots.map(h => h.y))
  const away = (from: number, to: number) => {
    for (const shift of [16, 8, 0]) {
      const was = Math.abs(((from >> shift) & 0xff) - ((ground >> shift) & 0xff))
      const now = Math.abs(((to >> shift) & 0xff) - ((ground >> shift) & 0xff))

      if (now > was) {
        return true
      }
    }

    return false
  }

  let pushed = 0

  // Above the dialog, where the drawing is the same drawing either way: every
  // cell that carries ink is mixed toward the ground, and none away from it.
  for (let y = 0; y < top - 1; y++) {
    for (let x = 0; x < 110; x++) {
      const before = shut.canvas.cell(x, y)
      const after = lit.canvas.cell(x, y)

      if (before.code === 0x20 || before.code !== after.code || before.fg === DEFAULT_COLOR) {
        continue
      }

      expect(away(before.fg, after.fg)).toBe(false)

      if (before.fg !== after.fg) {
        pushed++
      }
    }
  }

  expect(pushed).toBeGreaterThan(100)

  // The dialog itself is painted over the scrim, not under it: a palette's own
  // three cells are the palette's own three values, to the byte.
  const spot = lit.spots.find(h => h.agentId === 'open:theme')
  const palette = paletteOf(themeOf('tokyo-night'))

  expect([
    lit.canvas.cell(spot!.x - 4, spot!.y).fg,
    lit.canvas.cell(spot!.x - 3, spot!.y).fg,
    lit.canvas.cell(spot!.x - 2, spot!.y).fg,
  ]).toEqual([palette.running, palette.done, palette.accent])
})

test('the dialog opens over the idle pane too', () => {
  const canvas = new Canvas(90, 24)
  const runs: RunEntry[] = [
    { id: 'wf_a', mark: '✔', name: 'audit', tally: '6/6', status: 'completed', startedMs: NOW - 3_600_000 },
  ]
  const hotspots = paintIdle(canvas, runs, NOW, {
    nowMs: NOW,
    tick: 0,
    detailRows: 24,
    settings: true,
    menu: 'theme',
  })

  expect(hotspots.map(h => h.agentId)).toContain('set:theme:nord')
})

test('a choice sets what it is named after, and nothing cycles', () => {
  const v = view()

  v.menu = 'theme'

  expect(applyPress(v, 'set:theme:nord', { hasRun: true })).toEqual({ store: ['theme'] })
  expect(v.theme).toBe('nord')
  // Taking a choice answers the question the list was asking, so the list goes.
  expect(v.menu).toBe(null)

  // Twice is the same answer. A cycle would have moved on.
  applyPress(v, 'set:theme:nord', { hasRun: true })

  expect(v.theme).toBe('nord')

  applyPress(v, 'set:orientation:timeline', { hasRun: true })

  expect(v.orientation).toBe('timeline')

  // A name the pane does not have changes nothing rather than throwing.
  applyPress(v, 'set:theme:dawn', { hasRun: true })
  applyPress(v, 'set:orientation:sideways', { hasRun: true })

  expect(v.theme).toBe('nord')
  expect(v.orientation).toBe('timeline')
})

test('one list is open at a time, and pressing its control again shuts it', () => {
  const v = view()

  applyPress(v, '@settings', { hasRun: true })
  applyPress(v, 'open:theme', { hasRun: true })

  expect(v.menu).toBe('theme')

  applyPress(v, 'open:layout', { hasRun: true })

  expect(v.menu).toBe('layout')

  applyPress(v, 'open:layout', { hasRun: true })

  expect(v.menu).toBe(null)

  // A setting the pane does not have opens nothing rather than throwing.
  applyPress(v, 'open:colours', { hasRun: true })

  expect(v.menu).toBe(null)

  // Shutting the dialog shuts what was open inside it, so it does not come
  // back unrolled the next time the button is pressed.
  applyPress(v, 'open:theme', { hasRun: true })
  applyPress(v, '@settings-close', { hasRun: true })

  expect(v.settings).toBe(false)
  expect(v.menu).toBe(null)
})

test('the dialog and the run menu are never open at once', () => {
  const v = view()

  applyPress(v, '@runs', { hasRun: true })

  expect(v.picking).toBe(true)

  applyPress(v, '@settings', { hasRun: true })

  expect(v.settings).toBe(true)
  expect(v.picking).toBe(false)

  applyPress(v, 'open:theme', { hasRun: true })
  applyPress(v, '@runs', { hasRun: true })

  expect(v.picking).toBe(true)
  expect(v.settings).toBe(false)
  expect(v.menu).toBe(null)
})

test('the settings open with no run to draw', () => {
  const v = view()

  applyPress(v, '@settings', { hasRun: false })

  expect(v.settings).toBe(true)

  applyPress(v, 'open:theme', { hasRun: false })

  expect(v.menu).toBe('theme')

  applyPress(v, 'set:theme:gruvbox', { hasRun: false })

  expect(v.theme).toBe('gruvbox')
})
