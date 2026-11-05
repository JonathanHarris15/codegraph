// codegraph: test feature list-projects
import { mkdirSync, rmSync } from 'node:fs'
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

beforeEach(() => {
  yard = openYard('grid')
  useProjectsFolder(yard.home)
  useGithubFolder(yard.home)
  useChooser(async () => '')
})

afterEach(() => closeYard(yard))

describe('the grid of projects', () => {
  it('shows nothing before a project is made', async () => {
    expect(await listProjects()).toEqual([])
  })

  it('shows a new project with no software systems', async () => {
    await createProject('Mosaic')
    const shown = await listProjects()
    expect(shown).toHaveLength(1)
    expect(shown[0]?.name).toBe('Mosaic')
    expect(shown[0]?.systems).toEqual([])
  })

  it('holds more than one software system under one project', async () => {
    const { id } = await createProject('Mosaic')
    await linkSoftwareSystem(id, aSoftwareSystem(yard, 'web', { setUp: true, remote: 'me/web' }))
    await linkSoftwareSystem(id, aSoftwareSystem(yard, 'api', { setUp: true, remote: 'me/api' }))
    const [project] = await listProjects()
    expect(project?.systems.map((c) => c.name)).toEqual(['web', 'api'])
    expect(project?.systems.map((c) => c.remote)).toEqual(['me/web', 'me/api'])
  })

  it('says a software system is ready when codegraph is turned on in it', async () => {
    const { id } = await createProject('Mosaic')
    await linkSoftwareSystem(id, aSoftwareSystem(yard, 'ready', { setUp: true }))
    const system = (await listProjects())[0]?.systems[0]
    expect(system?.setUp).toBe(true)
    expect(system?.configWritten).toBe(true)
    expect(system?.serves).toEqual(['ready'])
    expect(system?.taggedFiles).toBe(1)
  })

  it('says whether a repo names the project it sits in', async () => {
    const { id } = await createProject('Ready')
    await linkSoftwareSystem(id, aSoftwareSystem(yard, 'ready', { setUp: true }))
    await linkSoftwareSystem(id, aSoftwareSystem(yard, 'other', { setUp: true }))
    const [project] = await listProjects()
    expect(project?.shortName).toBe('ready')
    expect(project?.systems.map((s) => s.namesThisProject)).toEqual([true, false])
  })

  it('says a software system needs setting up when codegraph is not on in it', async () => {
    const { id } = await createProject('Mosaic')
    await linkSoftwareSystem(id, aSoftwareSystem(yard, 'plain'))
    expect((await listProjects())[0]?.systems[0]?.setUp).toBe(false)
  })

  it('says a repo with no GitHub copy has none, rather than guessing', async () => {
    const { id } = await createProject('Mosaic')
    await linkSoftwareSystem(id, aSoftwareSystem(yard, 'alone'))
    expect((await listProjects())[0]?.systems[0]?.cloud).toBe('no-remote')
  })

  it('says when a linked folder has been moved away', async () => {
    const { id } = await createProject('Mosaic')
    const path = aSoftwareSystem(yard, 'gone')
    await linkSoftwareSystem(id, path)
    rmSync(path, { recursive: true, force: true })
    expect((await listProjects())[0]?.systems[0]?.cloud).toBe('missing')
  })

  it('keeps projects apart', async () => {
    const one = await createProject('One')
    const two = await createProject('Two')
    await linkSoftwareSystem(one.id, aSoftwareSystem(yard, 'web'))
    await linkSoftwareSystem(two.id, aSoftwareSystem(yard, 'api'))
    const shown = await listProjects()
    expect(shown.map((p) => p.systems.map((c) => c.name))).toEqual([['web'], ['api']])
  })

  it('counts nothing for a project whose folder was never a repo', async () => {
    const { id } = await createProject('Mosaic')
    const loose = join(yard.path, 'loose')
    mkdirSync(loose)
    await linkSoftwareSystem(id, loose)
    expect((await listProjects())[0]?.systems).toEqual([])
  })
})
