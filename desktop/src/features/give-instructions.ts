// codegraph: feature give-instructions in agent
// codegraph: uses instructions
// codegraph: command instructions
import { instructionsFor, topics } from '../modules/instructions/index.js'

/** What codegraph tells an agent about one topic, or the list of topics
 *  when it asks for one there is none of. */
export const giveInstructions = (topic: string): string =>
  instructionsFor(topic) ??
  [
    topic ? `There are no instructions on "${topic}". These are the topics:` : 'These are the topics:',
    ...topics().map((t) => `- ${t.topic}: ${t.about}`),
  ].join('\n')
