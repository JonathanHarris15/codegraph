// codegraph: feature show-annotations in workspace
// codegraph: uses places, projects, sync
import type { Layer } from '../modules/annotations/index.js'
import { mapsNow, readLayers, takeUpMerges } from '../modules/places/index.js'
import { listProjects } from '../modules/projects/index.js'
import type { Point } from '../modules/reader/index.js'
import { sendMap } from '../modules/sync/index.js'

/** The annotation layers drawn over a project's maps, as those maps stand. */
export const showAnnotations = async (projectId: string, points: Record<string, Point> = {}): Promise<Layer[]> => {
  const project = listProjects().find((p) => p.id === projectId)
  if (!project) return []
  const maps = await mapsNow(project.systems, points)
  for (const at of maps) await sendMap(projectId, await takeUpMerges(projectId, at.folder, at, at.mainRef))
  return readLayers(projectId, maps)
}
