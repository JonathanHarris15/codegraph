// codegraph: feature delete-sketch in workspace
// codegraph: uses sketches, sync, members, projects
import { may, roleOf, whoIsIn } from '../modules/members/index.js'
import { listProjects } from '../modules/projects/index.js'
import { LOOSE, readSketch, removeSketch, SHARED_WITH_ME } from '../modules/sketches/index.js'
import { sendUp, sketchPath } from '../modules/sync/index.js'

/** Takes a sketch and its mockups out of its library, for everyone who has it. */
export const deleteSketch = async (projectId: string, sketchId: string): Promise<void> => {
  const sketch = readSketch(projectId, sketchId)
  const me = whoIsIn()?.id ?? ''
  // Someone else's shared sketch is theirs to delete, and a viewer deletes nothing.
  if (projectId === SHARED_WITH_ME) return
  if (projectId === LOOSE && sketch?.ownerId && sketch.ownerId !== me) return
  const project = listProjects().find((p) => p.id === projectId)
  if (project && !may(roleOf(project, me), 'draw')) return
  removeSketch(projectId, sketchId)
  const path = sketch ? sketchPath(sketch) : ''
  if (path) await sendUp(path)
}
