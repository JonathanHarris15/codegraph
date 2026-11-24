// codegraph: feature commit-ontology in workspace
// codegraph: uses projects, repo
import { findProject } from '../modules/projects/index.js'
import { commitFolder } from '../modules/repo/index.js'

export type Committed = { ok: boolean; commit: string; problem: string }

/** Commits what changed in a repo's codegraph/ folder, and nothing else, on
 *  the branch the ontology map wrote it on. Pushing it is the person's. */
export const commitOntology = async (projectId: string, systemId: string, message: string): Promise<Committed> => {
  const system = findProject(projectId)?.systems.find((s) => s.id === systemId)
  if (!system?.path) return { ok: false, commit: '', problem: 'That repo is not on this computer.' }
  const commit = await commitFolder(system.path, 'codegraph', message.trim() || 'Change the ontology map')
  return commit ? { ok: true, commit, problem: '' } : { ok: false, commit: '', problem: 'Nothing in codegraph/ has changed since the last commit.' }
}
