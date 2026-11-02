// codegraph: test module reader
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listPoints, live, outsideId, readMap, type SystemMap } from '../src/modules/reader/index.js'
import { aMappedRepo, aSoftwareSystem, closeYard, git, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let map: SystemMap

beforeAll(async () => {
  yard = openYard('reader')
  repo = aMappedRepo(yard)
  map = await readMap(repo, live)
})

afterAll(() => closeYard(yard))

const names = (m: SystemMap): string[] => m.components.map((c) => c.name).sort()
const wire = (m: SystemMap, from: string, to: string) =>
  m.wires.find((w) => w.from.endsWith(`:${from}`) && w.to.endsWith(`:${to}`))

describe('reading a set-up repo', () => {
  it('reads its projects and containers from the config', () => {
    expect(map.setUp).toBe(true)
    expect(map.projects).toEqual(['notes-app'])
    expect(map.containers.map((c) => [c.name, c.kind])).toEqual([
      ['web', 'browser app'],
      ['db', 'database'],
    ])
  })

  it('puts each tagged file in its component, inside its container', () => {
    expect(names(map)).toEqual(['new-note', 'nightly-tidy', 'notes', 'notes', 'write-note'])
    expect(map.components.every((c) => c.container === 'web')).toBe(true)
    const start = map.components.find((c) => c.start)
    expect([start?.kind, start?.at]).toEqual(['page', '/'])
    expect(map.components.find((c) => c.kind === 'trigger')?.trigger).toBe('schedule')
  })

  it('leaves tests out of the components, though they sit outside every container', () => {
    expect(map.components.flatMap((c) => c.files.map((f) => f.path))).not.toContain('test/write-note.test.ts')
    expect(map.problems).toEqual([])
  })

  it('reads the names declared in each file', () => {
    const notes = map.components.find((c) => c.kind === 'module')
    expect(notes?.files[0]?.names).toEqual(['Note', 'saveNote', 'listNotes'])
    expect(notes?.frontDoor).toEqual(['saveNote', 'listNotes', 'Note'])
  })

  it('draws wires from imports, with their kind and words, through path aliases too', () => {
    expect(wire(map, 'write-note', 'notes')).toMatchObject({ kind: 'uses', words: 'keeps the note' })
    expect(wire(map, 'new-note', 'write-note')).toMatchObject({ kind: 'acts on', words: 'saves what was typed' })
    expect(wire(map, 'page:notes', 'module:notes')).toMatchObject({ kind: 'shows', words: 'lists the notes' })
    expect(wire(map, 'nightly-tidy', 'write-note')).toMatchObject({ kind: 'starts', words: '' })
  })

  it('wires the module that keeps a store to the container it is kept in', () => {
    expect(map.containers.find((c) => c.name === 'db')?.stores).toEqual(['notes'])
    expect(map.wires).toContainEqual({
      from: 'web:module:notes',
      to: 'container:db',
      kind: 'keeps',
      words: 'keeps notes',
    })
  })

  it('sees which page leads to which', () => {
    expect(wire(map, 'page:notes', 'page:new-note')).toMatchObject({ kind: 'leads to' })
    expect(wire(map, 'page:new-note', 'page:notes')).toBeUndefined()
  })

  it('notes calls out of the repo by the name they are aimed at', () => {
    expect(map.outside).toEqual([
      { from: 'web:page:new-note', to: outsideId('mailer'), kind: 'calls', words: 'tells the owner' },
    ])
  })
})

describe('reading at a point', () => {
  it('shows what is not committed yet in the live folder, and nowhere else', async () => {
    mkdirSync(join(repo, 'app', 'modules'), { recursive: true })
    writeFileSync(join(repo, 'app', 'modules', 'tags.ts'), '// codegraph: module tags\nexport const tag = 1\n')
    expect(names(await readMap(repo, live))).toContain('tags')
    expect(names(await readMap(repo, { kind: 'branch', name: 'main' }))).not.toContain('tags')
    rmSync(join(repo, 'app', 'modules', 'tags.ts'))
  })

  it('reads another branch without checking it out', async () => {
    const there = await readMap(repo, { kind: 'branch', name: 'add-search' })
    expect(names(there)).toContain('search')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(names(await readMap(repo, live))).not.toContain('search')
  })

  it('reads an older commit', async () => {
    const first = git(repo, 'rev-list', '--max-parents=0', 'HEAD')
    const then = await readMap(repo, { kind: 'commit', sha: first, title: 'notes' })
    expect(names(then)).toEqual(names(map))
  })

  it('lists the live folder, the branches and the latest commits', async () => {
    const points = await listPoints(repo)
    expect(points[0]).toEqual(live)
    const branches = points.flatMap((p) => (p.kind === 'branch' ? [p.name] : []))
    expect(branches.sort()).toEqual(['add-search', 'main'])
    expect(points.find((p) => p.kind === 'commit')).toMatchObject({ title: 'notes' })
  })
})

describe('reading a repo that is not set up', () => {
  it('says so, and draws nothing', async () => {
    const plain = await readMap(aSoftwareSystem(yard, 'plain'), live)
    expect(plain.setUp).toBe(false)
    expect(plain.components).toEqual([])
  })

  it('names a file that sits outside every container', async () => {
    writeFileSync(join(repo, 'loose.ts'), '// codegraph: module loose\n')
    expect((await readMap(repo, live)).problems).toEqual(["loose.ts is not in any container's folders"])
    rmSync(join(repo, 'loose.ts'))
  })
})
