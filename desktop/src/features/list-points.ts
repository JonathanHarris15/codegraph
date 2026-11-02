// codegraph: feature list-points in workspace
// codegraph: uses projects, reader
import { listProjects } from '../modules/projects/index.js'
import { listPoints as pointsIn, type Point } from '../modules/reader/index.js'

/** Where a person can look in one software system: its live folder, its
 *  branches and its latest commits. */
export const listPoints = async (projectId: string, systemId: string): Promise<Point[]> => {
  const system = listProjects()
    .find((p) => p.id === projectId)
    ?.systems.find((s) => s.id === systemId)
  return system ? pointsIn(system.path) : []
}
