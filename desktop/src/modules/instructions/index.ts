// codegraph: module instructions
// codegraph: front door instructionsFor, topics, Topic
import proposals from './proposals.md?raw'
import setup from './setup.md?raw'
import tags from './tags.md?raw'
import workingHere from './working-here.md?raw'

/** Everything codegraph tells an agent lives here, and only here, so it is
 *  served the same way to whichever agent asks (ADR 0004). */
const texts = {
  setup: { about: 'How to set a repo up for codegraph, in one sweep', text: setup },
  tags: { about: 'The config, the tags and the words on wires, and what the check holds code to', text: tags },
  proposals: {
    about: 'What a proposal is, how to make one from a sketch, and how to build one until the check passes',
    text: proposals,
  },
  'working-here': {
    about: 'The block for a set-up repo\'s CLAUDE.md or AGENTS.md: how to work in it',
    text: workingHere,
  },
} as const

export type Topic = keyof typeof texts

export const topics = (): { topic: Topic; about: string }[] =>
  (Object.keys(texts) as Topic[]).map((topic) => ({ topic, about: texts[topic].about }))

export const instructionsFor = (topic: string): string | null =>
  topic in texts ? texts[topic as Topic].text : null
