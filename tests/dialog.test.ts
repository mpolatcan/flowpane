/**
 * What a node says and what its detail says, and where the detail is drawn.
 *
 * A node's card carries figures: how long the agent ran, what it spent, which
 * model it was. Its own words are not figures — a line of an agent's prose on a
 * card is a sentence cut off at thirty cells, and the phrase it cuts to reads
 * as a label. The words belong in the detail, which is a dialog over the
 * drawing rather than a strip under it: the strip took its rows from the
 * layout, so asking one node a question redrew every other one smaller.
 */

import { expect, test } from 'claude-code/testing'

import { Canvas, DEFAULT_COLOR } from '../hooks/canvas'
import type { AgentRow, RunState } from '../hooks/journal'
import { barRowsOf } from '../hooks/layout'
import { NAME, VERSION } from '../hooks/about'
import { paint, paintIdle, useTheme, type PaintOptions, type RunEntry } from '../hooks/paint'
import { themeOf } from '../hooks/theme'

const STARTED = 1_700_000_000_000
const SAYING = 'counting the cards in the deck before dealing another'
const CLOSE_MARK = '✕'

function agentOf(id: string, label: string, phase: string, from: number, ms: number): AgentRow {
  return {
    agentId: id,
    label,
    phase,
    state: 'done',
    startedMs: STARTED + from,
    endedMs: STARTED + from + ms,
    tools: [],
    tokens: 12_000,
    result: 'done',
  }
}

function runOf(): RunState {
  const thinking: AgentRow = {
    ...agentOf('r1', 'review:correctness', 'Review', 5_000, 0),
    state: 'running',
    endedMs: undefined,
    isThinking: true,
    saying: SAYING,
    prompt: 'Review hooks/paint.ts for correctness, and say what you found. ',
    calls: [
      {
        id: 'c0',
        name: 'Bash',
        input: 'git log -1 hooks/paint.ts',
        startedMs: STARTED + 5_000,
        endedMs: STARTED + 5_050,
        isError: true,
        result: 'fatal: not a git repository',
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `c${i + 1}`,
        name: 'Read',
        input: `hooks/paint.ts, line ${i * 100}`,
        startedMs: STARTED + 5_100 + i * 100,
        endedMs: STARTED + 5_400 + i * 100,
        step: i + 1,
        stepTokens: 1_200 + i * 100,
        result: 'read 200 lines',
      })),
    ],
  }

  return {
    runId: 'wf_test',
    name: 'audit',
    summary: '',
    transcriptDir: '/session/subagents/workflows/wf_test',
    runFile: '/session/workflows/wf_test.json',
    startedMs: STARTED,
    status: 'running',
    phases: ['Survey', 'Review'],
    agents: [
      agentOf('s1', 'survey:paint', 'Survey', 0, 4_000),
      agentOf('s2', 'survey:layout', 'Survey', 0, 4_000),
      thinking,
    ],
    consumed: 300_000,
  }
}

/** The canvas back as the lines a terminal would show. */
function rowsOf(canvas: Canvas): string[] {
  const lines: string[] = []

  for (let y = 0; y < canvas.rows; y++) {
    let line = ''

    for (let x = 0; x < canvas.columns; x++) {
      line += String.fromCodePoint(canvas.at(x, y) || 0x20)
    }

    lines.push(line)
  }

  return lines
}

function drawn(selectedId?: string): string[] {
  const canvas = new Canvas(110, 32)

  paint(canvas, runOf(), {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'stack',
    selectedId,
    detailRows: 14,
  })

  return rowsOf(canvas)
}

/** The rows of the dialog, found by the close mark in its top edge. */
function dialogOf(rows: string[]): { top: number; foot: number; left: number; right: number } {
  const top = rows.findIndex(row => row.includes(CLOSE_MARK))
  const left = rows[top]?.indexOf('╭') ?? -1
  const right = rows[top]?.lastIndexOf('╮') ?? -1
  const foot = rows.findIndex((row, y) => y > top && row.includes('╰'))

  return { top, foot, left, right }
}

