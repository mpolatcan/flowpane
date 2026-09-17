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
import type { AgentRow, RunState, ToolCall } from '../hooks/journal'
import { barRowsOf } from '../hooks/layout'
import { NAME, VERSION } from '../hooks/about'
import { paint, paintIdle, useTheme, type PaintOptions, type RunEntry } from '../hooks/paint'
import { themeOf } from '../hooks/theme'

const STARTED = 1_700_000_000_000
const SAYING = 'counting the cards in the deck before dealing another'
const CLOSE_MARK = '✕'

// The dialog shows one pane at a time across its whole width, and the tabs say
// which. Named here because half these tests are about what a given pane says,
// and a bare 1 in the call would not say which pane that is.
const PROMPT = 0
const CALLS = 1
const THINKING = 2

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

/** The pane with one node open, on one of the dialog's tabs. */
function drawn(selectedId?: string, detailTab = PROMPT): string[] {
  const canvas = new Canvas(110, 32)

  paint(canvas, runOf(), {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId,
    detailRows: 14,
    detailTab,
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

  // The dialog opens on the prompt, and what the agent is saying now is a tab
  // away rather than a block down: one pane at a time across the whole width,
  // because a tool call quoted into a forty-cell column is a tool call the
  // reader cannot check.
  expect(drawn('r1', PROMPT).join('\n')).not.toContain(SAYING.slice(0, 20))
  expect(drawn('r1', THINKING).join('\n')).toContain(SAYING.slice(0, 20))
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
  const text = drawn('r1', CALLS).join('\n')

  // The tab carries the count, so a reader knows how much is behind it without
  // opening it.
  expect(drawn('r1', PROMPT).join('\n')).toContain('Tool Calls (7)')
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
  const rows = drawn('r1', CALLS)
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

test('every call in the block takes one row, and the rows line up', () => {
  const rows = drawn('r1', CALLS)
  const calls = rows.filter(row => /[\u2714\u2716]\s\s(Bash|Read)\s/.test(row))

  // Seven calls, seven rows. They used to be a heading and however many lines
  // the payload wrapped to, with a dashed seam between one and the next: an
  // agent with forty-two calls came out as a column of ragged blocks two to six
  // rows deep, four of them on screen, and finding a call meant scrolling past
  // the whole text of every call before it.
  expect(calls.length).toBe(7)
  expect(rows.filter(row => /\u2508{6,}/.test(row)).length).toBe(0)

  // And the arguments start at one column, so the list reads down rather than
  // in and out.
  const at = calls.map(row => {
    const lead = row.match(/[\u2714\u2716]\s{2}\S+\s{2,}/)

    return (lead?.index ?? 0) + (lead?.[0].length ?? 0)
  })

  expect(new Set(at).size).toBe(1)
})

test('a row of the list opens that call, and the way back is in the corner', () => {
  const canvas = new Canvas(110, 32)
  const drew = paint(canvas, runOf(), {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: 'r1',
    detailRows: 14,
    detailTab: CALLS,
  })
  const spot = drew.hotspots.find(s => s.agentId === '@call:c0')

  expect(spot).toBeDefined()

  const opened = new Canvas(110, 32)

  paint(opened, runOf(), {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: 'r1',
    detailRows: 14,
    detailTab: CALLS,
    openCall: 'c0',
  })

  const text = rowsOf(opened).join('\n')

  // The call takes the dialog the agent had: its own title, what it was passed
  // and what came back under a rule each, and its figures on the foot.
  expect(text).toContain('Bash')
  expect(text).toContain('argument')
  expect(text).toContain('git log -1 hooks/paint.ts')
  expect(text).toContain('output')
  expect(text).toContain('fatal: not a git repository')
  expect(text).toContain('\u25c2 Back')
  expect(text).toContain('failed')

  // And the list it came from is not drawn behind it: one reading at a time.
  expect(text).not.toContain('hooks/paint.ts, line 300')
})

test('an argument of several lines keeps its own line breaks, opened', () => {
  const run = runOf()

  run.agents[2].calls = [
    {
      id: 'm0',
      name: 'Bash',
      input: 'set -e\ngit fetch --all --prune\ngit status --short',
      startedMs: STARTED + 5_000,
      endedMs: STARTED + 5_100,
    },
  ]

  const canvas = new Canvas(127, 34)

  paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: 'r1',
    detailRows: 24,
    detailTab: CALLS,
    openCall: 'm0',
  })

  const rows = rowsOf(canvas)

  // A script run together into one paragraph is a script whose second command
  // reads as an argument to its first. The lines the caller wrote are the lines
  // the reader gets, folded where they are too long for the pane and nowhere
  // else. The list flattens it to one line, which is what a list is for; this
  // is the reading the list points at.
  expect(rows.some(row => /git fetch --all --prune\s*│?\s*$/.test(row.trimEnd()))).toBe(true)
  expect(rows.some(row => row.includes('git status --short'))).toBe(true)
  expect(rows.some(row => row.includes('--prune') && row.includes('git status'))).toBe(false)
})

/** The pane with one call open, painted at a given width. */
function opened(
  call: Partial<ToolCall> & { id: string },
  columns = 127,
  detailRows = 24,
  scroll: { arg?: number; out?: number } = {},
): Canvas {
  const run = runOf()

  run.agents[2].calls = [
    { name: 'Bash', input: '', startedMs: STARTED + 5_000, endedMs: STARTED + 5_100, ...call },
  ]

  const canvas = new Canvas(columns, detailRows + 10)

  paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: 'r1',
    detailRows,
    detailTab: CALLS,
    openCall: call.id,
    callScroll: scroll.arg ?? 0,
    callOutScroll: scroll.out ?? 0,
  })

  return canvas
}

