// codegraph: tooling
import { describe, expect, it } from 'vitest'
import { mergeDoc, mergeItems, sameDoc, tally, undoStep, wordsFor } from '../src/modules/together/index.js'

const card = (id: string, more = {}) => ({ id, name: id, x: 0, y: 0, children: [], wires: [], ...more })

describe('two members changing one thing', () => {
  it('keeps both when they changed different things', () => {
    const base = [card('a'), card('b')]
    const mine = [card('a', { x: 5 }), card('b')]
    const theirs = [card('a'), card('b', { x: 9 })]
    expect(mergeItems(base, mine, theirs)).toEqual([card('a', { x: 5 }), card('b', { x: 9 })])
  })

  it('merges field by field within one thing', () => {
    const base = { id: 'a', name: 'old', x: 0 }
    expect(mergeDoc(base, { id: 'a', name: 'new', x: 0 }, { id: 'a', name: 'old', x: 7 })).toEqual({ id: 'a', name: 'new', x: 7 })
  })

  it('lets this side win where both changed one field', () => {
    expect(mergeDoc({ x: 0 }, { x: 1 }, { x: 2 })).toEqual({ x: 1 })
  })

  it('adds what either side added, and drops what one took away', () => {
    const base = [card('a'), card('gone')]
    const merged = mergeItems(base, [card('a'), card('gone'), card('mine')], [card('a'), card('theirs')])
    expect(merged.map((c) => c.id)).toEqual(['a', 'theirs', 'mine'])
  })

  it('keeps a thing one side took away if the other changed it since', () => {
    expect(mergeItems([card('a')], [], [card('a', { x: 3 })]).map((c) => c.x)).toEqual([3])
  })

  it('reaches down a tree of cards', () => {
    const inner = (x: number, y: number) => ({ id: 'root', name: 'r', children: [card('kid', { x, y })], wires: [] })
    expect(mergeDoc(inner(0, 0), inner(4, 0), inner(0, 8))).toEqual(inner(4, 8))
  })

  it('merges the layers of notes down to each note', () => {
    const with_ = (notes: object[]) => ({ layers: [{ id: 'l', name: 'L', items: notes }] })
    const base = with_([{ id: 'n', text: 'a' }])
    const mine = with_([{ id: 'n', text: 'b' }])
    const theirs = with_([{ id: 'n', text: 'a' }, { id: 'm', text: 'c' }])
    expect(mergeDoc(base, mine, theirs)).toEqual(with_([{ id: 'n', text: 'b' }, { id: 'm', text: 'c' }]))
  })
})

describe('undo', () => {
  it('takes back only this member\'s step', () => {
    const before = { children: [card('a'), card('b')] }
    const after = { children: [card('a', { x: 5 }), card('b')] }
    const now = { children: [card('a', { x: 5 }), card('b', { x: 9 }), card('c')] }
    expect(undoStep(before, after, now)).toEqual({ children: [card('a'), card('b', { x: 9 }), card('c')] })
  })
})

describe('undo, with others at work', () => {
  const layer = (...items: object[]) => [{ id: 'l', name: 'L', items }]

  it('keeps others\' notes when the whole thing is a list of layers', () => {
    const before = layer({ id: 'a', text: 'a' })
    const after = layer({ id: 'a', text: 'a' }, { id: 'mine', text: 'm' })
    const now = layer({ id: 'a', text: 'a' }, { id: 'mine', text: 'm' }, { id: 'theirs', text: 't' })
    expect(undoStep(before, after, now)).toEqual(layer({ id: 'a', text: 'a' }, { id: 'theirs', text: 't' }))
  })

  it('leaves a field someone else has changed since', () => {
    expect(undoStep({ x: 0 }, { x: 1 }, { x: 2 })).toEqual({ x: 2 })
  })

  it('brings back what the step took away', () => {
    expect(undoStep({ children: [card('a')] }, { children: [] }, { children: [card('b')] }).children.map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('does a step again, called the other way round', () => {
    expect(undoStep({ x: 1 }, { x: 0 }, { x: 0 })).toEqual({ x: 1 })
  })
})

describe('the same document in another order', () => {
  it('is the same document', () => {
    expect(mergeDoc({ a: 1, b: { c: 1, d: 2 } }, { b: { d: 2, c: 1 }, a: 1 }, { a: 1, b: { c: 1, d: 2 } })).toEqual({ b: { d: 2, c: 1 }, a: 1 })
    expect(sameDoc({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
  })
})

describe('saying what changed', () => {
  it('counts in people\'s words', () => {
    const before = { children: [card('a'), card('b')], layers: [] }
    const after = { children: [card('a', { x: 1 }), card('b', { name: 'renamed' }), card('c')], layers: [{ id: 'l', items: [{ id: 'n' }, { id: 'm' }] }] }
    expect(wordsFor(tally(before, after))).toBe('moved a card, added a card, added 2 notes, changed a card')
  })

  it('says a layout changed when the spots did', () => {
    expect(wordsFor(tally({ spots: [] }, { spots: [{ id: 'a', x: 1, y: 2 }] }))).toBe('moved a card')
    expect(wordsFor(tally({ spots: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 0 }] }, { spots: [{ id: 'a', x: 1, y: 2 }, { id: 'b', x: 3, y: 4 }] }))).toBe('moved 2 cards')
  })

  it('has words for nothing much', () => {
    expect(wordsFor(tally({}, {}))).toBe('made a change')
  })
})
