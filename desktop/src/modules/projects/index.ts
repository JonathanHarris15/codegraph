// codegraph: module projects
// codegraph: front door useFolder, listProjects, addProject, renameProject, addSoftwareSystem, removeSoftwareSystem, chooseBranch, knownRemotes, addShallowSystem, Project, SoftwareSystem, ShallowSystem, Workspace
import { shortNameOf, type Project, type ShallowSystem, type SoftwareSystem } from './schema.js'
import { newId, read, useFolder, write } from './store.js'

export { useFolder }
export type { Project, ShallowSystem, SoftwareSystem, Workspace } from './schema.js'

export const listProjects = (): Project[] => read().projects

/** Makes a project, with the short name it is given or one from its name,
 *  never one another project already has. */
export const addProject = (name: string, shortName = ''): Project => {
  const workspace = read()
  const named = name.trim() || 'Untitled project'
  const taken = new Set(workspace.projects.map((p) => p.shortName))
  const wanted = shortNameOf(shortName || named)
  let short = wanted
  for (let n = 2; taken.has(short); n++) short = `${wanted}-${n}`
  const project: Project = {
    id: newId(),
    name: named,
    shortName: short,
    createdAt: new Date().toISOString(),
    systems: [],
    shallow: [],
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

/** Remembers the branch a software system's map opens on. */
export const chooseBranch = (projectId: string, systemId: string, branch: string): void => {
  const workspace = read()
  const system = workspace.projects.find((p) => p.id === projectId)?.systems.find((s) => s.id === systemId)
  if (!system || system.branch === branch) return
  system.branch = branch
  write(workspace)
}

/** Every GitHub repo this computer already has in a project, as owner/name. */
export const knownRemotes = (): string[] =>
  read()
    .projects.flatMap((p) => p.systems)
    .map((c) => c.remote)
    .filter((r) => r.length > 0)

/** Records a shallow software system a person agreed to, or, given one that
 *  is already there, another name the code calls it by. */
export const addShallowSystem = (projectId: string, name: string, sameAs = ''): ShallowSystem => {
  const workspace = read()
  const project = workspace.projects.find((p) => p.id === projectId)
  if (!project) throw new Error('no project with that id')
  const known = project.shallow.find((s) => s.id === sameAs || s.answersTo.includes(name))
  if (known) {
    if (!known.answersTo.includes(name)) known.answersTo.push(name)
    write(workspace)
    return known
  }
  const added: ShallowSystem = { id: newId(), name, answersTo: [name] }
  project.shallow.push(added)
  write(workspace)
  return added
}
