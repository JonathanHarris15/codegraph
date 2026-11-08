// codegraph: feature remove-member in workspace
// codegraph: uses members, projects, sync
import { iMay, whoIsIn, type Changed } from '../modules/members/index.js'
import { keepProject, listProjects } from '../modules/projects/index.js'
import { sendProject } from '../modules/sync/index.js'

/** Takes a member off a project; anyone may take themselves off, but the owner,
 *  who must hand it over first. */
export const removeMember = async (projectId: string, memberId: string): Promise<Changed> => {
  const me = whoIsIn()
  const project = listProjects().find((p) => p.id === projectId)
  if (!me || !project?.online) return { ok: false, problem: 'That project is not online.' }
  if (project.ownerId === memberId) return { ok: false, problem: 'Hand the project over before its owner can leave.' }
  if (memberId !== me.id && !iMay(project, 'invite')) return { ok: false, problem: 'Only an owner or co-owner can take someone off.' }
  keepProject({ ...project, members: project.members?.filter((m) => m.id !== memberId) ?? [] })
  await sendProject(projectId)
  return { ok: true }
}
