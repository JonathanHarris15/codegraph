// codegraph: module annotations
// codegraph: front door useFolder, readAnnotations, writeAnnotations, annotationWords, firstLayer, Annotation, AnnotationEnd, Layer
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Layer } from './schema.js'

export { firstLayer } from './schema.js'
export { annotationWords } from './words.js'
export type { Annotation, AnnotationEnd, Layer } from './schema.js'

let folder = ''

/** The shell, or the MCP, says where this computer keeps codegraph's files;
 *  tests say a temp folder. A project's map annotations are one file there,
 *  never in any repo: they are notes about the code, not the code. */
export const useFolder = (where: string): void => {
  folder = where
}

const fileOf = (projectId: string): string => {
  if (!folder) throw new Error('annotations: no folder chosen yet')
  return join(folder, 'annotations', `${projectId}.json`)
}

/** The annotation layers over a project's map; none until some are drawn. */
export const readAnnotations = (projectId: string): Layer[] => {
  try {
    const kept = JSON.parse(readFileSync(fileOf(projectId), 'utf8')) as { layers?: Layer[] }
    return Array.isArray(kept.layers) ? kept.layers : []
  } catch {
    return []
  }
}

/** Written to a neighbour first, then moved over, so a crash cannot shred it. */
export const writeAnnotations = (projectId: string, layers: Layer[]): void => {
  const file = fileOf(projectId)
  mkdirSync(dirname(file), { recursive: true })
  const beside = `${file}.${randomUUID().slice(0, 8)}`
  writeFileSync(beside, JSON.stringify({ layers }, null, 2), 'utf8')
  renameSync(beside, file)
}
