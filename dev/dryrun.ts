/**
 * Runs a workflow script's control flow without spending a single agent.
 *
 * Every `agent()` call is answered by a stub, so what this proves is the shape
 * of the run — which phases are entered, which chains stop early, how many
 * times a loop goes round, what each node ends up labelled — and nothing about
 * what the models would actually say. The stub's answers come from the script's
 * own schema, so a script that branches on a field gets a field to branch on.
 *
 *   bun dev/dryrun.ts workflows/audit.workflow.js [--json '<args>']
 */

export {}

type Opts = {
  label?: string
  phase?: string
  model?: string
  effort?: string
  schema?: { properties?: Record<string, { type?: string; description?: string }> }
}

type Call = { label: string; phase: string; model: string; effort: string }

const path = process.argv[2] ?? 'workflows/audit.workflow.js'
const jsonAt = process.argv.indexOf('--json')
const scriptArgs = jsonAt > 0 ? JSON.parse(process.argv[jsonAt + 1]!) : undefined

const source = await Bun.file(path).text()

/**
 * Enough of an answer for the script to keep going. A field named in the
 * schema is filled from its own description where the script needs a specific
 * word — `code` or `prose`, `blocking` or `minor` — and from the call's index
 * otherwise, so successive passes of a loop do not look identical.
 */
function stub(opts: Opts, n: number): unknown {
  const props = opts.schema?.properties

  if (!props) {
    return `stub answer ${n}`
  }

  const out: Record<string, unknown> = {}

  for (const [key, spec] of Object.entries(props)) {
    if (key === 'kind') {
      out[key] = n % 2 === 1 ? 'prose' : 'code'
    } else if (key === 'severity') {
      out[key] = n % 5 === 0 ? 'blocking' : 'minor'
    } else if (key === 'refuted') {
      // Most claims die. One in three surviving is about what a real run sees.
      out[key] = n % 3 !== 0
    } else if (key === 'findings') {
      // Every fourth pass comes up empty. That is what stops a loop early, and
      // on a first pass it is what drops a file before it is ever verified.
      const many = n % 4 === 1 ? 0 : Math.max(0, 2 - Math.floor(n / 11))

      out[key] = Array.from({ length: many }, (_, i) => ({
        line: 10 * (n + 1) + i,
        claim: `stub finding ${n}.${i}`,
        why: 'stub reason',
        severity: (n + i) % 5 === 0 ? 'blocking' : 'minor',
      }))
    } else if (spec.type === 'number') {
      out[key] = 100 * (n + 1)
    } else if (spec.type === 'boolean') {
      out[key] = n % 2 === 0
    } else {
      out[key] = `stub ${key} ${n}`
    }
  }

  return out
}

/** A pipeline item as one readable token, whatever shape the script gave it. */
function nameOf(item: unknown): string {
  if (typeof item === 'string') {
    return item
  }

  const named = item as { name?: string; path?: string; key?: string } | null

  return named?.name ?? named?.path ?? named?.key ?? JSON.stringify(item)
}

const calls: Call[] = []
const logs: string[] = []
const dropped: string[] = []
let current = '(none)'
let n = 0

async function agent(_prompt: string, opts: Opts = {}): Promise<unknown> {
  const call: Call = {
    label: opts.label ?? `agent-${n}`,
    phase: opts.phase ?? current,
    model: opts.model ?? '(session)',
    effort: opts.effort ?? '(session)',
  }

  calls.push(call)

  return stub(opts, n++)
}

function phase(title: string): void {
  current = title
}

function log(message: string): void {
  logs.push(message)
}

async function parallel(thunks: Array<() => Promise<unknown>>): Promise<unknown[]> {
  return Promise.all(thunks.map(t => t().catch(() => null)))
}

async function pipeline(
  items: unknown[],
  ...stages: Array<(prev: unknown, item: unknown, index: number) => Promise<unknown>>
): Promise<unknown[]> {
  return Promise.all(
    items.map(async (item, index) => {
      let value: unknown = item

      for (const stage of stages) {
        try {
          value = await stage(value, item, index)
        } catch (error) {
          dropped.push(`${nameOf(item)}: ${(error as Error).message}`)

          return null
        }
      }

      return value
    }),
  )
}

const body = source.replace(/^export const meta/m, 'const meta')
const run = new Function(
  'agent',
  'parallel',
  'pipeline',
  'phase',
  'log',
  'args',
  'budget',
  `return (async () => {\n${body}\n})()`,
) as (...deps: unknown[]) => Promise<unknown>

const result = await run(agent, parallel, pipeline, phase, log, scriptArgs, {
  total: null,
  spent: () => 0,
  remaining: () => Infinity,
})

const byPhase = new Map<string, string[]>()

for (const call of calls) {
  byPhase.set(call.phase, [...(byPhase.get(call.phase) ?? []), call.label])
}

console.log(`${path}\n${calls.length} agents in ${byPhase.size} phases\n`)

for (const [title, labels] of byPhase) {
  const models = [...new Set(calls.filter(c => c.phase === title).map(c => c.model))]

  console.log(`${title.padEnd(10)} ${String(labels.length).padStart(3)}  ${models.join(' ')}`)
  console.log(`           ${labels.join('  ')}\n`)
}

const declared: string[] = [...source.matchAll(/title:\s*'([^']+)'/g)].map(m => m[1]!)
const never = declared.filter(t => !byPhase.has(t))

if (never.length > 0) {
  console.log(`declared but never entered  ${never.join(' ')}`)
}

for (const line of dropped) {
  console.log(`dropped  ${line}`)
}

for (const line of logs) {
  console.log(`log  ${line}`)
}

console.log(`\nreturned  ${typeof result === 'string' ? result : JSON.stringify(result)}`)
