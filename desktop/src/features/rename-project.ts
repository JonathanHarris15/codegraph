// codegraph: feature rename-project in workspace
// codegraph: uses members, projects, sync
import { iMay, type Changed } from '../modules/members/index.js'
import { listProjects, renameProject as rename } from '../modules/projects/index.js'
import { sendProject } from '../modules/sync/index.js'

/** Gives a project a new name, for everyone on it. Its short name stays, so no
 *  repo has to change. A viewer may not. */
export const renameProject = async (projectId: string, name: string): Promise<Changed> => {
  const project = listProjects().find((p) => p.id === projectId)
  if (!project) return { ok: false, problem: 'That project is not on this computer.' }
  if (!name.trim()) return { ok: false, problem: 'Give it a name.' }
  if (project.online && !iMay(project, 'rename')) return { ok: false, problem: 'A viewer cannot rename a project.' }
  rename(projectId, name)
  if (project.online) await sendProject(projectId)
  return { ok: true }
}