test('a card carries figures, and the agent’s own words wait in the dialog', () => {
  const shut = drawn()
  // The card's figures, which are the only place on the pane a clock and a
  // count stand side by side inside a frame.
  const card = shut.find(row => /│[^│]*⧖[^│]*∑[^│]*│/.test(row)) ?? ''

  // The spend says what it is a count of, one cell of air between the mark and
  // the figure. A bare `12k` beside a clock reads as another duration; glued to
  // its mark it reads as one token a reader has to break apart before either
  // half can be read.
  expect(card).toMatch(/∑ 12k/)
  expect(shut.join('\n')).not.toContain(SAYING.slice(0, 20))

  const open = drawn('r1').join('\n')

  expect(open).toContain(SAYING.slice(0, 20))
})

test('the detail is a dialog over the drawing, inset on all four sides', () => {
  const rows = drawn('r1')
  const box = dialogOf(rows)

  expect(box.top).toBeGreaterThanOrEqual(barRowsOf(rows.length))
  expect(box.left).toBeGreaterThan(0)
  expect(box.right).toBeLessThan(110 - 1)
  expect(box.foot).toBeGreaterThan(box.top)
  expect(box.foot).toBeLessThan(rows.length - 1)

  // Which agent is open is the dialog's title, set into its top edge, and the
  // mark that shuts it is at the far end of the same edge.
  expect(rows[box.top]).toContain('review:correctness')
  expect(rows[box.top]?.indexOf(CLOSE_MARK)).toBeLessThan(box.right)

  // The figures the card carried are under the reading, not over it.
  expect(rows[box.foot - 1]).toMatch(/Review.+∑ \d+k/)
})

test('opening a node leaves the graph where it was', () => {
  const shut = drawn()
  const open = drawn('r1')
  const box = dialogOf(open)

  // The strip took its rows from the layout, so every other node moved and
  // shrank when one was pressed. A dialog covers the middle of the drawing and
  // gives all of it back: above and below it, the two drawings are the same.
  for (let y = 0; y < box.top; y++) {
    expect(open[y]).toBe(shut[y] as string)
  }

  for (let y = box.foot + 1; y < open.length; y++) {
    expect(open[y]).toBe(shut[y] as string)
  }

  // Beside it too: the graph shows around the dialog rather than stopping at it.
  for (let y = box.top; y <= box.foot; y++) {
    expect((open[y] ?? '').slice(0, box.left)).toBe((shut[y] ?? '').slice(0, box.left))
  }
})

test('the calls block says what each call was, not what it came back with', () => {
  const text = drawn('r1').join('\n')

  expect(text).toContain('Tool Calls')
  expect(text).toContain('Read')

  // Newest first: the last call is the one the block opens on, and the first
  // call the agent made is at the far end of the list.
  expect(text).toContain('hooks/paint.ts, line 500')

  // What a call returned is the agent's material, not the reader's, and a list
  // of answers buried the calls themselves. A call that failed is no exception:
  // the mark says it failed, which is the part that belongs in the sequence.
  expect(text).not.toContain('read 200 lines')
  expect(text).not.toContain('fatal: not a git repository')
})

test('the title sits in the middle of the rule it is set into', () => {
  const rows = drawn('r1')
  const box = dialogOf(rows)
  const edge = rows[box.top] ?? ''
  const mark = edge.indexOf(CLOSE_MARK)
  const title = edge.indexOf('review:correctness')

  expect(title).toBeGreaterThan(0)
  expect(mark).toBeGreaterThan(title)

  // The rule runs from the left corner to the close mark, and the title halves
  // it. Centred on the box instead, the stroke to the left of the title ran
  // several cells longer than the stroke to its right, because the mark eats
  // the end of that one — the title measured centre and looked off it.
  const before = title - 2 - (box.left + 1)
  const after = mark - 2 - (title + 'review:correctness'.length)

  expect(Math.abs(before - after)).toBeLessThanOrEqual(2)
})

