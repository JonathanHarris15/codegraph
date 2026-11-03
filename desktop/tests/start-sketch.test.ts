// codegraph: test feature start-sketch
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { showMap } from '../src/features/show-map.js'
import { startSketch } from '../src/features/start-sketch.js'
import { useChooser } from '../src/modules/machine/index.js'
import { useFolder as useProjects } from '../src/modules/projects/index.js'
import { useFolder as useSketches } from '../src/modules/sketches/index.js'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let projectId = ''

beforeEach(async () => {
  yard = openYard('start-sketch')
  useProjects(yard.home)
  useSketches(yard.home)
  useChooser(async () => '')
  projectId = (await createProject('Notes')).id
})

afterEach(() => closeYard(yard))

describe('starting a sketch', () => {
  it('starts a blank one: the project and nothing in it', async () => {
    const sketch = await startSketch(projectId, 'Search')
    expect(sketch.name).toBe('Search')
    expect(sketch.from).toBe('')
    expect(sketch.root).toMatchObject({ level: 'project', name: 'Notes', children: [], wires: [], notes: [] })
  })

  it('starts one from a snapshot of the map, every level and wire as it stood', async () => {
    await linkSoftwareSystem(projectId, aMappedRepo(yard))
    const shown = await showMap(projectId)
    const sketch = await startSketch(projectId, 'Notes, but searchable', shown.card)

    expect(sketch.from).toMatch(/^A snapshot of the map, \d{4}-\d{2}-\d{2}$/)
    const web = sketch.root.children[0]?.children.find((c) => c.name === 'web')
    expect(web?.children.map((c) => c.name).sort()).toEqual(['new-note', 'nightly-tidy', 'notes', 'notes', 'write-note'])
    expect(web?.wires.length).toBe(shown.card.children[0]?.children.find((c) => c.name === 'web')?.wires.length)
    expect(web?.wires.every((w) => w.id.length > 0)).toBe(true)
    expect(web?.children.every((c) => c.mockup === '' && c.shot === '' && Array.isArray(c.notes))).toBe(true)
  })
})
