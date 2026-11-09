// codegraph: test module reader
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkRepo, live, readMap, type Store, type SystemMap } from '../src/modules/reader/index.js'
import { closeYard, git, openYard, writeInto, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let map: SystemMap

const schema = (body: Record<string, unknown>): string => JSON.stringify({ type: 'object', ...body }, null, 2)

/** A small church app kept in a document database: people, each with their
 *  own involvement and prayer requests inside them, and rosters that point at
 *  people. */
const aChurchRepo = (yard: Yard): string => {
  const path = `${yard.path}/church`
  git(yard.path, 'init', '--initial-branch=main', 'church')
  git(path, 'config', 'user.email', 'test@example.com')
  git(path, 'config', 'user.name', 'Test')
  writeInto(path, {
    'codegraph.config.json': JSON.stringify({
      projects: ['church'],
      containers: {
        web: { kind: 'browser app', says: 'Where the church is run', folders: ['app'] },
        firestore: { kind: 'database', says: 'Keeps everything' },
      },
    }),
    'app/modules/people/people.js': [
      '// codegraph: module people',
      '// codegraph: front door savePerson',
      '// codegraph: store people in firestore from people.schema.json',
      '// codegraph: store involvement in firestore inside people from involvement.schema.json',
      '// codegraph: store prayer_requests in firestore inside people',
      'export const savePerson = () => null',
      '',
    ].join('\n'),
    'app/modules/people/people.schema.json': schema({
      description: 'Everyone the church knows',
      required: ['name'],
      additionalProperties: false,
      properties: {
        name: { type: 'string', description: 'What they are called' },
        birthday: { type: 'string', format: 'date' },
        sex: { enum: ['male', 'female'] },
        householdId: { type: 'string', pointsAt: 'households', description: 'the home they live in' },
        customFields: { type: 'object', additionalProperties: { type: 'string' } },
        photo: { type: 'object', properties: { url: { type: 'string' } } },
      },
    }),
    'app/modules/people/involvement.schema.json': schema({
      additionalProperties: false,
      properties: { roleId: { type: 'string', pointsAt: 'roles' }, since: { type: 'string', format: 'date-time' } },
    }),
    'app/modules/households.js': [
      '// codegraph: module households',
      '// codegraph: store households in firestore from ./households.schema.json',
      'export const x = 1',
      '',
    ].join('\n'),
    'app/modules/households.schema.json': schema({
      properties: { memberIds: { type: 'array', items: { type: 'string', pointsAt: 'people' } } },
    }),
    'app/modules/rosters.js': [
      '// codegraph: module rosters',
      '// codegraph: store rosters in firestore from rosters.schema.json',
      '// codegraph: store roles in firestore',
      'export const x = 1',
      '',
    ].join('\n'),
    'app/modules/rosters.schema.json': schema({
      additionalProperties: false,
      properties: {
        personId: { type: 'string', pointsAt: 'people', description: 'who is serving' },
        count: { type: 'integer' },
        done: { type: 'boolean' },
      },
    }),
  })
  git(path, 'add', '-A')
  git(path, 'commit', '-m', 'church')
  return path
}

beforeAll(async () => {
  yard = openYard('stores')
  repo = aChurchRepo(yard)
  map = await readMap(repo, live)
})

afterAll(() => closeYard(yard))

const store = (path: string): Store => {
  const found = map.stores.find((s) => s.path === path)
  if (!found) throw new Error(`no store ${path}`)
  return found
}

describe('stores and their shapes', () => {
  it('reads every store, with the module that keeps it and the database it is in', () => {
    expect(map.problems).toEqual([])
    expect(map.stores.map((s) => [s.path, s.keeper, s.container])).toEqual([
      ['households', 'web:module:households', 'firestore'],
      ['people', 'web:module:people', 'firestore'],
      ['people/involvement', 'web:module:people', 'firestore'],
      ['people/prayer_requests', 'web:module:people', 'firestore'],
      ['rosters', 'web:module:rosters', 'firestore'],
      ['roles', 'web:module:rosters', 'firestore'],
    ])
    expect(map.containers.find((c) => c.name === 'firestore')?.stores).toContain('involvement')
  })

  it('knows which stores live inside another', () => {
    expect(store('people/involvement')).toMatchObject({ name: 'involvement', inside: 'people' })
    expect(store('people').inside).toBe('')
  })

  it('reads each field and what it holds from the schema the module runs', () => {
    const people = store('people')
    expect(people.says).toBe('Everyone the church knows')
    expect(people.schema).toBe('app/modules/people/people.schema.json')
    const fields = people.shape!.fields
    expect(fields.map((f) => [f.name, f.holds.kind, f.needed])).toEqual([
      ['name', 'text', true],
      ['birthday', 'date', false],
      ['sex', 'one of', false],
      ['householdId', 'text', false],
      ['customFields', 'record', false],
      ['photo', 'record', false],
    ])
    expect(fields[0]!.says).toBe('What they are called')
    expect(fields[2]!.holds).toEqual({ kind: 'one of', choices: ['male', 'female'] })
    expect(store('rosters').shape!.fields.map((f) => f.holds.kind)).toEqual(['text', 'whole number', 'yes or no'])
    expect(store('households').shape!.fields[0]!.holds).toEqual({ kind: 'list', of: { kind: 'text' } })
  })

  it('says whether a shape is fixed or open, and what an open one takes', () => {
    const people = store('people').shape!
    expect([people.fixed, people.others]).toEqual([true, null])
    const [, , , , custom, photo] = people.fields
    expect(custom!.holds).toEqual({ kind: 'record', shape: { fixed: false, fields: [], others: { kind: 'text' } } })
    // A schema that says nothing about other fields lets anything in, as JSON Schema does.
    expect(photo!.holds).toMatchObject({ kind: 'record', shape: { fixed: false, others: { kind: 'anything' } } })
    expect(store('households').shape).toMatchObject({ fixed: false, others: { kind: 'anything' } })
  })

  it('has the shape unknown, not guessed, where there is no schema to read', () => {
    expect(store('people/prayer_requests').shape).toBeNull()
    expect(store('roles').shape).toBeNull()
  })

  it('draws a wire for every field that points at another store, worded by the field', () => {
    const pointing = map.wires.filter((w) => w.kind === 'points at')
    expect(pointing).toEqual([
      { from: 'store:firestore:households', to: 'store:firestore:people', kind: 'points at', words: 'memberIds' },
      { from: 'store:firestore:people', to: 'store:firestore:households', kind: 'points at', words: 'the home they live in' },
      { from: 'store:firestore:people/involvement', to: 'store:firestore:roles', kind: 'points at', words: 'roleId' },
      { from: 'store:firestore:rosters', to: 'store:firestore:people', kind: 'points at', words: 'who is serving' },
    ])
    expect(store('rosters').shape!.fields[0]!.pointsAt).toBe('people')
  })

  it('still wires each module that keeps a store to its database', () => {
    expect(map.wires).toContainEqual({ from: 'web:module:rosters', to: 'container:firestore', kind: 'keeps', words: 'keeps rosters' })
  })

  it('says plainly what it could not make sense of', async () => {
    writeInto(repo, {
      'app/modules/broken.js': [
        '// codegraph: module broken',
        '// codegraph: store notes in firestore from notes.schema.json',
        '// codegraph: store comments in firestore inside posts',
        '// codegraph: store tasks in firestore from tasks.schema.json',
        '// codegraph: store rosters in firestore',
        'export const x = 1',
        '',
      ].join('\n'),
      'app/modules/tasks.schema.json': '{ not json',
      'app/modules/households.schema.json': schema({
        properties: { memberIds: { type: 'array', items: { type: 'string', pointsAt: 'peple' } } },
      }),
    })
    const now = await readMap(repo, live)
    git(repo, 'checkout', '--', '.')
    git(repo, 'clean', '-fdq')
    expect(now.problems).toEqual([
      'rosters is kept by both module broken and module rosters',
      'app/modules/broken.js shapes notes by app/modules/notes.schema.json, which is not there',
      'app/modules/broken.js keeps comments inside posts, which is not a store in firestore',
      'app/modules/tasks.schema.json is not JSON the reader can read',
      'The field memberIds of households points at peple, which is not a store in firestore',
    ])
  })

  it('reads stores at a commit as well as in the folder', async () => {
    const sha = git(repo, 'rev-parse', 'HEAD').trim()
    const then = await readMap(repo, { kind: 'commit', sha, title: 'church' })
    expect(then.stores.map((s) => s.path)).toEqual(map.stores.map((s) => s.path))
    expect(then.stores[0]!.shape).toEqual(map.stores[0]!.shape)
  })

  it('needs no tag on a schema file', async () => {
    expect((await checkRepo(repo, live)).filter((m) => m.file.endsWith('.json'))).toEqual([])
  })
})
