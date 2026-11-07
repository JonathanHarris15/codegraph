// codegraph: feature save-annotations in workspace
// codegraph: uses annotations, places, projects, sync, together, members
import { type Layer } from '../modules/annotations/index.js'
import { may, roleOf, whoIsIn } from '../modules/members/index.js'
import { keyIsShared, mapsNow, readLayers, writeLayers } from '../modules/places/index.js'
import { listProjects } from '../modules/projects/index.js'
import type { Point } from '../modules/reader/index.js'
import { sendMap } from '../modules/sync/index.js'
import { mergeItems } from '../modules/together/index.js'

/** Keeps the annotation layers drawn over a project's maps, as those maps stand.
 *  `seen` is what last reached the window, so saving keeps what others have added
 *  since. A viewer may only keep notes on their own local maps. */
export const saveAnnotations = async (projectId: string, layers: Layer[], points: Record<string, Point> = {}, seen?: Layer[]): Promise<Layer[]> => {
  const project = listProjects().find((p) => p.id === projectId)
  if (!project) return layers
  const maps = await mapsNow(project.systems, points)
  const allowed = may(roleOf(project, whoIsIn()?.id ?? ''), 'draw')
  const now = readLayers(projectId, maps)
  const merged = seen ? mergeItems(seen, layers, now) : layers
  const kept = allowed ? merged : merged.map((layer) => ({ ...layer, items: layer.items.filter((item) => maps.some((m) => !keyIsShared(m.key) && (item.at === m.systemId || item.at.startsWith(`${m.systemId}/`)))) }))
  await sendMap(projectId, writeLayers(projectId, maps, kept))
  return readLayers(projectId, maps)
}
