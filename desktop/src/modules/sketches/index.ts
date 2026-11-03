// codegraph: module sketches
// codegraph: front door useFolder, sketchesFolder, listSketches, newSketch, readSketch, writeSketch, removeSketch, keepMockup, mockupFile, mockupUrl, blankCard, Sketch, SketchCard, SketchWire, Note, Level, CardState
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import type { Sketch, SketchCard } from './schema.js'

export { blankCard } from './schema.js'
export type { CardState, Level, Note, Sketch, SketchCard, SketchWire } from './schema.js'

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

export type SketchListed = Pick<Sketch, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'from'>

export const listSketches = (projectId: string): SketchListed[] => {
  const where = projectFolder(projectId)
  if (!existsSync(where)) return []
  return readdirSync(where)
    .flatMap((id) => {
      const sketch = readSketch(projectId, id)
      return sketch ? [{ id, name: sketch.name, createdAt: sketch.createdAt, updatedAt: sketch.updatedAt, from: sketch.from }] : []
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

export const mockupFile = (projectId: string, sketchId: string, name: string): string =>
  join(sketchesFolder(projectId, sketchId), name)

const KINDS: Record<string, string> = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif', '.webp': 'webp' }

/** A mockup as a data URL, for a page to show; '' when it is not there. */
export const mockupUrl = (projectId: string, sketchId: string, name: string): string => {
  const file = mockupFile(projectId, sketchId, name)
  if (!name || !existsSync(file)) return ''
  return `data:image/${KINDS[extname(file).toLowerCase()] ?? 'png'};base64,${readFileSync(file).toString('base64')}`
}
