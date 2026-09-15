export const meta = {
  name: 'audit',
  description:
    'A read-only audit of the repository it is run in, shaped to exercise everything the pane draws: an agent-decided branch into two phases, a loop that keeps digging at one file until a pass turns up nothing new, chains that stop early, a phase usually never entered, three models side by side, and four kinds of tool call',
  whenToUse:
    'The realistic demo for flowpane, and a usable review in its own right. It surveys a handful of files, branches code from prose, digs at each one until a pass comes back empty, tries to refute what it found, escalates only what survives as blocking, and writes a report. Nothing is written to disk. Pass a JSON array of paths as args to audit those instead of the defaults.',
  phases: [
    { title: 'Survey', detail: 'one agent per file: how big, how often it changes, what it is', model: 'haiku' },
    { title: 'Review', detail: 'the code branch — a fresh lens each pass until one comes back empty', model: 'sonnet' },
    { title: 'Check', detail: 'the prose branch — every claim in the text against the code', model: 'haiku' },
    { title: 'Verify', detail: 'one agent per finding, told to refute it', model: 'sonnet' },
    { title: 'Escalate', detail: 'only what survived as blocking — usually nothing, so usually empty', model: 'opus' },
    { title: 'Report', detail: 'one agent joins the survey and the verdicts', model: 'opus' },
  ],
}

// Three models on purpose. The cheap tier counts lines and reads prose, the
// middle tier reads code and argues with itself about it, and the top tier only
// sees what survived — which is the shape a real review has, and the shape the
// pane's model tags (`H4.5`, `S5`, `O5`) are there to make visible.
const SCOUT = 'haiku'
const READER = 'sonnet'
const JUDGE = 'opus'

/** How many passes one file may take before the loop gives up on it. */
const MAX_PASSES = 3

/**
 * A different question each pass. The loop stops early when a pass finds
 * nothing new, so a clean file costs one agent and a messy one costs three —
 * which is why the Review lane comes out wider than the Check lane beside it.
 */
const LENSES = [
  {
    key: 'correctness',
    ask: 'Look for code that is wrong: an off-by-one, a boundary that is never hit, a branch that cannot be reached, a value used before it is set, an error swallowed where it matters.',
  },
  {
    key: 'edges',
    ask: 'Look for inputs the code does not survive: an empty list, a single element, a zero width or height, a negative number, a missing optional field, a division by something that can be zero.',
  },
  {
    key: 'drift',
    ask: 'Look for code and comments that have drifted apart: a comment describing behaviour the code no longer has, a name that says one thing and does another, a constant documented as one value and set to another, dead code nothing calls.',
  },
]

const DEFAULT_TARGETS = [
  'hooks/paint.ts',
  'hooks/layout.ts',
  'hooks/journal.ts',
  'README.md',
  '.claude-plugin/plugin.json',
]

const targets = (Array.isArray(args) ? args : DEFAULT_TARGETS).filter(p => typeof p === 'string')

/** A path as a label token: `hooks/paint.ts` reads as `paint`. */
function keyOf(path) {
  return (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, '-')
}

const SURVEY = {
  type: 'object',
  properties: {
    lines: { type: 'number', description: 'How many lines the file has, from wc -l' },
    kind: {
      type: 'string',
      description: "Exactly 'code' if the file is source the machine runs, exactly 'prose' if it is documentation or configuration a person reads",
    },
    headline: { type: 'string', description: 'One sentence saying what this file is for, under twenty words' },
    churn: { type: 'string', description: 'Under ten words on how recently and how often it has changed' },
  },
  required: ['lines', 'kind', 'headline', 'churn'],
}

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      description: 'What is wrong with this file. Empty when nothing is.',
      items: {
        type: 'object',
        properties: {
          line: { type: 'number', description: 'The line the problem is on' },
          claim: { type: 'string', description: 'One sentence saying what is wrong' },
          why: { type: 'string', description: 'The input or state that makes it go wrong' },
          severity: {
            type: 'string',
            description: "Exactly 'blocking' if it breaks the product, 'minor' otherwise",
          },
        },
        required: ['line', 'claim', 'why', 'severity'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean', description: 'True if the claim does not hold once you have read the code around it' },
    because: { type: 'string', description: 'One sentence, quoting the line that settles it' },
  },
  required: ['refuted', 'because'],
}

