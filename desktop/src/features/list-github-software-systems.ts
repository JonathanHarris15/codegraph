// codegraph: feature list-github-software-systems in workspace
// codegraph: uses github, projects
import {
  GithubRefused,
  codegraphRepos,
  savedToken,
  tokenIsSafe,
  whoAmI,
} from '../modules/github/index.js'
import { knownRemotes, listProjects } from '../modules/projects/index.js'

export type CloudSoftwareSystem = {
  fullName: string
  name: string
  owner: string
  private: boolean
  url: string
  cloneUrl: string
  /** The projects its config says it serves. */
  projects: string[]
  /** Of those, the projects this computer has, by their names here. */
  projectsHere: string[]
  /** The short names this computer has no project for yet. */
  projectsNew: string[]
  /** Already in one of this computer's projects. */
  here: boolean
}

export type CloudView = {
  signedIn: boolean
  account: string
  /** The token sits in the operating system's keystore, not in plain text. */
  tokenSafe: boolean
  problem?: string
  systems: CloudSoftwareSystem[]
}

/** The codegraph software systems the signed-in person can reach on GitHub, saying
 *  which are already on this computer and which are not. */
export const listGithubSoftwareSystems = async (): Promise<CloudView> => {
  const token = savedToken()
  const quiet: CloudView = {
    signedIn: false,
    account: '',
    tokenSafe: tokenIsSafe(),
    systems: [],
  }
  if (!token) return quiet

  try {
    const [account, repos] = await Promise.all([whoAmI(token), codegraphRepos(token)])
    const here = new Set(knownRemotes())
    const projectNamed = new Map(listProjects().map((p) => [p.shortName, p.name]))
    return {
      signedIn: true,
      account,
      tokenSafe: tokenIsSafe(),
      systems: repos.map((repo) => ({
        fullName: repo.fullName,
        name: repo.name,
        owner: repo.owner,
        private: repo.private,
        url: repo.url,
        cloneUrl: repo.cloneUrl,
        projects: repo.projects,
        projectsHere: repo.projects.flatMap((short) => projectNamed.get(short) ?? []),
        projectsNew: repo.projects.filter((short) => !projectNamed.has(short)),
        here: here.has(repo.fullName),
      })),
    }
  } catch (refusal) {
    return {
      ...quiet,
      signedIn: true,
      problem:
        refusal instanceof GithubRefused ? refusal.message : 'Could not reach GitHub just now.',
    }
  }
}
