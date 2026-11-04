// codegraph: test feature save-proposal
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addProposalMockup } from '../src/features/add-proposal-mockup.js'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { openProposal } from '../src/features/open-proposal.js'
import { saveProposal } from '../src/features/save-proposal.js'
import { useChooser, usePicturePicker } from '../src/modules/machine/index.js'
import { listProjects, useFolder } from '../src/modules/projects/index.js'
import { live, proposalProgress, readMap } from '../src/modules/reader/index.js'
import { blankCard, type SketchCard } from '../src/modules/sketches/index.js'
import { aMappedRepo, aPicture, buildSearch, closeYard, git, openYard, type Yard } from './yard.js'

let yard: Yard
let projectId = ''
let systemId = ''
let repo = ''

beforeEach(async () => {
  yard = openYard('draw-proposal')
  useFolder(yard.home)
  useChooser(async () => '')
  repo = aMappedRepo(yard)
  projectId = (await createProject('Notes')).id
  await linkSoftwareSystem(projectId, repo)
  systemId = listProjects().find((p) => p.id === projectId)!.systems[0]!.id
})

afterEach(() => closeYard(yard))

const web = (draft: SketchCard): SketchCard => draft.children.find((c) => c.name === 'web')!

describe('drawing a proposal over the map', () => {
  it('asks for a branch on the main line, and makes the one named', async () => {
    expect(await openProposal(projectId, systemId)).toMatchObject({ ok: false, why: 'main line', branch: 'main' })
    const opened = await openProposal(projectId, systemId, 'search-page')
    expect(opened).toMatchObject({ ok: true, branch: 'search-page' })
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('search-page')
  })

  it('keeps what is drawn new, and what is crossed out, as the proposal on the branch', async () => {
    git(repo, 'checkout', '-q', '-b', 'search')
    const opened = await openProposal(projectId, systemId)
    if (!opened.ok) throw new Error(opened.why)
    expect(web(opened.draft).children.every((c) => c.children.length === 0)).toBe(true)
    expect(opened.known).toContain(web(opened.draft).id)

    const draft = opened.draft
    const notes = web(draft).children.find((c) => c.kind === 'module')!
    web(draft).children.push({ ...blankCard('new', 'search', 'component', 'page'), at: '/search', state: 'proposed', x: 40, y: 300 })
    web(draft).wires.push({ id: 'w', from: 'new', to: notes.id, kind: 'reads', words: 'looks through the notes', state: 'proposed', x: 150, y: 260 })
    web(draft).children.find((c) => c.name === 'nightly-tidy')!.state = 'gone'
    expect(await saveProposal(projectId, systemId, draft, 'Let people search')).toEqual({ ok: true, kept: true })

    const map = await readMap(repo, live)
    expect(map.proposal?.says).toBe('Let people search')
    expect(map.proposal?.base).toBe(git(repo, 'rev-parse', 'HEAD'))
    expect(map.proposal?.layout['web/page search']).toEqual([40, 300])
    // A sentence dragged out of the way is kept by the names it reads as.
    expect(map.proposal?.layout['web/page search>reads>web/module notes']).toEqual([150, 260])
    const again = await openProposal(projectId, systemId)
    if (!again.ok) throw new Error(again.why)
    expect(web(again.draft).wires.find((w) => w.kind === 'reads' && w.words === 'looks through the notes')).toMatchObject({
      x: 150,
      y: 260,
    })
    expect((await proposalProgress(repo))?.items.map((i) => `${i.name} ${i.state}`)).toEqual([
      'web/trigger nightly-tidy to remove',
      'web/page search to build',
      'web/page search reads web/module notes to build',
    ])
  })

  it('reopens with the proposal drawn in, and keeps what is built as the code catches up', async () => {
    git(repo, 'checkout', '-q', '-b', 'search')
    const first = await openProposal(projectId, systemId)
    if (!first.ok) throw new Error(first.why)
    web(first.draft).children.push({ ...blankCard('new', 'search', 'component', 'page'), at: '/search' })
    web(first.draft).children.find((c) => c.name === 'nightly-tidy')!.state = 'gone'
    await saveProposal(projectId, systemId, first.draft, 'Search')

    buildSearch(repo)
    const again = await openProposal(projectId, systemId)
    if (!again.ok) throw new Error(again.why)
    expect(again.says).toBe('Search')
    expect(web(again.draft).children.find((c) => c.name === 'search')?.state).toBe('built')
    // Saving untouched keeps the built page and the tidy already taken away.
    await saveProposal(projectId, systemId, again.draft, 'Search')
    const kept = (await readMap(repo, live)).proposal
    expect(kept?.components.map((c) => `${c.name}${c.gone ? ' gone' : ''}`)).toEqual(['search', 'nightly-tidy gone'])
  })

  it('leaves no proposal when the drawing changes nothing', async () => {
    git(repo, 'checkout', '-q', '-b', 'search')
    const opened = await openProposal(projectId, systemId)
    if (!opened.ok) throw new Error(opened.why)
    expect(await saveProposal(projectId, systemId, opened.draft, '')).toEqual({ ok: true, kept: false })
    expect(existsSync(join(repo, 'codegraph-proposal'))).toBe(false)
  })

  it('keeps a mockup for a proposed page beside the proposal', async () => {
    git(repo, 'checkout', '-q', '-b', 'search')
    const picked = join(yard.path, 'drawn.png')
    writeFileSync(picked, aPicture())
    usePicturePicker(async () => picked)
    const added = await addProposalMockup(projectId, systemId, 'Search')
    expect(added).toMatchObject({ ok: true, name: 'search.png' })

    const opened = await openProposal(projectId, systemId)
    if (!opened.ok) throw new Error(opened.why)
    web(opened.draft).children.push({ ...blankCard('new', 'search', 'component', 'page'), mockup: added.name })
    await saveProposal(projectId, systemId, opened.draft, 'Search')
    expect((await readMap(repo, live)).mockups['web:page:search']).toMatch(/^data:image\/png/)
  })
})
