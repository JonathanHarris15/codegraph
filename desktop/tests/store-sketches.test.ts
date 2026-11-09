// codegraph: test feature start-sketch
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { describeSketch } from '../src/features/describe-sketch.js'
import { startSketch, type MapCard } from '../src/features/start-sketch.js'
import { addProject, addSoftwareSystem, useFolder as useProjects } from '../src/modules/projects/index.js'
import { blankCard, useFolder as useSketches, writeSketch, type SketchCard } from '../src/modules/sketches/index.js'
import { addStoreInside, choicesIn, kindBetween, placeCard, setFields } from '../src/ui/components/sketch-edits.js'
import { choiceWords, typeOf } from '../src/ui/components/store-fields.js'
import { aChurchRepo, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let projectId = ''

beforeAll(() => {
  yard = openYard('store-sketches')
  useProjects(yard.home)
  useSketches(yard.home)
  repo = aChurchRepo(yard)
  const project = addProject('Church', 'church')
  addSoftwareSystem(project.id, { name: 'church', path: repo, remote: '' })
  projectId = project.id
})

afterAll(() => closeYard(yard))

const mapCard = (id: string, name: string, level: MapCard['level'], kind: string, more: Partial<MapCard> = {}): MapCard => ({
  id,
  name,
  level,
  kind,
  says: '',
  at: '',
  start: false,
  setUp: true,
  names: [],
  children: [],
  wires: [],
  ...more,
})

const database = (): SketchCard => blankCard('db', 'firestore', 'container', 'database')

describe('drawing stores on a sketch', () => {
  it('offers a store inside a database, and an inner store inside a store', () => {
    expect(choicesIn(database()).flatMap((g) => g.choices.map((c) => c.kind))).toEqual(['store'])
    const store = { ...blankCard('s', 'people', 'component', 'store'), fields: [] }
    expect(choicesIn(store).flatMap((g) => g.choices.map((c) => c.kind))).toEqual(['inner store'])
  })

  it('places a fixed store with no fields yet, and an inner store inside it a level down', () => {
    const [withStore, id] = placeCard(database(), { x: 100, y: 100 }, 'store')
    const store = withStore.children.find((c) => c.id === id)!
    expect([store.kind, store.level, store.fields, store.others]).toEqual(['store', 'component', [], ''])
    const [withInner, innerId] = placeCard(store, { x: 50, y: 50 }, 'inner store')
    expect(withInner.children.find((c) => c.id === innerId)).toMatchObject({ kind: 'inner store', level: 'component', fields: [] })
  })

  it('wires one store to another as pointing at it', () => {
    const people = { ...blankCard('p', 'people', 'component', 'store'), fields: [] }
    const rosters = { ...blankCard('r', 'rosters', 'component', 'store'), fields: [] }
    expect(kindBetween(rosters, people)).toBe('points at')
  })

  it('wires a store to the store a field points at, once', () => {
    const focus = database()
    focus.children.push(
      { ...blankCard('p', 'people', 'component', 'store'), fields: [] },
      { ...blankCard('r', 'rosters', 'component', 'store'), fields: [] },
    )
    const field = { name: 'personId', holds: 'text', needed: true, pointsAt: 'people' }
    const once = setFields(focus, 'r', [field])
    const twice = setFields(once, 'r', [field, { ...field, name: 'leaderId' }])
    expect(twice.children.find((c) => c.id === 'r')!.fields).toHaveLength(2)
    expect(twice.wires.map((w) => [w.from, w.to, w.kind, w.words])).toEqual([['r', 'p', 'points at', 'personId']])
  })
})

describe('designing a store beside the board', () => {
  it('adds a store inside a database, and an inner store inside a store, fixed and empty', () => {
    const focus = blankCard('sys', 'church', 'system', 'software system')
    focus.children.push(database())
    const [withStore, storeId] = addStoreInside(focus, 'db', 'people')
    const db = withStore.children[0]!
    expect(db.children.map((c) => [c.id, c.name, c.kind, c.level, c.fields, c.others])).toEqual([[storeId, 'people', 'store', 'component', [], '']])
    const inStore = { ...database(), children: [] as SketchCard[] }
    inStore.children.push({ ...blankCard('p', 'people', 'component', 'store'), fields: [] })
    const [withInner] = addStoreInside(inStore, 'p', 'prayer_requests')
    expect(withInner.children[0]!.children[0]).toMatchObject({ name: 'prayer_requests', kind: 'inner store', level: 'component', fields: [] })
  })

  it('reads what a field holds back into a type, and says choices as the map does', () => {
    expect(typeOf('whole number')).toEqual({ type: 'whole number', of: '', choices: [] })
    expect(typeOf('a list of date')).toEqual({ type: 'a list', of: 'date', choices: [] })
    expect(typeOf('a record of url, open to anything').type).toBe('a record')
    expect(typeOf('draft, sent or paid')).toEqual({ type: 'choices', of: '', choices: ['draft', 'sent', 'paid'] })
    expect(choiceWords(['draft', 'sent', 'paid'])).toBe('draft, sent or paid')
    expect(choiceWords(['male', 'female'])).toBe('male or female')
  })
})

describe('a snapshot of the map', () => {
  it('keeps each store with its fields, open or fixed, or its shape unknown', async () => {
    const people = mapCard('db/people', 'people', 'component', 'store', {
      fields: [{ name: 'name', holds: 'text', needed: true, pointsAt: '' }],
      others: '',
      children: [mapCard('db/involvement', 'involvement', 'component', 'inner store', { fields: [], others: 'anything' })],
    })
    const roles = mapCard('db/roles', 'roles', 'component', 'store', { fields: null, others: '' })
    const db = mapCard('db', 'firestore', 'container', 'database', { children: [people, roles] })
    const sketch = await startSketch(projectId, 'From the map', mapCard(projectId, 'Church', 'project', 'project', { children: [db] }))
    const [kept] = sketch.root.children[0]!.children
    expect(kept).toMatchObject({ kind: 'store', fields: [{ name: 'name', holds: 'text', needed: true, pointsAt: '' }], others: '' })
    expect(kept!.children[0]).toMatchObject({ kind: 'inner store', fields: [], others: 'anything' })
    expect(sketch.root.children[0]!.children[1]!.fields).toBeNull()
  })
})

describe('a sketch told to an agent', () => {
  it('lists each store with its fields, and whether it is fixed or open', async () => {
    const db = database()
    db.children.push(
      {
        ...blankCard('p', 'people', 'component', 'store'),
        says: 'Everyone the church knows',
        fields: [
          { name: 'name', holds: 'text', needed: true, pointsAt: '' },
          { name: 'householdId', holds: 'text', needed: false, pointsAt: 'households' },
        ],
        others: '',
        children: [{ ...blankCard('i', 'involvement', 'component', 'inner store'), fields: [], others: 'text' }],
      },
      { ...blankCard('h', 'households', 'component', 'store'), fields: null },
    )
    const root = blankCard(projectId, 'Church', 'project', 'project')
    const system = blankCard('church', 'church', 'system', 'software system')
    system.children.push(db)
    root.children.push(system)
    writeSketch({ id: 'stores', projectId, name: 'Stores', createdAt: '', updatedAt: '', from: '', root })
    const said = await describeSketch(repo, 'Stores')
    expect(said).toContain('    store people: Everyone the church knows (fixed)')
    expect(said).toContain('      name: text, needed')
    expect(said).toContain('      householdId: text, points at households')
    expect(said).toContain('      inner store involvement (open to text)')
    expect(said).toContain('    store households: shape unknown')
  })
})
