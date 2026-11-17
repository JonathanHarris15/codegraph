// codegraph: test feature add-to-map
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addToMap } from '../src/features/add-to-map.js'
import { agreeShallowSystem } from '../src/features/agree-shallow-system.js'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { removeFromMap } from '../src/features/remove-from-map.js'
import { renameOnMap } from '../src/features/rename-on-map.js'
import { showMap } from '../src/features/show-map.js'
import { useChooser } from '../src/modules/machine/index.js'
import { useFolder } from '../src/modules/projects/index.js'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let projectId = ''

beforeEach(async () => {
  yard = openYard('people')
  useFolder(yard.home)
  useChooser(async () => '')
  projectId = (await createProject('Notes')).id
  await linkSoftwareSystem(projectId, aMappedRepo(yard))
})

afterEach(() => closeYard(yard))

const top = async () => (await showMap(projectId)).card

describe('people and shallow software systems a person keeps on the map', () => {
  it('draws a person someone added, beside the software systems', async () => {
    const { id } = await addToMap(projectId, 'person', 'Note taker')
    expect((await top()).children.find((c) => c.id === id)).toMatchObject({
      name: 'Note taker',
      kind: 'person',
      level: 'system',
      children: [],
    })
  })

  it('draws a shallow software system no code calls yet, and never folds two of the same name together', async () => {
    const one = await addToMap(projectId, 'shallow software system', 'New software system')
    const two = await addToMap(projectId, 'shallow software system', 'New software system')
    expect(one.id).not.toEqual(two.id)
    expect((await top()).children.filter((c) => c.kind === 'shallow software system')).toHaveLength(2)
  })

  it('wires the code to a shallow software system added by hand once it carries the name the code calls', async () => {
    const { id } = await addToMap(projectId, 'shallow software system', 'New software system')
    await renameOnMap(projectId, id, 'Mailer')
    const shown = await showMap(projectId)
    expect(shown.suggestions).toEqual([])
    expect(shown.card.wires).toMatchObject([{ to: id, words: 'tells the owner' }])
  })

  it('renames a person and a shallow software system, and the code still reaches the system by its old name', async () => {
    const person = await addToMap(projectId, 'person', 'New person')
    const mailer = await agreeShallowSystem(projectId, 'mailer')
    await renameOnMap(projectId, person.id, 'Owner')
    await renameOnMap(projectId, mailer.id, 'Postmark')
    const shown = await showMap(projectId)
    expect(shown.card.children.map((c) => c.name)).toEqual(expect.arrayContaining(['Owner', 'Postmark']))
    expect(shown.card.wires).toMatchObject([{ to: mailer.id }])
  })

  it('keeps the old name when the new one is blank', async () => {
    const { id } = await addToMap(projectId, 'person', 'Owner')
    await renameOnMap(projectId, id, '   ')
    expect((await top()).children.find((c) => c.id === id)?.name).toEqual('Owner')
  })

  it('takes a person away', async () => {
    const { id } = await addToMap(projectId, 'person', 'Owner')
    await removeFromMap(projectId, id)
    expect((await top()).children.some((c) => c.id === id)).toBe(false)
  })

  it('takes a shallow software system away, and asks again if the code still calls it', async () => {
    const { id } = await agreeShallowSystem(projectId, 'mailer')
    await removeFromMap(projectId, id)
    const shown = await showMap(projectId)
    expect(shown.card.children.some((c) => c.id === id)).toBe(false)
    expect(shown.card.wires).toEqual([])
    expect(shown.suggestions).toEqual(['mailer'])
  })

  it('leaves a software system with a repo alone: unlinking it is done elsewhere', async () => {
    const repo = (await showMap(projectId)).systems[0]!.id
    await removeFromMap(projectId, repo)
    expect((await showMap(projectId)).systems.map((s) => s.id)).toEqual([repo])
  })
})
