// codegraph: test module sketches
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  blankCard,
  keepMockup,
  listSketches,
  mockupFile,
  newSketch,
  readSketch,
  removeSketch,
  useFolder,
  writeSketch,
} from '../src/modules/sketches/index.js'
import { aPicture } from './yard.js'

let folder = ''

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'codegraph-sketches-'))
  useFolder(folder)
})

afterEach(() => rmSync(folder, { recursive: true, force: true }))

describe('the sketches a project keeps', () => {
  it('starts with none', () => {
    expect(listSketches('p')).toEqual([])
  })

  it('keeps a sketch with its project, card for card', () => {
    const sketch = newSketch('p', 'Search', blankCard('p', 'Notes', 'project'))
    sketch.root.children.push({ ...blankCard('s1', 'web', 'system'), x: 10, y: 20 })
    sketch.root.notes.push({ id: 'n1', text: 'what about tags?', x: 0, y: 0 })
    writeSketch(sketch)

    const kept = readSketch('p', sketch.id)
    expect(kept?.name).toBe('Search')
    expect(kept?.root.children[0]).toMatchObject({ name: 'web', level: 'system', x: 10, y: 20 })
    expect(kept?.root.notes[0]?.text).toBe('what about tags?')
    expect(listSketches('q')).toEqual([])
  })

  it('lists the latest changed first', () => {
    const older = newSketch('p', 'Older', blankCard('p', 'Notes', 'project'))
    writeSketch({ ...older, updatedAt: '2026-01-01T00:00:00.000Z' })
    const newer = newSketch('p', 'Newer', blankCard('p', 'Notes', 'project'))
    writeSketch({ ...newer, updatedAt: '2026-02-01T00:00:00.000Z' })
    expect(listSketches('p').map((s) => s.name)).toEqual(['Newer', 'Older'])
  })

  it('keeps a mockup as a picture beside the sketch, for an agent to open', () => {
    const sketch = newSketch('p', 'Search', blankCard('p', 'Notes', 'project'))
    writeSketch(sketch)
    const picked = join(folder, 'design.png')
    writeFileSync(picked, aPicture())

    const name = keepMockup('p', sketch.id, 'card-1', picked)
    expect(name).toBe('card-1.png')
    expect(readFileSync(mockupFile('p', sketch.id, name))).toEqual(aPicture())
  })

  it('forgets a sketch and its mockups', () => {
    const sketch = newSketch('p', 'Search', blankCard('p', 'Notes', 'project'))
    writeSketch(sketch)
    const picked = join(folder, 'design.png')
    writeFileSync(picked, aPicture())
    keepMockup('p', sketch.id, 'card-1', picked)

    removeSketch('p', sketch.id)
    expect(listSketches('p')).toEqual([])
    expect(existsSync(mockupFile('p', sketch.id, 'card-1.png'))).toBe(false)
  })
})
