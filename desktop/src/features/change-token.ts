// codegraph: feature change-token in workspace
// codegraph: uses projects, reader, repo
import { findProject } from '../modules/projects/index.js'
import { changeToken as changed, DESIGN } from '../modules/reader/index.js'
import { leaveMainLine, readWorkingFile, writeWorkingFile } from '../modules/repo/index.js'

export type TokenChanged = {
  ok: boolean
  /** The branch the change was written on. */
  branch: string
  problem: string
}

const refused = (problem: string): TokenChanged => ({ ok: false, branch: '', problem })

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

  const name = `design/${tokenId.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()}`
  const branch = await leaveMainLine(system.path, name)
  if (!branch) return refused(`Git would not start the branch ${name}, so nothing was changed.`)
  writeWorkingFile(system.path, DESIGN, done.text)
  return { ok: true, branch, problem: '' }
}
