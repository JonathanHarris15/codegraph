// codegraph: module projects
// codegraph: store projects as Workspace

/** One repo that belongs to a project. */
export type SoftwareSystem = {
  id: string
  /** What it is called: the folder's name, or the GitHub repo's name. */
  name: string
  /** Where it sits on this computer. Empty when it is only known from GitHub. */
  path: string
  /** owner/name on GitHub, where it has one. */
  remote: string
}

/** A software system the project refers to but has no repo for, which a
 *  person agreed to. The code may call it by more than one name. */
export type ShallowSystem = {
  id: string
  name: string
  answersTo: string[]
}

/** A piece of work with one or more software systems under it. */
export type Project = {
  id: string
  name: string
  createdAt: string
  systems: SoftwareSystem[]
  shallow: ShallowSystem[]
}

/** Everything this computer remembers about the person's projects. */
export type Workspace = {
  version: 2
  projects: Project[]
}

export const emptyWorkspace = (): Workspace => ({ version: 2, projects: [] })
