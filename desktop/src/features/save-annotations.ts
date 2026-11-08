// codegraph: feature save-annotations in workspace
// codegraph: uses annotations, places, projects, sync, together, members
import { type Layer } from '../modules/annotations/index.js'
import { iMay } from '../modules/members/index.js'
import { mapsNow, onLocalMap, readLayers, writeLayers } from '../modules/places/index.js'
import { findProject } from '../modules/projects/index.js'
import type { Point } from '../modules/reader/index.js'
import { sendMap } from '../modules/sync/index.js'
import { mergeItems } from '../modules/together/index.js'

/** Keeps the annotation layers drawn over a project's maps, as those maps stand.
 *  `seen` is what last reached the window, so saving keeps what others have added
 *  since. A viewer may only keep notes on their own local maps. */
export const saveAnnotations = async (projectId: string, layers: Layer[], points: Record<string, Point> = {}, seen?: Layer[]): Promise<Layer[]> => {
  const project = findProject(projectId)
  if (!project) return layers
  const maps = await mapsNow(project.systems, points)
  const allowed = iMay(project, 'draw')
  const now = readLayers(projectId, maps)
  const merged = seen ? mergeItems(seen, layers, now) : layers
  const kept = allowed
    ? merged
    : now.map((layer) => ({
        ...layer,
        items: [
          ...layer.items.filter((item) => !onLocalMap(item.at, maps)),
          ...(merged.find((l) => l.id === layer.id)?.items.filter((item) => onLocalMap(item.at, maps)) ?? []),
        ],
      }))
  await sendMap(projectId, writeLayers(projectId, maps, kept))
  return readLayers(projectId, maps)
}
