/**
 * The script `bun dev/dryrun.ts` reads when it is handed nothing.
 *
 * The tool takes `process.argv[2] ?? DEMO`, and nobody imports it, so the
 * default is a path with no compiler behind it: the demo run has moved once
 * already, and a move that misses that line leaves a tool whose only documented
 * invocation exits 1. The path is written out again here on purpose — this test
 * is the other end of the pair, and the pair is what a rename has to keep.
 */

import { expect, test } from 'claude-code/testing'

/** The `DEMO` constant of `dev/dryrun.ts`, spelled the same way. */
const DEMO = 'dev/audit.workflow.js'

/** What a module that is not there says, in any of the loader's wordings. */
const MISSING = /cannot find|not found|no such file|failed to resolve|unable to resolve/i

test('the workflow dev/dryrun.ts falls back to is a file that resolves', async () => {
  // The demo is a workflow body rather than a module — loading it reaches
  // `agent`, which exists only inside dryrun's harness — so it is allowed to
  // throw. What it may not do is fail to be found: that is the failure the
  // default was written to be caught by, and the only one this asserts.
  const failure = await import('../dev/audit.workflow.js').then(
    () => '',
    (error: unknown) => String(error),
  )

  expect(`${DEMO} :: ${MISSING.test(failure)}`).toBe(`${DEMO} :: false`)
})
