// codegraph: module repo
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { git } from './run.js'

const started = promisify(execFile)

/** Moves a working copy onto a branch. A branch only on GitHub,
 *  `origin/name`, becomes a branch here that follows it. Refuses while the
 *  folder has changes not committed, so nothing is carried over or lost by
 *  surprise. Hands back '' when done, or why not, in words for a person. */
export const switchBranch = async (path: string, name: string): Promise<string> => {
  if (await git(path, ['status', '--porcelain']))
    return 'This folder has changes that are not committed. Commit or stash them first, then switch.'
  const remote = name.match(/^([^/]+)\/(.+)$/)
  const local = remote && (await git(path, ['remote'])).split(/\s+/).includes(remote[1]!) ? remote[2]! : name
  const args =
    local !== name && !(await git(path, ['rev-parse', '--verify', '--quiet', `refs/heads/${local}`]))
      ? ['switch', '--track', name]
      : ['switch', local]
  try {
    await started('git', args, { cwd: path, windowsHide: true, timeout: 60_000 })
    return ''
  } catch (failed) {
    const said = String((failed as { stderr?: string }).stderr ?? '').trim()
    return said ? `Git would not switch: ${said.split('\n').at(-1)}` : 'Git would not switch to that branch.'
  }
}
