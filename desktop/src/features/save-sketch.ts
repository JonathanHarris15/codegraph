// codegraph: feature save-sketch in workspace
// codegraph: uses projects, sketches, members, sync, together
import { may, roleOf, whoIsIn } from '../modules/members/index.js'
import { listProjects } from '../modules/projects/index.js'
import { LOOSE, readSketch, SHARED_WITH_ME, writeSketch, type Sketch } from '../modules/sketches/index.js'
import { sendSketch } from '../modules/sync/index.js'
import { mergeDoc } from '../modules/together/index.js'

/** Whether this person may change this sketch at all. */
const mayDraw = (sketch: Sketch): boolean => {
  const me = whoIsIn()
  if (sketch.projectId === LOOSE) return true
  if (sketch.projectId === SHARED_WITH_ME) {
    // Who may change it is what is kept here, not what the window says.
    const role = readSketch(SHARED_WITH_ME, sketch.id)?.members?.find((m) => m.id === me?.id)?.role
    return role === 'owner' || role === 'collaborator'
  }
  const project = listProjects().find((p) => p.id === sketch.projectId)
  if (!project) throw new Error('no project with that id')
  return may(roleOf(project, me?.id ?? ''), 'draw')
}

/** Keeps what a person has drawn, as they draw it. `seen` is the sketch as it
 *  last reached their window: anything others have changed since stays, so a
 *  person saving never undoes what they had not seen yet. */
export const saveSketch = async (sketch: Sketch, seen?: Sketch): Promise<Sketch> => {
  if (!mayDraw(sketch)) return readSketch(sketch.projectId, sketch.id) ?? sketch
  const now = readSketch(sketch.projectId, sketch.id)
  const merged = seen && now ? mergeDoc(seen, sketch, now) : sketch
  const saved = { ...merged, updatedAt: new Date().toISOString() }
  writeSketch(saved)
  await sendSketch(saved)
  return readSketch(saved.projectId, saved.id) ?? saved
}
