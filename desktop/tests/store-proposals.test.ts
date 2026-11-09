// codegraph: test module reader
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkCode } from '../src/features/check-code.js'
import { systemCard, type Card } from '../src/modules/cards/index.js'
import { live, proposalFrom, proposalProgress, readMap, type DrawnCard } from '../src/modules/reader/index.js'
import { aChurchRepo, aProposal, closeYard, git, openYard, writeInto, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let base = ''

const schema = (body: Record<string, unknown>): string => JSON.stringify({ type: 'object', ...body }, null, 2)

/** Add a services store, give rosters a note, make every person's birthday
 *  needed, and take roles away. */
const theProposal = (migration = '') => ({
  says: 'Plan services',
  sketch: 'Services',
  base,
  containers: [],
  components: [],
  wires: [],
  stores: [
    {
      container: 'firestore',
      path: 'services',
      says: 'Every Sunday service',
      fields: [
        { name: 'title', holds: 'text', needed: true, pointsAt: '' },
        { name: 'leaderId', holds: 'text', needed: false, pointsAt: 'people' },
      ],
      others: '',
    },
    {
      container: 'firestore',
      path: 'rosters',
      says: '',
      fields: [
        { name: 'personId', holds: 'text', needed: false, pointsAt: 'people' },
        { name: 'count', holds: 'whole number', needed: false, pointsAt: '' },
        { name: 'done', holds: 'yes or no', needed: false, pointsAt: '' },
        { name: 'note', holds: 'text', needed: false, pointsAt: '' },
      ],
      others: '',
    },
    {
      container: 'firestore',
      path: 'people',
      says: '',
      fields: [
        { name: 'name', holds: 'text', needed: true, pointsAt: '' },
        { name: 'birthday', holds: 'date', needed: true, pointsAt: '' },
        { name: 'sex', holds: 'male or female', needed: false, pointsAt: '' },
        { name: 'householdId', holds: 'text', needed: false, pointsAt: 'households' },
        { name: 'customFields', holds: 'a record', needed: false, pointsAt: '' },
        { name: 'photo', holds: 'a record', needed: false, pointsAt: '' },
      ],
      others: '',
      ...(migration ? { migration } : {}),
    },
    { container: 'firestore', path: 'roles', says: '', fields: null, others: '', gone: true },
  ],
  layout: {},
})

/** Builds what the proposal draws, all but the migration. */
const buildIt = (): void => {
  const people = JSON.parse(git(repo, 'show', 'HEAD:app/modules/people/people.schema.json')) as {
    required: string[]
  }
  writeInto(repo, {
    'app/modules/services.js': [
      '// codegraph: module services',
      '// codegraph: store services in firestore from services.schema.json',
      'export const x = 1',
      '',
    ].join('\n'),
    'app/modules/services.schema.json': schema({
      description: 'Every Sunday service',
      required: ['title'],
      additionalProperties: false,
      properties: { title: { type: 'string' }, leaderId: { type: 'string', pointsAt: 'people' } },
    }),
    'app/modules/rosters.js': [
      '// codegraph: module rosters',
      '// codegraph: store rosters in firestore from rosters.schema.json',
      'export const x = 1',
      '',
    ].join('\n'),
    'app/modules/rosters.schema.json': schema({
      additionalProperties: false,
      properties: {
        personId: { type: 'string', pointsAt: 'people', description: 'who is serving' },
        count: { type: 'integer' },
        done: { type: 'boolean' },
        note: { type: 'string' },
      },
    }),
    'app/modules/people/people.schema.json': git(repo, 'show', 'HEAD:app/modules/people/people.schema.json').replace(
      JSON.stringify(people.required, null, 2).replace(/\n/g, '\n  '),
      JSON.stringify(['name', 'birthday'], null, 2).replace(/\n/g, '\n  '),
    ),
  })
}

const states = async () => Object.fromEntries((await proposalProgress(repo))!.items.map((i) => [i.name, i.state]))

beforeEach(() => {
  yard = openYard('store-proposals')
  repo = aChurchRepo(yard)
  base = git(repo, 'rev-parse', 'HEAD').trim()
  git(repo, 'checkout', '-q', '-b', 'services')
})

afterEach(() => closeYard(yard))

describe('stores in a proposal', () => {
  it('is read with the rest of the proposal', async () => {
    aProposal(repo, theProposal())
    const map = await readMap(repo, live)
    expect(map.problems).toEqual([])
    expect(map.proposal?.stores.map((s) => [s.path, s.gone ?? false])).toEqual([
      ['services', false],
      ['rosters', false],
      ['people', false],
      ['roles', true],
    ])
  })

  it('starts with every store to build or take away, and says what each lacks', async () => {
    aProposal(repo, theProposal())
    const progress = (await proposalProgress(repo))!
    expect(await states()).toEqual({
      'firestore/store services': 'to build',
      'firestore/store rosters': 'to build',
      'firestore/store people': 'to build',
      'firestore/store roles': 'to remove',
    })
    expect(progress.items.find((i) => i.name === 'firestore/store rosters')?.left).toEqual(['it has no field note'])
    expect(progress.items.find((i) => i.name === 'firestore/store people')?.left).toEqual([
      'birthday is not needed by every record yet',
      'it changes records already kept, so it needs a migration: a script that moves them to the new shape, named in the proposal as its migration',
    ])
  })

  it('holds each schema to its store, and a change to what is kept to its migration', async () => {
    aProposal(repo, theProposal())
    buildIt()
    expect(await states()).toEqual({
      'firestore/store services': 'built',
      'firestore/store rosters': 'built',
      'firestore/store people': 'to build',
      'firestore/store roles': 'removed',
    })
    expect((await proposalProgress(repo))!.unasked).toEqual([])

    aProposal(repo, theProposal('scripts/birthdays.js'))
    expect((await proposalProgress(repo))!.items.find((i) => i.name === 'firestore/store people')?.left).toEqual([
      'its migration, scripts/birthdays.js, is not there yet',
    ])
    writeInto(repo, { 'scripts/birthdays.js': '// codegraph: tooling\nexport const run = () => null\n' })
    const progress = (await proposalProgress(repo))!
    expect(progress.items.every((i) => i.state === 'built' || i.state === 'removed')).toBe(true)
    expect(progress.built).toBe(true)
  })

  it('names a store changed without being drawn', async () => {
    aProposal(repo, { ...theProposal(), stores: [] })
    buildIt()
    // What a store keeps and points at follows from the store, so it is not
    // said twice; the module made to keep a new store is.
    expect((await proposalProgress(repo))!.unasked.sort()).toEqual([
      'The shape of firestore/store people changed, but the proposal does not draw it.',
      'The shape of firestore/store rosters changed, but the proposal does not draw it.',
      'The store firestore/store roles is gone, but the proposal does not cross it out.',
      'The store firestore/store services is new, but the proposal does not draw it.',
      'web/module services is new, but the proposal does not draw it.',
    ])
  })

  it('tells the agent what is left of each store', async () => {
    aProposal(repo, theProposal())
    const { words } = await checkCode(repo)
    expect(words).toContain('- build firestore/store rosters\n  - it has no field note')
  })
})

describe('a proposal drawn from a sketch of stores', () => {
  const card = (holder: Card, name: string): Card => holder.children.find((c) => c.name === name)!

  it('lists the stores the drawing adds, changes or leaves out', async () => {
    const map = await readMap(repo, live)
    const system = systemCard('church', 'church', map)
    const firestore = card(system, 'firestore')
    const rosters = card(firestore, 'rosters')
    rosters.fields = [...rosters.fields!, { name: 'note', holds: 'text', needed: false, pointsAt: '' }]
    const roles = card(firestore, 'roles')
    firestore.children = firestore.children.filter((c) => c.name !== 'roles')
    firestore.children.push({
      ...roles,
      id: 'new',
      name: 'services',
      says: 'Every Sunday service',
      fields: [{ name: 'title', holds: 'text', needed: true, pointsAt: '' }],
      others: 'anything',
      children: [],
      state: undefined,
    })
    const people = card(firestore, 'people')
    people.children = people.children.filter((c) => c.name !== 'prayer_requests')
    const proposal = proposalFrom(system as unknown as DrawnCard, map, { absentIsGone: true })
    expect(proposal.stores).toEqual([
      { container: 'firestore', path: 'rosters', says: '', fields: rosters.fields, others: '', migration: '' },
      {
        container: 'firestore',
        path: 'services',
        says: 'Every Sunday service',
        fields: [{ name: 'title', holds: 'text', needed: true, pointsAt: '' }],
        others: 'anything',
        migration: '',
      },
      { container: 'firestore', path: 'people/prayer_requests', says: '', fields: null, others: '', migration: '', gone: true },
      { container: 'firestore', path: 'roles', says: '', fields: null, others: '', migration: '', gone: true },
    ])
    expect(proposal.wires).toEqual([])
    expect(proposal.components).toEqual([])
  })
})

describe('a proposal of stores drawn over the map', () => {
  it('draws a new store faint with its fields, and marks one crossed out', async () => {
    aProposal(repo, theProposal())
    const firestore = systemCard('church', 'church', await readMap(repo, live)).children.find((c) => c.name === 'firestore')!
    const services = firestore.children.find((c) => c.name === 'services')!
    expect(services.state).toBe('proposed')
    expect(services.fields?.map((f) => f.name)).toEqual(['title', 'leaderId'])
    expect(firestore.children.find((c) => c.name === 'roles')?.state).toBe('gone')
    expect(firestore.children.find((c) => c.name === 'rosters')?.state).toBe('proposed')
    expect(firestore.children.find((c) => c.name === 'households')?.state).toBeUndefined()
  })
})
