// codegraph: feature unlink-software-system in workspace
// codegraph: uses projects, members, sync
import { iMay, type Changed } from '../modules/members/index.js'
import { findProject, removeSoftwareSystem } from '../modules/projects/index.js'
import { sendProject } from '../modules/sync/index.js'

/** Takes a repo off a project, for every member. Whoever may add a repo may
 *  take one off. No folder and no code is touched; linking it again puts it
 *  back. */
export const unlinkSoftwareSystem = async (projectId: string, systemId: string): Promise<Changed> => {
  const project = findProject(projectId)
  if (!project?.systems.some((s) => s.id === systemId)) return { ok: false, problem: 'That repo is not on this project any more.' }
  if (!iMay(project, 'add-repo')) return { ok: false, problem: 'A viewer cannot take a repo off this project.' }
  removeSoftwareSystem(projectId, systemId)
  await sendProject(projectId)
  return { ok: true }
}
