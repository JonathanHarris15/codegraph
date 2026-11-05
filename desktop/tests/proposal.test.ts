// codegraph: test module reader
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { live, proposalProgress, readMap } from '../src/modules/reader/index.js'
import { aMappedRepo, aProposal, buildSearch, closeYard, git, openYard, searchProposal, writeInto, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let base = ''

beforeEach(() => {
  yard = openYard('proposal')
  repo = aMappedRepo(yard)
  base = git(repo, 'rev-parse', 'HEAD')
  git(repo, 'checkout', '-q', '-b', 'search')
  aProposal(repo, searchProposal(base), ['search.png'])
})

afterEach(() => closeYard(yard))

const states = async () =>
  Object.fromEntries((await proposalProgress(repo))!.items.map((i) => [i.name, i.state]))

describe('a proposal on a branch', () => {
  it('is read with the map, its mockups with it', async () => {
    const map = await readMap(repo, live)
    expect(map.proposal?.says).toBe('Let people search their notes')
    expect(map.proposal?.components.map((c) => c.name)).toEqual(['search', 'find-notes', 'nightly-tidy'])
    expect(map.mockups['web:page:search']).toMatch(/^data:image\/png;base64,/)
    expect(map.problems).toEqual([])
  })

  it('is not on the main line', async () => {
    expect((await readMap(repo, { kind: 'branch', name: 'main' })).proposal).toBeNull()
  })

  it('starts with everything drawn still to build, and what is crossed out still there', async () => {
    expect(await states()).toEqual({
      'web/page search': 'to build',
      'web/feature find-notes': 'to build',
      'web/trigger nightly-tidy': 'to remove',
      'web/page search asks web/feature find-notes': 'to build',
      'web/feature find-notes uses web/module notes': 'to build',
    })
    expect((await proposalProgress(repo))?.built).toBe(false)
  })

  it('shows each part built as the code gets there', async () => {
    buildSearch(repo, { all: false })
    const now = await states()
    expect(now['web/page search']).toBe('built')
    expect(now['web/page search asks web/feature find-notes']).toBe('built')
    expect(now['web/trigger nightly-tidy']).toBe('to remove')
  })

  it('is built when everything is there and the crossed-out part is gone', async () => {
    buildSearch(repo)
    const progress = await proposalProgress(repo)
    expect(progress?.unasked).toEqual([])
    expect(progress?.built).toBe(true)
    expect(Object.values(await states())).toEqual(['built', 'built', 'removed', 'built', 'built'])
  })

  it('is not built while something it did not draw has changed', async () => {
    buildSearch(repo)
    writeInto(repo, { 'app/modules/tags.ts': '// codegraph: module tags\nexport const x = 1\n' })
    const progress = await proposalProgress(repo)
    expect(progress?.unasked).toEqual(['web/module tags is new, but the proposal does not draw it.'])
    expect(progress?.built).toBe(false)
  })

  it('holds a wire between containers to any wire between what they hold', async () => {
    aProposal(repo, {
      ...searchProposal(base),
      components: [],
      wires: [{ from: 'web', to: 'db', kind: 'keeps', words: '' }],
    })
    expect(await states()).toEqual({ 'web keeps db': 'built' })
  })

  it('finds where the branch left the main line when it names no commit', async () => {
    aProposal(repo, { ...searchProposal(''), components: [], wires: [] })
    writeInto(repo, { 'app/modules/tags.ts': '// codegraph: module tags\nexport const x = 1\n' })
    expect((await proposalProgress(repo))?.unasked).toEqual(['web/module tags is new, but the proposal does not draw it.'])
  })

  it('says plainly when its file cannot be read', async () => {
    writeInto(repo, { 'codegraph-proposal/proposal.json': '{ not json' })
    const map = await readMap(repo, live)
    expect(map.proposal).toBeNull()
    expect(map.problems).toEqual(['codegraph-proposal/proposal.json is not JSON the reader can read'])
  })
})
