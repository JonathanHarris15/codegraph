// codegraph: test feature make-proposal
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeProposal } from '../src/features/make-proposal.js'
import { showMap } from '../src/features/show-map.js'
import { startSketch } from '../src/features/start-sketch.js'
import { addProject, addSoftwareSystem, useFolder as useProjects } from '../src/modules/projects/index.js'
import { live, proposalProgress, readMap } from '../src/modules/reader/index.js'
import { blankCard, keepMockup, useFolder as useSketches, writeSketch } from '../src/modules/sketches/index.js'
import { aLinkTo, aMappedRepo, anAgentIn, aPicture, closeYard, git, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let agent: Awaited<ReturnType<typeof anAgentIn>>

/** A snapshot of the notes map, drawn on: a search page with a mockup that
 *  reads the notes, the nightly tidy taken off, and a mailer drawn beside
 *  that has no repo. */
beforeAll(async () => {
  yard = openYard('make-proposal')
  useProjects(yard.home)
  useSketches(yard.home)
  repo = aMappedRepo(yard)
  const project = addProject('Notes', 'notes-app')
  addSoftwareSystem(project.id, { name: 'notes', path: repo, remote: '' })

  const sketch = await startSketch(project.id, 'Search', (await showMap(project.id)).card)
  const system = sketch.root.children[0]!
  const web = system.children.find((c) => c.name === 'web')!
  web.children = web.children.filter((c) => c.name !== 'nightly-tidy')
  web.wires = web.wires.filter((w) => !w.from.endsWith('nightly-tidy'))
  const notes = web.children.find((c) => c.kind === 'module')!
  web.children.push({ ...blankCard('new-search', 'search', 'component', 'page'), at: '/search', says: 'Finds a note by its words' })
  web.wires.push({ id: 'w-new', from: 'new-search', to: notes.id, kind: 'reads', words: 'looks through the notes' })
  sketch.root.children.push(blankCard('new-mailer', 'mailer', 'system', 'software system'))
  writeSketch(sketch)
  const picked = join(yard.path, 'search.png')
  writeFileSync(picked, aPicture())
  web.children.at(-1)!.mockup = keepMockup(project.id, sketch.id, 'new-search', picked)
  writeSketch(sketch)

  agent = await anAgentIn(repo, yard.home)
})

afterAll(async () => {
  await agent.close()
  closeYard(yard)
})

describe('making a proposal from a sketch', () => {
  it('will not write one on the main line', async () => {
    expect(await makeProposal(repo, 'Search')).toContain('You are on main. A proposal lives on a branch of its own')
    expect(existsSync(join(repo, 'codegraph-proposal'))).toBe(false)
  })

  it('writes only what the sketch changes, on the branch, with the mockup beside it', async () => {
    git(repo, 'checkout', '-q', '-b', 'search')
    const said = await makeProposal(repo, 'Search')
    expect(said).toContain('Wrote the proposal to codegraph-proposal/proposal.json on search: 2 to build and 1 to take away.')
    expect(said).toContain('- build web/page search at /search: Finds a note by its words (mockup search.png)')
    expect(said).toContain('- take away web/trigger nightly-tidy')
    expect(said).toContain('- build the wire web/page search reads web/module notes: looks through the notes')
    expect(said).toContain('- mailer has no repo yet. Make one, set it up, then propose there.')

    const map = await readMap(repo, live)
    expect(map.proposal?.sketch).toBe('Search')
    expect(map.proposal?.base).toBe(git(repo, 'rev-parse', 'HEAD'))
    expect(map.mockups['web:page:search']).toMatch(/^data:image\/png/)
    expect(readFileSync(join(repo, 'codegraph-proposal', 'search.png'))).toEqual(aPicture())
  })

  it('crosses out the wires of a card taken off with the card, not one by one', async () => {
    const map = await readMap(repo, live)
    expect(map.proposal?.wires.map((w) => `${w.from} ${w.kind} ${w.to}${w.gone ? ' gone' : ''}`)).toEqual([
      'web/page search reads web/module notes',
    ])
    expect((await proposalProgress(repo))?.items.map((i) => i.state)).toEqual(['to build', 'to remove', 'to build'])
  })

  it('keeps to one proposal a branch unless told to replace it', async () => {
    expect(await makeProposal(repo, 'Search')).toContain('There is already a proposal on search: "Search"')
    expect(await makeProposal(repo, 'Search', '', true)).toContain('Wrote the proposal')
  })

  it('knows the repo under any name the folder goes by', async () => {
    expect(await makeProposal(aLinkTo(yard, repo), 'Search', '', true)).toContain('Wrote the proposal')
  })

  it('is what an agent asks for through the MCP', async () => {
    expect(await agent.call('propose', { sketch: 'Search', replace: true })).toContain('Wrote the proposal')
    expect(await agent.call('propose', { sketch: 'Payments' })).toContain('There is no sketch called "Payments"')
  })
})
