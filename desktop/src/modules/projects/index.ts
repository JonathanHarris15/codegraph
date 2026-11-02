// codegraph: module projects
// codegraph: front door useFolder, listProjects, addProject, renameProject, addSoftwareSystem, removeSoftwareSystem, knownRemotes, Project, SoftwareSystem, Workspace
import { type SoftwareSystem, type Project } from './schema.js'
import { newId, read, useFolder, write } from './store.js'

export { useFolder }
export type { SoftwareSystem, Project, Workspace } from './schema.js'

export const listProjects = (): Project[] => read().projects

export const addProject = (name: string): Project => {
  const workspace = read()
  const project: Project = {
    id: newId(),
    name: name.trim() || 'Untitled project',
    createdAt: new Date().toISOString(),
    systems: [],
  }
  workspace.projects.push(project)
  write(workspace)
  return project
}

export const renameProject = (id: string, name: string): void => {
  const workspace = read()
  const project = workspace.projects.find((p) => p.id === id)
  if (!project) throw new Error('no project with that id')
  project.name = name.trim() || project.name
  write(workspace)
}

export const addSoftwareSystem = (
  projectId: string,
  system: Omit<SoftwareSystem, 'id'>,
): SoftwareSystem => {
  const workspace = read()
  const project = workspace.projects.find((p) => p.id === projectId)
  if (!project) throw new Error('no project with that id')
  const already = project.systems.find(
    (c) => (system.path && c.path === system.path) || (system.remote && c.remote === system.remote),
  )
  if (already) return already
  const added: SoftwareSystem = { id: newId(), ...system }
  project.systems.push(added)
  write(workspace)
  return added
}

export const removeSoftwareSystem = (projectId: string, systemId: string): void => {
  const workspace = read()
  const project = workspace.projects.find((p) => p.id === projectId)
  if (!project) return
  project.systems = project.systems.filter((c) => c.id !== systemId)
  write(workspace)
}

/** Every GitHub repo this computer already has in a project, as owner/name. */
export const knownRemotes = (): string[] =>
  read()
    .projects.flatMap((p) => p.systems)
    .map((c) => c.remote)
    .filter((r) => r.length > 0)
