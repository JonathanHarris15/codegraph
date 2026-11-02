// codegraph: test module repo
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { folderName, isRepo, isSetUp, readSoftwareSystem, remoteName } from '../src/modules/repo/index.js'

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
    const facts = await readSoftwareSystem(work)
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
    const facts = await readSoftwareSystem(work)
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

    const stale = await readSoftwareSystem(work)
    expect(stale.behind).toBe(0)

    const fresh = await readSoftwareSystem(work, true)
    expect(fresh.behind).toBe(1)
  })

  it('notices changes that are not committed', async () => {
    writeFileSync(join(work, 'first.ts'), '// codegraph: module thing\nexport const one = 9\n')
    const facts = await readSoftwareSystem(work)
    expect(facts.dirty).toBe(true)
    git(work, 'checkout', '--', 'first.ts')
  })

  it('says nothing is there when the folder has gone', async () => {
    const facts = await readSoftwareSystem(join(yard, 'never-existed'))
    expect(facts.present).toBe(false)
    expect(facts.tracked).toBe(false)
  })

  it('says codegraph is not turned on, and does not bother counting tags', async () => {
    const bare = await readSoftwareSystem(work)
    expect(bare.toolsOn).toBe(false)
    expect(bare.rulesWritten).toBe(false)
    expect(bare.taggedFiles).toBe(0)
  })
})

/** Setting a repo up happens on a branch and is merged, so the app has to
 *  say something sensible at each step. */
describe('setup is the repo’s, not the branch’s', () => {
  const turnOn = (clone: string): void => {
    mkdirSync(join(clone, '.claude'), { recursive: true })
    writeFileSync(
      join(clone, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'codegraph@codegraph': true } }),
    )
    writeFileSync(join(clone, 'CLAUDE.md'), '# repo\n\nThis repo follows the codegraph rules.\n')
    git(clone, 'add', '-A')
    git(clone, 'commit', '-m', 'turn codegraph on')
  }

  it('says the main line is what it reads against', async () => {
    const facts = await readSoftwareSystem(work)
    expect(facts.mainLine).toBe('main')
  })

  it('does not count a setup that is only in the working copy', async () => {
    mkdirSync(join(work, '.claude'), { recursive: true })
    writeFileSync(join(work, '.claude', 'settings.json'), '{"enabledPlugins":{"codegraph":true}}')

    const facts = await readSoftwareSystem(work)
    expect(facts.toolsOn).toBe(false)
    expect(facts.setUpHere).toBe(false)

    rmSync(join(work, '.claude'), { recursive: true, force: true })
  })

  it('says it is set up on this branch only, before the branch is merged', async () => {
    git(work, 'checkout', '-q', '-b', 'turn-codegraph-on')
    turnOn(work)

    const facts = await readSoftwareSystem(work)
    expect(facts.branch).toBe('turn-codegraph-on')
    expect(facts.setUpHere).toBe(true)
    expect(facts.toolsOn).toBe(false)
    expect(isSetUp(facts)).toBe(false)
  })

  it('says the repo is set up once the branch is merged and pushed', async () => {
    git(work, 'checkout', '-q', 'main')
    git(work, 'pull', '-q', '--rebase')
    git(work, 'merge', '-q', 'turn-codegraph-on')
    git(work, 'push', '-q')

    const facts = await readSoftwareSystem(work)
    expect(isSetUp(facts)).toBe(true)
    expect(facts.toolsOn).toBe(true)
    expect(facts.rulesWritten).toBe(true)
    expect(facts.taggedFiles).toBeGreaterThan(0)
  })

  it('counts only what git tracks, not loose files beside it', async () => {
    const before = await readSoftwareSystem(work)
    writeFileSync(join(work, 'scratch.ts'), '// codegraph: module scratch\n')
    const after = await readSoftwareSystem(work)
    expect(after.taggedFiles).toBe(before.taggedFiles)
    expect(after.sourceFiles).toBe(before.sourceFiles)
    rmSync(join(work, 'scratch.ts'))
  })

  it('still says the repo is set up from a branch that knows nothing about it', async () => {
    git(work, 'checkout', '-q', '-b', 'older-work', 'HEAD~2')
    const facts = await readSoftwareSystem(work)
    expect(facts.branch).toBe('older-work')
    expect(isSetUp(facts)).toBe(true)
    expect(facts.setUpHere).toBe(false)
    git(work, 'checkout', '-q', 'main')
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

  it('names a software system after its folder, trailing slash or not', () => {
    expect(folderName('C:/work/mosaic/')).toBe('mosaic')
    expect(folderName('/home/me/mosaic')).toBe('mosaic')
  })
})
