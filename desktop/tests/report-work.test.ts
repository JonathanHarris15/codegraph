// codegraph: test feature report-work
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { reportWork } from '../src/features/report-work.js'
import { useFolder, whereIs } from '../src/modules/agents/index.js'
import { aMappedRepo, anAgentIn, aProposal, closeYard, git, openYard, searchProposal, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let agent: Awaited<ReturnType<typeof anAgentIn>>

beforeAll(async () => {
  yard = openYard('report-work')
  useFolder(yard.home)
  repo = aMappedRepo(yard)
  git(repo, 'checkout', '-q', '-b', 'search')
  aProposal(repo, searchProposal(git(repo, 'rev-parse', 'HEAD')))
  agent = await anAgentIn(repo, yard.home)
})

afterAll(async () => {
  await agent.close()
  closeYard(yard)
})

describe('an agent saying where it is working', () => {
  it('names a card the proposal draws, and the app hears it', async () => {
    expect(await agent.call('working-on', { card: 'web/page search', words: 'writing the page' })).toBe(
      'The canvas follows you to web/page search.',
    )
    expect(whereIs(repo)).toMatchObject({ card: 'web/page search', words: 'writing the page' })
  })

  it('can name a card the map already has', async () => {
    await agent.call('working-on', { card: 'web/module notes' })
    expect(whereIs(repo)?.card).toBe('web/module notes')
  })

  it('hears when a card is not there, and the canvas stays put', async () => {
    expect(await agent.call('working-on', { card: 'web/page payments' })).toContain('There is no card called "web/page payments"')
    expect(whereIs(repo)?.card).toBe('web/module notes')
  })

  it('stops being followed when it names no card, or goes quiet a while', async () => {
    expect(whereIs(repo, Date.now() + 60 * 60 * 1000)).toBeNull()
    await agent.call('working-on', {})
    expect(whereIs(repo)).toBeNull()
  })
})

describe('saying where, called straight', () => {
  it('names a container as well as a component', async () => {
    expect(await reportWork(repo, 'db', 'adding a table')).toBe('The canvas follows you to db.')
    expect(whereIs(repo)?.words).toBe('adding a table')
  })
})
