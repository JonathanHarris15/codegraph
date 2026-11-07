// codegraph: module reader
import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { PROPOSAL } from './proposal.js'
import type { Point } from './schema.js'

const started = promisify(execFile)

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|py|rb|go|rs|java|kt|swift|cs|php|sql|prisma|css|scss|html|vue|svelte|sh)$/i
const ALSO = new Set(['codegraph.config.json', PROPOSAL, 'tsconfig.json', 'jsconfig.json'])
const TOO_BIG = 1024 * 1024

/** The files the reader cares about: source it can tag, and the few config
 *  files it reads whole. */
export const wanted = (path: string): boolean =>
  (SOURCE.test(path) && !path.includes('node_modules/')) || ALSO.has(path)

const git = async (cwd: string, args: string[]): Promise<string> => {
  try {
    const { stdout } = await started('git', args, {
      cwd,
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024,
    })
    return stdout
  } catch {
    return ''
  }
}

export const refOf = (point: Point): string =>
  point.kind === 'live' ? '' : point.kind === 'branch' ? point.name : point.sha

/** Every wanted file at a point, path to text. The live folder counts what
 *  git tracks plus new files it would track, so uncommitted work shows; a
 *  branch or commit is read from git without touching the folder. */
export const filesAt = async (repo: string, point: Point): Promise<Map<string, string>> => {
  const files = new Map<string, string>()
  if (!existsSync(join(repo, '.git'))) return files

  if (point.kind === 'live') {
    const listed = await git(repo, ['ls-files', '-z', '-co', '--exclude-standard'])
    for (const path of new Set(listed.split('\0').filter(wanted))) {
      const full = join(repo, path)
      if (!existsSync(full) || statSync(full).size > TOO_BIG) continue
      files.set(path, readFileSync(full, 'utf8'))
    }
    return files
  }

  const ref = refOf(point)
  const listed = await git(repo, ['ls-tree', '-r', '-z', '--name-only', ref])
  const paths = listed.split('\0').filter(wanted)
  if (paths.length === 0) return files
  const blobs = await catFiles(repo, paths.map((path) => `${ref}:${path}`))
  paths.forEach((path, i) => {
    const text = blobs[i]
    if (text !== undefined && text.length <= TOO_BIG) files.set(path, text)
  })
  return files
}

/** Many files out of git in one go, in the order asked. A file git cannot
 *  find comes back undefined. */
const catFiles = (repo: string, names: string[]): Promise<(string | undefined)[]> =>
  new Promise((done) => {
    const child = spawn('git', ['cat-file', '--batch'], { cwd: repo, windowsHide: true })
    const chunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('error', () => done(names.map(() => undefined)))
    child.on('close', () => {
      const all = Buffer.concat(chunks)
      const out: (string | undefined)[] = []
      let at = 0
      for (let i = 0; i < names.length && at < all.length; i++) {
        const end = all.indexOf(10, at)
        if (end < 0) break
        const head = all.subarray(at, end).toString('utf8')
        at = end + 1
        const match = head.match(/^\S+ (\S+) (\d+)$/)
        if (!match) {
          out.push(undefined)
          continue
        }
        const size = Number(match[2])
        out.push(match[1] === 'blob' ? all.subarray(at, at + size).toString('utf8') : undefined)
        at += size + 1
      }
      done(out)
    })
    child.stdin.end(names.join('\n') + '\n')
  })

/** The branches a person might want to look at, each saying whether it is
 *  on this computer, on GitHub, or both, and how far apart the two are; and
 *  the latest commits on the one checked out. */
