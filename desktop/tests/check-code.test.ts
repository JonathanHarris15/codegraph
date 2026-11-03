// codegraph: test feature check-code
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkCode } from '../src/features/check-code.js'
import { aMappedRepo, anAgentIn, checkFromTerminal, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let agent: Awaited<ReturnType<typeof anAgentIn>>

beforeAll(async () => {
  yard = openYard('check-code')
  repo = aMappedRepo(yard)
  agent = await anAgentIn(repo)
})

afterAll(async () => {
  await agent.close()
  closeYard(yard)
})

describe('an agent checking its work', () => {
  it('hears there is nothing to fix in the folder it works in', async () => {
    expect(await agent.call('check')).toBe('Nothing to fix: the code fits its tags and config.')
  })

  it('hears what does not fit, with where it is', async () => {
    writeFileSync(join(repo, 'app', 'stray.ts'), 'export const stray = 1\n')
    const said = await agent.call('check')
    rmSync(join(repo, 'app', 'stray.ts'))
    expect(said).toBe('1 thing does not fit:\napp/stray.ts:1  It has no tag saying what it belongs to.')
  })

  it('can check a repo other than the one it works in', async () => {
    const said = await agent.call('check', { repo: yard.home })
    expect(said).toContain('There is no codegraph.config.json')
  })
})

describe('the check, called straight', () => {
  it('hands back each mismatch as well as the words', async () => {
    const checked = await checkCode(yard.home)
    expect(checked.clean).toBe(false)
    expect(checked.mismatches.map((m) => m.file)).toEqual(['codegraph.config.json'])
  })
})

describe('the check in a terminal, the way CI runs it', () => {
  it('passes a repo whose code fits', () => {
    expect(checkFromTerminal(repo).code).toBe(0)
  })

  it('fails one that does not, and says why', () => {
    writeFileSync(join(repo, 'app', 'stray.ts'), 'export const stray = 1\n')
    const run = checkFromTerminal(repo)
    rmSync(join(repo, 'app', 'stray.ts'))
    expect(run.code).toBe(1)
    expect(run.said).toContain('app/stray.ts:1')
  })
})
