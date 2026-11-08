// codegraph: feature restore-revision in workspace
// codegraph: uses members, projects, sync
import { iMay, type Changed } from '../modules/members/index.js'
import { listProjects } from '../modules/projects/index.js'
import { restoreRevision as restore } from '../modules/sync/index.js'

/** Puts something back as a revision left it. That is a new revision of its own,
 *  so it can be gone back on. */
export const restoreRevision = async (projectId: string, revisionId: string): Promise<Changed> => {
  const project = listProjects().find((p) => p.id === projectId)
  if (!project || !iMay(project, 'draw')) return { ok: false, problem: 'Only someone who can edit this project can restore a version.' }
  return (await restore(projectId, revisionId)) ? { ok: true } : { ok: false, problem: 'That version could not be found.' }
}
