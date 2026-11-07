// codegraph: feature move-sketch in workspace
// codegraph: uses sketches, projects, members, sync
import { cpSync, existsSync } from 'node:fs'
import { may, roleOf, whoIsIn } from '../modules/members/index.js'
import { listProjects } from '../modules/projects/index.js'
import { LOOSE, readSketch, removeSketch, sketchesFolder, writeSketch } from '../modules/sketches/index.js'
import { sendSketch, sendUp, sketchPath } from '../modules/sync/index.js'
import type { Changed } from './invite-member.js'

/** Moves a loose sketch into a project's library, for all its members. Anyone it
 *  was shared with who is not on the project loses it. It only goes this way. */
export const moveSketch = async (sketchId: string, projectId: string): Promise<Changed> => {
  const sketch = readSketch(LOOSE, sketchId)
  const project = listProjects().find((p) => p.id === projectId)
  if (!sketch) return { ok: false, problem: 'That sketch is not in your own library.' }
  if (!project) return { ok: false, problem: 'That project is not on this computer.' }
  if (!may(roleOf(project, whoIsIn()?.id ?? ''), 'draw')) return { ok: false, problem: 'A viewer cannot add a sketch to this project.' }
  const wasOnline = sketchPath(sketch)
  const from = sketchesFolder(LOOSE, sketchId)
  const to = sketchesFolder(projectId, sketchId)
  if (existsSync(from)) cpSync(from, to, { recursive: true })
  const { ownerId: _o, members: _m, memberIds: _i, roles: _r, ...rest } = sketch
  // Its folder was in the library it left.
  const moved = { ...rest, projectId, folderId: '', updatedAt: new Date().toISOString() }
  writeSketch(moved)
  removeSketch(LOOSE, sketchId)
  if (wasOnline) await sendUp(wasOnline)
  await sendSketch(moved)
  return { ok: true }
}
