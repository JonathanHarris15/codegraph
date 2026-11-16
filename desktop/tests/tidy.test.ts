// codegraph: test module sketch-steps
import { describe, expect, it } from 'vitest'
import { applyStep, type Step } from '../src/modules/sketch-steps/index.js'
import { type Sketch, type SketchCard } from '../src/modules/sketches/index.js'
import { sizeOf, type Box, type DrawnCard } from '../src/ui/components/map-layout.js'
import { squareRoute, type Point } from '../src/ui/components/square-wires.js'
import { blank, messy, run } from './wardrobe-mess.js'

/** Tidying a level: laid out as a diagram tool would, every wire at right
 *  angles, drawn by the canvas's own router at the cards' real sizes. */

const level = (sketch: Sketch, id: string): SketchCard => {
  const find = (card: SketchCard): SketchCard | undefined => (card.id === id ? card : card.children.map(find).find(Boolean))
  return find(sketch.root)!
}

/** Each card's box at the size the canvas really draws it. */
const boxesOf = (inside: SketchCard): Map<string, Box> =>
  new Map(inside.children.map((card) => [card.id, { x: card.x!, y: card.y!, ...sizeOf(card as unknown as DrawnCard) }]))

/** Each wire as the canvas routes it, from its sides, ends and bends. */
const routesOf = (inside: SketchCard): Map<string, Point[]> => {
  const boxes = boxesOf(inside)
  return new Map(
    inside.wires.map((wire) => [
      wire.id,
      squareRoute({ from: boxes.get(wire.from)!, to: boxes.get(wire.to)!, sides: wire.sides, along: wire.along, bends: wire.bends }),
    ]),
  )
}

type Piece = { a: Point; b: Point }
const piecesOf = (route: Point[]): Piece[] => route.slice(1).map((b, i) => ({ a: route[i]!, b }))
const flat = (p: Piece): boolean => Math.abs(p.a.y - p.b.y) < 0.5
const upright = (p: Piece): boolean => Math.abs(p.a.x - p.b.x) < 0.5

/** Whether a straight piece runs through the inside of a box, not just along
 *  or up to its edge. */
const through = (p: Piece, box: Box): boolean => {
  const x0 = Math.min(p.a.x, p.b.x)
  const x1 = Math.max(p.a.x, p.b.x)
  const y0 = Math.min(p.a.y, p.b.y)
  const y1 = Math.max(p.a.y, p.b.y)
  return x1 > box.x + 1 && x0 < box.x + box.w - 1 && y1 > box.y + 1 && y0 < box.y + box.h - 1
}

/** Two pieces of different wires lying on one another for more than a hair. */
const onTop = (p: Piece, q: Piece): boolean => {
  if (flat(p) && flat(q) && Math.abs(p.a.y - q.a.y) < 1) {
    const lo = Math.max(Math.min(p.a.x, p.b.x), Math.min(q.a.x, q.b.x))
    const hi = Math.min(Math.max(p.a.x, p.b.x), Math.max(q.a.x, q.b.x))
    return hi - lo > 2
  }
  if (upright(p) && upright(q) && Math.abs(p.a.x - q.a.x) < 1) {
    const lo = Math.max(Math.min(p.a.y, p.b.y), Math.min(q.a.y, q.b.y))
    const hi = Math.min(Math.max(p.a.y, p.b.y), Math.max(q.a.y, q.b.y))
    return hi - lo > 2
  }
  return false
}

const crossing = (p: Piece, q: Piece): boolean => {
  const [h, v] = flat(p) && upright(q) ? [p, q] : flat(q) && upright(p) ? [q, p] : [null, null]
  if (!h || !v) return false
  const x = v.a.x
  const y = h.a.y
  return x > Math.min(h.a.x, h.b.x) + 0.5 && x < Math.max(h.a.x, h.b.x) - 0.5 && y > Math.min(v.a.y, v.b.y) + 0.5 && y < Math.max(v.a.y, v.b.y) - 0.5
}

