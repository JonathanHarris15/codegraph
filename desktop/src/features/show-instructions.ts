// codegraph: feature show-instructions in workspace
// codegraph: uses instructions
import { defaultFor, editsOf, instructionsFor, topics, type Edit } from '../modules/instructions/index.js'

/** One topic of what codegraph tells an agent, as the settings page shows it:
 *  what the topic is for, the words in force now, the words codegraph ships
 *  with, and every edit a person has made to it. */
export type InstructionsView = {
  topic: string
  about: string
  /** What an agent asking now is told. */
  text: string
  /** The words codegraph ships with, always there to go back to. */
  byDefault: string
  edited: boolean
  /** Oldest first. */
  edits: Edit[]
}

export const showInstructions = async (): Promise<InstructionsView[]> =>
  topics().map(({ topic, about }) => {
    const text = instructionsFor(topic) ?? ''
    const byDefault = defaultFor(topic) ?? ''
    return { topic, about, text, byDefault, edited: text !== byDefault, edits: editsOf(topic) }
  })
