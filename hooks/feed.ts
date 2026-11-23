/**
 * The activity strip as a surface module: the rows the paint drew, and the
 * pointer and keys that move them.
 *
 * It runs on the drawing thread without `$`, so it holds nothing of the run.
 * The hooks module paints the strip onto the canvas as it paints everything
 * else, hands the rows over as plain data, and moves the strip when this module
 * posts how far. What lives here is only what a drag needs between two events:
 * where the button went down, and the lines asked for since the last post.
 *
 * Posts go out on a clock rather than one per pointer move. A post not yet
 * delivered is replaced by the next one, so a post per move would drop the
 * steps of every move but the last in a frame; summed and sent on the clock,
 * nothing is lost, and the same post is what brings new lines in while the
 * run goes on.
 */

import type { ClientModule } from 'claude-code'

type Span = { t: string; fg?: string; bg?: string }

type Props = { lines?: Span[][]; ground?: string; columns?: number }

type Local = {
  /** The row the button last stood on while it is held; null when it is not. */
  held: number | null
  /** Lines asked for since the last post, positive towards the newest. */
  by: number
  /** Asked to jump to one end, which wins over `by`. */
  to: 'top' | 'end' | null
}

/** How often the module posts: the pane's own frame, so a drag moves as fast as the drawing does. */
const POST_MS = 120

const KEYS: Record<string, number> = { up: -1, down: 1, pageup: -8, pagedown: 8 }

const Feed: ClientModule = (props, surface) => {
  const { Box, Text } = surface.elements as unknown as Record<string, (p: Record<string, unknown>) => unknown>
  const given = (props ?? {}) as Props

  if (surface.state === undefined) {
    const local: Local = { held: null, by: 0, to: null }

    // Mutated in place rather than through `setState`: a drag moves the rows
    // through the props the hooks hand back, and a redraw of this module per
    // pointer move would draw the same rows again for nothing.
    surface.setState(local)

    surface.onPointer(event => {
      if (event.type === 'down' && event.button === 'left') {
        local.held = event.y
      } else if (event.type === 'move' && local.held !== null && event.button !== undefined) {
        // The lines are grabbed and carried: dragged up, they go up, and the
        // newer lines under them come into view.
        local.by += local.held - event.y
        local.held = event.y
      } else if (event.type === 'up') {
        local.held = null
      }
    })

    surface.onKey(event => {
      if (event.key === 'home') {
        local.to = 'top'
      } else if (event.key === 'end') {
        local.to = 'end'
      } else if (KEYS[event.key] !== undefined) {
        local.by += KEYS[event.key]!
      }
    })

    surface.every(POST_MS, () => {
      surface.post({ by: local.by, ...(local.to ? { to: local.to } : {}) })
      local.by = 0
      local.to = null
    })
  }

  const lines = Array.isArray(given.lines) ? given.lines : []

  return Box({
    flexDirection: 'column',
    children: lines.map((spans, y) =>
      Box({
        key: `l${y}`,
        flexDirection: 'row',
        ...(typeof given.columns === 'number' ? { width: given.columns } : {}),
        ...(given.ground ? { backgroundColor: given.ground } : {}),
        children: (Array.isArray(spans) ? spans : []).map((span, x) =>
          Text({
            key: `s${x}`,
            ...(span.fg ? { color: span.fg } : {}),
            ...(span.bg ? { backgroundColor: span.bg } : {}),
            wrap: 'truncate-end',
            children: String(span.t ?? ''),
          }),
        ),
      }),
    ),
  }) as never
}

export default Feed
