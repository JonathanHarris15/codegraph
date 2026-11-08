// codegraph: feature show-arrangement in workspace
// codegraph: uses arrangements, places, projects, sync, members
import type { Arrangement } from '../modules/arrangements/index.js'
import { iMay } from '../modules/members/index.js'
import { keyIsShared, mapsNow, readSpots, takeUpMerges } from '../modules/places/index.js'
import { listProjects } from '../modules/projects/index.js'
import type { Point } from '../modules/reader/index.js'
import { sendMap } from '../modules/sync/index.js'

/** Where people have moved the cards and sentences of a project's maps, as those
 *  maps stand. A map whose branch has been merged into it takes that up first. */
export const showArrangement = async (projectId: string, points: Record<string, Point> = {}): Promise<Arrangement> => {
  const project = listProjects().find((p) => p.id === projectId)
  if (!project) return []
  const maps = await mapsNow(project.systems, points)
  // Someone who cannot change a shared map leaves this to someone who can.
  const allowed = iMay(project, 'draw')
  for (const at of maps) if (allowed || !keyIsShared(at.key)) await sendMap(projectId, await takeUpMerges(projectId, at.folder, at, at.mainRef))
  return readSpots(projectId, maps)
}