test('the dialog’s figures are ruled off from the reading, and divided from each other', () => {
  const rows = drawn('r1')
  const box = dialogOf(rows)
  const foot = rows[box.foot - 1] ?? ''
  const rule = rows[box.foot - 2] ?? ''
  const inner = rule.slice(box.left + 1, box.right)

  // A rule between the reading and the figures under it: set straight against
  // the last line of an answer, they read as the answer's last line.
  expect(inner).toMatch(/^─+$/)

  // And a divider between one figure and the next. Three cells apart with
  // nothing between them, a clock, a count and a model read as one run of
  // figures grouped by whichever happened to be short.
  expect(foot).toContain('│ ⧖ ')
  expect(foot.split('│').length).toBeGreaterThan(3)
})

test('a call says what it was passed on the same row as the tool that took it', () => {
  const rows = drawn('r1')
  const row = rows.find(r => r.includes('Read') && r.includes('hooks/paint.ts, line 500'))

  // Two rows per call — the name, then the argument indented under it — doubled
  // the height of a list whose whole job is to be read as a sequence.
  expect(row).toBeDefined()

  // And what the call cost, against the block's far edge: how long it took and
  // what the request that issued it spent. The number of that request is not
  // drawn, being an index into a list the dialog does not show.
  expect(row).toMatch(/⧖ /)
  expect(row).not.toMatch(/req \d/)
})

test('the calls in the block are divided from one another', () => {
  const rows = drawn('r1')
  const seams = rows.filter(row => /┈{6,}/.test(row))

  // A call is a heading and however many lines its payload wrapped to, so
  // without a rule between them the last line of one call's input sat directly
  // above the next call's name. One rule between calls, never above the first.
  expect(seams.length).toBeGreaterThan(0)
  expect(seams.length).toBeLessThan(rows.filter(row => row.includes('Read')).length + 1)

  // The same tone every other structural line takes, and inside the block
  // rather than across the dialog: the dialog's own border still closes it.
  const seam = seams[0] ?? ''

  expect(seam).toMatch(/│.*┈{6,}.*│/)
})

/** One agent whose calls all name files by their full path, in a long prompt. */
function pathRun(prompt: string, calls: number): RunState {
  const run = runOf()
  const agent = run.agents[2]

  agent.prompt = prompt
  agent.calls = Array.from({ length: calls }, (_, i) => ({
    id: `p${i}`,
    name: 'Read',
    input: `/Users/someone/Desktop/my-projects/flowpane/hooks/paint.ts, line ${i * 100}`,
    startedMs: STARTED + 5_000 + i * 100,
    endedMs: STARTED + 5_200 + i * 100,
    result: 'read 200 lines',
  }))

  return run
}

function shown(run: RunState, columns = 127, rows = 34, detailRows = 24): string[] {
  const canvas = new Canvas(columns, rows)

  paint(canvas, run, { nowMs: STARTED + 20_000, tick: 0, orientation: 'stack', selectedId: 'r1', detailRows })

  return rowsOf(canvas)
}

test('a long path is cut to the part that tells it from the next one', () => {
  const text = shown(pathRun('Review the file.', 4)).join('\n')

  // The prefix is the same for every call in the run, and in a column wide
  // enough for fifty cells it was the part that fitted.
  expect(text).not.toContain('/Users/someone/Desktop')
  expect(text).toContain('…/hooks/paint.ts')
  expect(text).toContain('line 300')
})

test('a short path is left alone', () => {
  const run = runOf()

  run.agents[2].calls = [
    { id: 'p0', name: 'Read', input: '/etc/hosts', startedMs: STARTED + 5_000, endedMs: STARTED + 5_100 },
    { id: 'p1', name: 'Read', input: 'hooks/paint.ts', startedMs: STARTED + 5_200, endedMs: STARTED + 5_300 },
  ]

  const text = shown(run).join('\n')

  expect(text).toContain('/etc/hosts')
  expect(text).toContain('hooks/paint.ts')
  expect(text).not.toContain('…/')
})

