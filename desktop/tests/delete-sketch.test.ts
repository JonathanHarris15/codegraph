// codegraph: test feature delete-sketch
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { deleteSketch } from '../src/features/delete-sketch.js'
import { listSketches } from '../src/features/list-sketches.js'
import { startSketch } from '../src/features/start-sketch.js'
import { useFolder as useProjects } from '../src/modules/projects/index.js'
import { useFolder as useSketches } from '../src/modules/sketches/index.js'
import { closeYard, openYard, type Yard } from './yard.js'

let yard: Yard

beforeEach(() => {
  yard = openYard('delete-sketch')
  useProjects(yard.home)
  useSketches(yard.home)
})

afterEach(() => closeYard(yard))

describe('throwing a sketch away', () => {
  it('takes it out of the library', async () => {
    const { id } = await createProject('Notes')
    const keep = await startSketch(id, 'Keep')
    const bin = await startSketch(id, 'Bin')
    await deleteSketch(id, bin.id)
    expect((await listSketches(id)).map((s) => s.id)).toEqual([keep.id])
  })
})
