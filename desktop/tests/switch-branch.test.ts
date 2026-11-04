// codegraph: test feature switch-branch
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { switchBranch } from '../src/features/switch-branch.js'
import { useChooser } from '../src/modules/machine/index.js'
import { listProjects, useFolder } from '../src/modules/projects/index.js'
import { aMappedRepo, closeYard, git, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let projectId = ''
let systemId = ''

beforeEach(async () => {
  yard = openYard('switch')
  useFolder(yard.home)
  useChooser(async () => '')
  repo = aMappedRepo(yard)
  projectId = (await createProject('Notes')).id
  await linkSoftwareSystem(projectId, repo)
  systemId = listProjects()[0]!.systems[0]!.id
})

afterEach(() => closeYard(yard))

describe('switching a folder to the branch being looked at', () => {
  it('moves the folder onto a branch here', async () => {
    expect(await switchBranch(projectId, systemId, 'add-search')).toEqual({ ok: true, problem: '' })
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('add-search')
  })

  it('makes a branch only on GitHub into one here that follows it', async () => {
    const remote = join(yard.path, 'remote.git')
    git(yard.path, 'init', '--bare', '-q', remote)
    git(repo, 'remote', 'add', 'origin', remote)
    git(repo, 'push', '-q', 'origin', 'add-search')
    git(repo, 'branch', '-q', '-D', 'add-search')
    git(repo, 'fetch', '-q', 'origin')
    expect((await switchBranch(projectId, systemId, 'origin/add-search')).ok).toBe(true)
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('add-search')
    expect(git(repo, 'rev-parse', '--abbrev-ref', '@{u}')).toBe('origin/add-search')
  })

  it('will not move a folder with changes not committed', async () => {
    writeFileSync(join(repo, 'app', 'half.ts'), '// codegraph: module half\n')
    const done = await switchBranch(projectId, systemId, 'add-search')
    expect(done.ok).toBe(false)
    expect(done.problem).toContain('not committed')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
  })

  it('says why when git will not', async () => {
    const done = await switchBranch(projectId, systemId, 'no-such-branch')
    expect(done.ok).toBe(false)
    expect(done.problem).toMatch(/^Git would not switch/)
  })
})
