// codegraph: feature save-arrangement in workspace
// codegraph: uses arrangements, places, projects, sync, together, members
import type { Arrangement } from '../modules/arrangements/index.js'
import { may, roleOf, whoIsIn } from '../modules/members/index.js'
import { keyIsShared, mapsNow, readSpots, writeSpots } from '../modules/places/index.js'
import { listProjects } from '../modules/projects/index.js'
import type { Point } from '../modules/reader/index.js'
import { sendMap } from '../modules/sync/index.js'
import { mergeItems } from '../modules/together/index.js'

/** Keeps where a person has put the cards and the wires' sentences of a project's
 *  maps, as those maps stand. What is not in it the map lays out itself. `seen` is
 *  what last reached the window, so saving keeps what others have moved since. A
 *  viewer may only move things on their own local maps. */
export const saveArrangement = async (projectId: string, arrangement: Arrangement, points: Record<string, Point> = {}, seen?: Arrangement): Promise<Arrangement> => {
  const project = listProjects().find((p) => p.id === projectId)
  if (!project) return arrangement
  const maps = await mapsNow(project.systems, points)
  const allowed = may(roleOf(project, whoIsIn()?.id ?? ''), 'draw')
  const now = readSpots(projectId, maps)
  const merged = seen ? mergeItems(seen, arrangement, now) : arrangement
  const kept = allowed ? merged : [...now.filter((spot) => !maps.some((m) => !keyIsShared(m.key) && spot.id.includes(`${m.systemId}/`))), ...merged.filter((spot) => maps.some((m) => !keyIsShared(m.key) && spot.id.includes(`${m.systemId}/`)))]
  await sendMap(projectId, writeSpots(projectId, maps, kept))
  return readSpots(projectId, maps)
}
