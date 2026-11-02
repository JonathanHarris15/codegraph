// codegraph: module reader
// codegraph: front door readMap, listPoints, live, outsideId, Point, SystemMap, Component, Container, CodeFile, Wire, WireKind, ComponentKind
import { buildMap } from './build.js'
import type { Point, SystemMap } from './schema.js'
import { filesAt, pointsIn } from './source.js'

export { live, outsideId } from './schema.js'
export type { CodeFile, Component, ComponentKind, Container, Point, SystemMap, Wire, WireKind } from './schema.js'

/** A software system's map, read from its repo at one point (ADR 0003). */
export const readMap = async (repo: string, point: Point): Promise<SystemMap> =>
  buildMap(point, await filesAt(repo, point))

/** Where a person can look: the live folder, its branches, its latest commits. */
export const listPoints = (repo: string): Promise<Point[]> => pointsIn(repo)
