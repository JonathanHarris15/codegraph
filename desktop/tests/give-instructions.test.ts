// codegraph: test feature give-instructions
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { giveInstructions } from '../src/features/give-instructions.js'
import { anAgentIn, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let agent: Awaited<ReturnType<typeof anAgentIn>>

beforeAll(async () => {
  yard = openYard('instructions')
  agent = await anAgentIn(yard.home)
})

afterAll(async () => {
  await agent.close()
  closeYard(yard)
})

describe('instructions, called straight', () => {
  it('lists the topics when asked for none', () => {
    expect(giveInstructions('')).toMatch(/^These are the topics:\n- setup: /)
  })
})

describe('an agent asking how codegraph works', () => {
  it('gets the setup instructions', async () => {
    expect(await agent.call('instructions', { topic: 'setup' })).toMatch(/^# Setting a repo up for codegraph/)
  })

  it('gets the block for its own context file, ready to paste', async () => {
    const block = await agent.call('instructions', { topic: 'working-here' })
    expect(block.startsWith('<!-- codegraph:start -->')).toBe(true)
    expect(block.trimEnd().endsWith('<!-- codegraph:end -->')).toBe(true)
  })

  it('hears the topics there are when it asks for one there is not', async () => {
    const said = await agent.call('instructions', { topic: 'cooking' })
    expect(said).toContain('There are no instructions on "cooking"')
    expect(said).toContain('- tags: ')
  })

  it('can be started on setup by a prompt', async () => {
    const prompt = await agent.client.getPrompt({ name: 'setup' })
    const first = prompt.messages[0]?.content
    expect(first && 'text' in first ? first.text : '').toMatch(/^# Setting a repo up/)
  })
})
