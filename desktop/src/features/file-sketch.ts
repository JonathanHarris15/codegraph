// codegraph: feature file-sketch in workspace
// codegraph: uses sketches, sync
import { mayFileIn, readFolder, readSketch, writeSketch, type FolderDone } from '../modules/sketches/index.js'
import { sendSketch } from '../modules/sync/index.js'

/** Puts a sketch in a folder of its library, or at its top with ''. Filing it is
 *  not changing it, so when it was last changed stays as it was. */
export const fileSketch = async (library: string, sketchId: string, folderId: string): Promise<FolderDone> => {
  const sketch = readSketch(library, sketchId)
  if (!sketch) return { ok: false, problem: 'That sketch is not there any more.' }
  if (!mayFileIn(library)) return { ok: false, problem: 'You can only look at these sketches.' }
  if (folderId && !readFolder(library, folderId)) return { ok: false, problem: 'That folder is not there any more.' }
  const filed = { ...sketch, folderId }
  writeSketch(filed)
  await sendSketch(filed)
  return { ok: true }
}