test('a block that fits gives its width to the one that does not', () => {
  const prompt = 'Review this file and say what you found. '.repeat(3)
  // Three calls fit the rows; forty do not.
  const narrow = shown(pathRun(prompt, 40))
  const even = shown(pathRun(prompt, 3))

  const divider = (rows: string[]) => {
    const head = rows.find(row => row.includes('Tool Calls')) ?? ''

    return head.indexOf('│ ⚙')
  }

  // The call list overflows, so the prompt beside it keeps only the width it
  // needs and the rule between them moves left.
  expect(divider(narrow)).toBeGreaterThan(0)
  expect(divider(even)).toBeGreaterThan(0)
  expect(divider(narrow)).toBeLessThan(divider(even))
})

test('nothing narrows when nothing is overflowing', () => {
  const short = shown(pathRun('Review the file.', 2))
  const head = short.find(row => row.includes('Tool Calls')) ?? ''
  const left = head.indexOf('│ ⚙')
  const right = head.lastIndexOf('│')

  // An even split: the rule between the two blocks sits about the middle of
  // the dialog rather than a third of the way across it.
  const frame = head.indexOf('│')

  expect(left - frame).toBeGreaterThan((right - frame) * 0.4)
})

test('a failed call is marked, and its reason is left to the transcript', () => {
  const run = runOf()

  run.agents[2].calls = [
    {
      id: 'e0',
      name: 'Read',
      input: '/Users/someone/Desktop/my-projects/flowpane/hooks/paint.ts',
      startedMs: STARTED + 5_000,
      endedMs: STARTED + 5_100,
      isError: true,
      result: 'PreToolUse:Read hook error: the file is far too long to read whole. '.repeat(8),
    },
    { id: 'e1', name: 'Bash', input: 'wc -l', startedMs: STARTED + 5_200, endedMs: STARTED + 5_300 },
  ]

  const rows = shown(run)
  const text = rows.join('\n')

  // The mark says the call failed. The reason was three lines of an engine's
  // own wording in a list of one-line rows, and it pushed the calls either side
  // of the one that broke — which are what say whether it mattered — off the
  // rows the block had.
  expect(text).toContain('✖')
  expect(text).not.toContain('PreToolUse:Read hook error')
  expect(rows.filter(row => /hook error|far too long/.test(row))).toHaveLength(0)
  expect(text).toContain('wc -l')
})

/**
 * The drawing behind whatever is open over it.
 *
 * A dialog painted straight onto the graph is the same ink as the graph — same
 * strokes, same palette, its frame the only thing saying which is in front. So
 * every cell outside it is mixed toward the ground, and only the frontmost of
 * the things that can be open keeps its own colours.
 */
function lit(options: Partial<PaintOptions>, run: RunState = runOf()): Canvas {
  const canvas = new Canvas(110, 32)

  paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'stack',
    detailRows: 14,
    ...options,
  })

  return canvas
}

/**
 * How many cells of the drawing moved toward the ground, and how many away.
 *
 * Only the rows the thing that opened did not draw on are counted. Its own
 * frame can land on a graph rule and keep the glyph while changing the colour,
 * which is the dialog being drawn rather than the drawing being pushed back —
 * and those rows are the ones that are meant to stay lit.
 */
function pushed(shut: Canvas, over: Canvas): { back: number; forward: number } {
  const ground = themeOf('tokyo-night').bg
  let first = shut.rows
  let last = -1

  for (let y = 0; y < shut.rows; y++) {
    for (let x = 0; x < shut.columns; x++) {
      if (shut.cell(x, y).code !== over.cell(x, y).code) {
        first = Math.min(first, y)
        last = Math.max(last, y)
        break
      }
    }
  }

  let back = 0
  let forward = 0

  for (let y = 0; y < shut.rows; y++) {
    if (y >= first && y <= last) {
      continue
    }

    for (let x = 0; x < shut.columns; x++) {
      const was = shut.cell(x, y)
      const now = over.cell(x, y)

      if (was.code === 0x20 || was.fg === DEFAULT_COLOR || was.fg === now.fg) {
        continue
      }

      const off = (fg: number, shift: number) => Math.abs(((fg >> shift) & 0xff) - ((ground >> shift) & 0xff))

      if ([16, 8, 0].some(shift => off(now.fg, shift) > off(was.fg, shift))) {
        forward++
      } else {
        back++
      }
    }
  }

  return { back, forward }
}

