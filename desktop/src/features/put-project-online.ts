// codegraph: feature put-project-online in workspace
// codegraph: uses projects, members, cloud, sync
import { isConnected } from '../modules/cloud/index.js'
import { whoIsIn, type Changed } from '../modules/members/index.js'
import { findProject, putOnline } from '../modules/projects/index.js'
import { sendEverything } from '../modules/sync/index.js'

/** Puts a project that is only on this computer online, with its sketches, notes
 *  and layouts, and whoever does so as its owner. The old files stay. */
export const putProjectOnline = async (projectId: string): Promise<Changed> => {
  const me = whoIsIn()
  const project = findProject(projectId)
  if (!isConnected() || !me) return { ok: false, problem: 'Sign in first.' }
  if (!project) return { ok: false, problem: 'That project is not on this computer.' }
  putOnline(projectId, me)
  await sendEverything(projectId)
  return { ok: true }
}
