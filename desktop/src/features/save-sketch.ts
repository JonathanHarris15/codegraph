// codegraph: feature save-sketch in workspace
// codegraph: uses projects, sketches
import { listProjects } from '../modules/projects/index.js'
import { writeSketch, type Sketch } from '../modules/sketches/index.js'

/** Keeps what a person has drawn, as they draw it. */
export const saveSketch = async (sketch: Sketch): Promise<Sketch> => {
  if (!listProjects().some((p) => p.id === sketch.projectId)) throw new Error('no project with that id')
  const saved = { ...sketch, updatedAt: new Date().toISOString() }
  writeSketch(saved)
  return saved
}
