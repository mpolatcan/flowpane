/**
 * Checks that the version the pane shows is the version the marketplace ships.
 *
 * The manifest is what the engine installs by and `hooks/about.ts` is what the
 * reader is told, and a pane naming 0.3.0 while the marketplace serves 0.4.0 is
 * worse than a pane that names no version at all. The test suite cannot read
 * the manifest — a hooks module imports its own files and `claude-code`, and
 * nothing else — so the check lives here, where there is a filesystem.
 *
 *   bun dev/checkmeta.ts
 */

import { readFileSync } from 'node:fs'

import { NAME, VERSION } from '../hooks/about'

const manifest = JSON.parse(
  readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'),
) as { name?: string; version?: string }

// The manifest name is an identifier the engine installs and addresses commands
// by, so it is lowercase; `NAME` is the same word set the way a reader sees it.
// Compared letter for letter they are one name spelled two ways, and a check
// that insists on one spelling would force the pane to shout its own title.
const wrong = [
  manifest.name?.toLowerCase() === NAME.toLowerCase()
    ? ''
    : `name: manifest ${manifest.name}, about.ts ${NAME}`,
  manifest.version === VERSION ? '' : `version: manifest ${manifest.version}, about.ts ${VERSION}`,
].filter(Boolean)

if (wrong.length > 0) {
  console.error(wrong.join('\n'))
  process.exit(1)
}

console.log(`${NAME} ${VERSION} matches the manifest`)
