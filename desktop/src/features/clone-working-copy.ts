// codegraph: feature clone-working-copy in workspace
// codegraph: uses projects, repo, machine, github
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { savedToken } from '../modules/github/index.js'
import { askForFolder } from '../modules/machine/index.js'
import { findProject, placeWorkingCopy, type Linked } from '../modules/projects/index.js'
import { cloneWorkingCopy as clone } from '../modules/repo/index.js'

/** Clones a repo on the project from GitHub into a folder the person picks,
 *  named for the repo, and links it as this computer's working copy. The
 *  picker opens where the project's other repos sit. */
export const cloneWorkingCopy = async (projectId: string, systemId: string): Promise<Linked> => {
  const project = findProject(projectId)
  const system = project?.systems.find((s) => s.id === systemId)
  if (!project || !system) return { ok: false, problem: 'That repo is not on this project any more.' }
  if (!system.remote) return { ok: false, problem: `${system.name} has no GitHub copy to clone.` }
  const beside = project.systems.find((s) => s.path && existsSync(s.path))?.path
  const parent = await askForFolder({
    title: `Pick the folder to clone ${system.remote} into`,
    button: 'Clone here',
    ...(beside ? { startAt: dirname(beside) } : {}),
  })
  if (!parent) return { ok: false, cancelled: true }

  const repoName = system.remote.split('/').pop() ?? system.name
  const into = join(parent, repoName)
  if (existsSync(into))
    return { ok: false, problem: `There is already a folder named ${repoName} there. If it is ${system.remote}, use Link folder instead.` }
  const reach = await clone(system.remote, into, savedToken())
  if (reach === 'offline') return { ok: false, problem: `Could not reach GitHub to clone ${system.remote}. Try again once you are online.` }
  if (reach === 'no-access')
    return { ok: false, problem: `GitHub would not hand over ${system.remote}. Check you are signed in as someone it lets into the repo.` }
  placeWorkingCopy(projectId, systemId, into)
  return { ok: true, name: system.name }
}
