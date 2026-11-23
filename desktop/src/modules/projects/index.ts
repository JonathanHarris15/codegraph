// codegraph: module projects
// codegraph: front door useFolder, listProjects, findProject, addProject, putOnline, renameProject, keepProject, removeProject, addSoftwareSystem, placeWorkingCopy, removeSoftwareSystem, chooseBranch, knownRemotes, addShallowSystem, newShallowSystem, addPerson, renameDrawn, removeDrawn, Linked, Project, SoftwareSystem, ShallowSystem, Person, ProjectMember, Workspace
import { sameFolder } from '../machine/index.js'
import { shortNameOf, type Person, type Project, type ProjectMember, type ShallowSystem, type SoftwareSystem } from './schema.js'
import { newId, read, useFolder, write } from './store.js'

export { useFolder }
export type { Linked, Person, Project, ProjectMember, ShallowSystem, SoftwareSystem, Workspace } from './schema.js'

export const listProjects = (): Project[] => read().projects

/** The project with this id, if this computer has it. */
export const findProject = (id: string): Project | undefined => listProjects().find((p) => p.id === id)

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
    people: [],
  }
  workspace.projects.push(project)
  write(workspace)
  return project
}

/** Puts a project on this computer exactly as given: new, or replacing the one
 *  with its id. */
/** Makes a project one that lives online too, with this member as its owner and
 *  only member. A project already online stays as it is. */
export const putOnline = (projectId: string, owner: Omit<ProjectMember, 'role'>): void => {
  const project = findProject(projectId)
  if (!project || project.online) return
  keepProject({ ...project, online: true, ownerId: owner.id, members: [{ ...owner, role: 'owner' }] })
}

export const keepProject = (project: Project): void => {
  const workspace = read()
  const at = workspace.projects.findIndex((p) => p.id === project.id)
  if (at >= 0) workspace.projects[at] = project
  else workspace.projects.push(project)
  write(workspace)
}

export const removeProject = (id: string): void => {
  const workspace = read()
  workspace.projects = workspace.projects.filter((p) => p.id !== id)
  write(workspace)
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
    (c) => (system.path && c.path && sameFolder(c.path, system.path)) || (system.remote && c.remote === system.remote),
  )
  if (already) {
    // A member with no working copy of a repo on the project has just linked one.
    if (system.path && !already.path) {
      already.path = system.path
      write(workspace)
    }
    return already
  }
  const added: SoftwareSystem = { id: newId(), ...system }
  project.systems.push(added)
  write(workspace)
  return added
}

/** Says where a repo on the project sits on this computer, or, given '',
 *  that it has no working copy here. Only this computer's: a path never goes
 *  online. False when the project has no such repo. */
export const placeWorkingCopy = (projectId: string, systemId: string, path: string): boolean => {
  const workspace = read()
  const system = workspace.projects.find((p) => p.id === projectId)?.systems.find((s) => s.id === systemId)
  if (!system) return false
  system.path = path
  write(workspace)
  return true
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

/** A shallow software system a person put on the map themselves: always a new
 *  one, even beside another of the same name. It answers to its name, so the
 *  code reaches it once it is called what the code calls it. */
export const newShallowSystem = (projectId: string, name: string): ShallowSystem => {
  const workspace = read()
  const project = workspace.projects.find((p) => p.id === projectId)
  if (!project) throw new Error('no project with that id')
  const added: ShallowSystem = { id: newId(), name: name.trim() || 'Software system', answersTo: [] }
  project.shallow.push(added)
  write(workspace)
  return added
}

/** Draws someone who uses the project's software. */
export const addPerson = (projectId: string, name: string): Person => {
  const workspace = read()
  const project = workspace.projects.find((p) => p.id === projectId)
  if (!project) throw new Error('no project with that id')
  const added: Person = { id: newId(), name: name.trim() || 'Person' }
  project.people.push(added)
  write(workspace)
  return added
}

/** Renames a person or a shallow software system. A shallow one keeps every
 *  name the code already calls it by. A blank name changes nothing. */
export const renameDrawn = (projectId: string, id: string, name: string): void => {
  const workspace = read()
  const project = workspace.projects.find((p) => p.id === projectId)
  const drawn = project?.people.find((p) => p.id === id) ?? project?.shallow.find((s) => s.id === id)
  if (!drawn || !name.trim() || drawn.name === name.trim()) return
  drawn.name = name.trim()
  write(workspace)
}

/** Takes a person or a shallow software system off the project. A software
 *  system with a repo is not one of these, and stays. */
export const removeDrawn = (projectId: string, id: string): boolean => {
  const workspace = read()
  const project = workspace.projects.find((p) => p.id === projectId)
  if (!project) return false
  const before = project.people.length + project.shallow.length
  project.people = project.people.filter((p) => p.id !== id)
  project.shallow = project.shallow.filter((s) => s.id !== id)
  if (project.people.length + project.shallow.length === before) return false
  write(workspace)
  return true
}
