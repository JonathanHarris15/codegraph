// codegraph: feature move-folder in workspace
// codegraph: uses sketches, sync
import { listFolders, mayFileIn, readFolder, tidyFolders, writeFolder, type FolderDone } from '../modules/sketches/index.js'
import { sendFolder } from '../modules/sync/index.js'

/** Puts a folder inside another, or at the top with ''. Never inside itself, or
 *  inside a folder of its own. */
export const moveFolder = async (library: string, id: string, parentId: string): Promise<FolderDone> => {
  const folder = readFolder(library, id)
  if (!folder) return { ok: false, problem: 'That folder is not there any more.' }
  if (!mayFileIn(library)) return { ok: false, problem: 'You can only look at these sketches.' }
  const all = tidyFolders(listFolders(library))
  if (parentId && !all.some((f) => f.id === parentId)) return { ok: false, problem: 'That folder is not there any more.' }
  for (let at = parentId; at; at = all.find((f) => f.id === at)?.parentId ?? '')
    if (at === id) return { ok: false, problem: 'A folder cannot go inside itself.' }
  const moved = { ...folder, parentId }
  writeFolder(moved)
  await sendFolder(library, id)
  return { ok: true, folder: moved }
}
