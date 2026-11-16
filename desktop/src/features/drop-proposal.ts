// codegraph: feature drop-proposal in workspace
// codegraph: uses projects, reader, repo
import { listProjects } from '../modules/projects/index.js'
import { live, readMap } from '../modules/reader/index.js'
import { removeProposal } from '../modules/repo/index.js'

export type Dropped = { ok: boolean; problem: string }

/** Throws away the proposal in a software system's folder, for a person
 *  who no longer wants it built. The branch and its code stay; the change
 *  is left for them to commit. */
export const dropProposal = async (projectId: string, systemId: string): Promise<Dropped> => {
  const system = listProjects()
    .find((p) => p.id === projectId)
    ?.systems.find((s) => s.id === systemId)
  if (!system?.path) return { ok: false, problem: 'That software system is not on this computer.' }
  if (!(await readMap(system.path, live)).proposal)
    return { ok: false, problem: 'There is no proposal in this folder to throw away.' }
  removeProposal(system.path)
  return { ok: true, problem: '' }
}
