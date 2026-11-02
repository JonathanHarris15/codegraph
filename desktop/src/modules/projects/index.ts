// codegraph: module projects
// codegraph: front door useFolder, listProjects, addProject, renameProject, addCodebase, removeCodebase, knownRemotes, Project, Codebase, Workspace
import { type Codebase, type Project } from './schema.js'
import { newId, read, useFolder, write } from './store.js'

export { useFolder }
export type { Codebase, Project, Workspace } from './schema.js'

export const listProjects = (): Project[] => read().projects

export const addProject = (name: string): Project => {
  const workspace = read()
  const project: Project = {
    id: newId(),
    name: name.trim() || 'Untitled project',
    createdAt: new Date().toISOString(),
    codebases: [],
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

export const addCodebase = (
  projectId: string,
  codebase: Omit<Codebase, 'id'>,
): Codebase => {
  const workspace = read()
  const project = workspace.projects.find((p) => p.id === projectId)
  if (!project) throw new Error('no project with that id')
  const already = project.codebases.find(
    (c) => (codebase.path && c.path === codebase.path) || (codebase.remote && c.remote === codebase.remote),
  )
  if (already) return already
  const added: Codebase = { id: newId(), ...codebase }
  project.codebases.push(added)
  write(workspace)
  return added
}

export const removeCodebase = (projectId: string, codebaseId: string): void => {
  const workspace = read()
  const project = workspace.projects.find((p) => p.id === projectId)
  if (!project) return
  project.codebases = project.codebases.filter((c) => c.id !== codebaseId)
  write(workspace)
}

/** Every GitHub repo this computer already has in a project, as owner/name. */
export const knownRemotes = (): string[] =>
  read()
    .projects.flatMap((p) => p.codebases)
    .map((c) => c.remote)
    .filter((r) => r.length > 0)
