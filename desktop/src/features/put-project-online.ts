// codegraph: feature put-project-online in workspace
// codegraph: uses projects, members, cloud, sync
import { isConnected } from '../modules/cloud/index.js'
import { whoIsIn } from '../modules/members/index.js'
import { keepProject, listProjects } from '../modules/projects/index.js'
import { sendEverything } from '../modules/sync/index.js'

/** Puts a project that is only on this computer online, with its sketches, notes
 *  and layouts, and whoever does so as its owner. The old files stay. */
export const putProjectOnline = async (projectId: string): Promise<{ ok: boolean; problem?: string }> => {
  const me = whoIsIn()
  const project = listProjects().find((p) => p.id === projectId)
  if (!isConnected() || !me) return { ok: false, problem: 'Sign in first.' }
  if (!project) return { ok: false, problem: 'That project is not on this computer.' }
  if (!project.online) keepProject({ ...project, online: true, ownerId: me.id, members: [{ ...me, role: 'owner' }] })
  await sendEverything(projectId)
  return { ok: true }
}
