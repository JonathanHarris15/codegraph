// codegraph: feature rename-on-map in workspace
// codegraph: uses projects, sync, members
import { iMay } from '../modules/members/index.js'
import { findProject, renameDrawn } from '../modules/projects/index.js'
import { sendProject } from '../modules/sync/index.js'

/** Renames a person or a shallow software system on a project's map. What the
 *  code reads is named in the code, so nothing else is renamed here. */
export const renameOnMap = async (projectId: string, id: string, name: string): Promise<void> => {
  const project = findProject(projectId)
  if (!project || !iMay(project, 'draw')) return
  renameDrawn(projectId, id, name)
  await sendProject(projectId)
}