/** What names a finding, so the same one found twice is only counted once. */
function fingerprint(path, finding) {
  return `${path}:${finding.line}:${(finding.claim ?? '').slice(0, 40).toLowerCase()}`
}

// ── Survey, then the branch ─────────────────────────────────────────────────
// Every file is surveyed by the same cheap agent, and what that agent answers
// decides which phase the file goes to next. The two branches are declared
// phases of their own, and neither holds every file, so the pane draws two
// lanes of uneven width where a flat run would draw one.
const reviewed = await pipeline(
  targets,

  path =>
    agent(
      [
        `Survey the file ${path} in this repository. Do not change anything.`,
        `Run \`wc -l ${path}\` for its length and \`git log --oneline -3 -- ${path}\` for its churn, then read enough of the top of it to say what it is for.`,
        'Answer with the survey fields and nothing else.',
      ].join('\n'),
      { label: `survey:${keyOf(path)}`, phase: 'Survey', model: SCOUT, effort: 'low', schema: SURVEY },
    ).then(survey => ({ path, survey })),

  async ({ path, survey }) => {
    const key = keyOf(path)
    const isCode = survey?.kind === 'code'

    // ── The loop ────────────────────────────────────────────────────────────
    // One pass per lens, stopping the moment a pass turns up nothing the
    // earlier passes had not already said. The stop is decided by plain JS
    // against what came back, not by asking an agent whether it is done — an
    // agent asked that answers yes. A file that keeps yielding gets three
    // nodes in its lane; a clean one gets a single node and moves on.
    const seen = new Set()
    const found = []
    let passes = 0

    for (const lens of isCode ? LENSES : LENSES.slice(0, 1)) {
      passes++

      const pass = await agent(
        isCode
          ? [
              `Review ${path} in this repository. Read it, and grep for the callers of anything you suspect.`,
              lens.ask,
              found.length === 0
                ? ''
                : `An earlier pass already reported these; do not report them again:\n${found.map(f => `- line ${f.line}: ${f.claim}`).join('\n')}`,
              'Report only what you can point at a line for. An empty list is the right answer for a file that is fine.',
            ]
              .filter(Boolean)
              .join('\n\n')
          : [
              `Check ${path} in this repository against the code it describes.`,
              'Read it, then grep the source for each concrete thing it names — a file path, a function, a setting, a default value, a key binding.',
              'Report every claim the code does not back: a setting that no longer exists, a default that has changed, a path that has moved, a behaviour described that the code does not have.',
              'Report only what you can point at a line of the text for.',
            ].join('\n\n'),
        {
          label: isCode ? `review:${key}:${lens.key}` : `check:${key}`,
          phase: isCode ? 'Review' : 'Check',
          model: isCode ? READER : SCOUT,
          effort: isCode ? 'medium' : 'low',
          schema: FINDINGS,
        },
      )

      const fresh = (pass?.findings ?? []).filter(f => !seen.has(fingerprint(path, f)))

      for (const f of fresh) {
        seen.add(fingerprint(path, f))
        found.push(f)
      }

      // Nothing new this pass, so another pass of the same file is an agent
      // spent to be told the same thing again.
      if (fresh.length === 0 || passes >= MAX_PASSES) {
        break
      }
    }

    log(`${path}: ${found.length} finding(s) in ${passes} pass(es)`)

    // ── The skip ────────────────────────────────────────────────────────────
    // A stage that throws drops its item to null and skips every stage after
    // it. A file nothing is wrong with has nothing to verify, so its chain
    // stops here — which the pane draws as a chain that reaches the Review
    // lane and goes no further.
    if (found.length === 0) {
      throw new Error(`${path} is clean: nothing to verify`)
    }

    return { path, key, survey, findings: found, passes }
  },
)

const files = reviewed.filter(Boolean)
const clean = targets.length - files.length
const flat = files.flatMap(file => file.findings.map(finding => ({ file, finding })))

