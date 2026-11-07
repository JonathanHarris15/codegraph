// codegraph: module annotations
// codegraph: front door useFolder, readAnnotations, writeAnnotations, hasAnnotations, annotationKeys, removeAnnotations, annotationWords, firstLayer, Annotation, AnnotationEnd, Layer, Pointer
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Layer } from './schema.js'

export { firstLayer } from './schema.js'
export { annotationWords } from './words.js'
export type { Annotation, AnnotationEnd, Layer, Pointer } from './schema.js'

let folder = ''

/** The shell, or the MCP, says where this computer keeps codegraph's files;
 *  tests say a temp folder. A map's annotations are kept there,
 *  never in any repo: they are notes about the code, not the code. */
export const useFolder = (where: string): void => {
  folder = where
}

const fileOf = (projectId: string, key: string): string => {
  if (!folder) throw new Error('annotations: no folder chosen yet')
  return key ? join(folder, 'annotations', projectId, `${encodeURIComponent(key)}.json`) : join(folder, 'annotations', `${projectId}.json`)
}

/** Whether notes have ever been kept for this map, as opposed to none yet. */
export const hasAnnotations = (projectId: string, key = ''): boolean => existsSync(fileOf(projectId, key))

/** The annotation layers over a map, one file for the project's top level,
 *  under no key, and one per software system's map, by its key (ADR 0019); none
 *  until some are drawn. */
export const readAnnotations = (projectId: string, key = ''): Layer[] => {
  try {
    const kept = JSON.parse(readFileSync(fileOf(projectId, key), 'utf8')) as { layers?: Layer[] }
    return Array.isArray(kept.layers) ? kept.layers : []
  } catch {
    return []
  }
}

/** Written to a neighbour first, then moved over, so a crash cannot shred it. */
export const writeAnnotations = (projectId: string, layers: Layer[], key = ''): void => {
  const file = fileOf(projectId, key)
  mkdirSync(dirname(file), { recursive: true })
  const beside = `${file}.${randomUUID().slice(0, 8)}`
  writeFileSync(beside, JSON.stringify({ layers }, null, 2), 'utf8')
  renameSync(beside, file)
}

/** The keys of every map of a project with notes kept. */
export const annotationKeys = (projectId: string): string[] => {
  if (!folder) throw new Error('annotations: no folder chosen yet')
  const dir = join(folder, 'annotations', projectId)
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => decodeURIComponent(n.slice(0, -5))) : []
}

export const removeAnnotations = (projectId: string): void => {
  if (!folder) return
  rmSync(join(folder, 'annotations', projectId), { recursive: true, force: true })
  rmSync(join(folder, 'annotations', `${projectId}.json`), { force: true })
}
