/**
 * What `dev/contrast.ts` prints, caught from the moment it is imported.
 *
 * The script does its work as it loads, and the runner takes an import
 * declaration only, so the catch has to be in place in a module imported
 * before it rather than in the test that reads it. The runner's `console` is
 * read-only, so the catch stands in for the whole object.
 */

export const said: string[] = []
export const real = globalThis.console

globalThis.console = {
  ...real,
  log: (...parts: unknown[]) => {
    said.push(parts.map(String).join(' '))
  },
}