test('a call reads in two sections, what it was passed and what came back', () => {
  const rows = rowsOf(opened({ id: 'two', input: 'command: ls -la', result: 'total 0' }))
  const text = rows.join('\n')

  // Argument and answer ran together under one rule read as one block, and the
  // first line of the answer read as the last line of the call. Two rules and a
  // blank between them say which half of the reading a row belongs to without a
  // reader having to work it out from the words.
  expect(text).toContain('command')
  expect(text).toContain('output')
  expect(rows.findIndex(row => row.includes('\u2500 command \u2500'))).toBeLessThan(
    rows.findIndex(row => row.includes('\u2500 output \u2500')),
  )

  // A call that takes named arguments rather than a shell line says so: the
  // word over the rule is what the section holds, not a word that fits.
  expect(rowsOf(opened({ id: 'arg', name: 'Read', input: '/tmp/a.txt' })).join('\n')).toContain(
    '\u2500 argument \u2500',
  )
})

test('a call is two compartments of one box, each with its own bar', () => {
  const canvas = opened({ id: 'two', input: 'command: ls -la', result: 'total 0' })
  const rows = rowsOf(canvas)
  const box = dialogOf(rows)
  const shelf = (word: string) => rows.findIndex(row => row.includes(`\u2500 ${word} \u2500`))

  // Tied into the frame at both ends, the way the tab strip and the figures rule
  // are. A rule drawn inside the block scrolled away with the fourth line, and
  // what was left was one slab of somebody else's text with no word anywhere
  // saying where the argument stopped and the answer started.
  for (const word of ['command', 'output']) {
    const row = rows[shelf(word)] ?? ''

    expect(row[box.left]).toBe('\u251c')
    expect(row[box.right]).toBe('\u2524')
  }

  expect(shelf('command')).toBeLessThan(shelf('output'))

  // A call that takes named fields rather than a shell line says which.
  expect(rowsOf(opened({ id: 'arg', name: 'Read', input: '/tmp/a.txt' })).join('\n')).toContain(
    '\u2500 argument \u2500',
  )
})

test('moving one compartment of a call leaves the other where it was', () => {
  const long = Array.from({ length: 200 }, (_, i) => `out ${i}`).join('\n')
  const call = { id: 'both', input: Array.from({ length: 40 }, (_, i) => `arg${i}: value ${i}`).join('\n'), result: long }
  const at = (canvas: Canvas) => {
    const rows = rowsOf(canvas)
    const cut = rows.findIndex(row => row.includes('\u2500 output \u2500'))

    return {
      argument: rows.slice(0, cut).find(row => /arg\d+:/.test(row)) ?? '',
      output: rows.slice(cut).find(row => /out \d+/.test(row)) ?? '',
    }
  }

  const still = at(opened(call))
  const moved = at(opened(call, 127, 24, { out: 30 }))

  // Two readings in one scroll was the bug the tabs were introduced for, one
  // level up: a reader with the pointer on a three-line command turned the
  // wheel and watched the answer move instead.
  expect(moved.output).not.toBe(still.output)
  expect(moved.argument).toBe(still.argument)

  const lifted = at(opened(call, 127, 24, { arg: 8 }))

  expect(lifted.argument).not.toBe(still.argument)
  expect(lifted.output).toBe(still.output)
})

