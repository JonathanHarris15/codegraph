// codegraph: feature delete-sketch in workspace
// codegraph: uses sketches
import { removeSketch } from '../modules/sketches/index.js'

/** Takes a sketch and its mockups out of the project's library. */
export const deleteSketch = async (projectId: string, sketchId: string): Promise<void> => {
  removeSketch(projectId, sketchId)
}
