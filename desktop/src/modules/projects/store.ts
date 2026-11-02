// codegraph: module projects
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { emptyWorkspace, type Project, type Workspace } from './schema.js'

let folder = ''

/** The shell says where this computer keeps the file; tests say a temp folder. */
export const useFolder = (where: string): void => {
  folder = where
}

const file = (): string => {
  if (!folder) throw new Error('projects: no folder chosen yet')
  return join(folder, 'projects.json')
}

/** A project as an older app may have written it: before version 2 its
 *  software systems were kept under `codebases`. */
type Stored = Omit<Project, 'systems'> & { systems?: Project['systems']; codebases?: Project['systems'] }

const upgrade = ({ codebases, systems, ...project }: Stored): Project => ({
  ...project,
  systems: systems ?? codebases ?? [],
})

export const read = (): Workspace => {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as { projects?: unknown }
    const projects = Array.isArray(raw.projects) ? (raw.projects as Stored[]) : []
    return { version: 2, projects: projects.map(upgrade) }
  } catch {
    return emptyWorkspace()
  }
}

/** Written to a neighbour first, then moved over, so a crash cannot shred it. */
export const write = (workspace: Workspace): void => {
  const path = file()
  mkdirSync(dirname(path), { recursive: true })
  const beside = path + '.' + randomUUID().slice(0, 8)
  writeFileSync(beside, JSON.stringify(workspace, null, 2), 'utf8')
  renameSync(beside, path)
}

export const newId = (): string => randomUUID()
