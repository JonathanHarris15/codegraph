// codegraph: feature make-folder in workspace
// codegraph: uses sketches, projects, members, sync
import { may, roleOf, whoIsIn } from '../modules/members/index.js'
import { listProjects } from '../modules/projects/index.js'
import { LOOSE, newFolder, readFolder, writeFolder, type SketchFolder } from '../modules/sketches/index.js'
import { sendFolder } from '../modules/sync/index.js'

export type FolderDone = { ok: boolean; folder?: SketchFolder; problem?: string }

/** Whether this person may change the folders of a library: their own always,
 *  a project's unless they only view it, and never what others shared with them. */
export const mayFileIn = (library: string): boolean => {
  if (library === LOOSE) return true
  const project = listProjects().find((p) => p.id === library)
  return Boolean(project && may(roleOf(project, whoIsIn()?.id ?? ''), 'draw'))
}

/** Makes a folder in a sketch library, at its top or inside another folder. */
export const makeFolder = async (library: string, name: string, parentId = ''): Promise<FolderDone> => {
  if (!mayFileIn(library)) return { ok: false, problem: 'You can only look at these sketches.' }
  if (parentId && !readFolder(library, parentId)) return { ok: false, problem: 'That folder is not there any more.' }
  const folder = newFolder(library, name, parentId)
  writeFolder(folder)
  await sendFolder(library, folder.id)
  return { ok: true, folder }
}
