/**
 * What the pane says about itself, in one place.
 *
 * The About dialog draws these rows on the canvas and `/wf about` prints the
 * same ones as text, because the seat without Buttons is the seat where a
 * reader most needs to be told what the pane is and how to drive it. Two
 * copies of that answer drift: the dialog would gain a line the command never
 * learned, and a reader on the hint line would be told less by the surface
 * that can show them least.
 */

/**
 * The plugin's own name, as the footer and the dialog title both say it.
 *
 * Capitalised, where the manifest's `name` is not: the manifest's is an
 * identifier the engine installs and addresses by, and an identifier is
 * lowercase. This is the word a reader sees.
 */
export const NAME = 'FlowPane'

/** The line under the name, wherever the pane has room to say what it is. */
export const TAGLINE = 'Dynamic Workflow Visualizer'

/** Who to ask about it. */
export const MAINTAINER = 'Mutlu Polatcan'

/** When this version was published, written the way a European reader dates. */
export const RELEASED = '15-09-2026'

/**
 * The version, kept in step with `.claude-plugin/plugin.json` by a test rather
 * than by memory: the manifest is what the engine installs by and this is what
 * the reader is told, and a pane claiming 0.3.0 while the marketplace serves
 * 0.4.0 is worse than a pane that names no version at all.
 */
export const VERSION = '0.3.0'

/** One line of the About dialog: a pair, a sentence, or the air between them. */
export type AboutRow =
  | { kind: 'field'; left: string; right: string }
  | { kind: 'text'; text: string }
  | { kind: 'gap' }

/**
 * What the pane is, what presses it, and where it reads from.
 *
 * The order is the order a reader asks in. What is this — one sentence, since
 * a reader who opened a dialog titled with the name already knows roughly. Then
 * what can be pressed, because that is the question that brought them. Then the
 * commands, for the seat that draws no buttons. Then where the drawing comes
 * from, which is the question every live view eventually raises: a graph with
 * nothing in it is either a quiet session or a path this plugin cannot read,
 * and the reader cannot tell which without being told where it looks.
 */
export function aboutRows(): AboutRow[] {
  return [
    { kind: 'text', text: 'A live picture of the agents a workflow runs: what each one is doing, what it has spent, and what it answered.' },
    { kind: 'gap' },
    { kind: 'field', left: 'A node', right: 'opens its detail' },
    { kind: 'field', left: 'Tab, Enter', right: 'moves, presses' },
    { kind: 'field', left: '✕', right: 'closes what is open' },
    { kind: 'gap' },
    { kind: 'field', left: '/wf help', right: 'every command' },
    { kind: 'field', left: '/wf runs', right: 'this session’s runs' },
    { kind: 'gap' },
    { kind: 'text', text: 'Reads the workflow journals under ~/.claude/projects.' },
    { kind: 'text', text: 'Nothing leaves this machine.' },
    { kind: 'gap' },
    { kind: 'field', left: 'Maintainer', right: MAINTAINER },
    { kind: 'field', left: 'Released', right: RELEASED },
  ]
}

/** The same rows as text, for `/wf about` and any seat that draws no canvas. */
export function aboutText(): string {
  const rows = aboutRows()
  const pad = rows.reduce((w, r) => (r.kind === 'field' ? Math.max(w, r.left.length) : w), 0)

  return [
    `${NAME} ${VERSION} — ${TAGLINE}`,
    ...rows.map(row =>
      row.kind === 'gap'
        ? ''
        : row.kind === 'text'
          ? row.text
          : `${row.left.padEnd(pad)}   ${row.right}`,
    ),
  ].join('\n')
}
