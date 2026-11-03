// codegraph: test feature describe-map
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { describeMap } from '../src/features/describe-map.js'
import { aMappedRepo, anAgentIn, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let agent: Awaited<ReturnType<typeof anAgentIn>>

beforeAll(async () => {
  yard = openYard('describe-map')
  agent = await anAgentIn(aMappedRepo(yard))
})

afterAll(async () => {
  await agent.close()
  closeYard(yard)
})

describe('the map in words, called straight', () => {
  it('says plainly when a repo is not set up', async () => {
    expect(await describeMap(yard.home)).toMatch(/^This repo has no codegraph.config.json/)
  })
})

describe('an agent reading the map', () => {
  it('lists the tools an agent can call', async () => {
    const { tools } = await agent.client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['check', 'instructions', 'map'])
  })

  it('reads containers, components, files and wires in words', async () => {
    const said = await agent.call('map')
    expect(said).toContain('Serves notes-app. Read at the live folder.')
    expect(said).toContain('Container web (browser app): Where people keep their notes')
    expect(said).toContain('  module notes (front door saveNote, listNotes, Note)\n    app/modules/notes.ts')
    expect(said).toContain('  page new-note -> feature write-note (acts on): saves what was typed')
    expect(said).toContain('  module notes -> mailer: tells the owner')
  })
})
