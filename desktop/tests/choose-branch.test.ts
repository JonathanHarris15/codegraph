// codegraph: test feature choose-branch
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chooseBranch } from '../src/features/choose-branch.js'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { listProjects as listViews } from '../src/features/list-projects.js'
import { showMap } from '../src/features/show-map.js'
import { useChooser } from '../src/modules/machine/index.js'
import { listProjects, useFolder } from '../src/modules/projects/index.js'
import { aMappedRepo, closeYard, git, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let projectId = ''
let systemId = ''

beforeEach(async () => {
  yard = openYard('choose-branch')
  useFolder(yard.home)
  useChooser(async () => '')
  repo = aMappedRepo(yard)
  projectId = (await createProject('Notes')).id
  await linkSoftwareSystem(projectId, repo)
  systemId = listProjects()[0]!.systems[0]!.id
})

afterEach(() => closeYard(yard))

const web = async () =>
  (await showMap(projectId)).card.children[0]!.children.find((c) => c.name === 'web')!.children.map((c) => c.name)

describe('the branch a map opens on', () => {
  it('is the folder, until a branch is chosen', async () => {
    expect((await showMap(projectId)).systems[0]?.point).toEqual({ kind: 'live', branch: 'main' })
  })

  it('is the branch chosen, read from git, and stays chosen', async () => {
    await chooseBranch(projectId, systemId, 'add-search')
    expect((await showMap(projectId)).systems[0]?.point).toEqual({ kind: 'branch', name: 'add-search' })
    expect(await web()).toContain('search')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
  })

  it('is the folder when the branch chosen is the one checked out', async () => {
    await chooseBranch(projectId, systemId, 'main')
    expect((await showMap(projectId)).systems[0]?.point.kind).toBe('live')
  })

  it('moves to main, and remembers main, when the branch chosen has gone', async () => {
    git(repo, 'branch', '-q', 'short-lived')
    await chooseBranch(projectId, systemId, 'short-lived')
    git(repo, 'branch', '-q', '-D', 'short-lived')
    expect((await showMap(projectId)).systems[0]?.point).toEqual({ kind: 'live', branch: 'main' })
    expect(listProjects()[0]?.systems[0]?.branch).toBe('main')
  })

  it('shows on the projects page, with every branch to pick from', async () => {
    await chooseBranch(projectId, systemId, 'add-search')
    const row = (await listViews())[0]!.systems[0]!
    expect(row.point).toEqual({ kind: 'branch', name: 'add-search' })
    expect(row.branches.flatMap((p) => (p.kind === 'branch' ? [p.name] : [])).sort()).toEqual(['add-search', 'main'])
  })
})
