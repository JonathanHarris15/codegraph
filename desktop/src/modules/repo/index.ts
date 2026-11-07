// codegraph: module repo
// codegraph: front door isRepo, remoteName, mainLineRef, isSetUp, readSoftwareSystem, folderName, writeProposal, removeProposal, proposalPicture, headOf, makeBranch, switchBranch, useMirrors, mirrorFolder, fetchMirror, tipOf, isAncestor, fetchWorkingCopy, proposalsOnBranches, RepoFacts, SetupFacts, Picture, Reach
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { isRepo, mainLineRef, readGit, remoteName, type GitFacts } from './git.js'
import { git } from './run.js'
import { isSetUp, noSetup, readSetupAt, type SetupFacts } from './setup.js'

export { isRepo, isSetUp, mainLineRef, remoteName }
export { headOf, makeBranch, proposalPicture, removeProposal, writeProposal } from './proposal.js'
export type { Picture } from './proposal.js'
export { switchBranch } from './switch.js'
export type { SetupFacts } from './setup.js'
export { fetchMirror, mirrorFolder, useMirrors } from './mirror.js'
export type { Reach } from './mirror.js'

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

/** The commit a branch or other name stands at; '' if git does not know it. */
export const tipOf = (path: string, ref: string): Promise<string> => git(path, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])

/** Whether one commit is in the history of another. */
export const isAncestor = async (path: string, commit: string, of: string): Promise<boolean> => {
  if (!commit || !of) return false
  const base = await git(path, ['merge-base', commit, of])
  return base !== '' && base === (await tipOf(path, commit))
}

/** Asks GitHub what it has for a working copy, using the person's own git. */
export const fetchWorkingCopy = async (path: string): Promise<void> => {
  await git(path, ['fetch', '--quiet', '--prune'], 90)
}

/** The branches of a repo with a proposal being built on them, by name as a map
 *  would show it: a GitHub one if it is on GitHub. */
export const proposalsOnBranches = async (path: string, file: string): Promise<string[]> => {
  const refs = (await git(path, ['for-each-ref', '--sort=-committerdate', '--count=40', '--format=%(refname:short)', 'refs/remotes', 'refs/heads'])).split('\n').filter(Boolean)
  const found: string[] = []
  for (const ref of refs) {
    if (ref.endsWith('/HEAD') || ref === 'origin') continue
    if (await git(path, ['rev-parse', '--verify', '--quiet', `${ref}:${file}`])) found.push(ref)
  }
  const pushed = new Set(found.filter((ref) => ref.startsWith('origin/')).map((ref) => ref.replace('origin/', '')))
  return found.filter((ref) => !pushed.has(ref))
}
