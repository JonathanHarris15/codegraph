// codegraph: test feature find-sketches
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findSketches } from '../src/features/find-sketches.js'
import { addProject, addSoftwareSystem, useFolder as useProjects } from '../src/modules/projects/index.js'
import { blankCard, newSketch, useFolder as useSketches, writeSketch } from '../src/modules/sketches/index.js'
import { aMappedRepo, aSoftwareSystem, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard

beforeEach(() => {
  yard = openYard('find-sketches')
  useProjects(yard.home)
  useSketches(yard.home)
})

afterEach(() => closeYard(yard))

describe('finding the sketches an agent can be handed', () => {
  it('lists the sketches of the project the repo serves', async () => {
    const repo = aMappedRepo(yard)
    const project = addProject('Notes', 'notes-app')
    addSoftwareSystem(project.id, { name: 'notes', path: repo, remote: '' })
    writeSketch(newSketch(project.id, 'Search', blankCard(project.id, 'Notes', 'project')))
    expect(await findSketches(repo)).toMatch(/^Project Notes \(notes-app\):\n- Search: blank, changed \d{4}-\d{2}-\d{2}$/)
  })

  it('lists a project named by its short name, which may have no repo yet', async () => {
    addProject('Mosaic', 'mosaic')
    expect(await findSketches('', 'mosaic')).toBe('Project Mosaic (mosaic):\n- no sketches yet')
  })

  it('says plainly when the repo names no project here', async () => {
    expect(await findSketches(aSoftwareSystem(yard, 'plain'))).toMatch(/^This repo names no project this computer has/)
  })
})
