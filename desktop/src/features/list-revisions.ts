// codegraph: feature list-revisions in workspace
// codegraph: uses sync
import { listRevisions as listed, type Revision } from '../modules/sync/index.js'

export type { Revision } from '../modules/sync/index.js'

/** A project's history, newest first: who changed what, and when. */
export const listRevisions = async (projectId: string): Promise<Revision[]> => listed(projectId)
