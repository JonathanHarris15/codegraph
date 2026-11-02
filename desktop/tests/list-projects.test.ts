// codegraph: test feature list-projects
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { listProjects } from '../src/features/list-projects.js'
import { linkCodebase } from '../src/features/link-codebase.js'
import { useFolder as useGithubFolder } from '../src/modules/github/index.js'
import { useChooser } from '../src/modules/machine/index.js'
import { useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import { aCodebase, closeYard, openYard, type Yard } from './yard.js'

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

  it('shows a new project with no codebases', async () => {
    await createProject('Mosaic')
    const shown = await listProjects()
    expect(shown).toHaveLength(1)
    expect(shown[0]?.name).toBe('Mosaic')
    expect(shown[0]?.codebases).toEqual([])
  })

  it('holds more than one codebase under one project', async () => {
    const { id } = await createProject('Mosaic')
    await linkCodebase(id, aCodebase(yard, 'web', { setUp: true, remote: 'me/web' }))
    await linkCodebase(id, aCodebase(yard, 'api', { setUp: true, remote: 'me/api' }))
    const [project] = await listProjects()
    expect(project?.codebases.map((c) => c.name)).toEqual(['web', 'api'])
    expect(project?.codebases.map((c) => c.remote)).toEqual(['me/web', 'me/api'])
  })

  it('says a codebase is ready when codegraph is turned on in it', async () => {
    const { id } = await createProject('Mosaic')
    await linkCodebase(id, aCodebase(yard, 'ready', { setUp: true }))
    const codebase = (await listProjects())[0]?.codebases[0]
    expect(codebase?.setUp).toBe(true)
    expect(codebase?.toolsOn).toBe(true)
    expect(codebase?.rulesWritten).toBe(true)
    expect(codebase?.taggedFiles).toBe(1)
  })

  it('says a codebase needs setting up when codegraph is not on in it', async () => {
    const { id } = await createProject('Mosaic')
    await linkCodebase(id, aCodebase(yard, 'plain'))
    expect((await listProjects())[0]?.codebases[0]?.setUp).toBe(false)
  })

  it('says a repo with no GitHub copy has none, rather than guessing', async () => {
    const { id } = await createProject('Mosaic')
    await linkCodebase(id, aCodebase(yard, 'alone'))
    expect((await listProjects())[0]?.codebases[0]?.cloud).toBe('no-remote')
  })

  it('says when a linked folder has been moved away', async () => {
    const { id } = await createProject('Mosaic')
    const path = aCodebase(yard, 'gone')
    await linkCodebase(id, path)
    rmSync(path, { recursive: true, force: true })
    expect((await listProjects())[0]?.codebases[0]?.cloud).toBe('missing')
  })

  it('keeps projects apart', async () => {
    const one = await createProject('One')
    const two = await createProject('Two')
    await linkCodebase(one.id, aCodebase(yard, 'web'))
    await linkCodebase(two.id, aCodebase(yard, 'api'))
    const shown = await listProjects()
    expect(shown.map((p) => p.codebases.map((c) => c.name))).toEqual([['web'], ['api']])
  })

  it('counts nothing for a project whose folder was never a repo', async () => {
    const { id } = await createProject('Mosaic')
    const loose = join(yard.path, 'loose')
    mkdirSync(loose)
    await linkCodebase(id, loose)
    expect((await listProjects())[0]?.codebases).toEqual([])
  })
})
