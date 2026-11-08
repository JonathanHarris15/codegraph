// codegraph: feature edit-instructions in workspace
// codegraph: uses instructions
import { keepEdit, type Edit } from '../modules/instructions/index.js'

/** Keeps a person's own words for one topic. From then on every agent that
 *  asks is told these instead of the ones codegraph ships with. Nothing is
 *  lost: the edit joins the topic's history, and the default is still there
 *  to put back (ADR 0022). */
export const editInstructions = async (topic: string, text: string): Promise<Edit | null> => keepEdit(topic, text)
