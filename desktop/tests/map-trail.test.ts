// codegraph: test ui canvas
import { describe, expect, it } from 'vitest'
import { deeper, shallower, walk, type DrawnCard } from '../src/ui/components/map-layout.js'

type Tree = { id: string; children: Tree[] }
const card = (id: string, ...children: Tree[]): Tree => ({ id, children })
const asDrawn = (trail: Tree[]): DrawnCard[] => trail as unknown as DrawnCard[]

// A project with one software system, holding one container, holding two
// components: the system and the container are levels with nothing to choose.
const project = card('p', card('s', card('c', card('a', card('a1')), card('b'))))

describe('the trail from the top of the map to the card open now', () => {
  it('follows a path of ids, and stops where the path no longer leads', () => {
    expect(walk(project, ['p', 's', 'c']).map((c) => c.id)).toEqual(['p', 's', 'c'])
    expect(walk(project, ['p', 's', 'gone', 'c']).map((c) => c.id)).toEqual(['p', 's'])
  })

  it('opens on through levels with only one card in them, on a map', () => {
    expect(deeper(asDrawn(walk(project, ['p'])), false)).toEqual(['p', 's', 'c'])
  })

  it('opens just the card asked for, on a sketch', () => {
    expect(deeper(asDrawn(walk(project, ['p'])), true)).toEqual(['p'])
  })

  it('backs out over those same levels', () => {
    expect(shallower(asDrawn(walk(project, ['p', 's', 'c'])), false)).toEqual(['p'])
    expect(shallower(asDrawn(walk(project, ['p', 's', 'c'])), true)).toEqual(['p', 's'])
  })
})
