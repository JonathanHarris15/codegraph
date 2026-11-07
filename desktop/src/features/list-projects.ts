// codegraph: feature list-projects in workspace
// codegraph: uses projects, repo, reader, cloud, members
import { isConnected } from '../modules/cloud/index.js'
import { roleOf, whoIsIn, type Role } from '../modules/members/index.js'
import { chooseBranch, listProjects as stored, type ProjectMember } from '../modules/projects/index.js'
import { listPoints, pointFor, type Point } from '../modules/reader/index.js'
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
  /** The branch checked out in the folder. */
  branch: string
  /** Where its map opens: the branch last chosen for it, or the folder. */
  point: Point
  /** Its branches, each with where it is and how far from GitHub. */
  branches: Point[]
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
  /** Its config names the project it sits in, by the project's short name. */
  namesThisProject: boolean
  taggedFiles: number
  sourceFiles: number
}

export type ProjectView = {
  id: string
  name: string
  /** What its repos call it in their config. */
  shortName: string
  createdAt: string
  systems: SoftwareSystemView[]
  /** Online for its members, not just on this computer. */
  online: boolean
  /** What the person signed in may do here. */
  role: Role | null
  ownerId: string
  members: ProjectMember[]
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
 *  fetch first and it asks GitHub what it has before answering. Where there is an
 *  online side, projects need signing in to; none show for no one. */
export const listProjects = async (fetchFirst = false): Promise<ProjectView[]> =>
  Promise.all(
    (isConnected() && !whoIsIn() ? [] : stored()).map(async (project) => ({
      online: project.online ?? false,
      role: roleOf(project, whoIsIn()?.id ?? ''),
      ownerId: project.ownerId ?? '',
      members: project.members ?? [],
      id: project.id,
      name: project.name,
      shortName: project.shortName,
      createdAt: project.createdAt,
      systems: await Promise.all(
        project.systems.map(async (system) => {
          const facts = await readSoftwareSystem(system.path, fetchFirst)
          const [chosen, points] = await Promise.all([pointFor(system.path, system.branch), listPoints(system.path)])
          if (chosen.moved) chooseBranch(project.id, system.id, chosen.branch)
          return {
            id: system.id,
            name: system.name,
            path: system.path,
            remote: system.remote || facts.remote,
            present: facts.present,
            tracked: facts.tracked,
            dirty: facts.dirty,
            branch: facts.branch,
            point: chosen.point,
            branches: points.filter((p) => p.kind !== 'commit'),
            mainLine: facts.mainLine,
            ahead: facts.ahead,
            behind: facts.behind,
            cloud: cloudOf(facts),
            setUp: isSetUp(facts),
            setUpHere: facts.setUpHere,
            configWritten: facts.configWritten,
            serves: facts.projects,
            namesThisProject: facts.projects.includes(project.shortName),
            taggedFiles: facts.taggedFiles,
            sourceFiles: facts.sourceFiles,
          }
        }),
      ),
    })),
  )
