// codegraph: test feature show-map
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { showMap, type Card } from '../src/features/show-map.js'
import { useChooser } from '../src/modules/machine/index.js'
import { useFolder } from '../src/modules/projects/index.js'
import { sayWhere, useFolder as useAgents } from '../src/modules/agents/index.js'
import { aMappedRepo, aProposal, aSoftwareSystem, buildSearch, closeYard, git, openYard, searchProposal, type Yard } from './yard.js'

let yard: Yard

beforeEach(() => {
  yard = openYard('show-map')
  useFolder(yard.home)
  useChooser(async () => '')
})

afterEach(() => closeYard(yard))

const child = (card: Card | undefined, name: string): Card | undefined =>
  card?.children.find((c) => c.name === name)
const named = (card: Card | undefined, id: string): string =>
  card?.children.find((c) => c.id === id)?.name ?? id

const aProject = async (withMailer: boolean): Promise<string> => {
  const { id } = await createProject('Notes')
  await linkSoftwareSystem(id, aMappedRepo(yard))
  if (withMailer) await linkSoftwareSystem(id, aSoftwareSystem(yard, 'mailer'))
  return id
}

describe('the map of a project', () => {
  it('draws the project, its software systems, their containers, components and code', async () => {
    const shown = await showMap(await aProject(true))
    expect(shown.card.level).toBe('project')
    expect(shown.card.children.map((c) => c.name)).toEqual(['notes', 'mailer'])

    const notes = child(shown.card, 'notes')
    expect(notes?.children.map((c) => [c.name, c.kind])).toEqual([
      ['web', 'browser app'],
      ['db', 'database'],
    ])
    const web = child(notes, 'web')
    expect(web?.children.map((c) => c.kind).sort()).toEqual(['feature', 'module', 'page', 'page', 'trigger'])
    const module = web?.children.find((c) => c.kind === 'module')
    expect(module?.children[0]).toMatchObject({ level: 'code', name: 'notes.ts', names: ['Note', 'saveNote', 'listNotes', 'tellOwner'] })
  })

  it('says a repo that is not set up is not, and draws nothing inside it', async () => {
    const mailer = child((await showMap(await aProject(true))).card, 'mailer')
    expect(mailer?.setUp).toBe(false)
    expect(mailer?.children).toEqual([])
  })

  it('hands each software system its design system, set up or not', async () => {
    const id = await aProject(true)
    const mailer = join(yard.path, 'mailer')
    writeFileSync(join(mailer, 'DESIGN.md'), '---\nname: Post\ncolors:\n  ink: "#111"\n---\n')
    const shown = await showMap(id)
    const design = (name: string) => shown.systems.find((s) => s.name === name)?.design
    expect(design('mailer')?.tokens.map((t) => [t.id, t.value])).toEqual([['colors.ink', '#111']])
    expect(design('notes')).toBeNull()
  })

  it('draws wires at every level, from the wires between components', async () => {
    const shown = await showMap(await aProject(true))
    const notes = child(shown.card, 'notes')
    const web = child(notes, 'web')

    expect(shown.card.wires.map((w) => [named(shown.card, w.from), named(shown.card, w.to), w.kind, w.words])).toEqual([
      ['notes', 'mailer', 'calls', 'tells the owner'],
    ])
    expect(notes?.wires.map((w) => [named(notes, w.from), named(notes, w.to), w.kind])).toEqual([['web', 'db', 'keeps']])
    expect(web?.wires.some((w) => w.kind === 'asks' && w.words === 'saves what was typed')).toBe(true)
  })

  it('keeps where a wire really starts and ends when it is drawn a level up', async () => {
    const shown = await showMap(await aProject(true))
    const notes = child(shown.card, 'notes')
    const keeps = notes?.wires.find((w) => w.kind === 'keeps')
    // web keeps notes in db: drawn between the containers, but it is module
    // notes, inside web, that does the keeping, of the store notes inside db.
    expect(keeps?.ends.map((end) => [end.from.split('/').pop(), end.to.split('/').pop()])).toEqual([
      ['web:module:notes', 'store:db:notes'],
    ])
    const calls = shown.card.wires[0]
    expect(calls?.ends.map((end) => end.from.split('/').pop())).toEqual(['web:module:notes'])
  })

  it('holds back a call to something the project has no software system for, as a suggestion', async () => {
    const shown = await showMap(await aProject(false))
    expect(shown.card.wires).toEqual([])
    expect(shown.suggestions).toEqual(['mailer'])
  })

  it('reads each software system at the point asked for', async () => {
    const id = await aProject(false)
    const notesId = (await showMap(id)).systems[0]!.id
    const there = await showMap(id, { [notesId]: { kind: 'branch', name: 'add-search' } })
    const web = child(child(there.card, 'notes'), 'web')
    expect(web?.children.map((c) => c.name)).toContain('search')
    expect(there.systems[0]?.point).toEqual({ kind: 'branch', name: 'add-search' })
  })
})

describe('the map of a branch with a proposal', () => {
  const aProposed = async (): Promise<{ id: string; repo: string }> => {
    const { id } = await createProject('Notes')
    const repo = aMappedRepo(yard)
    await linkSoftwareSystem(id, repo)
    const base = git(repo, 'rev-parse', 'HEAD')
    git(repo, 'checkout', '-q', '-b', 'search')
    aProposal(repo, searchProposal(base), ['search.png'])
    return { id, repo }
  }

  it('draws what is not built yet as proposed cards and wires, where they will be', async () => {
    const shown = await showMap((await aProposed()).id)
    const web = child(child(shown.card, 'notes'), 'web')
    expect(child(web, 'search')).toMatchObject({ kind: 'page', state: 'proposed', at: '/search', says: 'Finds a note by its words' })
    expect(child(web, 'search')?.mockup).toMatch(/^data:image\/png/)
    expect(child(web, 'find-notes')?.state).toBe('proposed')
    const asks = web?.wires.find((w) => named(web, w.from) === 'search')
    expect(asks).toMatchObject({ kind: 'asks', words: 'to find notes', state: 'proposed' })
  })

  it('marks what it crosses out, and what is built as built', async () => {
    const { id, repo } = await aProposed()
    buildSearch(repo, { all: false })
    const shown = await showMap(id)
    const web = child(child(shown.card, 'notes'), 'web')
    expect(child(web, 'nightly-tidy')?.state).toBe('gone')
    expect(child(web, 'search')?.state).toBe('built')
    expect(web?.wires.find((w) => named(web, w.from) === 'search')?.state).toBe('built')
    expect(shown.systems[0]?.proposal?.items.filter((i) => i.state === 'built')).toHaveLength(4)
  })

  it('shows where the agent says it is working', async () => {
    const { id, repo } = await aProposed()
    useAgents(yard.home)
    sayWhere(repo, 'web/page search', 'writing the page')
    const agent = (await showMap(id)).systems[0]?.agent
    expect(agent).toMatchObject({ name: 'web/page search', words: 'writing the page' })
    expect(agent?.card.endsWith('/web:page:search')).toBe(true)
  })
})
