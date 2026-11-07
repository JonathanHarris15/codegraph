// codegraph: feature restore-revision in workspace
// codegraph: uses members, projects, sync
import { may, roleOf, whoIsIn } from '../modules/members/index.js'
import { listProjects } from '../modules/projects/index.js'
import { restoreRevision as restore } from '../modules/sync/index.js'
import type { Changed } from './invite-member.js'

/** Puts something back as a revision left it. That is a new revision of its own,
 *  so it can be gone back on. */
export const restoreRevision = async (projectId: string, revisionId: string): Promise<Changed> => {
  const me = whoIsIn()
  const project = listProjects().find((p) => p.id === projectId)
  if (!me || !project || !may(roleOf(project, me.id), 'draw')) return { ok: false, problem: 'Only someone who can edit this project can restore a version.' }
  return (await restore(projectId, revisionId)) ? { ok: true } : { ok: false, problem: 'That version could not be found.' }
}
