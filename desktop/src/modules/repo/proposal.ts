// codegraph: module repo
import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git } from './run.js'

/** Where a repo keeps the proposal on its branch (ADR 0007). The reader
 *  says what is in it; this is only where it is put. */
const FOLDER = 'codegraph-proposal'

/** A picture to keep beside the proposal: the file it is copied from, and
 *  the name it goes by there. */
export type Picture = { name: string; from: string }

/** Writes the proposal into the working copy, and its mockups beside it,
 *  dropping any mockup it no longer names. Written to a neighbour first,
 *  then moved over, so a crash cannot shred it. */
export const writeProposal = (path: string, proposal: object, pictures: Picture[] = []): void => {
  const folder = join(path, FOLDER)
  mkdirSync(folder, { recursive: true })
  const named = new Set(['proposal.json', ...pictures.map((p) => p.name)])
  for (const picture of pictures) if (picture.from !== join(folder, picture.name)) copyFileSync(picture.from, join(folder, picture.name))
  const beside = join(folder, `.proposal.${Date.now()}.json`)
  writeFileSync(beside, JSON.stringify(proposal, null, 2) + '\n', 'utf8')
  renameSync(beside, join(folder, 'proposal.json'))
  for (const file of readdirSync(folder)) if (!named.has(file) && !file.startsWith('.proposal.')) rmSync(join(folder, file), { force: true })
}

/** Where a proposal's mockup sits in the working copy. */
export const proposalPicture = (path: string, name: string): string => join(path, FOLDER, name)

export const removeProposal = (path: string): void => {
  rmSync(join(path, FOLDER), { recursive: true, force: true })
}

/** The commit checked out, by its full id; '' in a repo with none. */
export const headOf = (path: string): Promise<string> => git(path, ['rev-parse', 'HEAD'])

/** Starts a branch where the working copy stands and moves onto it, taking
 *  any changes along. Says whether git agreed. */
export const makeBranch = async (path: string, name: string): Promise<boolean> => {
  if (!(await git(path, ['check-ref-format', '--branch', name]))) return false
  await git(path, ['switch', '-c', name])
  return (await git(path, ['rev-parse', '--abbrev-ref', 'HEAD'])) === name
}
