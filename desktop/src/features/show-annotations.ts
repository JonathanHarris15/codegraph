// codegraph: feature show-annotations in workspace
// codegraph: uses annotations, places, projects, reader, sync
import type { Layer } from '../modules/annotations/index.js'
import { readLayers } from '../modules/places/index.js'
import { findProject } from '../modules/projects/index.js'
import type { Point } from '../modules/reader/index.js'
import { settleMaps } from '../modules/sync/index.js'

/** The annotation layers drawn over a project's maps, as those maps stand. */
export const showAnnotations = async (projectId: string, points: Record<string, Point> = {}): Promise<Layer[]> => {
  const project = findProject(projectId)
  if (!project) return []
  return readLayers(projectId, await settleMaps(project, points))
}
