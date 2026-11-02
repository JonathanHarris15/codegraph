// codegraph: module repo
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** What git says about one working copy. */
export type GitFacts = {
  tracked: boolean
  branch: string
  /** owner/name on GitHub, where origin points there. */
  remote: string
  dirty: boolean
  hasUpstream: boolean
  ahead: number
  behind: number
}

const git = async (cwd: string, args: string[], seconds = 20): Promise<string> => {
  try {
    const { stdout } = await run('git', args, {
      cwd,
      windowsHide: true,
      timeout: seconds * 1000,
    })
    return stdout.trim()
  } catch {
    return ''
  }
}

export const isRepo = (path: string): boolean => path.length > 0 && existsSync(join(path, '.git'))

/** github.com/owner/name, however the remote is written, else ''. */
export const remoteName = (url: string): string => {
  const match = url.match(/github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?$/i)
  return match ? `${match[1]}/${match[2]}` : ''
}

export const readGit = async (path: string, fetchFirst = false): Promise<GitFacts> => {
  const blank: GitFacts = {
    tracked: false,
    branch: '',
    remote: '',
    dirty: false,
    hasUpstream: false,
    ahead: 0,
    behind: 0,
  }
  if (!isRepo(path)) return blank

  if (fetchFirst) await git(path, ['fetch', '--quiet', '--prune'], 90)

  const [branch, url, status, upstream] = await Promise.all([
    git(path, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(path, ['remote', 'get-url', 'origin']),
    git(path, ['status', '--porcelain']),
    git(path, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
  ])

  const facts: GitFacts = {
    ...blank,
    tracked: true,
    branch,
    remote: remoteName(url),
    dirty: status.length > 0,
    hasUpstream: upstream.length > 0,
  }
  if (!facts.hasUpstream) return facts

  const counts = await git(path, ['rev-list', '--left-right', '--count', '@{u}...HEAD'])
  const [behind, ahead] = counts.split(/\s+/).map((n) => Number(n) || 0)
  return { ...facts, behind: behind ?? 0, ahead: ahead ?? 0 }
}
