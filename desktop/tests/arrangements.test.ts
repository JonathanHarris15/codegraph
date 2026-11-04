// codegraph: test feature show-arrangement
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { saveArrangement } from '../src/features/save-arrangement.js'
import { showArrangement } from '../src/features/show-arrangement.js'
import { forgetting, movedTo, useFolder as useArrangements } from '../src/modules/arrangements/index.js'
import { addProject, addSoftwareSystem, useFolder as useProjects } from '../src/modules/projects/index.js'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let projectId = ''
let system = ''
const web = (): string => `${system}/container:web`
const db = (): string => `${system}/container:db`
/** A wire's sentence is known by the two cards it joins and how. */
const words = (): string => `${web()}>${db()}>keeps`

beforeAll(() => {
  yard = openYard('arrangements')
  useProjects(yard.home)
  useArrangements(yard.home)
  const repo = aMappedRepo(yard)
  projectId = addProject('Notes', 'notes-app').id
  system = addSoftwareSystem(projectId, { name: 'notes', path: repo, remote: '' }).id
})

afterAll(() => closeYard(yard))

describe('where a person has moved a map about', () => {
  it('is nothing until they move something', async () => {
    expect(await showArrangement(projectId)).toEqual([])
  })

  it('keeps every card and sentence where it was put', async () => {
    await saveArrangement(projectId, [
      { id: web(), x: 40, y: -121 },
      { id: db(), x: 400, y: 80 },
      { id: words(), x: 220, y: 10 },
    ])
    expect(await showArrangement(projectId)).toEqual([
      { id: web(), x: 40, y: -121 },
      { id: db(), x: 400, y: 80 },
      { id: words(), x: 220, y: 10 },
    ])
  })

  it('is none for a project nobody has moved anything on', async () => {
    expect(await showArrangement('nobody')).toEqual([])
  })
})

describe('moving things on an arrangement', () => {
  const was = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 10, y: 10 },
  ]

  it('moves one without forgetting the others, to the nearest pixel', () => {
    expect(movedTo(was, [{ id: 'a', x: 40.4, y: -120.6 }])).toEqual([
      { id: 'a', x: 40, y: -121 },
      { id: 'b', x: 10, y: 10 },
    ])
  })

  it('adds one it had never heard of', () => {
    expect(movedTo(was, [{ id: 'c', x: 5, y: 5 }]).map((spot) => spot.id)).toEqual(['a', 'b', 'c'])
  })

  it('forgets one, so the map lays it out again', () => {
    expect(forgetting(was, ['a'])).toEqual([{ id: 'b', x: 10, y: 10 }])
  })

  it('forgets nothing it was not asked to', () => {
    expect(forgetting(was, ['nobody'])).toEqual(was)
  })
})
