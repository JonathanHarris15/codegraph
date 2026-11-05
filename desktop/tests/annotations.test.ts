// codegraph: test feature show-annotations
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { saveAnnotations } from '../src/features/save-annotations.js'
import { showAnnotations } from '../src/features/show-annotations.js'
import { annotationWords, useFolder as useAnnotations, type Layer } from '../src/modules/annotations/index.js'
import { addProject, addSoftwareSystem, useFolder as useProjects } from '../src/modules/projects/index.js'
import { blankCard, newSketch, withNotesAsAnnotations } from '../src/modules/sketches/index.js'
import { aMappedRepo, anAgentIn, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let projectId = ''
let agent: Awaited<ReturnType<typeof anAgentIn>>

/** A sticky note kept beside the web container, an arrow from it to the
 *  database, and a hidden layer with a question on the project. */
const layers = (system: string): Layer[] => [
  {
    id: 'l1',
    name: 'Review',
    shown: true,
    snaps: true,
    items: [
      {
        id: 's1',
        at: system,
        kind: 'sticky',
        x: 0,
        y: 0,
        w: 160,
        h: 110,
        near: { card: `${system}/container:web`, dx: 40, dy: -120 },
        text: 'Split the db?',
        color: 'yellow',
      },
      {
        id: 'a1',
        at: system,
        kind: 'arrow',
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        text: '',
        color: '',
        from: { annotation: 's1' },
        to: { card: `${system}/container:db` },
      },
    ],
  },
  {
    id: 'l2',
    name: 'Ideas',
    shown: false,
    snaps: false,
    items: [{ id: 't1', at: 'later', kind: 'text', x: 10, y: 10, w: 100, h: 30, text: 'Mobile app?', color: '' }],
  },
]

beforeAll(async () => {
  yard = openYard('annotations')
  useProjects(yard.home)
  useAnnotations(yard.home)
  repo = aMappedRepo(yard)
  const project = addProject('Notes', 'notes-app')
  projectId = project.id
  const system = addSoftwareSystem(projectId, { name: 'notes', path: repo, remote: '' })
  const drawn = layers(system.id)
  drawn[1]!.items[0]!.at = projectId
  await saveAnnotations(projectId, drawn)
  agent = await anAgentIn(repo, yard.home)
})

afterAll(async () => {
  await agent.close()
  closeYard(yard)
})

describe('annotations over a map', () => {
  it('are kept with the project, layer by layer', async () => {
    const kept = await showAnnotations(projectId)
    expect(kept.map((l) => [l.name, l.shown, l.items.length])).toEqual([
      ['Review', true, 2],
      ['Ideas', false, 1],
    ])
  })

  it('are none for a project nobody has drawn on', async () => {
    expect(await showAnnotations('nobody')).toEqual([])
  })

  it('are read by an agent with the map, said plainly to be no part of the architecture', async () => {
    const said = await agent.call('map')
    expect(said).toContain('From project Notes:')
    expect(said).toContain('Annotations: notes people drew over the diagram. They are not the architecture and never change the code.')
    expect(said).toContain('On software system notes:')
    expect(said).toContain('  sticky note "Split the db?", beside container web (layer Review)')
    expect(said).toContain('  arrow from sticky note "Split the db?" to container db (layer Review)')
    expect(said).toContain('On the project Notes:')
    expect(said).toContain('  text "Mobile app?" (layer Ideas, hidden)')
  })
})

describe('a sticky note’s arrows, in words', () => {
  const level = 'p'
  const with_ = (pointers: { dx: number; dy: number }[]): Layer[] => [
    { id: 'l', name: 'Review', shown: true, snaps: true, items: [{ id: 's', at: level, kind: 'sticky', x: 0, y: 0, w: 100, h: 100, text: 'Look', color: '', pointers }] },
  ]
  const words = (layers: Layer[]) => annotationWords(layers, [level], () => 'the project').join('\n')

  it('says which way each points, since it holds nothing', () => {
    expect(words(with_([{ dx: 50, dy: 200 }]))).toContain('sticky note "Look", with an arrow pointing down (layer Review)')
    expect(words(with_([{ dx: -100, dy: -100 }, { dx: 300, dy: 50 }]))).toContain('with arrows pointing up and left; right (layer Review)')
  })

  it('says nothing of arrows a note has not got', () => {
    expect(words(with_([]))).not.toContain('arrow')
  })
})

describe('notes drawn on a sketch before annotations', () => {
  it('become sticky notes on a layer of their own, where they were', () => {
    const root = blankCard('p', 'Notes', 'project', 'project')
    root.notes.push({ id: 'n1', text: 'Ask Sam', x: 40, y: 60 })
    const sketch = withNotesAsAnnotations(newSketch('p', 'Search', root))
    expect(sketch.root.notes).toEqual([])
    expect(sketch.layers?.map((l) => l.name)).toEqual(['Notes'])
    expect(sketch.layers?.[0]?.items[0]).toMatchObject({ id: 'n1', at: 'p', kind: 'sticky', x: 40, y: 60, text: 'Ask Sam' })
  })

  it('leave a sketch with no notes as it was', () => {
    const sketch = newSketch('p', 'Blank', blankCard('p', 'Notes', 'project', 'project'))
    expect(withNotesAsAnnotations(sketch)).toBe(sketch)
  })
})
