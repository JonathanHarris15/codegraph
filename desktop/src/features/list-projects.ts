// codegraph: feature list-projects in workspace
// codegraph: uses projects, repo
import { listProjects as stored } from '../modules/projects/index.js'
import { isSetUp, readSoftwareSystem, type RepoFacts } from '../modules/repo/index.js'

/** How a working copy stands against the copy on GitHub. */
export type Cloud =
  | 'level'
  | 'behind'
  | 'ahead'
  | 'diverged'
  | 'no-upstream'
  | 'no-remote'
  | 'untracked'
  | 'missing'

export type SoftwareSystemView = {
  id: string
  name: string
  path: string
  remote: string
  present: boolean
  tracked: boolean
  dirty: boolean
  branch: string
  /** The repo's main line, which the setup answers are read against. */
  mainLine: string
  ahead: number
  behind: number
  cloud: Cloud
  /** The repo has its codegraph config on its main line, whatever branch
   *  happens to be checked out here. */
  setUp: boolean
  /** Set up on the branch checked out here but not yet on the main line. */
  setUpHere: boolean
  configWritten: boolean
  /** The projects its config says it serves. */
  serves: string[]
  taggedFiles: number
  sourceFiles: number
}

export type ProjectView = {
  id: string
  name: string
  createdAt: string
  systems: SoftwareSystemView[]
}

export const cloudOf = (facts: RepoFacts): Cloud => {
  if (!facts.present) return 'missing'
  if (!facts.tracked) return 'untracked'
  if (!facts.remote) return 'no-remote'
  if (!facts.hasUpstream) return 'no-upstream'
  if (facts.behind > 0 && facts.ahead > 0) return 'diverged'
  if (facts.behind > 0) return 'behind'
  if (facts.ahead > 0) return 'ahead'
  return 'level'
}

/** Every project with the live state of each software system under it. Ask it to
 *  fetch first and it asks GitHub what it has before answering. */
export const listProjects = async (fetchFirst = false): Promise<ProjectView[]> =>
  Promise.all(
    stored().map(async (project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      systems: await Promise.all(
        project.systems.map(async (system) => {
          const facts = await readSoftwareSystem(system.path, fetchFirst)
          return {
            id: system.id,
            name: system.name,
            path: system.path,
            remote: system.remote || facts.remote,
            present: facts.present,
            tracked: facts.tracked,
            dirty: facts.dirty,
            branch: facts.branch,
            mainLine: facts.mainLine,
            ahead: facts.ahead,
            behind: facts.behind,
            cloud: cloudOf(facts),
            setUp: isSetUp(facts),
            setUpHere: facts.setUpHere,
            configWritten: facts.configWritten,
            serves: facts.projects,
            taggedFiles: facts.taggedFiles,
            sourceFiles: facts.sourceFiles,
          }
        }),
      ),
    })),
  )
