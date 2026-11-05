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
  /** The branch its map opens on, as a person last chose it; the one
   *  checked out when left out. */
  branch?: string
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
  /** What its repos call it in their codegraph config (ADR 0008). It stays
   *  put when the project is renamed, so no repo has to change. */
  shortName: string
  createdAt: string
  systems: SoftwareSystem[]
  shallow: ShallowSystem[]
}

/** Everything this computer remembers about the person's projects. */
export type Workspace = {
  version: 2
  projects: Project[]
}

/** A project's name as a repo writes it: lower case, words joined by hyphens. */
export const shortNameOf = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project'

export const emptyWorkspace = (): Workspace => ({ version: 2, projects: [] })
