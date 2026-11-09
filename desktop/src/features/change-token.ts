// codegraph: feature change-token in workspace
// codegraph: uses projects, reader, repo
import { findProject } from '../modules/projects/index.js'
import { changeToken as changed, DESIGN } from '../modules/reader/index.js'
import { makeBranch, readSoftwareSystem, readWorkingFile, tipOf, writeWorkingFile } from '../modules/repo/index.js'

export type TokenChanged = {
  ok: boolean
  /** The branch the change was written on. */
  branch: string
  problem: string
}

const refused = (problem: string): TokenChanged => ({ ok: false, branch: '', problem })

/** A branch name for a change to one token that the repo does not have yet:
 *  design/colors-action, then design/colors-action-2 and on. */
const freeBranch = async (path: string, id: string): Promise<string> => {
  const base = `design/${id.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()}`
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}-${n}`
    if (!(await tipOf(path, `refs/heads/${name}`))) return name
  }
}

/** Changes one token's value in a software system's DESIGN.md, in this
 *  member's working copy. Never on the main line: there it makes a branch
 *  first and moves onto it, so the change can be looked at before it is
 *  merged (ADR 0024). The agent then brings the code along. */
export const changeToken = async (projectId: string, systemId: string, tokenId: string, value: string): Promise<TokenChanged> => {
  const system = findProject(projectId)?.systems.find((s) => s.id === systemId)
  if (!system?.path) return refused('That software system is not on this computer.')
  const text = readWorkingFile(system.path, DESIGN)
  if (text === null) return refused(`This repo has no ${DESIGN} to change.`)
  const done = changed(text, tokenId, value)
  if ('problem' in done) return refused(done.problem)

  const facts = await readSoftwareSystem(system.path)
  let branch = facts.branch
  if (!branch || branch === 'HEAD' || branch === facts.mainLine || ['main', 'master'].includes(branch)) {
    branch = await freeBranch(system.path, tokenId)
    if (!(await makeBranch(system.path, branch))) return refused(`Git would not start the branch ${branch}, so nothing was changed.`)
  }
  writeWorkingFile(system.path, DESIGN, done.text)
  return { ok: true, branch, problem: '' }
}
