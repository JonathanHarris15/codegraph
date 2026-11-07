// codegraph: feature copy-sketch in workspace
// codegraph: uses sketches, sync
import { randomUUID } from 'node:crypto'
import { cpSync, existsSync } from 'node:fs'
import { LOOSE, readSketch, sketchesFolder, writeSketch, type Sketch } from '../modules/sketches/index.js'
import { sendSketch } from '../modules/sync/index.js'

/** Copies a sketch to this member's own library: one shared with them, so it can
 *  be opened offline, or one from a project, to take further alone. */
export const copySketch = async (projectId: string, sketchId: string): Promise<Sketch | null> => {
  const sketch = readSketch(projectId, sketchId)
  if (!sketch) return null
  const { ownerId: _o, members: _m, memberIds: _i, roles: _r, ...rest } = sketch
  const now = new Date().toISOString()
  const copy: Sketch = { ...rest, id: randomUUID(), projectId: LOOSE, name: `${sketch.name} (copy)`, createdAt: now, updatedAt: now }
  const from = sketchesFolder(projectId, sketchId)
  if (existsSync(from)) cpSync(from, sketchesFolder(LOOSE, copy.id), { recursive: true })
  writeSketch(copy)
  await sendSketch(copy)
  return copy
}