test('a box too short for two compartments rules the sections off instead', () => {
  // Three rows is a compartment, a shelf and a compartment with nothing in
  // either. Below that the words still say which half a row belongs to.
  const rows = rowsOf(opened({ id: 'tiny', input: 'command: ls', result: 'total 0' }, 127, 4))
  const box = dialogOf(rows)
  const said = rows.find(row => row.includes('\u2500 command \u2500')) ?? ''

  expect(said).not.toBe('')
  expect(said[box.left]).toBe('\u2502')
})

test('a long answer keeps both its ends and counts what it left out', () => {
  // Lines nearly as wide as the block, so both ends and the count between them
  // stand in one pane rather than a scroll apart.
  const wide = '='.repeat(60)
  const lines = Array.from({ length: 400 }, (_, i) => `line ${i} ${wide} of the build log`)
  const rows = rowsOf(opened({ id: 'long', input: 'command: make', result: lines.join('\n') }, 127, 40))
  const text = rows.join('\n')

  // Cut off at the front, a build log keeps the part a reader had already
  // guessed and drops the verdict they opened the call for. Both ends are kept
  // and the middle is counted, so nothing goes missing quietly.
  expect(text).toContain(`line 0 ${wide}`)
  expect(text).toContain(`line 399 ${wide}`)
  expect(text).toMatch(/\u2026 [\d.]+k characters not shown \u2026/)

  // And the cut lands where the answer already broke, so the row after the
  // count is a whole line rather than the tail of one.
  const at = rows.findIndex(row => row.includes('characters not shown'))

  expect(rows[at + 1]).toMatch(/line \d+ =+/)
})

test('a call sets what it ran apart from what it ran on, in weight alone', () => {
  const canvas = opened({ id: 'lit', input: 'command: git status --porcelain' })
  const rows = rowsOf(canvas)
  const y = rows.findIndex(row => row.includes('git status'))
  const toneAt = (text: string) => canvas.cell(rows[y]!.indexOf(text), y).fg

  // Three weights of the block's own grey and no fourth colour: colour in this
  // pane already says what state a node is in and that a line is a wire, and a
  // third meaning taken on here would cost the first two theirs.
  const [key, ran, on, flag] = [toneAt('command:'), toneAt('git'), toneAt('status'), toneAt('--porcelain')]

  expect(ran).not.toBe(on)
  expect(key).not.toBe(on)
  expect(flag).toBe(key)
  expect(new Set([key, ran, on]).size).toBe(3)
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

function shown(run: RunState, columns = 127, rows = 34, detailRows = 24, detailTab = CALLS): string[] {
  const canvas = new Canvas(columns, rows)

  paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: 'r1',
    detailRows,
    detailTab,
  })

  return rowsOf(canvas)
}

test('a call is shown whole, however long the thing it was passed', () => {
  const text = shown(pathRun('Review the file.', 4)).join('\n')

  // The path used to be cut to the part that told it from the next one: the
  // calls shared the dialog with the prompt, so a path had forty cells to be
  // said in and the prefix was what fitted. A pane at a time has the width for
  // the whole thing, and a command a reader cannot read whole is a command they
  // cannot check.
  expect(text).toContain('/Users/someone/Desktop/my-projects/flowpane/hooks/paint.ts, line 300')
  expect(text).not.toContain('\u2026/')
})

test('the open pane takes the dialog’s whole width', () => {
  const rows = shown(pathRun('Review this file and say what you found. '.repeat(3), 40))
  const call = rows.find(row => row.includes('hooks/paint.ts, line 300')) ?? ''

  // Two blocks side by side gave a call forty cells and the prompt the rest.
  // One pane at a time gives whichever is open all of them, and the reader
  // changes which with a press instead of reading both through a keyhole.
  const left = call.indexOf('│')
  const right = call.lastIndexOf('│')

  const margin = Math.floor((right - left) * 0.2)

  expect(right - left).toBeGreaterThan(100)
  // Nothing down the middle of it: the rule that used to divide the two blocks
  // stood about there. The pane's own scroll rail sits against the right frame,
  // which is furniture rather than a second column.
  expect(call.slice(left + 1 + margin, right - margin)).not.toContain('│')
})

