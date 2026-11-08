// codegraph: feature delete-project in workspace
// codegraph: uses members, projects, sync
import { iMay, type Changed } from '../modules/members/index.js'
import { findProject, removeProject } from '../modules/projects/index.js'
import { removeEverything } from '../modules/sync/index.js'

/** Deletes a project for everyone. Only its owner may. No repo is touched. */
export const deleteProject = async (projectId: string): Promise<Changed> => {
  const project = findProject(projectId)
  if (!project) return { ok: false, problem: 'That project is not on this computer.' }
  if (project.online && !iMay(project, 'delete')) return { ok: false, problem: 'Only the owner can delete a project.' }
  if (project.online) await removeEverything(projectId)
  removeProject(projectId)
  return { ok: true }
}