const crossingsOf = (routes: Map<string, Point[]>): number => {
  const all = [...routes.values()].map(piecesOf)
  let count = 0
  for (let i = 0; i < all.length; i += 1)
    for (let j = i + 1; j < all.length; j += 1) for (const p of all[i]!) for (const q of all[j]!) if (crossing(p, q)) count += 1
  return count
}

describe('tidying a level', () => {
  for (const direction of ['down', 'right'] as const) {
    describe(`reading ${direction}`, () => {
      const tidied = run(messy(), [{ do: 'tidy', in: 'server', direction }])
      const server = level(tidied, 'server')
      const boxes = boxesOf(server)
      const routes = routesOf(server)

      it('puts every card somewhere of its own, clear of the others', () => {
        const all = [...boxes.entries()]
        for (let i = 0; i < all.length; i += 1)
          for (let j = i + 1; j < all.length; j += 1) {
            const [, a] = all[i]!
            const [, b] = all[j]!
            const apart = a.x + a.w + 20 <= b.x || b.x + b.w + 20 <= a.x || a.y + a.h + 20 <= b.y || b.y + b.h + 20 <= a.y
            expect(apart, `${all[i]![0]} and ${all[j]![0]}`).toBe(true)
          }
      })

      it('draws every wire at right angles, out of a side and into the next rank', () => {
        for (const wire of server.wires) {
          expect(wire.shape).toBe('square')
          expect(wire.bends?.length).toBeGreaterThan(0)
          for (const piece of piecesOf(routes.get(wire.id)!)) expect(flat(piece) || upright(piece), `${wire.from} -> ${wire.to}`).toBe(true)
        }
        // Firestore and the cards in the frame wire to each other both ways:
        // either may come first.
        const loop = new Set(['firestore', 'usage', 'dupes', 'rules'])
        const forward = server.wires.filter((w) => !(loop.has(w.from) && loop.has(w.to)))
        for (const wire of forward) {
          const a = boxes.get(wire.from)!
          const b = boxes.get(wire.to)!
          if (direction === 'down') expect(a.y + a.h, `${wire.from} above ${wire.to}`).toBeLessThan(b.y)
          else expect(a.x + a.w, `${wire.from} left of ${wire.to}`).toBeLessThan(b.x)
        }
      })

      it('runs no wire through a card', () => {
        for (const wire of server.wires)
          for (const piece of piecesOf(routes.get(wire.id)!))
            for (const [id, box] of boxes) expect(through(piece, box), `${wire.from} -> ${wire.to} through ${id}`).toBe(false)
      })

      it('lays no wire on top of another', () => {
        const all = server.wires.map((w) => ({ w, pieces: piecesOf(routes.get(w.id)!) }))
        for (let i = 0; i < all.length; i += 1)
          for (let j = i + 1; j < all.length; j += 1)
            for (const p of all[i]!.pieces)
              for (const q of all[j]!.pieces)
                expect(onTop(p, q), `${all[i]!.w.from}->${all[i]!.w.to} on ${all[j]!.w.from}->${all[j]!.w.to}`).toBe(false)
      })

      it('crosses far fewer wires than it was given', () => {
        // The mess, drawn at right angles where the agent put each card.
        const before = level(messy(), 'server')
        const squared = { ...before, wires: before.wires.map((w) => ({ ...w, shape: 'square' as const })) }
        expect(crossingsOf(routes)).toBeLessThan(crossingsOf(routesOf(squared)) / 2)
      })

      it('keeps a frame round its own cards and nothing else', () => {
        // As the canvas fits a frame: round its cards, with air and its name above.
        const held = ['usage', 'dupes', 'rules'].map((id) => boxes.get(id)!)
        const x = Math.min(...held.map((b) => b.x)) - 36
        const y = Math.min(...held.map((b) => b.y)) - 36 - 28
        const frame = { x, y, w: Math.max(...held.map((b) => b.x + b.w)) + 36 - x, h: Math.max(...held.map((b) => b.y + b.h)) + 36 - y }
        for (const [id, box] of boxes) {
          if (['usage', 'dupes', 'rules'].includes(id)) continue
          expect(through({ a: { x: box.x, y: box.y }, b: { x: box.x + box.w, y: box.y + box.h } }, frame), `${id} in the frame`).toBe(false)
        }
      })

      it('keeps notes beside the card they were nearest, clear of every card', () => {
        const items = (tidied.layers ?? []).flatMap((l) => l.items).filter((a) => a.at === 'server' && !a.around)
        expect(items).toHaveLength(2)
        for (const note of items) {
          expect(note.near).toBeTruthy()
          for (const [id, box] of boxes)
            expect(through({ a: { x: note.x, y: note.y }, b: { x: note.x + note.w, y: note.y + note.h } }, box), `note on ${id}`).toBe(false)
        }
        expect(items.find((a) => a.text.startsWith('Every call'))!.near!.card).toBe('api')
      })
    })
  }

  it('lays out a tree with no crossings at all', () => {
    const tree = run(blank(), [
      { do: 'card', name: 'Root', kind: 'software system', id: 'r' },
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id): Step => ({ do: 'card', name: id.toUpperCase(), kind: 'software system', id })),
      { do: 'wire', from: 'r', to: 'a' },
      { do: 'wire', from: 'r', to: 'b' },
      { do: 'wire', from: 'r', to: 'c' },
      { do: 'wire', from: 'a', to: 'd' },
      { do: 'wire', from: 'a', to: 'e' },
      { do: 'wire', from: 'c', to: 'f' },
      { do: 'wire', from: 'c', to: 'g' },
      { do: 'tidy' },
    ])
    expect(crossingsOf(routesOf(tree.root))).toBe(0)
  })

  it('can leave every wire its own shape', () => {
    const kept = run(messy(), [
      { do: 'change', what: 'api -> signin', shape: 'curved' },
      { do: 'tidy', in: 'server', wires: 'keep' },
    ])
    const wires = level(kept, 'server').wires
    expect(wires.find((w) => w.to === 'signin')!.shape).toBe('curved')
    expect(wires.find((w) => w.to === 'outfits')!.shape).toBeUndefined()
  })

  it('grows an open card round what it holds', () => {
    const roomy = run(messy(), [{ do: 'tidy', in: 'server' }])
    const opened: Sketch = { ...roomy, root: { ...roomy.root } }
    const server = level(opened, 'server')
    server.room = { x: 0, y: 0, w: 100, h: 100 }
    const again = level(run(opened, [{ do: 'tidy', in: 'server' }]), 'server')
    const around = [...boxesOf(again).values()]
    for (const box of around) {
      expect(box.x).toBeGreaterThanOrEqual(again.room!.x)
      expect(box.y + box.h).toBeLessThanOrEqual(again.room!.y + again.room!.h)
    }
  })
})

