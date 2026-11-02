// codegraph: feature list-projects in workspace
// codegraph: uses projects, repo
import { listProjects as stored } from '../modules/projects/index.js'
import { isSetUp, readCodebase, type RepoFacts } from '../modules/repo/index.js'

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

export type CodebaseView = {
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
  /** Codegraph is turned on in the repo: tools, rules and tags, on its main
   *  line, whatever branch happens to be checked out here. */
  setUp: boolean
  /** Set up on the branch checked out here but not yet on the main line. */
  setUpHere: boolean
  toolsOn: boolean
  rulesWritten: boolean
  taggedFiles: number
  sourceFiles: number
}

export type ProjectView = {
  id: string
  name: string
  createdAt: string
  codebases: CodebaseView[]
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

/** Every project with the live state of each codebase under it. Ask it to
 *  fetch first and it asks GitHub what it has before answering. */
export const listProjects = async (fetchFirst = false): Promise<ProjectView[]> =>
  Promise.all(
    stored().map(async (project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      codebases: await Promise.all(
        project.codebases.map(async (codebase) => {
          const facts = await readCodebase(codebase.path, fetchFirst)
          return {
            id: codebase.id,
            name: codebase.name,
            path: codebase.path,
            remote: codebase.remote || facts.remote,
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
            toolsOn: facts.toolsOn,
            rulesWritten: facts.rulesWritten,
            taggedFiles: facts.taggedFiles,
            sourceFiles: facts.sourceFiles,
          }
        }),
      ),
    })),
  )