test('the tab strip stays put when a different tab opens', () => {
  const strip = (tab: number) => {
    const rows = shown(pathRun('Review the file.', 4), 127, 34, 24, tab)

    return rows.find(row => row.includes('Prompt') && row.includes('Thinking')) ?? ''
  }

  // The open tab is bracketed rather than widened, so every tab keeps the cells
  // it had: a strip that shifted under the pointer made the tab a reader meant
  // to press the one beside the one they pressed.
  const at = (row: string, name: string) => row.indexOf(name)

  for (const name of ['Prompt', 'Thinking']) {
    expect(at(strip(PROMPT), name)).toBe(at(strip(CALLS), name))
    expect(at(strip(CALLS), name)).toBe(at(strip(THINKING), name))
  }
})

test('the tab strip gives up its count before it gives up its name', () => {
  const strip = (columns: number) => {
    const rows = shown(pathRun('Review the file.', 4), columns, 34, 18, PROMPT)

    return rows.find(row => row.includes('Prompt')) ?? ''
  }

  // `Calls` was a tab a reader could read two ways — the calls made, or the
  // calls still to make — and the count was on the scrollbar, where it named
  // the rows in view rather than the rows there are. Both belong on the tab.
  expect(strip(110)).toContain('Tool Calls (4)')

  // Narrowed, the strip drops the count, then the word in front of the name.
  // The name is what a reader presses; the count is what they would have found
  // by pressing it, so it is the part that can go.
  expect(strip(48)).toContain('Tool Calls')
  expect(strip(48)).not.toContain('(4)')
  expect(strip(44)).toContain('Calls')
  expect(strip(44)).not.toContain('Tool Calls')
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
    orientation: 'vertical',
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
    orientation: 'vertical',
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

  // The detail: its own ✕, the tabs that say which pane is open, and the arrows
  // that move the words under it.
  const detail = keysOf({ selectedId: 'r1' })

  expect(detail).toContain('@close')
  expect(detail).toContain('@tab:1')
  expect(
    detail.every(key => key === '@close' || key.startsWith('detail-') || key.startsWith('@tab:')),
  ).toBe(true)

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
    orientation: 'vertical',
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
  expect(text).toContain('/flowpane help')
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
  const callRow = (rows: string[]) => rows.find(row => /\u2714\s{2}\S+\s{2,}\S/.test(row))
  const spent = callRow(drawn('r1', CALLS))

  expect(spent).toMatch(/\u2211 \d+(?:\.\d)?k tkns/)

  // The word goes before the argument the detail was opened to read gives up
  // any of its own cells. A tool whose name is a third of the block is what
  // takes those cells: the row keeps the figure and drops the unit.
  const long = runOf()
  const named = long.agents.find(a => a.agentId === 'r1')

  for (const call of named?.calls ?? []) {
    call.name = 'claude-in-chrome-computer'
  }

  // A name with no `__` in it, since the list names an MCP tool by its last
  // segment: fifteen tools of one server share the first forty cells of their
  // names, so `mcp__claude-in-chrome__computer` would be drawn as `computer`
  // and the row would no longer be squeezed at all. The name is cut to the
  // column at this width, so the row is found by its mark rather than by it —
  // the dialog's own foot names the tool in full.
  const row = callRow(shown(long, 70, 30, 20))

  expect(row).toMatch(/\u2211 \d+(?:\.\d)?k/)
  expect(row).not.toContain('tkns')
})

/** A run that called another workflow, drawn shut: one row for the four agents. */
function runWithNested(): RunState {
  const phase = '▸ code-review'
  const inside = [
    { ...agentOf('n1', 'plan', phase, 1_000, 2_000), resultPreview: 'four dimensions to review' },
    { ...agentOf('n2', 'review:bugs', phase, 3_000, 4_000), resultPreview: 'one off-by-one in wavesOf' },
    { ...agentOf('n3', 'review:perf', phase, 3_000, 5_000), resultPreview: 'nothing worth changing' },
    { ...agentOf('n4', 'write', phase, 9_000, 1_000), resultPreview: 'wrote the summary' },
  ]

  return {
    ...runOf(),
    phases: ['Survey', phase],
    agents: [agentOf('s1', 'survey:paint', 'Survey', 0, 4_000), ...inside],
  }
}