describe('changing a wire', () => {
  it('turns it square, plugs its ends into sides and gives it bends', () => {
    const changed = run(messy(), [{ do: 'change', what: 'api -> closet', shape: 'square', sides: { from: 'e', to: 'n' }, bends: [{ x: 800.4, y: 100 }] }])
    const wire = level(changed, 'server').wires.find((w) => w.to === 'closet')!
    expect(wire).toMatchObject({ shape: 'square', sides: { from: 'e', to: 'n' }, bends: [{ x: 800, y: 100 }] })
  })

  it('lets it find its own way again with no bends', () => {
    const changed = run(messy(), [
      { do: 'change', what: 'api -> closet', bends: [{ x: 1, y: 1 }] },
      { do: 'change', what: 'api -> closet', bends: [] },
    ])
    expect(level(changed, 'server').wires.find((w) => w.to === 'closet')!.bends).toBeUndefined()
  })

  it('turns down a shape or side it does not know', () => {
    expect(applyStep(messy(), { do: 'change', what: 'api -> closet', shape: 'wavy' as 'square' })).toMatchObject({ ok: false })
    expect(applyStep(messy(), { do: 'change', what: 'api -> closet', sides: { from: 'up' as 'n' } })).toMatchObject({ ok: false })
  })

  it('draws a new wire square when asked', () => {
    const drawn = run(messy(), [{ do: 'wire', from: 'tagger', to: 'storage', shape: 'square' }])
    expect(level(drawn, 'server').wires.find((w) => w.from === 'tagger' && w.to === 'storage')!.shape).toBe('square')
  })
})
