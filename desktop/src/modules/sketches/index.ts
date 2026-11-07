// codegraph: module sketches
// codegraph: front door LOOSE, SHARED_WITH_ME, keepMockupBytes, useFolder, sketchesFolder, listSketches, newSketch, readSketch, writeSketch, removeSketch, listFolders, newFolder, readFolder, writeFolder, removeFolder, tidyFolders, withNotesAsAnnotations, keepMockup, mockupFile, mockupUrl, blankCard, hubOf, isHub, looksDrawn, wireOfHub, Sketch, SketchCard, SketchWire, Note, Level, CardState, CardLook, CardShape, SketchFolder
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import type { Sketch, SketchCard, SketchFolder } from './schema.js'

export { LOOSE, SHARED_WITH_ME, blankCard, hubOf, isHub, looksDrawn, wireOfHub } from './schema.js'
export type { CardLook, CardShape, CardState, Level, Note, Sketch, SketchCard, SketchFolder, SketchWire } from './schema.js'

let folder = ''

/** The shell says where this computer keeps codegraph's files; tests say a
 *  temp folder. Each sketch is a folder of its own under its project:
 *  sketch.json, and its mockups beside it as pictures. */
export const useFolder = (where: string): void => {
  folder = where
}

const projectFolder = (projectId: string): string => {
  if (!folder) throw new Error('sketches: no folder chosen yet')
  return join(folder, 'sketches', projectId)
}

/** Where one sketch's files live, so an agent can be pointed at them. */
export const sketchesFolder = (projectId: string, sketchId: string): string => join(projectFolder(projectId), sketchId)

const fileOf = (projectId: string, sketchId: string): string => join(sketchesFolder(projectId, sketchId), 'sketch.json')

export type SketchListed = Pick<Sketch, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'from' | 'folderId'>

