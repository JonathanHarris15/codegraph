// codegraph: feature create-project in workspace
// codegraph: uses projects
import { addProject } from '../modules/projects/index.js'

/** Starts an empty project and hands back its id, so the page can open it
 *  and ask for the first software system. Its short name, what its repos call
 *  it, comes from its name unless one is given. */
export const createProject = async (name: string, shortName = ''): Promise<{ id: string }> => ({
  id: addProject(name, shortName).id,
})
