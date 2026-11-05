// codegraph: test ui canvas
import { describe, expect, it } from 'vitest'
import { openLevels, pushAside, resized, roomAround, type Box, type DrawnCard } from '../src/ui/components/map-layout.js'

const card = (id: string, x: number, y: number, children: DrawnCard[] = []): DrawnCard =>
  ({ id, name: id, level: 'container', kind: 'server', says: '', at: '', start: false, setUp: true, names: [], shot: '', mockup: '', x, y, children, wires: [], notes: [] }) as unknown as DrawnCard

const clear = (a: Box, b: Box): boolean => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y

const levelsOf = (trail: DrawnCard[]) => trail.map((c) => ({ card: c, children: c.children, wires: c.wires, notes: c.notes ?? [] }))
const room800 = (_: DrawnCard, inside: Box | null): Box => roomAround(inside, { w: 800, h: 600 })

describe('a card opening pushes the cards around it aside', () => {
  const open: Box = { x: 0, y: 0, w: 800, h: 600 }

  it('moves a card it would cover straight out from its middle', () => {
    const out = pushAside(open, [{ id: 'left', box: { x: 100, y: 250, w: 280, h: 100 } }])
    const moved = out.get('left')!
    expect(clear(moved, open)).toBe(true)
    expect(moved.x + moved.w).toBeLessThanOrEqual(0)
    expect(moved.y + moved.h / 2).toBeCloseTo(300, 0)
  })

  it('leaves a card that is clear of it where it was', () => {
    const far = { x: 2000, y: 0, w: 280, h: 100 }
    expect(pushAside(open, [{ id: 'far', box: far }]).get('far')).toEqual(far)
  })

  it('passes the push on to a card the first one lands on', () => {
    const out = pushAside(open, [
      { id: 'near', box: { x: 700, y: 250, w: 280, h: 100 } },
      { id: 'next', box: { x: 1000, y: 250, w: 280, h: 100 } },
    ])
    expect(out.get('near')!.x).toBeGreaterThanOrEqual(800)
    expect(clear(out.get('near')!, out.get('next')!)).toBe(true)
  })

  it('leaves two cards a person stacked alone when nothing pushed them', () => {
    const a = { x: 2000, y: 0, w: 280, h: 100 }
    const b = { x: 2010, y: 10, w: 280, h: 100 }
    const out = pushAside(open, [{ id: 'a', box: a }, { id: 'b', box: b }])
    expect(out.get('a')).toEqual(a)
    expect(out.get('b')).toEqual(b)
  })

  it('never moves the card under the hand', () => {
    const held = { x: 100, y: 100, w: 280, h: 100 }
    expect(pushAside(open, [{ id: 'held', box: held }], new Set(['held'])).get('held')).toEqual(held)
  })

  it('gives a wired card room for the wire’s words beside it', () => {
    const out = pushAside(open, [{ id: 'wired', box: { x: 820, y: 250, w: 280, h: 100 } }], new Set(), new Map([['wired', 300]]))
    expect(out.get('wired')!.x).toBeGreaterThanOrEqual(1100)
  })
})

describe('an open card', () => {
  it('grows round its own middle, so it stays where it was on its level', () => {
    const inner = card('inner', 0, 0)
    const levels = openLevels({ levels: levelsOf([card('root', 0, 0, [inner]), inner]), roomOf: room800, anchors: new Map() })
    expect(levels[0]!.open!.box).toEqual({ x: 140 - 400, y: 75 - 300, w: 800, h: 600 })
  })

  it('does not slide what is inside it when a card is carried past its edge', () => {
    const a = card('a', 0, 0)
    const b = card('b', 300, 0)
    const inner = card('inner', 0, 0, [a, b])
    const anchors = new Map()
    const kept = (): Box => ({ x: -200, y: -300, w: 800, h: 600 })
    const before = openLevels({ levels: levelsOf([card('root', 0, 0, [inner]), inner]), roomOf: kept, anchors })
    const carried = { ...inner, children: [a, { ...b, x: 3000 }] }
    const after = openLevels({ levels: levelsOf([card('root', 0, 0, [carried]), carried]), roomOf: kept, anchors })
    const at = (levels: typeof before, id: string): Box => levels[1]!.placed.find((p) => p.card.id === id)!.box
    expect(at(after, 'a')).toEqual(at(before, 'a'))
    expect(after[0]!.open!.box.x).toBe(before[0]!.open!.box.x)
    const open = after[0]!.open!.box
    expect(open.x + open.w).toBeGreaterThan(at(after, 'b').x + at(after, 'b').w)
  })

  it('pushes its neighbours further as it grows', () => {
    const inner = card('inner', 0, 0)
    const next = card('next', 500, 0)
    const root = card('root', 0, 0, [inner, next])
    const small = openLevels({ levels: levelsOf([root, inner]), roomOf: room800, anchors: new Map() })
    const big = openLevels({ levels: levelsOf([root, inner]), roomOf: (c, i) => roomAround(i, { w: 2400, h: 600 }), anchors: new Map() })
    expect(big[0]!.placed[0]!.box.x).toBeGreaterThan(small[0]!.placed[0]!.box.x)
    expect(big[0]!.natural.find((p) => p.card.id === 'next')!.box.x).toBe(500)
  })

  it('makes the card it sits in big enough to hold it, all the way out', () => {
    const deep = card('deep', 0, 0)
    const middle = card('middle', 0, 0, [deep])
    const root = card('root', 0, 0, [middle])
    const levels = openLevels({ levels: levelsOf([root, middle, deep]), roomOf: (c, i) => roomAround(i, { w: 500, h: 400 }), anchors: new Map() })
    const outer = levels[0]!.open!.box
    const inner = levels[1]!.open!.box
    expect(outer.x).toBeLessThan(inner.x)
    expect(outer.x + outer.w).toBeGreaterThan(inner.x + inner.w)
    expect(outer.y).toBeLessThan(inner.y)
  })
})

describe('resizing an open card', () => {
  const room: Box = { x: 0, y: 0, w: 800, h: 600 }
  it('moves only the edges of the handle being dragged', () => {
    expect(resized(room, 'se', 100, 50, { w: 200, h: 100 })).toEqual({ x: 0, y: 0, w: 900, h: 650 })
    expect(resized(room, 'nw', -100, -50, { w: 200, h: 100 })).toEqual({ x: -100, y: -50, w: 900, h: 650 })
    expect(resized(room, 'e', 100, 50, { w: 200, h: 100 })).toEqual({ x: 0, y: 0, w: 900, h: 600 })
  })
  it('stops at the smallest it can be, holding the far edge still', () => {
    expect(resized(room, 'nw', 2000, 2000, { w: 200, h: 100 })).toEqual({ x: 600, y: 500, w: 200, h: 100 })
  })
})