export const listSketches = (projectId: string): SketchListed[] => {
  const where = projectFolder(projectId)
  if (!existsSync(where)) return []
  return readdirSync(where)
    .flatMap((id) => {
      const sketch = readSketch(projectId, id)
      return sketch ? [{ id, name: sketch.name, createdAt: sketch.createdAt, updatedAt: sketch.updatedAt, from: sketch.from, folderId: sketch.folderId ?? '' }] : []
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const newSketch = (projectId: string, name: string, root: SketchCard, from = ''): Sketch => {
  const now = new Date().toISOString()
  return { id: randomUUID(), projectId, name: name.trim() || 'Untitled sketch', createdAt: now, updatedAt: now, from, root }
}

export const readSketch = (projectId: string, sketchId: string): Sketch | null => {
  try {
    return JSON.parse(readFileSync(fileOf(projectId, sketchId), 'utf8')) as Sketch
  } catch {
    return null
  }
}

/** Written to a neighbour first, then moved over, so a crash cannot shred it. */
export const writeSketch = (sketch: Sketch): void => {
  const path = fileOf(sketch.projectId, sketch.id)
  mkdirSync(dirname(path), { recursive: true })
  const beside = path + '.' + randomUUID().slice(0, 8)
  writeFileSync(beside, JSON.stringify(sketch, null, 2), 'utf8')
  renameSync(beside, path)
}

/** Folders are kept apart from the sketches, one file each, under their library. */
const foldersOf = (library: string): string => {
  if (!folder) throw new Error('sketches: no folder chosen yet')
  return join(folder, 'sketch-folders', library)
}
const folderFile = (library: string, id: string): string => join(foldersOf(library), `${id}.json`)

export const newFolder = (library: string, name: string, parentId = ''): SketchFolder => ({
  id: randomUUID(),
  library,
  name: name.trim() || 'New folder',
  parentId,
  createdAt: new Date().toISOString(),
})

export const readFolder = (library: string, id: string): SketchFolder | null => {
  try {
    return JSON.parse(readFileSync(folderFile(library, id), 'utf8')) as SketchFolder
  } catch {
    return null
  }
}

export const writeFolder = (one: SketchFolder): void => {
  const path = folderFile(one.library, one.id)
  mkdirSync(dirname(path), { recursive: true })
  const beside = path + '.' + randomUUID().slice(0, 8)
  writeFileSync(beside, JSON.stringify(one, null, 2), 'utf8')
  renameSync(beside, path)
}

export const removeFolder = (library: string, id: string): void => {
  rmSync(folderFile(library, id), { force: true })
}

/** A library's folders, by name. */
export const listFolders = (library: string): SketchFolder[] => {
  const where = foldersOf(library)
  if (!existsSync(where)) return []
  return readdirSync(where)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      const one = readFolder(library, name.slice(0, -'.json'.length))
      return one ? [one] : []
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Two people moving folders at once, or one deleting a folder another is
 *  filing into, can leave a folder inside a folder that is gone, or inside
 *  itself. Such a folder is shown at the top, so nothing is ever out of reach. */
export const tidyFolders = (folders: SketchFolder[]): SketchFolder[] => {
  const byId = new Map(folders.map((f) => [f.id, byId_(f, folders)]))
  // A loop is broken where the walk up first comes back round.
  for (const start of byId.keys()) {
    const walked = new Set<string>()
    let at = byId.get(start)
    while (at && at.parentId) {
      walked.add(at.id)
      const up = byId.get(at.parentId)
      if (!up) break
      if (walked.has(up.id)) {
        byId.set(at.id, { ...at, parentId: '' })
        break
      }
      at = up
    }
  }
  return [...byId.values()]
}

/** A folder whose parent is gone sits at the top. */
const byId_ = (one: SketchFolder, all: SketchFolder[]): SketchFolder =>
  one.parentId && !all.some((f) => f.id === one.parentId) ? { ...one, parentId: '' } : one

export const removeSketch = (projectId: string, sketchId: string): void => {
  rmSync(sketchesFolder(projectId, sketchId), { recursive: true, force: true })
}

/** Copies a picture in as a card's mockup and hands back its file name. */
export const keepMockup = (projectId: string, sketchId: string, cardId: string, picture: string): string => {
  const name = `${cardId}${extname(picture).toLowerCase() || '.png'}`
  mkdirSync(sketchesFolder(projectId, sketchId), { recursive: true })
  copyFileSync(picture, mockupFile(projectId, sketchId, name))
  return name
}

/** Puts a card's mockup in place from the online copy. */
export const keepMockupBytes = (projectId: string, sketchId: string, name: string, bytes: Buffer): void => {
  mkdirSync(sketchesFolder(projectId, sketchId), { recursive: true })
  writeFileSync(mockupFile(projectId, sketchId, name), bytes)
}

export const mockupFile = (projectId: string, sketchId: string, name: string): string =>
  join(sketchesFolder(projectId, sketchId), name)

const KINDS: Record<string, string> = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif', '.webp': 'webp' }

/** A mockup as a data URL, for a page to show; '' when it is not there. */
export const mockupUrl = (projectId: string, sketchId: string, name: string): string => {
  const file = mockupFile(projectId, sketchId, name)
  if (!name || !existsSync(file)) return ''
  return `data:image/${KINDS[extname(file).toLowerCase()] ?? 'png'};base64,${readFileSync(file).toString('base64')}`
}

/** A sketch with the notes drawn on its levels before annotations existed
 *  turned into sticky notes on a layer of their own, where they now live. */
export const withNotesAsAnnotations = (sketch: Sketch): Sketch => {
  const items: NonNullable<Sketch['layers']>[number]['items'] = []
  const strip = (card: SketchCard): SketchCard => {
    for (const note of card.notes ?? [])
      items.push({ id: note.id, at: card.id, kind: 'sticky', x: note.x, y: note.y, w: 180, h: 110, text: note.text, color: 'yellow' })
    return { ...card, notes: [], children: card.children.map(strip) }
  }
  const root = strip(sketch.root)
  if (!items.length) return sketch
  const layers = sketch.layers ?? []
  const kept = layers.find((l) => l.name === 'Notes')
  return {
    ...sketch,
    root,
    layers: kept
      ? layers.map((l) => (l === kept ? { ...l, items: [...l.items, ...items] } : l))
      : [...layers, { id: `notes-${sketch.id.slice(0, 8)}`, name: 'Notes', shown: true, snaps: true, items }],
  }
}
