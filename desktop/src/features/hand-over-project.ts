// codegraph: feature hand-over-project in workspace
// codegraph: uses members, projects, sync
import { iMay, whoIsIn, type Changed } from '../modules/members/index.js'
import { keepProject, listProjects } from '../modules/projects/index.js'
import { sendProject } from '../modules/sync/index.js'

/** Gives a project to another of its members. Nothing moves: it just points at a
 *  new owner (ADR 0016). The old owner stays on as a co-owner. */
export const handOverProject = async (projectId: string, memberId: string): Promise<Changed> => {
  const me = whoIsIn()
  const project = listProjects().find((p) => p.id === projectId)
  if (!me || !project?.online) return { ok: false, problem: 'That project is not online.' }
  if (!iMay(project, 'hand-over')) return { ok: false, problem: 'Only the owner can hand a project over.' }
  if (!project.members?.some((m) => m.id === memberId)) return { ok: false, problem: 'They need to be on the project first.' }
  keepProject({
    ...project,
    ownerId: memberId,
    members: project.members.map((m) => (m.id === memberId ? { ...m, role: 'owner' } : m.id === me.id ? { ...m, role: 'co-owner' } : m)),
  })
  await sendProject(projectId)
  return { ok: true }
}
