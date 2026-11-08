// codegraph: module card-types
// codegraph: front door useFolder, readCardTypes, writeCardTypes, rememberLooks, CardType
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CardType } from './schema.js'
import { keepWhole } from '../machine/index.js'

export type { CardType } from './schema.js'

let folder = ''

/** The shell says where this computer keeps codegraph's files; tests say a
 *  temp folder. A person's card types are one file there, for every project,
 *  since how they like to draw goes with them. */
export const useFolder = (where: string): void => {
  folder = where
}

const fileOf = (): string => {
  if (!folder) throw new Error('card types: no folder chosen yet')
  return join(folder, 'card-types.json')
}

/** The types a person has saved; none until they save one. */
export const readCardTypes = (): CardType[] => {
  try {
    const kept = JSON.parse(readFileSync(fileOf(), 'utf8')) as { types?: CardType[] }
    return Array.isArray(kept.types) ? kept.types : []
  } catch {
    return []
  }
}

/** Keeps the look of any type about to go into the code that is not saved yet,
 *  so it is drawn the same once it is read back. A saved type stays as it is. */
export const rememberLooks = (drawn: { name: string; icon: string; shape: CardType['shape']; color: string }[]): void => {
  const kept = readCardTypes()
  const added: CardType[] = []
  for (const type of drawn)
    if (type.name && ![...kept, ...added].some((one) => one.name === type.name)) added.push({ id: randomUUID(), ...type })
  if (added.length) writeCardTypes([...kept, ...added])
}

/** Written to a neighbour first, then moved over, so a crash cannot shred it. */
export const writeCardTypes = (types: CardType[]): void => {
  const file = fileOf()
  keepWhole(file, JSON.stringify({ types }, null, 2))
}
