// codegraph: feature change-role in workspace
// codegraph: uses members, projects, sync
import { iMay, whoIsIn, type Changed, type Role } from '../modules/members/index.js'
import { keepProject, listProjects } from '../modules/projects/index.js'
import { sendProject } from '../modules/sync/index.js'

/** Changes what a member may do on a project. The owner's role does not change
 *  here: that is handing over. */
export const changeRole = async (projectId: string, memberId: string, role: Exclude<Role, 'owner'>): Promise<Changed> => {
  const me = whoIsIn()
  const project = listProjects().find((p) => p.id === projectId)
  if (!me || !project?.online) return { ok: false, problem: 'That project is not online.' }
  if (!iMay(project, 'invite')) return { ok: false, problem: 'Only an owner or co-owner can change a role.' }
  if (project.ownerId === memberId) return { ok: false, problem: 'Hand the project over to change who owns it.' }
  keepProject({ ...project, members: project.members?.map((m) => (m.id === memberId ? { ...m, role } : m)) ?? [] })
  await sendProject(projectId)
  return { ok: true }
}
