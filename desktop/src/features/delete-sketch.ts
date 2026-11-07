// codegraph: feature delete-sketch in workspace
// codegraph: uses sketches, sync
import { readSketch, removeSketch } from '../modules/sketches/index.js'
import { sendUp, sketchPath } from '../modules/sync/index.js'

/** Takes a sketch and its mockups out of its library, for everyone who has it. */
export const deleteSketch = async (projectId: string, sketchId: string): Promise<void> => {
  const sketch = readSketch(projectId, sketchId)
  removeSketch(projectId, sketchId)
  const path = sketch ? sketchPath(sketch) : ''
  if (path) await sendUp(path)
}
