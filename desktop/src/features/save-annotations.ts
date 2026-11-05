// codegraph: feature save-annotations in workspace
// codegraph: uses annotations
import { writeAnnotations, type Layer } from '../modules/annotations/index.js'

/** Keeps the annotation layers drawn over a project's map. */
export const saveAnnotations = async (projectId: string, layers: Layer[]): Promise<void> =>
  writeAnnotations(projectId, layers)
