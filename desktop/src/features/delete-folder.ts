// codegraph: feature delete-folder in workspace
// codegraph: uses sketches, sync
import { listFolders, listSketches, readFolder, readSketch, removeFolder, tidyFolders, writeFolder, writeSketch } from '../modules/sketches/index.js'
import { sendFolder, sendSketch } from '../modules/sync/index.js'
import { mayFileIn, type FolderDone } from './make-folder.js'

/** Takes a folder away. What was in it, sketches and folders alike, moves up
 *  to where the folder was, so no sketch goes with it. */
export const deleteFolder = async (library: string, id: string): Promise<FolderDone> => {
  const folder = tidyFolders(listFolders(library)).find((f) => f.id === id)
  if (!folder || !readFolder(library, id)) return { ok: false, problem: 'That folder is not there any more.' }
  if (!mayFileIn(library)) return { ok: false, problem: 'You can only look at these sketches.' }
  for (const listed of listSketches(library).filter((s) => s.folderId === id)) {
    const sketch = readSketch(library, listed.id)
    if (!sketch) continue
    const moved = { ...sketch, folderId: folder.parentId }
    writeSketch(moved)
    await sendSketch(moved)
  }
  for (const child of listFolders(library).filter((f) => f.parentId === id)) {
    writeFolder({ ...child, parentId: folder.parentId })
    await sendFolder(library, child.id)
  }
  removeFolder(library, id)
  await sendFolder(library, id)
  return { ok: true }
}
