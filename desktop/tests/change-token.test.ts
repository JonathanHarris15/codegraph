// codegraph: test feature change-token
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changeToken } from '../src/features/change-token.js'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { useChooser } from '../src/modules/machine/index.js'
import { findProject, useFolder } from '../src/modules/projects/index.js'
import { aMappedRepo, closeYard, git, openYard, type Yard } from './yard.js'

const DESIGN = '---\nname: Daylight\ncolors:\n  blue-500: "#2563eb"\nspacing:\n  md: 16px\n---\n'

let yard: Yard
let repo = ''
let projectId = ''
let systemId = ''

beforeEach(async () => {
  yard = openYard('change-token')
  useFolder(yard.home)
  useChooser(async () => '')
  repo = aMappedRepo(yard)
  writeFileSync(join(repo, 'DESIGN.md'), DESIGN)
  git(repo, 'add', 'DESIGN.md')
  git(repo, 'commit', '-q', '-m', 'Add the design system')
  projectId = (await createProject('Notes')).id
  await linkSoftwareSystem(projectId, repo)
  systemId = findProject(projectId)!.systems[0]!.id
})

afterEach(() => closeYard(yard))

const onDisk = (): string => readFileSync(join(repo, 'DESIGN.md'), 'utf8')
const branch = (): string => git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')

describe('changing a token from the app', () => {
  it('never writes on the main line: it makes a branch first, then writes', async () => {
    const done = await changeToken(projectId, systemId, 'colors.blue-500', '#dc2626')
    expect(done).toEqual({ ok: true, branch: 'design/colors-blue-500', problem: '' })
    expect(branch()).toBe('design/colors-blue-500')
    expect(onDisk()).toContain('blue-500: "#dc2626"')
    expect(git(repo, 'show', 'main:DESIGN.md')).toContain('#2563eb')
  })

  it('writes straight onto a branch already in progress', async () => {
    git(repo, 'switch', '-q', '-c', 'calmer')
    const done = await changeToken(projectId, systemId, 'spacing.md', '24px')
    expect(done).toEqual({ ok: true, branch: 'calmer', problem: '' })
    expect(branch()).toBe('calmer')
    expect(onDisk()).toContain('md: 24px')
  })

  it('picks a new branch name when the obvious one is taken', async () => {
    git(repo, 'branch', 'design/colors-blue-500')
    const done = await changeToken(projectId, systemId, 'colors.blue-500', '#000000')
    expect(done.branch).toBe('design/colors-blue-500-2')
  })

  it('changes nothing when the value will not do, and says why', async () => {
    const done = await changeToken(projectId, systemId, 'colors.blue-500', 'bright')
    expect(done).toEqual({ ok: false, branch: '', problem: 'colors.blue-500 is a colour, and "bright" is not one' })
    expect(branch()).toBe('main')
    expect(onDisk()).toBe(DESIGN)
  })

  it('says so when the repo has no DESIGN.md, or is not on this computer', async () => {
    git(repo, 'rm', '-q', 'DESIGN.md')
    expect((await changeToken(projectId, systemId, 'colors.blue-500', '#000')).problem).toBe('This repo has no DESIGN.md to change.')
    expect((await changeToken(projectId, 'nope', 'colors.blue-500', '#000')).problem).toBe('That software system is not on this computer.')
  })
})
