// codegraph: module arrangements
// codegraph: front door useFolder, readArrangement, writeArrangement, movedTo, forgetting, Arrangement, Spot
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Arrangement } from './schema.js'

export { forgetting, movedTo } from './schema.js'
export type { Arrangement, Spot } from './schema.js'

let folder = ''

/** The shell says where this computer keeps codegraph's files; tests say a
 *  temp folder. A project's arrangement is one file there, never in any
 *  repo: where a person likes the cards is not part of the code. */
export const useFolder = (where: string): void => {
  folder = where
}

const fileOf = (projectId: string): string => {
  if (!folder) throw new Error('arrangements: no folder chosen yet')
  return join(folder, 'arrangements', `${projectId}.json`)
}

/** Where a person has put the things on a project's map; none until they
 *  have moved something. */
export const readArrangement = (projectId: string): Arrangement => {
  try {
    const kept = JSON.parse(readFileSync(fileOf(projectId), 'utf8')) as { spots?: Arrangement }
    return Array.isArray(kept.spots) ? kept.spots : []
  } catch {
    return []
  }
}

/** Written to a neighbour first, then moved over, so a crash cannot shred it. */
export const writeArrangement = (projectId: string, spots: Arrangement): void => {
  const file = fileOf(projectId)
  mkdirSync(dirname(file), { recursive: true })
  const beside = `${file}.${randomUUID().slice(0, 8)}`
  writeFileSync(beside, JSON.stringify({ spots }, null, 2), 'utf8')
  renameSync(beside, file)
}
