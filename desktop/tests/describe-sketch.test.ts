// codegraph: test feature describe-sketch
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { describeSketch } from '../src/features/describe-sketch.js'
import { useFolder as useProjects, addProject, addSoftwareSystem } from '../src/modules/projects/index.js'
import { blankCard, keepMockup, newSketch, useFolder as useSketches, writeSketch } from '../src/modules/sketches/index.js'
import { aMappedRepo, anAgentIn, aPicture, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let agent: Awaited<ReturnType<typeof anAgentIn>>

/** A project the notes repo serves, with one sketch: a search page with a
 *  mockup, wired to a search feature, and a note. */
beforeAll(async () => {
  yard = openYard('describe-sketch')
  useProjects(yard.home)
  useSketches(yard.home)
  repo = aMappedRepo(yard)
  const project = addProject('Notes', 'notes-app')
  addSoftwareSystem(project.id, { name: 'notes', path: repo, remote: '' })

  const web = blankCard('web', 'web', 'container', 'browser app')
  web.children.push(
    { ...blankCard('page-search', 'search', 'component', 'page'), at: '/search', says: 'Find a note by its words' },
    blankCard('feature-find', 'find-notes', 'component', 'feature'),
  )
  web.wires.push({ id: 'w1', from: 'page-search', to: 'feature-find', kind: 'asks', words: 'finds notes with these words' })
  web.notes.push({ id: 'n1', text: 'Search as you type?', x: 0, y: 0 })
  const system = blankCard('notes', 'notes', 'system', 'software system')
  system.children.push(web)
  const root = blankCard(project.id, 'Notes', 'project', 'project')
  root.children.push(system)
  const sketch = newSketch(project.id, 'Search', root)
  writeSketch(sketch)
  const picked = join(yard.path, 'search.png')
  writeFileSync(picked, aPicture())
  web.children[0]!.mockup = keepMockup(project.id, sketch.id, 'page-search', picked)
  writeSketch(sketch)

  agent = await anAgentIn(repo, yard.home)
})

afterAll(async () => {
  await agent.close()
  closeYard(yard)
})

describe('an agent reading a sketch', () => {
  it('finds the sketches of the project the repo it works in serves', async () => {
    const said = await agent.call('sketches')
    expect(said).toContain('Project Notes (notes-app):')
    expect(said).toContain('- Search: blank')
  })

  it('reads a sketch in words, level by level, with the mockup to open', async () => {
    const said = await agent.call('sketch', { name: 'Search' })
    expect(said).toContain('Sketch "Search" of project Notes (notes-app)')
    expect(said).toContain('software system notes')
    expect(said).toContain('\n  container web (browser app)')
    expect(said).toContain('\n    page search (at /search): Find a note by its words')
    expect(said).toMatch(/mockup: .+page-search\.png/)
    expect(said).toContain('\n    page search asks feature find-notes to find notes with these words')
    expect(said).toContain('Annotations: notes people drew over the diagram. They are not the architecture and never change the code.')
    expect(said).toContain('\n  sticky note "Search as you type?" (layer Notes)')
  })

  it('says so when there is no sketch by that name', async () => {
    expect(await agent.call('sketch', { name: 'Payments' })).toContain('There is no sketch called "Payments"')
  })

  it('reads a sketch straight, by a project short name, for a project with no repo yet', async () => {
    expect(await describeSketch('', 'search', 'notes-app')).toContain('Sketch "Search"')
  })
})
