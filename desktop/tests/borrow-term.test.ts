// codegraph: test feature borrow-term
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { borrow } from '../src/features/borrow-term.js'
import { checkCode } from '../src/features/check-code.js'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { useChooser } from '../src/modules/machine/index.js'
import { useFolder } from '../src/modules/projects/index.js'
import { aMappedRepo, closeYard, git, openYard, type Yard } from './yard.js'

/** A word one repo defines and another borrows, written by codegraph, never
 *  by hand (ADR 0036). */
const ADDRESS = '---\nterm: Address\navoid: [location]\n---\nWhere a letter goes.\n'

let yard: Yard
let api = ''
let web = ''

const commit = (repo: string, message: string): void => {
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', message)
}

beforeEach(async () => {
  yard = openYard('borrow')
  useFolder(yard.home)
  useChooser(async () => '')
  api = aMappedRepo(yard, 'api')
  web = aMappedRepo(yard, 'web')
  mkdirSync(join(api, 'codegraph', 'terms'), { recursive: true })
  writeFileSync(join(api, 'codegraph', 'terms', 'address.md'), ADDRESS)
  commit(api, 'Address is a term')
  const { id } = await createProject('Post')
  await linkSoftwareSystem(id, api)
  await linkSoftwareSystem(id, web)
})

afterEach(() => closeYard(yard))

const copy = (): string => readFileSync(join(web, 'codegraph', 'terms', 'address.md'), 'utf8')

describe('borrowing a term another repo of the project defines', () => {
  it('writes a pinned copy into this repo, saying where it came from', async () => {
    const said = await borrow(web, 'address')
    const sha = git(api, 'rev-parse', '--short=7', 'HEAD')
    expect(said).toBe(`Borrowed Address from api at ${sha} into codegraph/terms/address.md. Commit it with the change that uses it.`)
    expect(copy()).toContain(`borrowed from: api @ ${sha}`)
    expect(copy()).toContain('Where a letter goes.')
    expect((await checkCode(web)).mismatches).toEqual([])
  })

  it('says, when checked, that the copy is stale once the defining repo changes the term', async () => {
    await borrow(web, 'Address')
    writeFileSync(join(api, 'codegraph', 'terms', 'address.md'), ADDRESS.replace('a letter', 'a letter or a parcel'))
    const sha = git(api, 'rev-parse', '--short=7', 'HEAD')
    expect((await checkCode(web)).mismatches.map((m) => m.says)).toEqual([`Address has changed in api since ${sha}. Borrow it again.`])
  })

  it('borrows again over an old copy', async () => {
    await borrow(web, 'Address')
    writeFileSync(join(api, 'codegraph', 'terms', 'address.md'), ADDRESS.replace('a letter', 'a parcel'))
    commit(api, 'Parcels too')
    await borrow(web, 'Address')
    expect(copy()).toContain('Where a parcel goes.')
    expect((await checkCode(web)).mismatches).toEqual([])
  })

  it('will not copy a term the defining repo has not committed', async () => {
    writeFileSync(join(api, 'codegraph', 'terms', 'stamp.md'), '---\nterm: Stamp\n---\nWhat pays for a letter.\n')
    expect(await borrow(web, 'Stamp')).toBe('Stamp in api is not committed yet. Commit it there first, so the copy can say which commit it came from.')
  })

  it('says when no repo of the project on this computer defines it', async () => {
    expect(await borrow(web, 'Parcel')).toBe('No repo of Post on this computer defines Parcel. Read: api.')
  })

  it('will not borrow over a term this repo defines itself', async () => {
    mkdirSync(join(web, 'codegraph', 'terms'), { recursive: true })
    writeFileSync(join(web, 'codegraph', 'terms', 'address.md'), ADDRESS)
    expect(await borrow(web, 'Address')).toBe(
      'Address is defined in this repo too. Decide with the person which repo defines it, then take it out of the other and borrow it there.',
    )
  })

  it('needs the folder linked to a project first', async () => {
    const loose = aMappedRepo(yard, 'loose')
    expect(await borrow(loose, 'Address')).toBe(
      'This folder is not linked to a project on this computer, so codegraph cannot tell which repos it may borrow from. Call `link` first.',
    )
  })
})
