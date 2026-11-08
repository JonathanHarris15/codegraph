// codegraph: feature reset-instructions in workspace
// codegraph: uses instructions
import { putBackDefault, type Edit } from '../modules/instructions/index.js'

/** Puts the words codegraph ships with back in force for one topic. It is an
 *  edit like any other, so everything the person wrote stays in the history
 *  and can be put back again. */
export const resetInstructions = async (topic: string): Promise<Edit | null> => putBackDefault(topic)
