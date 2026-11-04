// codegraph: test feature list-points
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { listPoints } from '../src/features/list-points.js'
import { listProjects } from '../src/modules/projects/index.js'
import { useChooser } from '../src/modules/machine/index.js'
import { useFolder } from '../src/modules/projects/index.js'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard

beforeEach(() => {
  yard = openYard('points')
  useFolder(yard.home)
  useChooser(async () => '')
})

afterEach(() => closeYard(yard))

describe('where a person can look in a software system', () => {
  it('offers the live folder, each branch and the latest commits', async () => {
    const { id } = await createProject('Notes')
    await linkSoftwareSystem(id, aMappedRepo(yard))
    const systemId = listProjects()[0]!.systems[0]!.id

    const points = await listPoints(id, systemId)
    expect(points[0]).toEqual({ kind: 'live', branch: 'main' })
    expect(points.flatMap((p) => (p.kind === 'branch' ? [p.name] : [])).sort()).toEqual(['add-search', 'main'])
    expect(points.some((p) => p.kind === 'commit')).toBe(true)
  })

  it('offers nothing for a software system it does not know', async () => {
    const { id } = await createProject('Notes')
    expect(await listPoints(id, 'nobody')).toEqual([])
  })
})
