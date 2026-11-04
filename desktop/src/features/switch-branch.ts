// codegraph: feature switch-branch in workspace
// codegraph: uses projects, repo
import { listProjects } from '../modules/projects/index.js'
import { switchBranch as moveTo } from '../modules/repo/index.js'

export type Switched = { ok: boolean; problem: string }

/** Moves a software system's folder onto the branch a person is looking
 *  at, so what they see is what they work on. */
export const switchBranch = async (projectId: string, systemId: string, branch: string): Promise<Switched> => {
  const system = listProjects()
    .find((p) => p.id === projectId)
    ?.systems.find((s) => s.id === systemId)
  if (!system?.path) return { ok: false, problem: 'That software system is not on this computer.' }
  const problem = await moveTo(system.path, branch)
  return { ok: problem === '', problem }
}
