/**
 * Checks the run-recovery walk outside Claude Code: given a session id, ask the
 * plugin itself what it finds on disk for that session, and print it.
 *
 *   bun dev/recover.ts <sessionId> [homeDir]
 *
 * The second argument stands in for `$HOME`, so a copied session tree can be
 * edited — a summary file taken out of it, say — to see what the walk makes of
 * a run that has not finished.
 *
 * It drives `register()` rather than repeating the walk: a second reader would
 * drift from the first, and then the harness would report a recovery no session
 * ever performs. The plugin's `session.start` is what does the walking; `/wf
 * runs` and a bare `/wf` are what it answers with.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'

import { register } from '../hooks/register'

const sessionId = process.argv[2]
const home = process.argv[3] ?? process.env.HOME

if (!sessionId) {
  console.error('usage: bun dev/recover.ts <sessionId> [homeDir]')
  process.exit(1)
}

type Handler = (engine: unknown, event: unknown, next: (e: unknown) => unknown) => Promise<{ text?: string }>

const handlers = new Map<string, Handler>()

/** The plugin's `on`, keyed the way the plugin's own filters distinguish hooks. */
function on(event: string, a: unknown, b?: unknown): void {
  const handler = (typeof a === 'function' ? a : b) as Handler
  const filter = (typeof a === 'function' ? {} : a) as { command?: string; tool?: string }
  const key = [event, filter.command, filter.tool].filter(Boolean).join(':')

  if (!handlers.has(key)) {
    handlers.set(key, handler)
  }
}

/** Enough of the engine for the walk: the session's id, a clock, and files. */
const engine = {
  env: { get: async (name: string) => (name === 'HOME' ? home : undefined) },
  session: { id: async () => sessionId },
  clock: { now: async () => Date.now(), every: () => ({ cancel() {} }) },
  store: { get: async () => undefined, set: async () => undefined },
  ui: { open: async () => undefined, close: async () => undefined, invalidate: () => undefined },
  command: { register: async () => undefined },
  fs: {
    exists: async (path: string) => {
      try {
        statSync(path)

        return true
      } catch {
        return false
      }
    },
    list: async (path: string) =>
      readdirSync(path, { withFileTypes: true }).map(entry => ({
        name: entry.name,
        kind: entry.isDirectory() ? 'dir' : 'file',
        size: 0,
      })),
    stat: async (path: string) => {
      const found = statSync(path)

      return { kind: found.isDirectory() ? 'dir' : 'file', size: found.size, mtimeMs: found.mtimeMs }
    },
    read: async (path: string) => readFileSync(path, 'utf8'),
  },
}

const pass = async (e: unknown) => e

register(on as never, {} as never)

await (handlers.get('session.start') as Handler)(engine, {}, pass)

const command = handlers.get('command.run:wf') as Handler

console.log((await command(engine, { args: 'runs' }, pass)).text)
console.log(`\n/wf opens on: ${(await command(engine, { args: '' }, pass)).text}`)
