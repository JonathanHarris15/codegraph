// codegraph: test module places
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useFolder as useAnnotations, writeAnnotations } from '../src/modules/annotations/index.js'
import { useFolder as useArrangements, writeArrangement } from '../src/modules/arrangements/index.js'
import { keyIsShared, mapKey, readLayers, readSpots, takeUpMerges, writeLayers, writeSpots, type MapAt } from '../src/modules/places/index.js'
import { aSoftwareSystem, closeYard, git, openYard, type Yard } from './yard.js'

const main: MapAt = { systemId: 'sys', key: 'github:main', mainKey: 'github:main' }
const feature: MapAt = { ...main, key: 'github:feature' }
const local: MapAt = { ...main, key: 'local:feature' }
const spot = (id: string, x = 1) => ({ id, x, y: 2 })
const note = (id: string, at: string) => ({ id, at, kind: 'sticky', x: 0, y: 0, w: 9, h: 9, text: id, color: '' })
const layer = (...items: ReturnType<typeof note>[]) => ({ id: 'l', name: 'L', shown: true, snaps: true, items })

describe('which map a point is', () => {
  it('names GitHub branches, local branches and commits apart', () => {
    expect(mapKey({ kind: 'branch', name: 'origin/feature/x', where: 'cloud' })).toBe('github:feature/x')
    expect(mapKey({ kind: 'branch', name: 'feature', where: 'both' })).toBe('local:feature')
    expect(mapKey({ kind: 'live', branch: 'feature' })).toBe('local:feature')
    expect(mapKey({ kind: 'commit', sha: 'abc', title: '' })).toBe('commit:abc')
  })

  it('never shares a local one', () => {
    expect(keyIsShared('github:main')).toBe(true)
    expect(keyIsShared('sys@github:main')).toBe(true)
    expect(keyIsShared('sys@local:main')).toBe(false)
  })
})

