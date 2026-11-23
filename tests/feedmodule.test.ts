/**
 * The activity strip's surface module, driven through a surface of its own: a
 * drag carries the lines, and what it moved goes out on the module's clock.
 */

import { expect, test } from 'claude-code/testing'

import Feed from '../hooks/feed'

type Pointer = { type: string; x: number; y: number; button?: string }

/** A surface that records what the module drew and posted, and hands back its listeners. */
function surfaceOf() {
  const posts: unknown[] = []
  let state: unknown
  let pointer: (e: Pointer) => void = () => {}
  let key: (e: { key: string }) => void = () => {}
  let tick: () => void = () => {}
  const element = (type: string) => (props: Record<string, unknown>) => ({ type, props })

  const surface = {
    elements: { Box: element('Box'), Text: element('Text') },
    get state() {
      return state
    },
    setState: (next: unknown) => {
      state = next
    },
    columns: 80,
    rows: 4,
    every: (_ms: number, fn: () => void) => {
      tick = fn
      return () => {}
    },
    onPointer: (fn: (e: Pointer) => void) => {
      pointer = fn
      return () => {}
    },
    onKey: (fn: (e: { key: string }) => void) => {
      key = fn
      return () => {}
    },
    post: (data: unknown) => posts.push(data),
  }

  return { surface, posts, pointer: (e: Pointer) => pointer(e), key: (k: string) => key({ key: k }), tick: () => tick() }
}

test('a drag up the strip carries its lines up, towards the newest', () => {
  const s = surfaceOf()

  Feed({ lines: [] }, s.surface as never)
  s.pointer({ type: 'down', x: 4, y: 3, button: 'left' })
  s.pointer({ type: 'move', x: 4, y: 2, button: 'left' })
  s.pointer({ type: 'move', x: 4, y: 0, button: 'left' })
  s.tick()

  expect(s.posts).toEqual([{ by: 3 }])

  // Let go, the pointer moving moves nothing.
  s.pointer({ type: 'up', x: 4, y: 0, button: 'left' })
  s.pointer({ type: 'move', x: 4, y: 3 })
  s.tick()

  expect(s.posts[1]).toEqual({ by: 0 })
})

test('a drag down carries them down, past the region’s edge too', () => {
  const s = surfaceOf()

  Feed({ lines: [] }, s.surface as never)
  s.pointer({ type: 'down', x: 4, y: 0, button: 'left' })
  s.pointer({ type: 'move', x: 4, y: 7, button: 'left' })
  s.tick()

  expect(s.posts).toEqual([{ by: -7 }])
})

test('the keys move it a line, a page, or to either end', () => {
  const s = surfaceOf()

  Feed({ lines: [] }, s.surface as never)
  s.key('up')
  s.key('pageup')
  s.tick()
  s.key('end')
  s.tick()

  expect(s.posts).toEqual([{ by: -9 }, { by: 0, to: 'end' }])
})

test('the rows it draws are the spans it was handed, in their colours, on the pane’s ground', () => {
  const s = surfaceOf()
  const drawn = Feed({ lines: [[{ t: ' 5.0s', fg: '#777777' }, { t: '  lint' }]], ground: '#101010', columns: 80 }, s.surface as never) as unknown as {
    props: { children: { props: { width: number; backgroundColor: string; children: { props: { color?: string; children: string } }[] } }[] }
  }
  const row = drawn.props.children[0]!.props

  expect(row.width).toBe(80)
  expect(row.backgroundColor).toBe('#101010')
  expect(row.children.map(t => t.props.children)).toEqual([' 5.0s', '  lint'])
  expect(row.children[0]!.props.color).toBe('#777777')
})
