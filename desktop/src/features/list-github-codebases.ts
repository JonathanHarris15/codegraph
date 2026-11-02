// codegraph: feature list-github-codebases in workspace
// codegraph: uses github, projects
import {
  GithubRefused,
  codegraphRepos,
  savedToken,
  tokenIsSafe,
  whoAmI,
} from '../modules/github/index.js'
import { knownRemotes } from '../modules/projects/index.js'

export type CloudCodebase = {
  fullName: string
  name: string
  owner: string
  private: boolean
  url: string
  cloneUrl: string
  /** Already in one of this computer's projects. */
  here: boolean
}

export type CloudView = {
  signedIn: boolean
  account: string
  /** The token sits in the operating system's keystore, not in plain text. */
  tokenSafe: boolean
  problem?: string
  codebases: CloudCodebase[]
}

/** The codegraph codebases the signed-in person can reach on GitHub, saying
 *  which are already on this computer and which are not. */
export const listGithubCodebases = async (): Promise<CloudView> => {
  const token = savedToken()
  const quiet: CloudView = {
    signedIn: false,
    account: '',
    tokenSafe: tokenIsSafe(),
    codebases: [],
  }
  if (!token) return quiet

  try {
    const [account, repos] = await Promise.all([whoAmI(token), codegraphRepos(token)])
    const here = new Set(knownRemotes())
    return {
      signedIn: true,
      account,
      tokenSafe: tokenIsSafe(),
      codebases: repos.map((repo) => ({
        fullName: repo.fullName,
        name: repo.name,
        owner: repo.owner,
        private: repo.private,
        url: repo.url,
        cloneUrl: repo.cloneUrl,
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
