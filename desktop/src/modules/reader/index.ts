// codegraph: module reader
// codegraph: front door readMap, listPoints, checkRepo, live, outsideId, Point, SystemMap, Component, Container, CodeFile, Wire, WireKind, ComponentKind, Mismatch
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMap, type Mismatch } from './build.js'
import { checkFiles } from './check.js'
import { live as liveFolder, type Point, type SystemMap } from './schema.js'
import { filesAt, pointsIn } from './source.js'

export { live, outsideId } from './schema.js'
export type { Mismatch } from './build.js'
export type { CodeFile, Component, ComponentKind, Container, Point, SystemMap, Wire, WireKind } from './schema.js'

/** Where a repo's UI tests leave a picture of each page they reach, named
 *  after the page. Not committed, so only the live folder has them. */
const SHOTS = 'codegraph-screenshots'

/** A software system's map, read from its repo at one point (ADR 0003). */
export const readMap = async (repo: string, point: Point): Promise<SystemMap> => {
  const map = buildMap(point, await filesAt(repo, point))
  if (point.kind === 'live')
    for (const page of map.components.filter((c) => c.kind === 'page')) {
      const file = join(repo, SHOTS, `${page.name}.png`)
      if (existsSync(file)) page.shot = `data:image/png;base64,${readFileSync(file).toString('base64')}`
    }
  return map
}

/** Where a person can look: the live folder, its branches, its latest commits. */
export const listPoints = (repo: string): Promise<Point[]> => pointsIn(repo)

/** Every place a repo's code does not fit its tags and config, read at one
 *  point: the live folder unless asked otherwise. */
export const checkRepo = async (repo: string, point: Point = liveFolder): Promise<Mismatch[]> =>
  checkFiles(await filesAt(repo, point), point)
