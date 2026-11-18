// codegraph: feature link-working-copy in workspace
// codegraph: uses projects, repo, machine
import { askForFolder } from '../modules/machine/index.js'
import { findProject, placeWorkingCopy, type Linked } from '../modules/projects/index.js'
import { folderName, isRepo, isSetUp, readSoftwareSystem, sameRemote } from '../modules/repo/index.js'

/** Makes a folder on this computer the working copy of a repo already on the
 *  project: one linked on another computer, or whose folder has gone. The
 *  folder must be that repo, by its GitHub address, so a different repo is
 *  never linked in its place. Only this computer hears of it. */
export const linkWorkingCopy = async (projectId: string, systemId: string, path?: string): Promise<Linked> => {
  const system = findProject(projectId)?.systems.find((s) => s.id === systemId)
  if (!system) return { ok: false, problem: 'That repo is not on this project any more.' }
  const folder = path && path.length > 0 ? path : await askForFolder({ title: `Pick the working copy of ${system.name}`, button: 'Link this folder' })
  if (!folder) return { ok: false, cancelled: true }

  if (!isRepo(folder))
    return {
      ok: false,
      problem: `${folderName(folder)} is not tracked by git. Pick the folder that holds the .git folder.`,
    }
  const facts = await readSoftwareSystem(folder)
  if (system.remote && !sameRemote(facts.remote, system.remote))
    return {
      ok: false,
      problem: `${folderName(folder)} is ${facts.remote ? `a working copy of ${facts.remote}` : 'not on GitHub'}, not of ${system.remote}. Pick a working copy of ${system.remote}, or clone it.`,
    }
  placeWorkingCopy(projectId, systemId, folder)
  return { ok: true, needsSetup: !isSetUp(facts) && !facts.setUpHere, name: system.name }
}
