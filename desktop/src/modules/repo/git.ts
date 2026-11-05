// codegraph: module repo
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { git } from './run.js'

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

export const isRepo = (path: string): boolean => path.length > 0 && existsSync(join(path, '.git'))

/** github.com/owner/name, however the remote is written, else ''. */
export const remoteName = (url: string): string => {
  const match = url.match(/github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?$/i)
  return match ? `${match[1]}/${match[2]}` : ''
}

/** The ref to read a repo-level question against: the main line, not
 *  whatever branch is checked out. GitHub's own idea of it first, then the
 *  usual names, and '' where the repo has no commits at all. */
export const mainLineRef = async (path: string): Promise<string> => {
  const pointed = await git(path, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'])
  if (pointed) return pointed.replace('refs/remotes/', '')
  for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
    if (await git(path, ['rev-parse', '--verify', '--quiet', ref])) return ref
  }
  return ''
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
