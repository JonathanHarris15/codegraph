// codegraph: test ui canvas
import { describe, expect, it } from 'vitest'
import { blankCard, type SketchCard } from '../src/modules/sketches/index.js'
import { bendWire, moveThings, rewire } from '../src/ui/components/sketch-edits.js'
import { addBend, dragPiece, nearestOn, pieceOf, pointAlong, squareRoute, takePieceOut, type Point } from '../src/ui/components/square-wires.js'

const left = { x: 0, y: 0, w: 100, h: 60 }
const right = { x: 300, y: 100, w: 100, h: 60 }
const below = { x: 0, y: 300, w: 100, h: 60 }

/** Every piece of a route runs straight across or straight down. */
const square = (route: Point[]): boolean => route.slice(1).every((p, i) => p.x === route[i]!.x || p.y === route[i]!.y)

describe('a right-angle wire finds its own way', () => {
  it('runs out of the facing sides and turns halfway across', () => {
    expect(squareRoute({ from: left, to: right })).toEqual([
      { x: 100, y: 30 },
      { x: 200, y: 30 },
      { x: 200, y: 130 },
      { x: 300, y: 130 },
    ])
  })

  it('runs down out of the bottom of a card above another', () => {
    const route = squareRoute({ from: left, to: below })
    expect(route).toEqual([
      { x: 50, y: 60 },
      { x: 50, y: 300 },
    ])
  })

  it('leaves a side it is plugged into, where along that side it was put, and turns only at right angles', () => {
    const route = squareRoute({ from: left, to: right, sides: { from: 's', to: 'n' }, along: { from: 0.25 } })
    expect(route[0]).toEqual({ x: 25, y: 60 })
    expect(route.at(-1)).toEqual({ x: 350, y: 100 })
    expect(square(route)).toBe(true)
  })

  it('goes out and round when the side it is plugged into faces away', () => {
    const route = squareRoute({ from: left, to: right, sides: { from: 'w', to: 'w' } })
    expect(route[0]).toEqual({ x: 0, y: 30 })
    expect(route[1]!.x).toBeLessThan(0)
    expect(route.at(-2)!.x).toBeLessThan(300)
    expect(square(route)).toBe(true)
  })

  it('goes through the bends a person gave it, joining them to the cards at right angles', () => {
    const route = squareRoute({ from: left, to: right, bends: [{ x: 156, y: 30 }, { x: 156, y: 240 }, { x: 252, y: 240 }] })
    expect(route.slice(1, 4)).toEqual([
      { x: 156, y: 30 },
      { x: 156, y: 240 },
      { x: 252, y: 240 },
    ])
    expect(route.at(-1)).toEqual({ x: 300, y: 130 })
    expect(square(route)).toBe(true)
  })
})

describe('moving a piece of a right-angle wire', () => {
  const route = squareRoute({ from: left, to: right })

  it('slides a middle piece across, and the pieces either side follow', () => {
    const moved = dragPiece(route, 1, 240)
    expect(moved).toEqual([
      { x: 100, y: 30 },
      { x: 240, y: 30 },
      { x: 240, y: 130 },
      { x: 300, y: 130 },
    ])
  })

  it('adds two bends when the piece leaving a card is moved, so it still leaves the card', () => {
    const moved = dragPiece(route, 0, 84)
    expect(moved[0]).toEqual({ x: 100, y: 30 })
    expect(moved.length).toBe(route.length + 2)
    expect(moved.some((p) => p.y === 84)).toBe(true)
    expect(square(moved)).toBe(true)
  })

  it('adds bends at both ends of a wire that is one straight piece', () => {
    const straight = squareRoute({ from: left, to: below })
    const moved = dragPiece(straight, 0, 120)
    expect(moved[0]).toEqual(straight[0])
    expect(moved.at(-1)).toEqual(straight.at(-1))
    expect(moved.some((p) => p.x === 120)).toBe(true)
    expect(square(moved)).toBe(true)
  })

  it('splits a piece where it is double-clicked, so each half moves on its own', () => {
    const split = addBend(route, 1, { x: 203, y: 80 })
    expect(split).toEqual([
      { x: 100, y: 30 },
      { x: 200, y: 30 },
      { x: 200, y: 80 },
      { x: 200, y: 130 },
      { x: 300, y: 130 },
    ])
    const moved = dragPiece(split, 2, 260)
    expect(square(moved)).toBe(true)
    expect(moved.slice(0, 3)).toEqual([
      { x: 100, y: 30 },
      { x: 200, y: 30 },
      { x: 200, y: 80 },
    ])
  })
})