export const pointsIn = async (repo: string, commits = 30): Promise<Point[]> => {
  if (!existsSync(join(repo, '.git'))) return []
  const [refs, log] = await Promise.all([
    git(repo, [
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(refname)%09%(upstream:short)%09%(upstream:track,nobracket)%09%(HEAD)',
      'refs/heads',
      'refs/remotes',
    ]),
    git(repo, ['log', `-n${commits}`, '--format=%H%x09%s']),
  ])
  const lines = refs
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((parts) => parts[0])
  const remote = new Set(lines.map(([ref]) => ref!).filter((ref) => ref.startsWith('refs/remotes/')).map((ref) => ref.replace('refs/remotes/', '')))
  const branches: Extract<Point, { kind: 'branch' }>[] = []
  for (const [ref = '', upstream = '', track = '', head = ''] of lines) {
    if (!ref.startsWith('refs/heads/')) continue
    const name = ref.replace('refs/heads/', '')
    const there = upstream && remote.has(upstream) && track !== 'gone'
    const count = (word: string): number => Number(track.match(new RegExp(`${word} (\\d+)`))?.[1] ?? 0)
    branches.push({
      kind: 'branch',
      name,
      where: there ? 'both' : 'local',
      ahead: there ? count('ahead') : 0,
      behind: there ? count('behind') : 0,
      current: head.trim() === '*',
    })
  }
  for (const [ref = ''] of lines) {
    if (!ref.startsWith('refs/remotes/') || ref.endsWith('/HEAD')) continue
    const name = ref.replace('refs/remotes/', '')
    if (!name.includes('/')) continue
    branches.push({ kind: 'branch', name, where: 'cloud', ahead: 0, behind: 0, current: false })
  }
  branches.sort((a, b) => Number(b.current) - Number(a.current))
  const history: Point[] = log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha = '', ...title] = line.split('\t')
      return { kind: 'commit', sha, title: title.join('\t') }
    })
  const checkedOut = branches.find((b) => b.current)?.name
  return [{ kind: 'live', ...(checkedOut ? { branch: checkedOut } : {}) }, ...branches, ...history]
}

/** One file at a point, as bytes, for a picture; null when it is not there. */
export const pictureAt = async (repo: string, point: Point, path: string): Promise<Buffer | null> => {
  if (point.kind === 'live') {
    const full = join(repo, path)
    return existsSync(full) && statSync(full).size <= TOO_BIG * 8 ? readFileSync(full) : null
  }
  try {
    const { stdout } = await started('git', ['show', `${refOf(point)}:${path}`], {
      cwd: repo,
      windowsHide: true,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
    })
    return stdout
  } catch {
    return null
  }
}

/** The commit a change was drawn on: the one named, if git has it, else
 *  where the checked-out branch left the main line. '' when neither is found. */
export const baseOf = async (repo: string, named: string): Promise<string> => {
  if (named) {
    const sha = (await git(repo, ['rev-parse', '--verify', '--quiet', `${named}^{commit}`])).trim()
    if (sha) return sha
  }
  for (const line of ['origin/main', 'origin/master', 'main', 'master']) {
    const sha = (await git(repo, ['merge-base', 'HEAD', line])).trim()
    if (sha) return sha
  }
  return ''
}

/** Where to read a repo when a person last chose a branch: the folder, if
 *  that branch is the one checked out; the branch, if git still has it here
 *  or on GitHub; and if it has gone, the main line instead, saying so. */
export const pointFor = async (repo: string, chosen = ''): Promise<{ point: Point; branch: string; moved: boolean }> => {
  if (!existsSync(join(repo, '.git'))) return { point: { kind: 'live' }, branch: '', moved: false }
  const checkedOut = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  const at = (name: string, moved: boolean) => ({
    point: name === checkedOut ? ({ kind: 'live', branch: name } as Point) : ({ kind: 'branch', name } as Point),
    branch: name,
    moved,
  })
  const has = async (name: string): Promise<boolean> =>
    (await git(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`])).trim() !== '' ||
    (await git(repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/${name}`])).trim() !== ''
  if (!chosen) return at(checkedOut, false)
  if (chosen === checkedOut || (await has(chosen))) return at(chosen, false)
  for (const main of ['main', 'master', 'origin/main', 'origin/master']) if (await has(main)) return at(main, true)
  return at(checkedOut, true)
}
