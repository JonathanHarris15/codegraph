// codegraph: feature remove-from-map in workspace
// codegraph: uses projects, sync, members
import { iMay } from '../modules/members/index.js'
import { findProject, removeDrawn } from '../modules/projects/index.js'
import { sendProject } from '../modules/sync/index.js'

/** Takes a person or a shallow software system off a project's map. A shallow
 *  one the code still calls comes back as a suggestion, since the code says it
 *  is there; a software system with a repo is unlinked, not removed here. */
export const removeFromMap = async (projectId: string, id: string): Promise<void> => {
  const project = findProject(projectId)
  if (!project || !iMay(project, 'draw')) return
  if (removeDrawn(projectId, id)) await sendProject(projectId)
}