test("a nested run's name opens every agent it ran, not the last of them", () => {
  const shut = new Canvas(110, 32)
  const drew = paint(shut, runWithNested(), {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    detailRows: 14,
  })

  // The row stands for a whole workflow and carries the figures of the agent
  // that decided it, so pressing its name used to open that one agent — a
  // reader who asked what the panel did was shown the last of four answers.
  expect(drew.hotspots.some(spot => spot.agentId === '@run:▸ code-review')).toBe(true)
  expect(drew.hotspots.some(spot => spot.agentId === 'n4')).toBe(false)

  const canvas = new Canvas(110, 32)

  paint(canvas, runWithNested(), {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: '@run:▸ code-review',
    detailRows: 14,
  })

  const text = rowsOf(canvas).join('\n')

  // Every agent, one to a row, each saying what it answered.
  for (const label of ['plan', 'review:bugs', 'review:perf', 'write']) {
    expect(text).toContain(label)
  }

  expect(text).toContain('one off-by-one in wavesOf')

  // The title is the run, without the marker that means *press to unfold* — the
  // one thing the reader has already done. The foot is what the whole of it
  // came to, the count of agents included, which is what the row said.
  expect(text).toContain('code-review')
  expect(text).not.toContain('▸ code-review ')
  expect(text).toContain('⧉ 4')
  expect(text).toContain('4/4')
})

test('a row of the run opens that agent, and the way back is in the corner', () => {
  const canvas = new Canvas(110, 32)
  const drew = paint(canvas, runWithNested(), {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: '@run:▸ code-review',
    detailRows: 14,
  })

  // Every row of the list is a press of its own. That is the whole point of
  // the list: it is an index, and an index has to hand over what it indexes.
  for (const id of ['n1', 'n2', 'n3', 'n4']) {
    expect(drew.hotspots.some(spot => spot.agentId === id)).toBe(true)
  }

  const opened = new Canvas(110, 32)

  paint(opened, runWithNested(), {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: 'n2',
    detailRows: 14,
    fromRun: '▸ code-review',
  })

  const text = rowsOf(opened).join('\n')

  // The agent's own dialog, with the way back to the list in the corner it came
  // from — the same word and the same place a call's dialog uses.
  expect(text).toContain('review:bugs')
  expect(text).toContain('◂ Back')

  // One reading at a time: the list is not drawn behind it.
  expect(text).not.toContain('review:perf')
})

test('the rows of a run are all one height, however long an answer runs', () => {
  const canvas = new Canvas(110, 32)

  paint(canvas, runWithNested(), {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: '@run:▸ code-review',
    detailRows: 14,
  })

  const rows = rowsOf(canvas)
  const at = (label: string) => rows.findIndex(row => row.includes(` ${label} `) || row.includes(` ${label}  `))

  // Four agents, four consecutive rows. A list whose rows wrap is a list a
  // reader cannot scan, and the answers here are somebody else's prose, which
  // has no length a pane can plan around.
  expect(at('review:bugs') - at('plan')).toBe(1)
  expect(at('review:perf') - at('review:bugs')).toBe(1)
  expect(at('write') - at('review:perf')).toBe(1)
})

/** An agent whose prompt is markdown, which is what every prompt in the corpus is. */
function runWithMarkdown(): RunState {
  const written = [
    'You are the develop stage.',
    '',
    '# SD-141413 — Implementation plan',
    '',
    '> Source of truth lives in docs/neo-migration-plan.md.',
    '> This adapts it to the current pipeline.',
    '',
    '- v1 — initial draft.',
    '- v2 — incorporated answers.',
  ].join('\n')

  return {
    ...runOf(),
    agents: [{ ...agentOf('m1', 'develop', 'Develop', 0, 4_000), prompt: written }],
  }
}

test('a prompt is read as the document it was written as', () => {
  const canvas = new Canvas(110, 32)

  paint(canvas, runWithMarkdown(), {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: 'm1',
    detailRows: 18,
    detailTab: PROMPT,
  })

  const rows = rowsOf(canvas)
  const at = (text: string) => rows.findIndex(row => row.includes(text))

  // Every line the writer wrote is a line. Run together as one paragraph — which
  // is how this pane wrapped a prompt until now — the markdown does not
  // degrade, it disappears: headings, quotes and list items end up loose in the
  // middle of sentences, and a two-hundred-line plan comes out as one paragraph.
  expect(at('# SD-141413 — Implementation plan')).toBeGreaterThan(at('You are the develop stage.'))
  expect(at('> Source of truth lives in docs/neo-migration-plan.md.')).toBeGreaterThan(0)
  expect(at('- v1 — initial draft.')).toBeGreaterThan(0)
  expect(at('- v2 — incorporated answers.')).toBe(at('- v1 — initial draft.') + 1)

  // The writer's own paragraph breaks are kept too: the blank line before the
  // heading is the blank line before the heading.
  const above = rows[at('# SD-141413 — Implementation plan') - 1] ?? ''

  expect(above.replace(/[│─╭╮╰╯]/g, '').trim()).toBe('')
})

