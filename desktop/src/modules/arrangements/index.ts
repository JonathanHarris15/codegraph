// codegraph: module arrangements
// codegraph: front door useFolder, readArrangement, writeArrangement, readArrangementFile, writeArrangementFile, arrangementKeys, removeArrangements, movedTo, forgetting, roomKey, Arrangement, ArrangementFile, Spot
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Arrangement } from './schema.js'

export { forgetting, movedTo, roomKey } from './schema.js'
export type { Arrangement, Spot } from './schema.js'

let folder = ''

/** The shell says where this computer keeps codegraph's files; tests say a
 *  temp folder. Arrangements are kept there, never in any
 *  repo: where a person likes the cards is not part of the code. */
export const useFolder = (where: string): void => {
  folder = where
}

const fileOf = (projectId: string, key: string): string => {
  if (!folder) throw new Error('arrangements: no folder chosen yet')
  return key ? join(folder, 'arrangements', projectId, `${encodeURIComponent(key)}.json`) : join(folder, 'arrangements', `${projectId}.json`)
}

/** What is known about one map's arrangement beside the spots themselves. */
export type ArrangementFile = {
  spots: Arrangement
  /** When someone last moved something here. */
  updatedAt?: string
  /** The commit first seen and last seen here, and the last one taken up by a
   *  merge, for telling when a branch has been merged. */
  from?: string
  head?: string
  merged?: string
}

/** The whole of what is kept for a project's map: one file for the project's
 *  top level, under no key, and one per software system's map, by its key
 *  (ADR 0019). Null when none has been kept. */
export const readArrangementFile = (projectId: string, key = ''): ArrangementFile | null => {
  try {
    const kept = JSON.parse(readFileSync(fileOf(projectId, key), 'utf8')) as ArrangementFile
    return Array.isArray(kept.spots) ? kept : null
  } catch {
    return null
  }
}

/** Where a person has put the things on a map; none until they have moved
 *  something. */
export const readArrangement = (projectId: string, key = ''): Arrangement => readArrangementFile(projectId, key)?.spots ?? []

/** Written to a neighbour first, then moved over, so a crash cannot shred it. */
export const writeArrangementFile = (projectId: string, kept: ArrangementFile, key = ''): void => {
  const file = fileOf(projectId, key)
  mkdirSync(dirname(file), { recursive: true })
  const beside = `${file}.${randomUUID().slice(0, 8)}`
  writeFileSync(beside, JSON.stringify(kept, null, 2), 'utf8')
  renameSync(beside, file)
}

export const writeArrangement = (projectId: string, spots: Arrangement, key = ''): void =>
  writeArrangementFile(projectId, { ...readArrangementFile(projectId, key), spots, updatedAt: new Date().toISOString() }, key)

/** The keys of every map of a project with an arrangement kept. */
export const arrangementKeys = (projectId: string): string[] => {
  if (!folder) throw new Error('arrangements: no folder chosen yet')
  const dir = join(folder, 'arrangements', projectId)
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => decodeURIComponent(n.slice(0, -5))) : []
}

export const removeArrangements = (projectId: string): void => {
  if (!folder) return
  rmSync(join(folder, 'arrangements', projectId), { recursive: true, force: true })
  rmSync(join(folder, 'arrangements', `${projectId}.json`), { force: true })
}
