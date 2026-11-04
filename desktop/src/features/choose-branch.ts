// codegraph: feature choose-branch in workspace
// codegraph: uses projects

import { chooseBranch as remember } from '../modules/projects/index.js'

/** Remembers which branch a software system's map opens on, from the
 *  projects page or the canvas. It does not touch the folder. */
export const chooseBranch = async (projectId: string, systemId: string, branch: string): Promise<void> => {
  remember(projectId, systemId, branch)
}
