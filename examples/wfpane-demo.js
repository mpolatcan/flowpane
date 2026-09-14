export const meta = {
  name: 'wfpane-demo',
  description: 'A five-phase haiku run: gather, draft, critique, revise, assemble — shaped to show the pane in motion',
  phases: [
    { title: 'Gather', detail: 'three facts per topic', model: 'haiku' },
    { title: 'Draft', detail: 'a paragraph from the facts', model: 'haiku' },
    { title: 'Critique', detail: 'score each draft', model: 'haiku' },
    { title: 'Revise', detail: 'cut each draft to sixty words', model: 'haiku' },
    { title: 'Measure', detail: 'each agent counts its own words with a shell command', model: 'haiku' },
    { title: 'Assemble', detail: 'join the revisions', model: 'haiku' },
  ],
}

const MODEL = 'haiku'

const TOPICS = [
  { key: 'rivers', subject: 'the Nile' },
  { key: 'mountains', subject: 'Mount Everest' },
  { key: 'deserts', subject: 'the Sahara' },
  { key: 'reefs', subject: 'the Great Barrier Reef' },
  { key: 'forests', subject: 'the Amazon rainforest' },
]

const CRITIQUE = {
  type: 'object',
  properties: {
    score: { type: 'number', description: 'How good the draft is, 1 to 10' },
    weakness: { type: 'string', description: 'The single weakest thing about it, in under twelve words' },
  },
  required: ['score', 'weakness'],
}

// Each topic runs its own chain: a topic that finishes gathering starts drafting
// while another is still gathering, so the pane shows phases overlapping rather
// than marching in lockstep.
const revised = await pipeline(
  TOPICS,

  topic =>
    agent(
      `Write exactly three specific, verifiable facts about ${topic.subject}. One per line, no numbering, no preamble.`,
      { label: `gather:${topic.key}`, phase: 'Gather', model: MODEL, effort: 'low' },
    ),

  (facts, topic) =>
    agent(
      `Using only these facts, write one vivid 150-word paragraph about ${topic.subject}. Output the paragraph alone.\n\n${facts}`,
      { label: `draft:${topic.key}`, phase: 'Draft', model: MODEL, effort: 'low' },
    ),

  (draft, topic) =>
    agent(
      `Score this paragraph about ${topic.subject} and name its single weakest point.\n\n${draft}`,
      { label: `critique:${topic.key}`, phase: 'Critique', model: MODEL, effort: 'low', schema: CRITIQUE },
    ).then(verdict => ({ topic, draft, verdict })),

  (carried, topic) =>
    agent(
      `Rewrite this paragraph about ${topic.subject} in exactly 60 words, fixing this weakness: ${carried.verdict.weakness}. Output the rewrite alone.\n\n${carried.draft}`,
      { label: `revise:${topic.key}`, phase: 'Revise', model: MODEL, effort: 'low' },
    ).then(text => ({ topic: topic.key, score: carried.verdict.score, text })),
)

phase('Measure')

// This phase exists to put tool calls on the screen: every agent shells out, so
// the pane shows the tool it is running while it runs it.
const measured = await parallel(
  revised.filter(Boolean).map(r => () =>
    agent(
      `Run this exact command with the Bash tool and report only its output: echo ${JSON.stringify(r.text)} | wc -w`,
      { label: `measure:${r.topic}`, phase: 'Measure', model: MODEL, effort: 'low' },
    ),
  ),
)

log(`${measured.filter(Boolean).length} passages measured`)

const kept = revised.filter(Boolean)

log(`${kept.length}/${TOPICS.length} topics survived the pipeline`)

phase('Assemble')

return agent(
  `Write a two-sentence closing that ties these five passages together. Output the two sentences alone.\n\n${kept
    .map(r => `${r.topic} (scored ${r.score}): ${r.text}`)
    .join('\n\n')}`,
  { label: 'assemble', phase: 'Assemble', model: MODEL, effort: 'low' },
)
