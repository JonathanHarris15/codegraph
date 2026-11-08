// codegraph: feature refresh-github in workspace
// codegraph: uses projects, repo, github
import { savedToken } from '../modules/github/index.js'
import { findProject } from '../modules/projects/index.js'
import { fetchMirror, fetchWorkingCopy } from '../modules/repo/index.js'

/** Asks GitHub what it has for a project's repos, so GitHub maps show branches
 *  that have moved on. Pulling and pushing stay with git. */
export const refreshGithub = async (projectId: string): Promise<void> => {
  const project = findProject(projectId)
  if (!project) return
  await Promise.all(
    project.systems.map(async (system) => {
      if (system.path) await fetchWorkingCopy(system.path)
      else if (system.remote) await fetchMirror(system.remote, savedToken(), true)
    }),
  )
}
