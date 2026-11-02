// codegraph: test module repo
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { folderName, isRepo, readCodebase, remoteName } from '../src/modules/repo/index.js'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()

let yard = ''
let work = ''
let other = ''

const settle = (clone: string): void => {
  git(clone, 'config', 'user.email', 'test@example.com')
  git(clone, 'config', 'user.name', 'Test')
}

beforeAll(() => {
  yard = mkdtempSync(join(tmpdir(), 'codegraph-repo-'))
  const cloud = join(yard, 'cloud.git')
  mkdirSync(cloud)
  git(cloud, 'init', '--bare', '--initial-branch=main')

  work = join(yard, 'work')
  git(yard, 'clone', cloud, 'work')
  settle(work)
  writeFileSync(join(work, 'first.ts'), '// codegraph: module thing\nexport const one = 1\n')
  git(work, 'add', '-A')
  git(work, 'commit', '-m', 'first')
  git(work, 'push', '-u', 'origin', 'main')

  other = join(yard, 'other')
  git(yard, 'clone', cloud, 'other')
  settle(other)
})

afterAll(() => {
  rmSync(yard, { recursive: true, force: true })
})

describe('reading a working copy', () => {
  it('knows a folder git tracks from one it does not', () => {
    expect(isRepo(work)).toBe(true)
    expect(isRepo(yard)).toBe(false)
  })

  it('reads the branch and says it is level with its upstream', async () => {
    const facts = await readCodebase(work)
    expect(facts.present).toBe(true)
    expect(facts.tracked).toBe(true)
    expect(facts.branch).toBe('main')
    expect(facts.hasUpstream).toBe(true)
    expect(facts.behind).toBe(0)
    expect(facts.ahead).toBe(0)
  })

  it('counts what has not been pushed', async () => {
    writeFileSync(join(work, 'second.ts'), 'export const two = 2\n')
    git(work, 'add', '-A')
    git(work, 'commit', '-m', 'second')
    const facts = await readCodebase(work)
    expect(facts.ahead).toBe(1)
    expect(facts.behind).toBe(0)
    git(work, 'push')
  })

  it('counts how far behind the cloud it is, once it has fetched', async () => {
    git(other, 'pull', '--rebase')
    writeFileSync(join(other, 'theirs.ts'), 'export const three = 3\n')
    git(other, 'add', '-A')
    git(other, 'commit', '-m', 'theirs')
    git(other, 'push')

    const stale = await readCodebase(work)
    expect(stale.behind).toBe(0)

    const fresh = await readCodebase(work, true)
    expect(fresh.behind).toBe(1)
  })

  it('notices changes that are not committed', async () => {
    writeFileSync(join(work, 'first.ts'), '// codegraph: module thing\nexport const one = 9\n')
    const facts = await readCodebase(work)
    expect(facts.dirty).toBe(true)
    git(work, 'checkout', '--', 'first.ts')
  })

  it('says nothing is there when the folder has gone', async () => {
    const facts = await readCodebase(join(yard, 'never-existed'))
    expect(facts.present).toBe(false)
    expect(facts.tracked).toBe(false)
  })

  it('reads how far codegraph is turned on', async () => {
    const bare = await readCodebase(work)
    expect(bare.toolsOn).toBe(false)
    expect(bare.rulesWritten).toBe(false)
    expect(bare.taggedFiles).toBe(1)

    mkdirSync(join(work, '.claude'), { recursive: true })
    writeFileSync(
      join(work, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'codegraph@codegraph': true } }),
    )
    writeFileSync(join(work, 'CLAUDE.md'), '# repo\n\nThis repo follows the codegraph rules.\n')

    const set = await readCodebase(work)
    expect(set.toolsOn).toBe(true)
    expect(set.rulesWritten).toBe(true)
    expect(set.taggedFiles).toBeGreaterThan(0)
  })
})

describe('reading a remote', () => {
  it('finds owner and name however the remote is written', () => {
    expect(remoteName('git@github.com:me/thing.git')).toBe('me/thing')
    expect(remoteName('https://github.com/me/thing.git')).toBe('me/thing')
    expect(remoteName('https://github.com/me/thing')).toBe('me/thing')
    expect(remoteName('https://gitlab.com/me/thing.git')).toBe('')
    expect(remoteName('')).toBe('')
  })

  it('names a codebase after its folder, trailing slash or not', () => {
    expect(folderName('C:/work/mosaic/')).toBe('mosaic')
    expect(folderName('/home/me/mosaic')).toBe('mosaic')
  })
})
