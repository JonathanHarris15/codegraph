// codegraph: feature show-arrangement in workspace
// codegraph: uses arrangements, places, projects, reader, sync
import type { Arrangement } from '../modules/arrangements/index.js'
import { readSpots } from '../modules/places/index.js'
import { findProject } from '../modules/projects/index.js'
import type { Point } from '../modules/reader/index.js'
import { settleMaps } from '../modules/sync/index.js'

/** Where people have moved the cards and sentences of a project's maps, as those
 *  maps stand. A map whose branch has been merged into it takes that up first. */
export const showArrangement = async (projectId: string, points: Record<string, Point> = {}): Promise<Arrangement> => {
  const project = findProject(projectId)
  if (!project) return []
  return readSpots(projectId, await settleMaps(project, points))
}