test('every dialog pushes the drawing back behind it', () => {
  useTheme('tokyo-night')

  const shut = lit({})
  const runs: RunEntry[] = [
    { id: 'wf_a', mark: '▸', name: 'this run', tally: '3/6', status: 'running', startedMs: STARTED },
    { id: 'wf_b', mark: '✔', name: 'an earlier one', tally: '6/6', status: 'completed', startedMs: STARTED - 60_000 },
  ]

  for (const open of [
    { selectedId: 'r1' },
    { runPicker: 'open' as const, runs },
    { settings: true },
    { settings: true, menu: 'theme' as const },
    { about: true },
  ]) {
    const moved = pushed(shut, lit(open))

    expect(moved.back).toBeGreaterThan(100)
    expect(moved.forward).toBe(0)
  }
})

test('only the frontmost dialog stays lit', () => {
  useTheme('tokyo-night')

  const alone = lit({ selectedId: 'r1' })
  const under = lit({ selectedId: 'r1', settings: true })
  const box = dialogOf(rowsOf(alone))

  // The detail dialog's own rows, with the settings open over them: a second
  // scrim over the first would have pushed the graph twice as far back and
  // left the dialog underneath half lit.
  let dimmed = 0

  for (let y = box.top; y <= box.foot; y++) {
    for (let x = box.left; x <= box.right; x++) {
      const was = alone.cell(x, y)
      const now = under.cell(x, y)

      if (was.code !== 0x20 && was.code === now.code && was.fg !== DEFAULT_COLOR && was.fg !== now.fg) {
        dimmed++
      }
    }
  }

  expect(dimmed).toBeGreaterThan(20)
})

/**
 * Every key the pane would answer a press on, with those options set.
 *
 * A hotspot is where the surface puts a press target, and a press target is a
 * `Button`, whose props carry a label and no colour: what is under it was mixed
 * toward the ground with the rest of the drawing, and it is drawn at full
 * strength over it anyway. So a node left pressable behind a dialog is a node
 * left lit behind one, and the two cannot be told apart from the outside.
 */
function keysOf(options: Partial<PaintOptions>, run: RunState = runOf()): string[] {
  return paint(new Canvas(110, 32), run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'stack',
    detailRows: 14,
    ...options,
  }).hotspots.map(h => h.agentId)
}

const SIBLINGS: RunEntry[] = [
  { id: 'wf_test', mark: '\u25b8', name: 'audit', tally: '3/6', status: 'running', startedMs: STARTED },
  { id: 'wf_b', mark: '\u2714', name: 'an earlier one', tally: '6/6', status: 'completed', startedMs: STARTED - 60_000 },
]

/** The four things that can be open over the drawing. */
const DIALOGS: Partial<PaintOptions>[] = [
  { selectedId: 'r1' },
  { runPicker: 'open', runs: SIBLINGS },
  { settings: true },
  { about: true },
]

test('no dialog leaves a node pressable behind it', () => {
  useTheme('tokyo-night')

  const run = runOf()
  const nodes = new Set(run.agents.map(a => a.agentId))

  // The graph with nothing open over it: every node takes a press, which is
  // what makes the check below worth making.
  expect(keysOf({}, run).filter(key => nodes.has(key)).length).toBeGreaterThan(1)

  for (const open of [...DIALOGS, { settings: true, menu: 'theme' as const }]) {
    expect(keysOf(open, run).filter(key => nodes.has(key))).toEqual([])
  }
})

