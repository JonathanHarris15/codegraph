// codegraph: module reader
import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Point } from './schema.js'

const started = promisify(execFile)

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|py|rb|go|rs|java|kt|swift|cs|php|sql|prisma|css|scss|html|vue|svelte|sh)$/i
const ALSO = new Set(['codegraph.config.json', 'tsconfig.json', 'jsconfig.json'])
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

/** The branches a person might want to look at, and the latest commits on
 *  the one checked out. */
export const pointsIn = async (repo: string, commits = 30): Promise<Point[]> => {
  if (!existsSync(join(repo, '.git'))) return []
  const [refs, log] = await Promise.all([
    git(repo, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads', 'refs/remotes']),
    git(repo, ['log', `-n${commits}`, '--format=%H%x09%s']),
  ])
  const local = new Set<string>()
  const branches: Point[] = []
  for (const name of refs.split('\n').map((line) => line.trim()).filter(Boolean)) {
    if (name.endsWith('/HEAD') || name === 'origin') continue
    const short = name.replace(/^origin\//, '')
    if (name.startsWith('origin/') && local.has(short)) continue
    local.add(name)
    branches.push({ kind: 'branch', name })
  }
  const history: Point[] = log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha = '', ...title] = line.split('\t')
      return { kind: 'commit', sha, title: title.join('\t') }
    })
  return [{ kind: 'live' }, ...branches, ...history]
}