test('the dialog says in a word what the card beside it says in a mark', () => {
  const run: RunState = {
    ...runOf(),
    phases: ['Gather', 'Widen', 'Draft'],
    agents: [
      agentOf('g0', 'gather:alpha', 'Gather', 0, 4_000),
      agentOf('w0', 'widen:one', 'Widen', 5_000, 4_000),
      agentOf('d0', 'draft:alpha', 'Draft', 10_000, 4_000),
    ],
  }
  const canvas = new Canvas(110, 32)

  paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: 'd0',
    detailRows: 14,
  })

  // `draft:alpha` was fed by `gather:alpha`, two bands back, so no wire is drawn
  // to it and the card carries `▾ Gather` instead. The mark is right and it is
  // learned rather than read — a reader took it for the run rewinding to this
  // step — so the dialog, which has the cells, says it outright. It is also the
  // only place the name is certain to be whole.
  const rows = rowsOf(canvas)

  expect(rows.some(row => row.includes('Draft │ from Gather │'))).toBe(true)
})

test('a prompt four hundred lines long is shown to its last line', () => {
  const lines = Array.from({ length: 400 }, (_, i) => `step ${i + 1} of the plan`)
  const run = {
    ...runOf(),
    agents: [{ ...agentOf('m1', 'develop', 'Develop', 0, 4_000), prompt: lines.join('\n') }],
  }
  const canvas = new Canvas(110, 32)

  paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: 'm1',
    detailRows: 18,
    detailTab: PROMPT,
    // Past the end; the pane clamps to the last screenful.
    detailScroll: [900],
  })

  const rows = rowsOf(canvas)

  // The wrapper came from the calls list, where an argument was a block of rows
  // among other blocks and stopping at two hundred was generous. A prompt is the
  // whole pane and the reader opened the tab to read it, so that same ceiling cut
  // a plan off in the middle and said `… 244 more lines` where the end was.
  expect(rows.some(row => row.includes('step 400 of the plan'))).toBe(true)
  expect(rows.some(row => row.includes('more lines'))).toBe(false)

  const counter = rows.map(row => /(\d+)–(\d+)\/(\d+)/.exec(row)).find(found => found !== null)

  expect(counter?.[3]).toBe('400')
})

test('a call is named by the argument that says which call it is', () => {
  const run = runOf()
  const agent = run.agents[2]

  agent.calls = [
    {
      id: 'e1',
      name: 'Edit',
      // The order a transcript replays keys in is the tool's own schema order,
      // which puts the same six characters at the head of every Edit in a run.
      input: 'replace_all: false\nfile_path: /repo/worktrees/feature/src/stores/ai-status.ts\nold_string: a',
      startedMs: STARTED + 5_000,
      endedMs: STARTED + 5_100,
    },
    {
      id: 'b1',
      name: 'Bash',
      input: 'command: bun run type-check 2>&1 | tail -25\ndescription: Run the type checker',
      startedMs: STARTED + 5_200,
      endedMs: STARTED + 5_300,
    },
  ]

  const canvas = new Canvas(110, 32)

  paint(canvas, run, {
    nowMs: STARTED + 20_000,
    tick: 0,
    orientation: 'vertical',
    selectedId: 'r1',
    detailRows: 14,
    detailTab: CALLS,
  })

  const text = rowsOf(canvas).join('\n')

  // The key's label goes with it: `command:` in front of a command, on a row
  // whose first column already reads `Bash`, spends cells saying the same thing
  // twice.
  expect(text).toContain('bun run type-check 2>&1 | tail -25')
  expect(text).not.toContain('replace_all')
  expect(text).not.toContain('command:')

  // A path is cut from the front. Every call in a run lives under one tree, so
  // cutting from the end gives a column of identical rows — and the file, which
  // is the part that differs, is the part that goes.
  expect(text).toContain('src/stores/ai-status.ts')
})
