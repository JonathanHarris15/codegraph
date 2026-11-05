// codegraph: feature show-annotations in workspace
// codegraph: uses annotations
import { readAnnotations, type Layer } from '../modules/annotations/index.js'

/** The annotation layers drawn over a project's map. */
export const showAnnotations = async (projectId: string): Promise<Layer[]> => readAnnotations(projectId)
