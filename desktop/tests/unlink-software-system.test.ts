// codegraph: test feature unlink-software-system
import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { listProjects } from '../src/features/list-projects.js'
import { unlinkSoftwareSystem } from '../src/features/unlink-software-system.js'
import { useFolder as useGithubFolder } from '../src/modules/github/index.js'
import { rememberMember, useFolder as useMembersFolder } from '../src/modules/members/index.js'
import { findProject, keepProject, useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import { aSoftwareSystem, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard

beforeEach(() => {
  yard = openYard('unlink-software-system')
  useProjectsFolder(yard.home)
  useGithubFolder(yard.home)
  useMembersFolder(yard.home)
})

afterEach(() => closeYard(yard))

const aProjectWithTwo = async () => {
  const { id } = await createProject('Wardrobe')
  const api = aSoftwareSystem(yard, 'api', { remote: 'me/api' })
  await linkSoftwareSystem(id, api)
  await linkSoftwareSystem(id, aSoftwareSystem(yard, 'web', { remote: 'me/web' }))
  const systems = (await listProjects())[0]!.systems
  return { id, api, apiId: systems.find((s) => s.name === 'api')!.id }
}

describe('taking a repo off a project', () => {
  it('takes it off, keeps the others, and never touches the folder', async () => {
    const { id, api, apiId } = await aProjectWithTwo()
    expect((await unlinkSoftwareSystem(id, apiId)).ok).toBe(true)
    expect((await listProjects())[0]!.systems.map((s) => s.name)).toEqual(['web'])
    expect(existsSync(api)).toBe(true)
  })

  it('refuses a viewer, who changes nothing', async () => {
    const { id, apiId } = await aProjectWithTwo()
    const me = { id: '7', login: 'ben', name: 'Ben', avatar: '' }
    rememberMember(me)
    keepProject({ ...findProject(id)!, online: true, ownerId: '1', members: [{ ...me, role: 'viewer' }] })

    const done = await unlinkSoftwareSystem(id, apiId)
    expect(done.ok).toBe(false)
    expect(done.problem).toMatch(/viewer/i)
    expect(findProject(id)!.systems).toHaveLength(2)
  })

  it('lets a collaborator, who may add repos, take one off', async () => {
    const { id, apiId } = await aProjectWithTwo()
    const me = { id: '7', login: 'ben', name: 'Ben', avatar: '' }
    rememberMember(me)
    keepProject({ ...findProject(id)!, online: true, ownerId: '1', members: [{ ...me, role: 'collaborator' }] })
    expect((await unlinkSoftwareSystem(id, apiId)).ok).toBe(true)
  })
})
