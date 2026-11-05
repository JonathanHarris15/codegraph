// codegraph: test feature add-mockup
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addMockup } from '../src/features/add-mockup.js'
import { createProject } from '../src/features/create-project.js'
import { openSketch } from '../src/features/open-sketch.js'
import { saveSketch } from '../src/features/save-sketch.js'
import { startSketch } from '../src/features/start-sketch.js'
import { usePicturePicker } from '../src/modules/machine/index.js'
import { useFolder as useProjects } from '../src/modules/projects/index.js'
import { blankCard, useFolder as useSketches } from '../src/modules/sketches/index.js'
import { aPicture, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let projectId = ''

beforeEach(async () => {
  yard = openYard('mockup')
  useProjects(yard.home)
  useSketches(yard.home)
  projectId = (await createProject('Notes')).id
})

afterEach(() => closeYard(yard))

describe('dropping a mockup onto a page', () => {
  it('keeps the picture the person picks, and shows it when the sketch opens', async () => {
    const picked = join(yard.path, 'search.png')
    writeFileSync(picked, aPicture())
    usePicturePicker(async () => picked)

    const sketch = await startSketch(projectId, 'Search')
    const added = await addMockup(projectId, sketch.id, 'page-1')
    expect(added).toMatchObject({ ok: true, name: 'page-1.png' })

    sketch.root.children.push({ ...blankCard('page-1', 'search', 'component', 'page'), mockup: added.name })
    await saveSketch(sketch)
    const opened = await openSketch(projectId, sketch.id)
    expect(opened?.mockups['page-1']).toMatch(/^data:image\/png;base64,/)
  })

  it('does nothing when the person backs out of the picker', async () => {
    usePicturePicker(async () => '')
    const sketch = await startSketch(projectId, 'Search')
    expect(await addMockup(projectId, sketch.id, 'page-1')).toEqual({ ok: false, name: '', url: '' })
  })
})
