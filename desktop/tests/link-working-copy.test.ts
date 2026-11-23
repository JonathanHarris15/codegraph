// codegraph: test feature link-working-copy
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { linkWorkingCopy } from '../src/features/link-working-copy.js'
import { listProjects } from '../src/features/list-projects.js'
import { useFolder as useGithubFolder } from '../src/modules/github/index.js'
import { useChooser } from '../src/modules/machine/index.js'
import { addSoftwareSystem, useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import { aSoftwareSystem, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let project = ''
let api = ''

beforeEach(async () => {
  yard = openYard('link-working-copy')
  useProjectsFolder(yard.home)
  useGithubFolder(yard.home)
  useChooser(async () => '')
  project = (await createProject('Wardrobe')).id
  // Another member linked it; this computer only knows it from GitHub.
  api = addSoftwareSystem(project, { name: 'api', path: '', remote: 'me/api' }).id
})

afterEach(() => closeYard(yard))

const row = async () => (await listProjects())[0]?.systems.find((s) => s.id === api)

describe('linking a working copy to a repo already on the project', () => {
  it('fills in the folder of a repo with no working copy here', async () => {
    const path = aSoftwareSystem(yard, 'backend', { remote: 'me/api' })
    const linked = await linkWorkingCopy(project, api, path)
    expect(linked.ok).toBe(true)
    expect((await row())?.path).toBe(path)
    expect((await row())?.cloud).not.toBe('not-here')
  })

  it('asks for the folder when none is given', async () => {
    const path = aSoftwareSystem(yard, 'backend', { remote: 'me/api' })
    useChooser(async () => path)
    expect((await linkWorkingCopy(project, api)).ok).toBe(true)
    expect((await row())?.path).toBe(path)
  })

  it('matches GitHub names whatever their case', async () => {
    const path = aSoftwareSystem(yard, 'backend', { remote: 'Me/API' })
    expect((await linkWorkingCopy(project, api, path)).ok).toBe(true)
  })

  it('refuses a folder that is a different repo, and says which it is', async () => {
    const path = aSoftwareSystem(yard, 'web', { remote: 'me/web' })
    const linked = await linkWorkingCopy(project, api, path)
    expect(linked.ok).toBe(false)
    expect(linked.problem).toMatch(/me\/web/)
    expect(linked.problem).toMatch(/me\/api/)
    expect((await row())?.path).toBe('')
  })

  it('refuses a folder git does not track', async () => {
    const loose = join(yard.path, 'loose')
    mkdirSync(loose)
    const linked = await linkWorkingCopy(project, api, loose)
    expect(linked.ok).toBe(false)
    expect(linked.problem).toMatch(/not tracked by git/)
  })

  it('moves a repo whose folder has gone to the one picked', async () => {
    const old = aSoftwareSystem(yard, 'old', { remote: 'me/api' })
    await linkWorkingCopy(project, api, old)
    rmSync(old, { recursive: true, force: true })
    expect((await row())?.cloud).toBe('missing')

    const path = aSoftwareSystem(yard, 'backend', { remote: 'me/api' })
    expect((await linkWorkingCopy(project, api, path)).ok).toBe(true)
    expect((await row())?.path).toBe(path)
  })

  it('does nothing when the person closes the folder picker', async () => {
    const linked = await linkWorkingCopy(project, api)
    expect(linked.cancelled).toBe(true)
    expect((await row())?.path).toBe('')
  })

  it('says a repo that is not set up still needs its setup', async () => {
    const linked = await linkWorkingCopy(project, api, aSoftwareSystem(yard, 'backend', { remote: 'me/api' }))
    expect(linked.needsSetup).toBe(true)
  })
})
