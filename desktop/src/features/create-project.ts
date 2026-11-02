// codegraph: feature create-project in workspace
// codegraph: uses projects
import { addProject } from '../modules/projects/index.js'

/** Starts an empty project and hands back its id, so the page can open it
 *  and ask for the first codebase. */
export const createProject = async (name: string): Promise<{ id: string }> => ({
  id: addProject(name).id,
})
