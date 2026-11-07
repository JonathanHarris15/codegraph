// codegraph: feature list-folders in workspace
// codegraph: uses sketches
import { listFolders as kept, SHARED_WITH_ME, tidyFolders, type SketchFolder } from '../modules/sketches/index.js'

export type { SketchFolder } from '../modules/sketches/index.js'

/** The folders of a sketch library, by name. What others shared has none here. */
export const listFolders = async (library: string): Promise<SketchFolder[]> => (library === SHARED_WITH_ME ? [] : tidyFolders(kept(library)))