log(`${flat.length} finding(s) across ${files.length} file(s); ${clean} file(s) clean and dropped before Verify`)

// ── Verify ──────────────────────────────────────────────────────────────────
// Every finding gets an agent whose job is to kill it, reading the code around
// the line rather than taking the claim's word for it. This is the phase that
// fills the pane: one node per finding, so its width is decided by what the
// review actually found.
phase('Verify')

const judged = await parallel(
  flat.map(({ file, finding }) => () =>
    agent(
      [
        `Try to refute this claim about ${file.path}, line ${finding.line}.`,
        `Claim: ${finding.claim}`,
        `Said to go wrong when: ${finding.why}`,
        '',
        `Read the lines around it — \`sed -n '${Math.max(1, finding.line - 25)},${finding.line + 25}p' ${file.path}\` — and grep for how the code is actually called.`,
        'Default to refuted when you cannot show the failure happening. A claim that needs a caller nobody writes is refuted.',
      ].join('\n'),
      {
        label: `verify:${file.key}:L${finding.line}`,
        phase: 'Verify',
        model: READER,
        effort: 'medium',
        schema: VERDICT,
      },
    ).then(verdict => ({ file, finding, verdict })),
  ),
)

const survived = judged.filter(Boolean).filter(j => j.verdict?.refuted === false)
const blocking = survived.filter(j => j.finding.severity === 'blocking')

log(`${survived.length} of ${flat.length} finding(s) survived; ${blocking.length} blocking`)

// ── The other kind of skip ──────────────────────────────────────────────────
// A declared phase nothing ever enters. Most audits refute everything blocking,
// so Escalate usually stays empty and the pane draws it as a phase that was
// never entered rather than one that failed.
let escalations = []

if (blocking.length === 0) {
  log('Escalate skipped: nothing survived as blocking')
} else {
  phase('Escalate')

  escalations = (
    await parallel(
      blocking.map(({ file, finding }) => () =>
        agent(
          [
            `A review of ${file.path} found this at line ${finding.line}, and an attempt to refute it failed.`,
            `Claim: ${finding.claim}`,
            `Goes wrong when: ${finding.why}`,
            '',
            'Read the file and say, in under eighty words: what breaks for a person using this, and the smallest change that fixes it. Do not write the patch.',
          ].join('\n'),
          { label: `escalate:${file.key}:L${finding.line}`, phase: 'Escalate', model: JUDGE, effort: 'high' },
        ).then(text => ({ file, finding, text })),
      ),
    )
  ).filter(Boolean)

  log(`${escalations.length} finding(s) escalated`)
}

// ── Report ──────────────────────────────────────────────────────────────────
// The closing agent is given the survey headlines verbatim as well as the
// verdicts, so its prompt quotes a phase four lanes back. That is an edge over
// more than one lane, which the pane bundles into a rail in the margin rather
// than threading a line through every band between.
phase('Report')

const surveyed = files
  .map(file => `${file.path} — ${file.survey?.headline ?? 'unsurveyed'} (${file.survey?.lines ?? '?'} lines, ${file.survey?.churn ?? 'unknown churn'})`)
  .join('\n')

const verdicts = survived.length === 0
  ? 'Nothing survived being refuted.'
  : survived
      .map(({ file, finding, verdict }) => `${file.path}:${finding.line} [${finding.severity}] ${finding.claim} — held because ${verdict.because}`)
      .join('\n')

return agent(
  [
    'Write the summary of a code review, for the person who owns this repository.',
    '',
    'What was surveyed:',
    surveyed,
    '',
    'What survived being refuted:',
    verdicts,
    escalations.length === 0 ? '' : `\nWhat was escalated:\n${escalations.map(e => `${e.file.path}:${e.finding.line} — ${e.text}`).join('\n')}`,
    '',
    `${clean} file(s) were dropped as clean before verification.`,
    '',
    'Open with one sentence saying whether this is shippable. Then list what to fix, worst first, one line each, path and line first. Say plainly if there is nothing to fix. Under two hundred words.',
  ]
    .filter(Boolean)
    .join('\n'),
  { label: 'report', phase: 'Report', model: JUDGE, effort: 'medium' },
)
