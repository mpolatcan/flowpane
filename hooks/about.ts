/**
 * What the pane says about itself, in one place.
 *
 * The About dialog draws these rows on the canvas and `/flowpane about` prints the
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

/**
 * When this version was published, written the way a European reader dates.
 *
 * It moves with {@link VERSION} or it says nothing: 0.3.1 and 0.5.0 both shipped
 * claiming the 15th, because bumping the version is the visible half of a
 * release and this line is the half nobody looks at. A date left behind is worse
 * than no date, since the row is well formed and reads as true. The test suite
 * holds it to the day the release before it went out, or a later one: two
 * releases can go out on one day, and 0.6.0, 0.7.0 and 0.8.0 did.
 */
export const RELEASED = '22-09-2026'

/**
 * The version this build was written with, and what the pane falls back to.
 *
 * It used to be the only answer, kept in step with `.claude-plugin/plugin.json`
 * by hand: the manifest is what the engine installs by and this is what the
 * reader was told, and a pane claiming 0.3.0 while the marketplace serves 0.5.0
 * is worse than a pane that names no version at all. Nothing inside the suite
 * could hold the two together — the manifest is not a file a test can open, so
 * the constant was checked against it by `dev/checkmeta.ts`, which is a check
 * somebody has to remember.
 *
 * So the session reads the manifest instead and the pane says what it found;
 * see {@link noteShipped}. A test can hold every seat to that, by answering the
 * read rather than opening the file. This constant is what is left when the read
 * failed, which is the only case where the two can still disagree, and
 * `dev/checkmeta.ts` keeps it honest for that case.
 */
export const VERSION = '0.8.0'

/** What the manifest said, once a session has read it. */
let shipped: string | undefined

/**
 * The version the pane names, which is the manifest's where there is one.
 *
 * Read rather than remembered: what the engine installed by is the fact a
 * reader checking a build against the marketplace is after, and the constant
 * above is one edit away from being last release's answer at any time.
 */
export function shippedVersion(): string {
  return shipped ?? VERSION
}

/**
 * Hand the session's own `.claude-plugin/plugin.json` to the pane.
 *
 * Takes the file as text rather than a version already picked out of it, so
 * the reading is here with the fallback it belongs to rather than in the hook
 * that did the loading: anything that is not JSON naming a version — a file
 * that was not there, a read that was refused, a manifest from a build that
 * states none — leaves the pane on {@link VERSION}. Called with nothing, it
 * forgets what it was told, which is what a session ending amounts to.
 */
export function noteShipped(manifest: string | undefined): void {
  shipped = undefined

  if (manifest === undefined) {
    return
  }

  try {
    const version: unknown = (JSON.parse(manifest) as { version?: unknown }).version

    if (typeof version === 'string' && version.trim() !== '') {
      shipped = version.trim()
    }
  } catch {
    // A manifest that does not parse is a manifest the pane has not read, and
    // the fallback already covers that. Nothing is logged: this runs at session
    // start, where a line about the plugin's own packaging is a line in front of
    // a reader who asked for none.
  }
}

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
    { kind: 'field', left: '/flowpane help', right: 'every command' },
    { kind: 'field', left: '/flowpane runs', right: 'this session’s runs' },
    { kind: 'gap' },
    { kind: 'text', text: 'Reads the workflow journals under ~/.claude/projects.' },
    { kind: 'text', text: 'Nothing leaves this machine.' },
    { kind: 'gap' },
    { kind: 'field', left: 'Maintainer', right: MAINTAINER },
    { kind: 'field', left: 'Released', right: RELEASED },
  ]
}

/** The same rows as text, for `/flowpane about` and any seat that draws no canvas. */
export function aboutText(): string {
  const rows = aboutRows()
  const pad = rows.reduce((w, r) => (r.kind === 'field' ? Math.max(w, r.left.length) : w), 0)

  return [
    `${NAME} ${shippedVersion()} — ${TAGLINE}`,
    ...rows.map(row =>
      row.kind === 'gap'
        ? ''
        : row.kind === 'text'
          ? row.text
          : `${row.left.padEnd(pad)}   ${row.right}`,
    ),
  ].join('\n')
}
