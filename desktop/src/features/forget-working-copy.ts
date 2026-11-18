// codegraph: feature forget-working-copy in workspace
// codegraph: uses projects, members
import type { Changed } from '../modules/members/index.js'
import { placeWorkingCopy } from '../modules/projects/index.js'

/** Unlinks this computer's folder from a repo on the project. The repo stays
 *  on the project, for this member and everyone else, with no working copy
 *  here; the folder itself is not touched. Anyone may, a viewer too. */
export const forgetWorkingCopy = async (projectId: string, systemId: string): Promise<Changed> =>
  placeWorkingCopy(projectId, systemId, '') ? { ok: true } : { ok: false, problem: 'That repo is not on this project any more.' }
