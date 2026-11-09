// codegraph: test feature check-code
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkCode } from '../src/features/check-code.js'
import {
  aMappedRepo,
  anAgentIn,
  aProposal,
  buildSearch,
  checkFromTerminal,
  closeYard,
  git,
  openYard,
  searchProposal,
  type Yard,
} from './yard.js'

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

describe('the check, with breaks of the design system made on purpose', () => {
  it('lists each exception apart, with why, and still passes', async () => {
    const files: Record<string, string> = {
      'DESIGN.md': '---\nname: X\ncolors:\n  ink: "#111111"\n---\n',
      'app/theme.css': '/* codegraph: module design-system */\n/* codegraph: theme */\n:root { --colors-ink: #111111; }\n',
      'app/pages/logo.tsx':
        "// codegraph: page logo at /logo\nexport const Logo = () => <b style={{ color: '#ff6600' }} /> // codegraph: exception the brand's own orange\n",
    }
    for (const [path, text] of Object.entries(files)) writeFileSync(join(repo, path), text)
    try {
      const checked = await checkCode(repo)
      expect(checked.clean).toBe(true)
      expect(checked.mismatches).toEqual([])
      expect(checked.exceptions.map((m) => m.onPurpose)).toEqual(["the brand's own orange"])
      expect(checked.words).toBe(
        [
          'Nothing to fix: the code fits its tags and config.',
          '',
          '1 break of the design system on purpose:',
          "app/pages/logo.tsx:2  A raw colour, #ff6600, where a token belongs. Add it to DESIGN.md, or use one it has. Why: the brand's own orange",
        ].join('\n'),
      )
    } finally {
      for (const path of Object.keys(files)) rmSync(join(repo, path))
    }
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

describe('the check on a branch with a proposal', () => {
  let other: Yard
  let built = ''
  beforeAll(() => {
    other = openYard('check-proposal')
    built = aMappedRepo(other)
    const base = git(built, 'rev-parse', 'HEAD')
    git(built, 'checkout', '-q', '-b', 'search')
    aProposal(built, searchProposal(base))
  })
  afterAll(() => closeYard(other))

  it('fails like a test while the proposal is not built, and says what is left', async () => {
    const checked = await checkCode(built)
    expect(checked.clean).toBe(false)
    expect(checked.words).toContain('The proposal on this branch is not built yet: "Let people search their notes".')
    expect(checked.words).toContain('Still to do (5 of 5):')
    expect(checked.words).toContain('- build web/page search')
    expect(checked.words).toContain('- take away web/trigger nightly-tidy')
    expect(checked.words).toContain('- build the wire web/page search asks web/feature find-notes')
  })

  it('says once it is built to delete it in the same change, and still fails until it is', async () => {
    buildSearch(built)
    const checked = await checkCode(built)
    expect(checked.proposal?.built).toBe(true)
    expect(checked.clean).toBe(false)
    expect(checked.words).toContain('delete codegraph-proposal/ in this same change')
    rmSync(join(built, 'codegraph-proposal'), { recursive: true })
    expect((await checkCode(built)).clean).toBe(true)
  })
})
