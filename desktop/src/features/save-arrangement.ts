// codegraph: feature save-arrangement in workspace
// codegraph: uses arrangements
import { writeArrangement, type Arrangement } from '../modules/arrangements/index.js'

/** Keeps where a person has put the cards and the wires' sentences of a
 *  project's map. What is not in it the map lays out itself. */
export const saveArrangement = async (projectId: string, arrangement: Arrangement): Promise<void> =>
  writeArrangement(projectId, arrangement)
