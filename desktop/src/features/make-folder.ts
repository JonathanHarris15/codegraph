// codegraph: feature make-folder in workspace
// codegraph: uses sketches, sync
import { mayFileIn, newFolder, readFolder, writeFolder, type FolderDone } from '../modules/sketches/index.js'
import { sendFolder } from '../modules/sync/index.js'

/** Makes a folder in a sketch library, at its top or inside another folder. */
export const makeFolder = async (library: string, name: string, parentId = ''): Promise<FolderDone> => {
  if (!mayFileIn(library)) return { ok: false, problem: 'You can only look at these sketches.' }
  if (parentId && !readFolder(library, parentId)) return { ok: false, problem: 'That folder is not there any more.' }
  const folder = newFolder(library, name, parentId)
  writeFolder(folder)
  await sendFolder(library, folder.id)
  return { ok: true, folder }
}
