// codegraph: feature link-software-system in workspace
// codegraph: uses projects, repo, machine
import { askForFolder } from '../modules/machine/index.js'
import { addSoftwareSystem } from '../modules/projects/index.js'
import { folderName, isRepo, isSetUp, readSoftwareSystem } from '../modules/repo/index.js'

export type Linked = {
  ok: boolean
  /** The person closed the folder picker. */
  cancelled?: boolean
  /** Why it could not be linked, in words for the person. */
  problem?: string
  /** Linked, but codegraph is not turned on in it yet. */
  needsSetup?: boolean
  name?: string
}

/** Puts a repo already on this computer into a project. A folder git does
 *  not track is refused: a software system in a project is a tracked repo. */
export const linkSoftwareSystem = async (projectId: string, path?: string): Promise<Linked> => {
  const folder = path && path.length > 0 ? path : await askForFolder()
  if (!folder) return { ok: false, cancelled: true }

  if (!isRepo(folder)) {
    return {
      ok: false,
      problem:
        folderName(folder) +
        ' is not tracked by git. Run git init in it, or pick the folder that holds the .git folder.',
    }
  }

  const facts = await readSoftwareSystem(folder)
  const added = addSoftwareSystem(projectId, {
    name: folderName(folder),
    path: folder,
    remote: facts.remote,
  })
  return { ok: true, needsSetup: !isSetUp(facts) && !facts.setUpHere, name: added.name }
}
