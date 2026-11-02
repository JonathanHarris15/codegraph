// codegraph: module repo
// codegraph: front door isRepo, remoteName, readCodebase, folderName, RepoFacts
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { isRepo, readGit, remoteName, type GitFacts } from './git.js'
import { readSetup, type SetupFacts } from './setup.js'

export { isRepo, remoteName }

/** Everything one working copy on this computer says about itself. */
export type RepoFacts = GitFacts &
  SetupFacts & {
    /** The folder is still there. */
    present: boolean
  }

export const folderName = (path: string): string => basename(path.replace(/[\/]+$/, ''))

export const readCodebase = async (path: string, fetchFirst = false): Promise<RepoFacts> => {
  const present = path.length > 0 && existsSync(path)
  const git = await readGit(present ? path : '', fetchFirst)
  const setup = readSetup(present ? path : '')
  return { present, ...git, ...setup }
}
