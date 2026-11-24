// codegraph: feature give-instructions in agent
// codegraph: uses instructions, machine
// codegraph: command instructions
import { instructionsFor, SETUP, topics } from '../modules/instructions/index.js'
import { olderVersion } from '../modules/machine/index.js'

/** What codegraph tells an agent about one topic, or the list of topics
 *  when it asks for one there is none of. Skills older than the app are told
 *  so first, with how to update them (ADR 0037). Setup always ends with which
 *  setup it is, even in a person's own words for it, so a repo says which one
 *  it got (ADR 0039). */
export const giveInstructions = (topic: string, versions: { skills: string; app: string } = { skills: '', app: '' }): string => {
  const given = instructionsFor(topic)
  const said =
    (given !== null && topic === 'setup'
      ? `${given.trimEnd()}\n\nThis is setup ${SETUP}. Write \`"setup": "${SETUP}"\` into codegraph.config.json, so the app knows which setup this repo got.\n`
      : given) ??
    [
      topic ? `There are no instructions on "${topic}". These are the topics:` : 'These are the topics:',
      ...topics().map((t) => `- ${t.topic}: ${t.about}`),
    ].join('\n')
  return olderVersion(versions.skills, versions.app)
    ? `Your codegraph skills are ${versions.skills}, older than the codegraph app, which is ${versions.app}. Tell the person, and ask them to update it: \`claude plugin update codegraph-app@codegraph\` in a terminal, then a new session.\n\n${said}`
    : said
}
