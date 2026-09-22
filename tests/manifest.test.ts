/**
 * What a session makes of the manifest it was installed by.
 *
 * The version the pane names is read off `.claude-plugin/plugin.json` under the
 * plugin's own root when the session starts, rather than kept as a second copy
 * in a constant a release has to remember to bump — the two drifted by hand for
 * three releases. The reading itself is a function of the file's text and is
 * held to that in `tests/about.test.ts`. This is the half either side of it: the
 * file the session asks for, and what the pane says when that read comes back
 * with nothing.
 *
 * Every test here drives `session.start` and then asks the plugin what it says
 * about itself, because the module state the hook writes is the plugin's own —
 * the engine loads the folder, so a `noteShipped` called from a test reaches a
 * different copy of `hooks/about.ts` than the hook does, and only what the
 * plugin prints is evidence about what the plugin read.
 */

import { expect, mock, test } from 'claude-code/testing'

import { NAME, VERSION } from '../hooks/about'

/**
 * The home the stub answers with: a directory this machine actually has.
 *
 * The plugin looks for `$HOME/.claude/projects` on the way up, to recover the
 * runs of earlier sessions, and the engine refuses `fs.exists` on a path it
 * cannot reach — a refusal is not a false, and the whole hook is skipped. This
 * file's own folder exists and holds no `.claude`, so the recovery finds nothing
 * and returns.
 */
const HOME = import.meta.dir

/** The file the manifest is read from, under whatever root the engine loaded. */
const MANIFEST = '/.claude-plugin/plugin.json'

/** A manifest no build of this plugin has ever shipped, so it can only be read. */
const SHIPPED = '{"name":"flowpane","version":"9.9.9"}'

/**
 * Everything but the manifest, which each test answers for itself: what it hands
 * back is the thing under test.
 */
function stubEngine(on: any): void {
  on('env.get', () => ({ value: HOME }))
  on('ui.open', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: { requestId: 'flowpane' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'flowpane' } }))
  on('session.id', () => ({ value: 'test-session' }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
  on('session.start', ($$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
}

/** What `/flowpane about` writes back, as one string. */
async function aboutReply($: any): Promise<string> {
  const result = await $.command.run({ command: 'flowpane', args: 'about' })

  return typeof result?.text === 'string' ? result.text : JSON.stringify(result)
}

test('the session reads its version off the manifest under its own plugin root', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  stubEngine(on)

  const read: string[] = []

  on('fs.read', ($$: unknown, e: { path: string }) => {
    read.push(e.path)

    return { value: e.path.endsWith(MANIFEST) ? SHIPPED : '' }
  })

  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })

  // One file, named as the engine names it: the manifest sits beside the plugin
  // rather than inside `hooks/`, and a session that reads the wrong file reads
  // nothing and falls back silently — which looks exactly like a session that
  // read the right one off a build whose constant was current.
  expect(read.filter(path => path.endsWith(MANIFEST)).length).toBe(1)
  // Built from the root the engine handed over, not from an absent one. `$.plugin`
  // is spelled out rather than reached for through `?.` — the host refuses it
  // written any other way — so a root that is missing throws and is caught here
  // instead of becoming `undefined/.claude-plugin/plugin.json` on every start.
  expect(read.some(path => path.includes('undefined'))).toBe(false)
})

test('the pane names the version the session read, not the one it was built with', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  stubEngine(on)

  on('fs.read', ($$: unknown, e: { path: string }) => ({
    value: e.path.endsWith(MANIFEST) ? SHIPPED : '',
  }))

  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })

  const said = await aboutReply($)

  // The whole point of the read: what the engine installed is what the reader
  // is told, whatever the constant in the module happens to say.
  expect(said).toContain(`${NAME} 9.9.9`)
  expect(said).not.toContain(`${NAME} ${VERSION}`)
})

test('a manifest the session could not read leaves the pane on the version it was built with', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  stubEngine(on)

  let refuse = false

  on('fs.read', ($$: unknown, e: { path: string }) => {
    if (refuse) {
      throw new Error('a network location is not reached from here (host check)')
    }

    return { value: e.path.endsWith(MANIFEST) ? SHIPPED : '' }
  })

  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })

  refuse = true

  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })

  const said = await aboutReply($)

  // A read the engine refuses is the ordinary case on an install it placed
  // somewhere this cannot reach, and it has to end where every other failure
  // ends. Two things are checked at once because they are one fault apart: the
  // pane keeps the constant rather than naming an empty version, and it drops
  // what the session before it read rather than going on naming a version this
  // install is not.
  expect(said).toContain(`${NAME} ${VERSION}`)
  expect(said).not.toContain('9.9.9')
})
