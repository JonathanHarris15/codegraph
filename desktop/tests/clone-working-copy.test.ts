// codegraph: test feature clone-working-copy
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cloneWorkingCopy } from '../src/features/clone-working-copy.js'
import { createProject } from '../src/features/create-project.js'
import { listProjects } from '../src/features/list-projects.js'
import { useFolder as useGithubFolder } from '../src/modules/github/index.js'
import { useChooser } from '../src/modules/machine/index.js'
import { addSoftwareSystem, useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import { useMirrors } from '../src/modules/repo/index.js'
import { aSoftwareSystem, closeYard, openYard, type Yard } from './yard.js'

// A folder of bare repos stands in for GitHub, as useMirrors allows.
let yard: Yard
let project = ''
let api = ''
let parent = ''

beforeEach(async () => {
  yard = openYard('clone-working-copy')
  const hub = join(yard.path, 'github')
  mkdirSync(join(hub, 'me'), { recursive: true })
  const theirs = aSoftwareSystem(yard, 'theirs')
  execFileSync('git', ['clone', '--bare', '--quiet', theirs, join(hub, 'me', 'api.git')])
  useProjectsFolder(yard.home)
  useGithubFolder(yard.home)
  useMirrors(yard.home, hub)
  parent = join(yard.path, 'code')
  mkdirSync(parent)
  useChooser(async () => parent)
  project = (await createProject('Wardrobe')).id
  api = addSoftwareSystem(project, { name: 'api', path: '', remote: 'me/api' }).id
})

afterEach(() => closeYard(yard))

describe('cloning a working copy of a repo on the project', () => {
  it('clones into the folder picked, named for the repo, and links it', async () => {
    const cloned = await cloneWorkingCopy(project, api)
    expect(cloned.ok).toBe(true)
    const into = join(parent, 'api')
    expect(existsSync(join(into, 'thing.ts'))).toBe(true)
    expect((await listProjects())[0]?.systems[0]?.path).toBe(into)
  })

  it('will not clone over a folder already there', async () => {
    mkdirSync(join(parent, 'api'))
    const cloned = await cloneWorkingCopy(project, api)
    expect(cloned.ok).toBe(false)
    expect(cloned.problem).toMatch(/already a folder/)
    expect((await listProjects())[0]?.systems[0]?.path).toBe('')
  })

  it('says so when GitHub will not hand the repo over', async () => {
    const gone = addSoftwareSystem(project, { name: 'secret', path: '', remote: 'me/secret' }).id
    const cloned = await cloneWorkingCopy(project, gone)
    expect(cloned.ok).toBe(false)
    expect(cloned.problem).toMatch(/me\/secret/)
    expect(existsSync(join(parent, 'secret'))).toBe(false)
  })

  it('does nothing when the person closes the folder picker', async () => {
    useChooser(async () => '')
    expect((await cloneWorkingCopy(project, api)).cancelled).toBe(true)
  })
})
