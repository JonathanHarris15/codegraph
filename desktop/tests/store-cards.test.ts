// codegraph: test module cards
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { describeMap } from '../src/features/describe-map.js'
import { systemCard, type Card } from '../src/modules/cards/index.js'
import { live, readMap } from '../src/modules/reader/index.js'
import { aChurchRepo, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let system: Card

beforeAll(async () => {
  yard = openYard('store-cards')
  repo = aChurchRepo(yard)
  system = systemCard('church', 'church', await readMap(repo, live))
})

afterAll(() => closeYard(yard))

const within = (holder: Card, name: string): Card => {
  const found = holder.children.find((c) => c.name === name)
  if (!found) throw new Error(`no ${name} in ${holder.name}`)
  return found
}
const at = (inside: string): string => `church/${inside}`

describe('stores on the map', () => {
  it('opens a database to a card for each store it keeps, with inner stores inside theirs', () => {
    const firestore = within(system, 'firestore')
    expect(firestore.children.map((c) => [c.name, c.kind, c.level])).toEqual([
      ['households', 'store', 'component'],
      ['people', 'store', 'component'],
      ['rosters', 'store', 'component'],
      ['roles', 'store', 'component'],
    ])
    const people = within(firestore, 'people')
    expect(people.id).toBe(at('store:firestore:people'))
    expect(people.children.map((c) => [c.name, c.kind])).toEqual([
      ['involvement', 'inner store'],
      ['prayer_requests', 'inner store'],
    ])
  })

  it("lists a store's fields on its card, in words", () => {
    const people = within(within(system, 'firestore'), 'people')
    expect(people.says).toBe('Everyone the church knows')
    expect(people.fields).toEqual([
      { name: 'name', holds: 'text', needed: true, pointsAt: '' },
      { name: 'birthday', holds: 'date', needed: false, pointsAt: '' },
      { name: 'sex', holds: 'male or female', needed: false, pointsAt: '' },
      { name: 'householdId', holds: 'text', needed: false, pointsAt: 'households' },
      { name: 'customFields', holds: 'a record, open to text', needed: false, pointsAt: '' },
      { name: 'photo', holds: 'a record of url, open to anything', needed: false, pointsAt: '' },
    ])
    expect(people.others).toBe('')
    expect(within(within(system, 'firestore'), 'households').fields?.[0]).toEqual({
      name: 'memberIds',
      holds: 'a list of text',
      needed: false,
      pointsAt: 'people',
    })
  })

  it('says what else an open store takes, and when a shape is unknown', () => {
    const firestore = within(system, 'firestore')
    expect(within(firestore, 'households').others).toBe('anything')
    const roles = within(firestore, 'roles')
    expect(roles.fields).toBeNull()
    expect(roles.says).toBe('Its shape is unknown: no schema says it.')
  })

  it('wires a store to the stores it points at, through the store an inner one lives in', () => {
    const firestore = within(system, 'firestore')
    const pointing = firestore.wires.filter((w) => w.kind === 'points at')
    expect(pointing.map((w) => [w.from, w.to, w.words])).toEqual([
      [at('store:firestore:households'), at('store:firestore:people'), 'memberIds'],
      [at('store:firestore:people'), at('store:firestore:households'), 'the home they live in'],
      [at('store:firestore:people'), at('store:firestore:roles'), 'roleId'],
      [at('store:firestore:rosters'), at('store:firestore:people'), 'who is serving'],
    ])
    expect(pointing[2]!.ends).toEqual([{ from: at('store:firestore:people/involvement'), to: at('store:firestore:roles') }])
  })

  it('wires a module to the store it keeps, by way of the database', () => {
    const keeps = system.wires.find((w) => w.kind === 'keeps')!
    expect([keeps.from, keeps.to]).toEqual([at('container:web'), at('container:firestore')])
    expect(keeps.ends).toContainEqual({ from: at('web:module:people'), to: at('store:firestore:people/involvement') })
    expect(keeps.ends).toContainEqual({ from: at('web:module:rosters'), to: at('store:firestore:roles') })
  })
})

describe('stores told to an agent', () => {
  it('lists each store with its fields, and its wires as sentences', async () => {
    const said = await describeMap(repo)
    expect(said).toContain('  store people: Everyone the church knows (fixed)')
    expect(said).toContain('    householdId: text, points at households')
    expect(said).toContain('    name: text, needed')
    expect(said).toContain('  store people/involvement, inside people (fixed)')
    expect(said).toContain('  store households (open to anything)')
    expect(said).toContain('  store roles: shape unknown')
    expect(said).toContain('store rosters points at store people')
    expect(said).toContain('module rosters keeps store roles in firestore')
  })
})
