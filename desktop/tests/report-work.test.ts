// codegraph: test feature report-work
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { reportWork } from '../src/features/report-work.js'
import { useFolder, whereIs } from '../src/modules/agents/index.js'
import { aLinkTo, aMappedRepo, anAgentIn, aProposal, closeYard, git, openYard, searchProposal, type Yard } from './yard.js'

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

  it('is heard under any name the folder goes by', async () => {
    const link = aLinkTo(yard, repo)
    expect(await reportWork(link, 'db', 'through a link')).toBe('The canvas follows you to db.')
    expect(whereIs(repo)?.words).toBe('through a link')
    expect(whereIs(link)?.words).toBe('through a link')
  })
})

describe('saying it is working on a UI block (ADR 0024)', () => {
  beforeAll(() => {
    mkdirSync(join(repo, 'app', 'ui'), { recursive: true })
    writeFileSync(
      join(repo, 'app', 'ui', 'row.tsx'),
      '// codegraph: module ui\n// codegraph: ui block settings/SettingsRow\nexport const SettingsRow = () => null\n',
    )
  })

  it('names a UI block by its folder and name, and the live view follows', async () => {
    expect(await reportWork(repo, 'ui block settings/SettingsRow', 'adding a hint')).toBe(
      'The canvas and the live view follow you to the UI block settings/SettingsRow.',
    )
    expect(whereIs(repo)).toMatchObject({ card: 'ui block settings/SettingsRow', words: 'adding a hint' })
  })

  it('takes its name alone, and keeps it whole', async () => {
    await reportWork(repo, 'ui block SettingsRow')
    expect(whereIs(repo)?.card).toBe('ui block settings/SettingsRow')
  })

  it('hears when there is no such UI block', async () => {
    expect(await reportWork(repo, 'ui block DatePicker')).toBe(
      'There is no UI block called "DatePicker". The repo has: settings/SettingsRow.',
    )
  })
})
