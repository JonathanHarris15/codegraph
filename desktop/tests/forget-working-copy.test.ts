// codegraph: test feature forget-working-copy
import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { forgetWorkingCopy } from '../src/features/forget-working-copy.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { listProjects } from '../src/features/list-projects.js'
import { useFolder as useGithubFolder } from '../src/modules/github/index.js'
import { useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import { aSoftwareSystem, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard

beforeEach(() => {
  yard = openYard('forget-working-copy')
  useProjectsFolder(yard.home)
  useGithubFolder(yard.home)
})

afterEach(() => closeYard(yard))

describe('forgetting a working copy', () => {
  it('keeps the repo on the project, with no working copy here, and leaves the folder alone', async () => {
    const { id } = await createProject('Wardrobe')
    const path = aSoftwareSystem(yard, 'api', { remote: 'me/api' })
    await linkSoftwareSystem(id, path)
    const system = (await listProjects())[0]!.systems[0]!

    expect((await forgetWorkingCopy(id, system.id)).ok).toBe(true)

    const after = (await listProjects())[0]!.systems
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: system.id, remote: 'me/api', path: '', cloud: 'not-here' })
    expect(existsSync(path)).toBe(true)
  })

  it('says so when the repo is not on the project', async () => {
    const { id } = await createProject('Wardrobe')
    expect((await forgetWorkingCopy(id, 'nothing')).ok).toBe(false)
  })
})
