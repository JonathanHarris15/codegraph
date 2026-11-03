// codegraph: module repo
// codegraph: front door isRepo, remoteName, mainLineRef, isSetUp, readSoftwareSystem, folderName, writeProposal, removeProposal, proposalPicture, headOf, makeBranch, RepoFacts, SetupFacts, Picture
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { isRepo, mainLineRef, readGit, remoteName, type GitFacts } from './git.js'
import { git } from './run.js'
import { isSetUp, noSetup, readSetupAt, type SetupFacts } from './setup.js'

export { isRepo, isSetUp, mainLineRef, remoteName }
export { headOf, makeBranch, proposalPicture, removeProposal, writeProposal } from './proposal.js'
export type { Picture } from './proposal.js'
export type { SetupFacts } from './setup.js'

/** Everything one working copy on this computer says about itself. The setup
 *  answers are the repo's, read on its main line; the branch, the changes
 *  and the counts against GitHub are this checkout's. */
export type RepoFacts = GitFacts &
  SetupFacts & {
    /** The folder is still there. */
    present: boolean
    /** The repo's main line, by name: main, master, whatever it calls it. */
    mainLine: string
    /** Set up on the branch checked out here, though not yet on the main
     *  line — what a setup that has not been merged looks like. */
    setUpHere: boolean
  }

export const folderName = (path: string): string => basename(path.replace(/[\\/]+$/, ''))

export const readSoftwareSystem = async (path: string, fetchFirst = false): Promise<RepoFacts> => {
  const present = path.length > 0 && existsSync(path)
  const here = present ? path : ''
  const facts = await readGit(here, fetchFirst)
  if (!facts.tracked) {
    return { present, ...facts, ...noSetup, mainLine: '', setUpHere: false }
  }

  const main = await mainLineRef(here)
  const [atHead, atMain] = await Promise.all([
    git(here, ['rev-parse', 'HEAD']),
    main ? git(here, ['rev-parse', main]) : Promise.resolve(''),
  ])
  // Standing on the main line, one read answers for both.
  const sameCommit = atHead !== '' && atHead === atMain
  const [onMainLine, onThisBranch] = await Promise.all([
    readSetupAt(here, main),
    sameCommit ? Promise.resolve(null) : readSetupAt(here, 'HEAD'),
  ])

  return {
    present,
    ...facts,
    ...onMainLine,
    mainLine: main.replace(/^origin\//, ''),
    setUpHere: isSetUp(onThisBranch ?? onMainLine),
  }
}
