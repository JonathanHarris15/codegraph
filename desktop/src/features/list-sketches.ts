// codegraph: feature list-sketches in workspace
// codegraph: uses sketches
import { listSketches as kept, type Sketch } from '../modules/sketches/index.js'

export type SketchListed = Pick<Sketch, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'from'>

/** A project's sketch library, the latest changed first. */
export const listSketches = async (projectId: string): Promise<SketchListed[]> => kept(projectId)
