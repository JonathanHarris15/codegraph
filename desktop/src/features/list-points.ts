// codegraph: feature list-points in workspace
// codegraph: uses projects, reader, places
import { readingFolder } from '../modules/places/index.js'
import { listProjects } from '../modules/projects/index.js'
import { listPoints as pointsIn, type Point } from '../modules/reader/index.js'

/** Where a person can look in one software system: its GitHub branches and,
 *  with a working copy, its local ones and its live folder. */
export const listPoints = async (projectId: string, systemId: string): Promise<Point[]> => {
  const system = listProjects()
    .find((p) => p.id === projectId)
    ?.systems.find((s) => s.id === systemId)
  if (!system) return []
  const points = await pointsIn(readingFolder(system))
  // With no working copy, the only branches are GitHub's.
  return system.path ? points : points.filter((p) => p.kind !== 'live' && (p.kind !== 'branch' || p.where === 'cloud'))
}
