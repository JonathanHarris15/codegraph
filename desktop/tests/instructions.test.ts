// codegraph: test feature show-instructions
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editInstructions } from '../src/features/edit-instructions.js'
import { resetInstructions } from '../src/features/reset-instructions.js'
import { showInstructions } from '../src/features/show-instructions.js'
import { useFolder } from '../src/modules/instructions/index.js'
import { anAgentIn, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard

const topic = async (which: string) => (await showInstructions()).find((one) => one.topic === which)!

beforeAll(() => {
  yard = openYard('instructions-store')
  useFolder(yard.home)
})

afterAll(() => closeYard(yard))

describe('the instructions a person can make their own', () => {
  it('offers every topic, as codegraph ships it, until someone changes one', async () => {
    const all = await showInstructions()
    expect(all.map((one) => one.topic)).toEqual(['setup', 'tags', 'design-system', 'proposals', 'working-here'])
    expect(all.every((one) => !one.edited && one.edits.length === 0)).toBe(true)
    expect((await topic('tags')).text).toMatch(/^# Codegraph/)
  })

  it('serves a person own words from then on, and says they are theirs', async () => {
    await editInstructions('tags', 'Tag every file. Nothing else.')
    const tags = await topic('tags')
    expect(tags.text).toBe('Tag every file. Nothing else.')
    expect(tags.edited).toBe(true)
    expect(tags.byDefault).toMatch(/^# Codegraph/)
  })

  it('keeps every edit, oldest first, saying how each came about', async () => {
    await editInstructions('tags', 'Tag every file, and say what each wire is for.')
    const tags = await topic('tags')
    expect(tags.edits.map((edit) => edit.how)).toEqual(['edited', 'edited'])
    expect(tags.edits[0]!.text).toBe('Tag every file. Nothing else.')
    expect(tags.edits[1]!.text).toBe(tags.text)
    expect(new Date(tags.edits[1]!.at).getTime()).toBeGreaterThan(0)
  })

  it('writes nothing when the words have not changed', async () => {
    const before = (await topic('tags')).edits.length
    await editInstructions('tags', (await topic('tags')).text)
    expect((await topic('tags')).edits.length).toBe(before)
  })

  it('puts the default back without losing what the person wrote', async () => {
    await resetInstructions('tags')
    const tags = await topic('tags')
    expect(tags.edited).toBe(false)
    expect(tags.text).toBe(tags.byDefault)
    expect(tags.edits.map((edit) => edit.how)).toEqual(['edited', 'edited', 'reset'])
    expect(tags.edits[1]!.text).toBe('Tag every file, and say what each wire is for.')
  })

  it('puts an old edit back in force, as an edit of its own', async () => {
    const old = (await topic('tags')).edits[0]!
    await editInstructions('tags', old.text)
    const tags = await topic('tags')
    expect(tags.text).toBe(old.text)
    expect(tags.edits.length).toBe(4)
  })

  it('leaves a topic there is none of alone', async () => {
    expect(await editInstructions('cooking', 'Boil water.')).toBe(null)
    expect((await showInstructions()).some((one) => one.topic === 'cooking')).toBe(false)
  })

  it('tells agents the person own words, not the ones codegraph ships with', async () => {
    await editInstructions('setup', 'Set it up the way we do it here.')
    const agent = await anAgentIn(yard.home, yard.home)
    try {
      expect(await agent.call('instructions', { topic: 'setup' })).toBe('Set it up the way we do it here.')
      expect(await agent.call('instructions', { topic: 'proposals' })).toMatch(/^# Proposals/)
      const prompt = await agent.client.getPrompt({ name: 'setup' })
      const first = prompt.messages[0]?.content
      expect(first && 'text' in first ? first.text : '').toBe('Set it up the way we do it here.')
    } finally {
      await agent.close()
    }
  })
})
