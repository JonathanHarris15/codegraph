// codegraph: feature rename-folder in workspace
// codegraph: uses sketches, sync
import { mayFileIn, readFolder, writeFolder, type FolderDone } from '../modules/sketches/index.js'
import { sendFolder } from '../modules/sync/index.js'

/** Gives a folder of sketches a new name. */
export const renameFolder = async (library: string, id: string, name: string): Promise<FolderDone> => {
  const folder = readFolder(library, id)
  if (!folder) return { ok: false, problem: 'That folder is not there any more.' }
  if (!mayFileIn(library)) return { ok: false, problem: 'You can only look at these sketches.' }
  if (!name.trim()) return { ok: false, problem: 'Give it a name.' }
  const renamed = { ...folder, name: name.trim() }
  writeFolder(renamed)
  await sendFolder(library, id)
  return { ok: true, folder: renamed }
}