test('a dialog answers every press, and keeps the one that shuts it', () => {
  useTheme('tokyo-night')

  // The detail: its own ✕, and the arrows that move the words under it.
  const detail = keysOf({ selectedId: 'r1' })

  expect(detail).toContain('@close')
  expect(detail.every(key => key === '@close' || key.startsWith('detail-'))).toBe(true)

  // The run menu: the runs it lists, and the name it dropped from. The name is
  // the menu's only way back — it carries no ✕ of its own — and it is the control
  // that opened the dialog rather than a piece of the drawing behind it.
  const menu = keysOf({ runPicker: 'open', runs: SIBLINGS })

  expect(menu).toEqual(['run:wf_test', 'run:wf_b', '@runs'])

  // The menu over the detail: the menu is the frontmost of the two, so it takes
  // the presses, and the name it dropped from is still there to roll it back up
  // and give the dialog underneath back.
  expect(keysOf({ selectedId: 'r1', runPicker: 'open', runs: SIBLINGS })).toEqual([
    'run:wf_test',
    'run:wf_b',
    '@runs',
  ])

  // The settings and the About dialog, which say all they have to say inside
  // their own frames.
  expect(keysOf({ settings: true }).every(key => key !== '@settings' && !key.startsWith('node:'))).toBe(true)
  expect(keysOf({ about: true })).toEqual(['@about-close'])
})

test('the pane says what it is, and nothing behind it takes a press', () => {
  useTheme('tokyo-night')

  const canvas = new Canvas(110, 32)
  const hotspots = paint(canvas, runOf(), {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'stack',
    detailRows: 14,
    about: true,
  }).hotspots
  const text = rowsOf(canvas).join('\n')

  // Titled with the name and the version, which is half of what the dialog was
  // opened to ask.
  expect(text).toContain(`${NAME} ${VERSION}`)
  // What it draws, what presses it, and where it reads from — the three
  // questions a reader has about a live diagram with no key.
  expect(text).toContain('opens its detail')
  expect(text).toContain('/wf help')
  expect(text).toContain('~/.claude/projects')

  // Modal, as the settings are: a press aimed at a line of this landing on a
  // node is the dialog and the graph both being live at once.
  expect(hotspots.map(h => h.agentId)).toEqual(['@about-close'])
})

test('the About dialog opens over the idle pane too', () => {
  useTheme('tokyo-night')

  const canvas = new Canvas(90, 20)
  const runs: RunEntry[] = [
    { id: 'wf_a', mark: '✔', name: 'an earlier run', tally: '6/6', status: 'completed', startedMs: STARTED },
  ]
  const hotspots = paintIdle(canvas, runs, STARTED + 1_000, {
    nowMs: STARTED + 1_000,
    tick: 0,
    detailRows: 14,
    about: true,
  })

  // The idle pane is exactly where somebody asks what this is: a list of runs
  // with no graph yet says less about the plugin than any other frame.
  expect(rowsOf(canvas).join('\n')).toContain(`${NAME} ${VERSION}`)
  expect(hotspots.map(h => h.agentId)).toEqual(['@about-close'])
})

test('the foot says which tools, as one measurement rather than three', () => {
  const rows = drawn('r1')
  const box = dialogOf(rows)
  const foot = rows[box.foot - 1] ?? ''

  // One Bash and six Reads, so the count is seven and the names carry their
  // own counts. The pair sits between one stroke and the next: `⚙ 7 │ 6×Read`
  // reads as two measurements, the second of which has lost what it counts.
  expect(foot).toContain('\u2699 7  6\u00d7Read  1\u00d7Bash')
})

test('a call says the unit of what it spent where the row has the cells', () => {
  // A call row, not the run line above it: both carry a sum, and since the run
  // line names the tools too it answers to `Read` as readily as a call does.
  const callRow = (rows: string[]) => rows.find(row => /\u2714\s\sRead/.test(row))
  const spent = callRow(drawn('r1'))

  expect(spent).toMatch(/\u2211 \d+(?:\.\d)?k tkns/)

  // The word goes before the argument the detail was opened to read gives up
  // any of its own cells. A tool whose name is a third of the block is what
  // takes those cells: the row keeps the figure and drops the unit.
  const long = runOf()
  const named = long.agents.find(a => a.agentId === 'r1')

  for (const call of named?.calls ?? []) {
    call.name = 'mcp__claude-in-chrome__computer'
  }

  const row = shown(long, 70, 30, 20).find(r => r.includes('claude-in-chrome'))

  expect(row).toMatch(/\u2211 \d+(?:\.\d)?k/)
  expect(row).not.toContain('tkns')
})
