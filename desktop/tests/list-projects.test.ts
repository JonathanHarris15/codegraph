// codegraph: test feature list-projects
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { listProjects } from '../src/features/list-projects.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { useFolder as useGithubFolder } from '../src/modules/github/index.js'
import { SETUP } from '../src/modules/instructions/index.js'
import { useChooser } from '../src/modules/machine/index.js'
import { addSoftwareSystem, useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import { aSoftwareSystem, closeYard, git, openYard, type Yard } from './yard.js'

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

  it('offers a working copy found beside the project\'s other repos, without linking it', async () => {
    const { id } = await createProject('Wardrobe')
    await linkSoftwareSystem(id, aSoftwareSystem(yard, 'wardrobe/frontend', { remote: 'me/frontend' }))
    addSoftwareSystem(id, { name: 'wardrobe-backend', path: '', remote: 'me/wardrobe-backend' })
    aSoftwareSystem(yard, 'wardrobe/other', { remote: 'me/other' })
    const backend = aSoftwareSystem(yard, 'wardrobe/backend', { remote: 'Me/Wardrobe-Backend' })

    const row = (await listProjects())[0]?.systems.find((s) => s.name === 'wardrobe-backend')
    expect(row?.found).toBe(backend)
    expect(row?.path).toBe('')
  })

  it('offers nothing when no folder nearby is the repo', async () => {
    const { id } = await createProject('Wardrobe')
    await linkSoftwareSystem(id, aSoftwareSystem(yard, 'wardrobe/frontend', { remote: 'me/frontend' }))
    addSoftwareSystem(id, { name: 'wardrobe-backend', path: '', remote: 'me/wardrobe-backend' })
    aSoftwareSystem(yard, 'wardrobe/other', { remote: 'me/other' })
    expect((await listProjects())[0]?.systems.find((s) => s.name === 'wardrobe-backend')?.found).toBe('')
  })

  it('counts nothing for a project whose folder was never a repo', async () => {
    const { id } = await createProject('Mosaic')
    const loose = join(yard.path, 'loose')
    mkdirSync(loose)
    await linkSoftwareSystem(id, loose)
    expect((await listProjects())[0]?.systems).toEqual([])
  })
})

describe("codegraph's skills in each repo (ADR 0037)", () => {
  const told = process.env['CLAUDE_CONFIG_DIR']
  afterEach(() => {
    if (told === undefined) delete process.env['CLAUDE_CONFIG_DIR']
    else process.env['CLAUDE_CONFIG_DIR'] = told
  })

  /** Claude Code's own record of the plugins installed on this computer. */
  const installed = (installs: Record<string, unknown>): void => {
    const config = join(yard.path, 'claude')
    mkdirSync(join(config, 'plugins'), { recursive: true })
    writeFileSync(join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: installs }))
    process.env['CLAUDE_CONFIG_DIR'] = config
  }

  /** A set-up repo whose committed settings turn the plugin on for everyone on it. */
  const turnedOn = (name: string): string => {
    const repo = aSoftwareSystem(yard, name, { setUp: true })
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(join(repo, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'codegraph-app@codegraph': true } }))
    git(repo, 'add', '-A')
    git(repo, 'commit', '-m', 'skills')
    return repo
  }

  it('says a repo turns the skills on, and that they are not installed on this computer', async () => {
    installed({})
    const { id } = await createProject('Mosaic')
    await linkSoftwareSystem(id, turnedOn('web'))
    expect((await listProjects())[0]?.systems[0]?.skills).toEqual({ on: true, installed: '', behind: false })
  })

  it('says when the skills installed here are older than the app', async () => {
    installed({ 'codegraph-app@codegraph': [{ scope: 'user', version: '0.0.1', installPath: '/x' }] })
    const { id } = await createProject('Mosaic')
    await linkSoftwareSystem(id, aSoftwareSystem(yard, 'api', { setUp: true }))
    expect((await listProjects())[0]?.systems[0]?.skills).toEqual({ on: false, installed: '0.0.1', behind: true })
  })

  it('counts skills installed for one repo only in that repo', async () => {
    const repo = turnedOn('web')
    installed({ 'codegraph-app@codegraph': [{ scope: 'project', projectPath: repo, version: '999.0.0', installPath: '/x' }] })
    const { id } = await createProject('Mosaic')
    await linkSoftwareSystem(id, repo)
    await linkSoftwareSystem(id, aSoftwareSystem(yard, 'api', { setUp: true }))
    const [web, api] = (await listProjects())[0]!.systems
    expect(web?.skills).toEqual({ on: true, installed: '999.0.0', behind: false })
    expect(api?.skills).toEqual({ on: false, installed: '', behind: false })
  })
})

describe('a repo set up by an older codegraph (ADR 0039)', () => {
  /** A set-up repo whose config says which setup it got, with more files committed beside it. */
  const setUpWith = (name: string, setup: string | null, files: Record<string, string> = {}): string => {
    const repo = aSoftwareSystem(yard, name, { setUp: true })
    const config = { projects: [name], containers: { app: { kind: 'command-line tool', folders: [''] } }, ...(setup === null ? {} : { setup }) }
    writeFileSync(join(repo, 'codegraph.config.json'), JSON.stringify(config))
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(join(repo, file, '..'), { recursive: true })
      writeFileSync(join(repo, file), text)
    }
    git(repo, 'add', '-A')
    git(repo, 'commit', '-m', 'setup')
    return repo
  }

  it('says a repo whose config names no setup was set up by an older one, and what it left behind', async () => {
    const { id } = await createProject('Mosaic')
    await linkSoftwareSystem(
      id,
      setUpWith('api', null, {
        'CONTEXT.md': '# Words\n',
        'docs/adr/0001-one.md': '# 1. One\n',
        '.claude/settings.json': JSON.stringify({ enabledPlugins: { 'codegraph@codegraph': true } }),
      }),
    )
    expect((await listProjects())[0]?.systems[0]?.setup).toEqual({
      version: '',
      behind: true,
      leftOver: ['CONTEXT.md', 'docs/adr/', 'the legacy codegraph plugin, turned on in .claude/settings.json'],
    })
  })

  it('says a repo set up by an older setup is behind, and one set up by this one is not', async () => {
    const { id } = await createProject('Mosaic')
    await linkSoftwareSystem(id, setUpWith('api', '0.5.0'))
    await linkSoftwareSystem(id, setUpWith('web', SETUP))
    const [api, web] = (await listProjects())[0]!.systems
    expect(api?.setup).toEqual({ version: '0.5.0', behind: true, leftOver: [] })
    expect(web?.setup).toEqual({ version: SETUP, behind: false, leftOver: [] })
  })

  it('reads the setup from the main line, not the branch checked out', async () => {
    const repo = setUpWith('api', '0.5.0')
    git(repo, 'switch', '-q', '-c', 'codegraph-setup')
    writeFileSync(join(repo, 'codegraph.config.json'), JSON.stringify({ projects: ['api'], setup: SETUP }))
    git(repo, 'commit', '-qam', 'setup again')
    const { id } = await createProject('Mosaic')
    await linkSoftwareSystem(id, repo)
    expect((await listProjects())[0]?.systems[0]?.setup.behind).toBe(true)
  })
})
