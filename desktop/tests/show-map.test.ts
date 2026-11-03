// codegraph: test feature show-map
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { showMap, type Card } from '../src/features/show-map.js'
import { useChooser } from '../src/modules/machine/index.js'
import { useFolder } from '../src/modules/projects/index.js'
import { aMappedRepo, aSoftwareSystem, closeYard, openYard, type Yard } from './yard.js'

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

  it('draws wires at every level, from the wires between components', async () => {
    const shown = await showMap(await aProject(true))
    const notes = child(shown.card, 'notes')
    const web = child(notes, 'web')

    expect(shown.card.wires.map((w) => [named(shown.card, w.from), named(shown.card, w.to), w.kind, w.words])).toEqual([
      ['notes', 'mailer', 'calls', 'tells the owner'],
    ])
    expect(notes?.wires.map((w) => [named(notes, w.from), named(notes, w.to), w.kind])).toEqual([['web', 'db', 'keeps']])
    expect(web?.wires.some((w) => w.kind === 'acts on' && w.words === 'saves what was typed')).toBe(true)
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
