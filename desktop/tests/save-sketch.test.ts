// codegraph: test feature save-sketch
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { listSketches } from '../src/features/list-sketches.js'
import { openSketch } from '../src/features/open-sketch.js'
import { saveSketch } from '../src/features/save-sketch.js'
import { startSketch } from '../src/features/start-sketch.js'
import { useFolder as useProjects } from '../src/modules/projects/index.js'
import { useFolder as useSketches } from '../src/modules/sketches/index.js'
import { closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let projectId = ''

beforeEach(async () => {
  yard = openYard('save-sketch')
  useProjects(yard.home)
  useSketches(yard.home)
  projectId = (await createProject('Notes')).id
})

afterEach(() => closeYard(yard))

describe('saving what was drawn', () => {
  it('keeps every change, and says when it was last changed', async () => {
    const sketch = await startSketch(projectId, 'Search')
    sketch.name = 'Search, for real'
    sketch.root.notes.push({ id: 'n', text: 'needs a page', x: 1, y: 2 })
    const saved = await saveSketch(sketch)

    expect(saved.updatedAt >= sketch.createdAt).toBe(true)
    const opened = await openSketch(projectId, sketch.id)
    expect(opened?.sketch.name).toBe('Search, for real')
    // A note is kept, and opens as a sticky note on the Notes layer.
    expect(opened?.sketch.layers?.[0]?.items[0]).toMatchObject({ id: 'n', kind: 'sticky', text: 'needs a page', x: 1, y: 2 })
    expect((await listSketches(projectId)).map((s) => s.name)).toEqual(['Search, for real'])
  })

  it('will not save a sketch into a project that is not there', async () => {
    const sketch = await startSketch(projectId, 'Search')
    await expect(saveSketch({ ...sketch, projectId: 'nobody' })).rejects.toThrow()
  })
})
