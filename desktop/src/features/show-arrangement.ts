// codegraph: feature show-arrangement in workspace
// codegraph: uses arrangements
import { readArrangement, type Arrangement } from '../modules/arrangements/index.js'

/** Where a person has moved the cards and sentences of a project's map. */
export const showArrangement = async (projectId: string): Promise<Arrangement> => readArrangement(projectId)
