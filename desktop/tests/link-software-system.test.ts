// codegraph: test feature link-software-system
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { listProjects } from '../src/features/list-projects.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { useFolder as useGithubFolder } from '../src/modules/github/index.js'
import { useChooser } from '../src/modules/machine/index.js'
import { useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import { aSoftwareSystem, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let project = ''

beforeEach(async () => {
  yard = openYard('link')
  useProjectsFolder(yard.home)
  useGithubFolder(yard.home)
  useChooser(async () => '')
  project = (await createProject('Mosaic')).id
})

afterEach(() => closeYard(yard))

describe('linking a repo into a project', () => {
  it('links the folder the person picks', async () => {
    const path = aSoftwareSystem(yard, 'plain')
    useChooser(async () => path)

    const linked = await linkSoftwareSystem(project)
    expect(linked.ok).toBe(true)
    expect(linked.name).toBe('plain')
    expect((await listProjects())[0]?.systems).toHaveLength(1)
  })

  it('says a linked repo still needs codegraph turned on in it', async () => {
    const linked = await linkSoftwareSystem(project, aSoftwareSystem(yard, 'plain'))
    expect(linked.needsSetup).toBe(true)
  })

  it('says nothing is needed when codegraph is already on in it', async () => {
    const linked = await linkSoftwareSystem(project, aSoftwareSystem(yard, 'ready', { setUp: true }))
    expect(linked.needsSetup).toBe(false)
  })

  it('refuses a folder git does not track, and says why', async () => {
    const loose = join(yard.path, 'loose')
    mkdirSync(loose)

    const linked = await linkSoftwareSystem(project, loose)
    expect(linked.ok).toBe(false)
    expect(linked.problem).toMatch(/not tracked by git/)
    expect((await listProjects())[0]?.systems).toEqual([])
  })

  it('does nothing when the person closes the folder picker', async () => {
    const linked = await linkSoftwareSystem(project)
    expect(linked.cancelled).toBe(true)
    expect((await listProjects())[0]?.systems).toEqual([])
  })

  it('reads the GitHub repo the folder points at', async () => {
    await linkSoftwareSystem(project, aSoftwareSystem(yard, 'web', { remote: 'me/web' }))
    expect((await listProjects())[0]?.systems[0]?.remote).toBe('me/web')
  })

  it('does not link the same folder twice', async () => {
    const path = aSoftwareSystem(yard, 'web')
    await linkSoftwareSystem(project, path)
    await linkSoftwareSystem(project, path)
    expect((await listProjects())[0]?.systems).toHaveLength(1)
  })
})
