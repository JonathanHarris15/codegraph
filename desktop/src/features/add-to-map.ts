// codegraph: feature add-to-map in workspace
// codegraph: uses projects, sync, members
import { iMay } from '../modules/members/index.js'
import { addPerson, findProject, newShallowSystem } from '../modules/projects/index.js'
import { sendProject } from '../modules/sync/index.js'

/** What a person can put on a project's map themselves: no code says either is
 *  there, so it is drawn, not read. */
export type Addable = 'person' | 'shallow software system'

/** Puts someone who uses the software, or a software system the project has no
 *  repo for, on the project's map. */
export const addToMap = async (projectId: string, kind: Addable, name: string): Promise<{ id: string }> => {
  const project = findProject(projectId)
  if (!project || !iMay(project, 'draw')) return { id: '' }
  const added = kind === 'person' ? addPerson(projectId, name) : newShallowSystem(projectId, name)
  await sendProject(projectId)
  return { id: added.id }
}