describe('finding a spot on a right-angle wire', () => {
  const route = squareRoute({ from: left, to: right })

  it('has its middle halfway along it, not halfway between its ends', () => {
    expect(pointAlong(route, 0.5)).toEqual({ x: 200, y: 80 })
  })

  it('finds the nearest spot and piece to a point beside it', () => {
    expect(nearestOn(route, { x: 210, y: 60 })).toEqual({ x: 200, y: 60 })
    expect(pieceOf(route, { x: 210, y: 60 })).toBe(1)
  })
})

describe('a sketch keeps where a right-angle wire turns', () => {
  const card = (id: string, x: number, y: number): SketchCard => ({ ...blankCard(id, id, 'component', 'module'), x, y })
  const level = (): SketchCard => ({
    ...blankCard('sys', 'sys', 'container', 'server'),
    children: [card('a', 0, 0), card('b', 300, 100), card('c', 600, 0)],
    wires: [{ id: 'w', from: 'a', to: 'b', kind: 'uses', words: '' }],
  })

  it('keeps the bends, rounded, and lets them go when told to', () => {
    const bent = bendWire(level(), 'w', [{ x: 156.4, y: 30 }, { x: 156.4, y: 240 }])
    expect(bent.wires[0]!.bends).toEqual([{ x: 156, y: 30 }, { x: 156, y: 240 }])
    expect('bends' in bendWire(bent, 'w', undefined).wires[0]!).toBe(false)
  })

  it('moves the bends with its two cards when both move together, and not when one does', () => {
    const bent = bendWire(level(), 'w', [{ x: 156, y: 30 }])
    const both = moveThings(bent, [{ id: 'a', x: 24, y: 12 }, { id: 'b', x: 324, y: 112 }])
    expect(both.wires[0]!.bends).toEqual([{ x: 180, y: 42 }])
    const one = moveThings(bent, [{ id: 'a', x: 24, y: 12 }])
    expect(one.wires[0]!.bends).toEqual([{ x: 156, y: 30 }])
  })

  it('keeps where along a side an end meets, and forgets the bends once the end reaches another card', () => {
    const bent = bendWire(level(), 'w', [{ x: 156, y: 30 }])
    const along = rewire(bent, 'w', 'to', 'b', 'n', 0.25)
    expect(along.wires[0]).toMatchObject({ to: 'b', sides: { to: 'n' }, along: { to: 0.25 }, bends: [{ x: 156, y: 30 }] })
    const elsewhere = rewire(along, 'w', 'to', 'c', 'w')
    expect(elsewhere.wires[0]).toMatchObject({ to: 'c', sides: { to: 'w' } })
    expect(elsewhere.wires[0]!.bends).toBeUndefined()
    expect(elsewhere.wires[0]!.along).toBeUndefined()
  })
})

describe('taking a piece out of a right-angle wire', () => {
  // Down out of one card, across, down, across, and down into another.
  const route: Point[] = [
    { x: 0, y: 0 },
    { x: 0, y: 48 },
    { x: 96, y: 48 },
    { x: 96, y: 120 },
    { x: 192, y: 120 },
    { x: 192, y: 200 },
  ]

  it('slides the piece after into line with the piece before, taking two turns out', () => {
    expect(takePieceOut(route, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 48 },
      { x: 192, y: 48 },
      { x: 192, y: 200 },
    ])
    expect(takePieceOut(route, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 120 },
      { x: 192, y: 120 },
      { x: 192, y: 200 },
    ])
  })

  it('slides the piece before instead where the piece after reaches a card', () => {
    expect(takePieceOut(route, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 48 },
      { x: 192, y: 48 },
      { x: 192, y: 200 },
    ])
  })

  it('never moves an end, nor turns one back through its card', () => {
    expect(takePieceOut(route, 0)).toBeNull()
    expect(takePieceOut(route, 4)).toBeNull()
    // The only piece between the two that leave the cards.
    expect(takePieceOut([{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 80 }], 1)).toBeNull()
    // Sliding either way would bring the wire into the card from below.
    const hooked: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 200 },
      { x: 96, y: 200 },
      { x: 96, y: 40 },
      { x: 192, y: 40 },
      { x: 192, y: 100 },
    ]
    expect(takePieceOut(hooked, 3)).toBeNull()
  })
})

describe('taking out the one turn between two cards', () => {
  // Out of one card's east side, down, and into another's west side.
  const route: Point[] = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 60 },
    { x: 100, y: 60 },
  ]

  it('slides an end along its card’s side, and the wire runs straight', () => {
    expect(takePieceOut(route, 1, { to: [-20, 120] })).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ])
    expect(takePieceOut(route, 1, { from: [-20, 120] })).toEqual([
      { x: 0, y: 60 },
      { x: 100, y: 60 },
    ])
  })

  it('leaves it where an end would come off its side, or has no room to slide', () => {
    expect(takePieceOut(route, 1, { to: [20, 120] })).toBeNull()
    expect(takePieceOut(route, 1)).toBeNull()
  })
})