describe('where things sit on each map', () => {
  let yard: Yard
  beforeEach(() => {
    yard = openYard('places')
    useArrangements(yard.home)
    useAnnotations(yard.home)
  })
  afterEach(() => closeYard(yard))

  it('keeps each branch to itself', () => {
    writeSpots('p', [main], [spot('sys/a', 1)])
    writeSpots('p', [feature], [spot('sys/a', 2)])
    expect(readSpots('p', [main])).toEqual([spot('sys/a', 1)])
    expect(readSpots('p', [feature])).toEqual([spot('sys/a', 2)])
  })

  it('starts a new branch from the main line', () => {
    writeSpots('p', [main], [spot('sys/a', 7)])
    expect(readSpots('p', [feature])).toEqual([spot('sys/a', 7)])
  })

  it('keeps the top level one for everyone', () => {
    writeSpots('p', [main], [spot('sys', 3), spot('sys/a', 1)])
    expect(readSpots('p', [feature])).toEqual([spot('sys', 3), spot('sys/a', 1)])
  })

  it('takes up what older files kept, on the main line', () => {
    writeArrangement('p', [spot('sys/a', 9), spot('top', 4)])
    expect(readSpots('p', [main])).toEqual([spot('top', 4), spot('sys/a', 9)])
    writeSpots('p', [main], [spot('top', 4), spot('sys/a', 10)])
    expect(readSpots('p', [main])).toEqual([spot('top', 4), spot('sys/a', 10)])
  })

  it('writes only the map that changed', () => {
    writeSpots('p', [main], [spot('sys/a', 1)])
    expect(writeSpots('p', [feature], [spot('sys/a', 1)])).toEqual([])
    expect(writeSpots('p', [feature], [spot('sys/a', 5)])).toEqual(['sys@github:feature'])
  })

  it('pushing a branch brings its layout along', () => {
    writeSpots('p', [local], [spot('sys/a', 8)])
    expect(readSpots('p', [feature])).toEqual([spot('sys/a', 8)])
  })

  describe('notes', () => {
    it('do not show on another branch', () => {
      writeLayers('p', [main], [layer(note('why', 'sys/a'))])
      expect(readLayers('p', [main])[0]?.items.map((i) => i.id)).toEqual(['why'])
      expect(readLayers('p', [feature]).flatMap((l) => l.items)).toEqual([])
    })

    it('at the top level show for everyone', () => {
      writeLayers('p', [main], [layer(note('top', 'p'))])
      expect(readLayers('p', [feature])[0]?.items.map((i) => i.id)).toEqual(['top'])
    })

    it('kept by older files go to the main line', () => {
      writeAnnotations('p', [layer(note('old', 'sys/a'))])
      expect(readLayers('p', [main])[0]?.items.map((i) => i.id)).toEqual(['old'])
      expect(readLayers('p', [feature]).flatMap((l) => l.items)).toEqual([])
    })

    it('come along when a local branch is pushed', () => {
      writeLayers('p', [local], [layer(note('mine', 'sys/a'))])
      expect(readLayers('p', [feature])[0]?.items.map((i) => i.id)).toEqual(['mine'])
    })
  })

  describe('when a branch is merged', () => {
    const repoWithBranch = (): string => {
      const repo = aSoftwareSystem(yard, 'repo')
      git(repo, 'switch', '-c', 'feature')
      writeFileSync(join(repo, 'new.ts'), 'export const b = 2\n')
      git(repo, 'add', '-A')
      git(repo, 'commit', '-m', 'more')
      git(repo, 'switch', 'main')
      return repo
    }
    const at = (key: string, head: string): MapAt => ({ systemId: 'sys', key, mainKey: 'local:main', head })

    it('leaves the main line alone until it happens', async () => {
      const repo = repoWithBranch()
      writeSpots('p', [at('local:main', git(repo, 'rev-parse', 'main'))], [spot('sys/a', 1)])
      writeSpots('p', [at('local:feature', git(repo, 'rev-parse', 'main'))], [spot('sys/a', 2)])
      await takeUpMerges('p', repo, at('local:main', ''), 'main')
      expect(readSpots('p', [at('local:main', '')])).toEqual([spot('sys/a', 1)])
    })

    it('takes the layout of the side last worked on, and all the notes', async () => {
      const repo = repoWithBranch()
      writeSpots('p', [at('local:main', git(repo, 'rev-parse', 'main'))], [spot('sys/a', 1)])
      writeLayers('p', [at('local:main', '')], [layer(note('m', 'sys/a'))])
      await new Promise((go) => setTimeout(go, 5))
      writeSpots('p', [at('local:feature', git(repo, 'rev-parse', 'main'))], [spot('sys/a', 2)])
      writeLayers('p', [at('local:feature', '')], [layer(note('f', 'sys/a'))])
      git(repo, 'merge', '--no-ff', '-m', 'merge', 'feature')
      expect(await takeUpMerges('p', repo, at('local:main', ''), 'main')).toEqual(['sys@local:main'])
      expect(readSpots('p', [at('local:main', '')])).toEqual([spot('sys/a', 2)])
      expect(readLayers('p', [at('local:main', '')])[0]?.items.map((i) => i.id)).toEqual(['m', 'f'])
    })

    it('keeps the main line layout if that was worked on last', async () => {
      const repo = repoWithBranch()
      writeSpots('p', [at('local:feature', git(repo, 'rev-parse', 'main'))], [spot('sys/a', 2)])
      await new Promise((go) => setTimeout(go, 5))
      writeSpots('p', [at('local:main', git(repo, 'rev-parse', 'main'))], [spot('sys/a', 1)])
      git(repo, 'merge', '--no-ff', '-m', 'merge', 'feature')
      await takeUpMerges('p', repo, at('local:main', ''), 'main')
      expect(readSpots('p', [at('local:main', '')])).toEqual([spot('sys/a', 1)])
    })

    it('takes a merge up once', async () => {
      const repo = repoWithBranch()
      writeSpots('p', [at('local:feature', git(repo, 'rev-parse', 'main'))], [spot('sys/a', 2)])
      git(repo, 'merge', '--no-ff', '-m', 'merge', 'feature')
      await takeUpMerges('p', repo, at('local:main', ''), 'main')
      await new Promise((go) => setTimeout(go, 5))
      writeSpots('p', [at('local:main', '')], [spot('sys/a', 3)])
      expect(await takeUpMerges('p', repo, at('local:main', ''), 'main')).toEqual([])
      expect(readSpots('p', [at('local:main', '')])).toEqual([spot('sys/a', 3)])
    })

    it('does not mistake a branch with no commits of its own for merged', async () => {
      const repo = aSoftwareSystem(yard, 'plain')
      const head = git(repo, 'rev-parse', 'main')
      git(repo, 'branch', 'feature')
      writeSpots('p', [at('local:main', head)], [spot('sys/a', 1)])
      await new Promise((go) => setTimeout(go, 5))
      writeSpots('p', [at('local:feature', head)], [spot('sys/a', 2)])
      expect(await takeUpMerges('p', repo, at('local:main', ''), 'main')).toEqual([])
    })
  })
})
