// codegraph: module projects
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyWorkspace, shortNameOf, type Project, type Workspace } from './schema.js'
import { keepWhole } from '../machine/index.js'

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
 *  software systems were kept under `codebases`, and it had no short name. */
type Stored = Omit<Project, 'systems' | 'shallow' | 'shortName'> & {
  systems?: Project['systems']
  codebases?: Project['systems']
  shallow?: Project['shallow']
  shortName?: string
}

const upgrade = ({ codebases, systems, shallow, shortName, ...project }: Stored): Project => ({
  ...project,
  shortName: shortName || shortNameOf(project.name),
  systems: systems ?? codebases ?? [],
  shallow: shallow ?? [],
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
  keepWhole(path, JSON.stringify(workspace, null, 2))
}

export const newId = (): string => randomUUID()
