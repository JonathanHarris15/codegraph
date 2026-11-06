// codegraph: test ui canvas
import { describe, expect, it } from 'vitest'
import { blankProposal, proposalFrom, type DrawnCard as ReadCard } from '../src/modules/reader/index.js'
import { blankCard, hubOf, type SketchCard } from '../src/modules/sketches/schema.js'
import { annotationsClear, openLevels, roomAround, wirePath, wireThrough, type Box, type DrawnCard } from '../src/ui/components/map-layout.js'
import { TEMPLATES, lookOf } from '../src/ui/components/card-looks.js'
import { addWire, choicesAt, copyOf, paste, placeCard, remove, rewire } from '../src/ui/components/sketch-edits.js'

const a: Box = { x: 0, y: 0, w: 200, h: 100 }
const b: Box = { x: 600, y: 0, w: 200, h: 100 }

describe('a wire runs through its sentence', () => {
  it('stays the plain curve when the sentence is at its middle', () => {
    const shape = wirePath(a, b)
    expect(wireThrough(shape, shape.at)).toBe(shape.d)
  })

  it('bends to pass through a sentence that has moved', () => {
    const shape = wirePath(a, b)
    const d = wireThrough(shape, { x: 400, y: 300 })
    expect(d.startsWith(`M ${shape.tail.x} ${shape.tail.y} `)).toBe(true)
    expect(d).toContain(', 400 300 C ')
    expect(d.endsWith(`${shape.head.x} ${shape.head.y}`)).toBe(true)
  })

  it('lands on the edge a card that is not a box really has', () => {
    const shape = wirePath(a, b, { from: 0.5, to: 0.5 }, [], { to: (at) => ({ x: at.x + 40, y: at.y }) })
    expect(shape.head.x).toBe(640)
    expect(shape.d.endsWith('640 50')).toBe(true)
  })
})

describe('annotations keep clear of a card opening', () => {
  const closed: Box = { x: 0, y: 0, w: 280, h: 150 }
  const big: Box = { x: -300, y: -200, w: 880, h: 550 }
  const placed = [{ card: { id: 'open' } as DrawnCard, box: closed }]

  it('pushes one the card would cover, and leaves one far off alone', () => {
    const covered = { id: 'on', box: { x: 40, y: 40, w: 100, h: 60 } }
    const far = { id: 'far', box: { x: 3000, y: 0, w: 100, h: 60 } }
    const out = annotationsClear([covered, far], placed, { id: 'open', closed, box: big }, () => big)
    const moved = out.get('on')!
    expect(moved.x + moved.w <= big.x || moved.x >= big.x + big.w || moved.y + moved.h <= big.y || moved.y >= big.y + big.h).toBe(true)
    expect(out.get('far')).toEqual(far.box)
  })

  it('grows a frame round the card rather than shoving it away', () => {
    const frame = { id: 'frame', box: { x: -20, y: -20, w: 320, h: 190 }, around: true }
    const out = annotationsClear([frame], placed, { id: 'open', closed, box: big }, () => big)
    expect(out.get('frame')).toEqual({ x: big.x - 20, y: big.y - 20, w: big.w + 40, h: big.h + 40 })
  })

  it('leaves one kept beside another card to follow that card', () => {
    const others = [...placed, { card: { id: 'other' } as DrawnCard, box: { x: 900, y: 0, w: 100, h: 60 } }]
    const kept = { id: 'kept', box: a, near: { card: 'other', dx: 0, dy: 80 } }
    expect(annotationsClear([kept], others, { id: 'open', closed, box: big }, () => big).has('kept')).toBe(false)
  })

  it('puts them back when nothing is open', () => {
    const covered = { id: 'on', box: { x: 40, y: 40, w: 100, h: 60 } }
    expect(annotationsClear([covered], placed, null, () => closed).get('on')).toEqual(covered.box)
  })

  it('shows them pushed on the level the card opens on, and home once it closes', () => {
    const inner: DrawnCard = { ...blankCard('c', 'c', 'container'), x: 0, y: 0 } as unknown as DrawnCard
    const root: DrawnCard = { ...blankCard('r', 'r', 'system'), children: [inner] } as unknown as DrawnCard
    const annos = [{ id: 'on', box: { x: 40, y: 40, w: 100, h: 60 } }]
    const levels = openLevels({
      levels: [
        { card: root, children: root.children, wires: [], notes: [], annos },
        { card: inner, children: [], wires: [], notes: [] },
      ],
      anchors: new Map(),
      roomOf: (_, inside) => roomAround(inside, { w: 900, h: 600 }),
    })
    expect(levels[0]!.annoBoxes.get('on')).not.toEqual(annos[0]!.box)
    const closedLevels = openLevels({
      levels: [{ card: root, children: root.children, wires: [], notes: [], annos }],
      anchors: new Map(),
      roomOf: (_, inside) => roomAround(inside, { w: 900, h: 600 }),
    })
    expect(closedLevels[0]!.annoBoxes.get('on')).toEqual(annos[0]!.box)
  })
})

describe('the old kinds are templates of the one card', () => {
  const names = (level: 'container' | 'component'): string[] =>
    choicesAt(level).flatMap((group) => group.choices.map((choice) => choice.kind))

  it('offers them beside the blank card and what does more than look', () => {
    expect(names('container')).toEqual(expect.arrayContaining(['card', 'database', 'web app', 'server', 'files on disk']))
    expect(names('component')).toEqual(expect.arrayContaining(['card', 'page', 'feature', 'module', 'trigger']))
  })

  it('makes a card of one with the template’s look, for a person to change', () => {
    const server = choicesAt('container').flatMap((group) => group.choices).find((choice) => choice.kind === 'server')!
    expect(server.look).toEqual(TEMPLATES.server)
    const [next, id] = placeCard(blankCard('s', 's', 'system'), { x: 0, y: 0 }, server.kind, '', undefined, server.look)
    expect(next.children.find((c) => c.id === id)?.look).toEqual(TEMPLATES.server)
  })

  it('keeps a database and a page out of the templates', () => {
    expect(TEMPLATES.database).toBeUndefined()
    expect(TEMPLATES.page).toBeUndefined()
  })

  it('draws a card made before templates the way its template looks', () => {
    expect(lookOf({ kind: 'server' })).toEqual(TEMPLATES.server)
    const own = { icon: 'mail', shape: 'diamond' as const, color: 'red' }
    expect(lookOf({ kind: 'server', look: own })).toEqual(own)
  })
})

describe('making a proposal from what a person drew', () => {
  const drawing = (): ReadCard => {
    const server: SketchCard = {
      ...blankCard('c', 'server', 'container', 'card'),
      children: [{ ...blankCard('k', 'jobs', 'component', 'queue'), says: 'Holds the work' }, blankCard('m', 'plain', 'component', 'card'), blankCard('p', 'home', 'component', 'page')],
      wires: [{ id: 'in', from: hubOf('w'), to: 'k', kind: 'calls', words: 'hands over work' }],
    }
    return {
      ...blankCard('s', 'notes', 'system', 'software system'),
      children: [blankCard('x', 'browser', 'container', 'card'), server],
      wires: [{ id: 'w', from: 'x', to: 'c', kind: 'calls', words: 'asks' }],
    } as unknown as ReadCard
  }
  const made = () =>
    proposalFrom(drawing(), { ...blankProposal(), mockups: {}, containers: [], components: [], wires: [], outside: [], stores: [] } as never, { absentIsGone: false })

  it('carries a person’s own type through to be tagged, as a first guess of module', () => {
    const jobs = made().components.find((c) => c.name === 'jobs')!
    expect(jobs).toMatchObject({ kind: 'module', type: 'queue', says: 'Holds the work' })
  })

  it('says nothing of a card left blank, and keeps a page a page', () => {
    const { components } = made()
    expect(components.find((c) => c.name === 'plain')).toMatchObject({ kind: 'module', says: '' })
    expect(components.find((c) => c.name === 'plain')?.type).toBeUndefined()
    expect(components.find((c) => c.name === 'home')?.kind).toBe('page')
  })

  it('turns a wire to a hub into a wire to the far end of the outer wire', () => {
    const wires = made().wires
    expect(wires).toContainEqual({ from: 'browser', to: 'server/module jobs', kind: 'calls', words: 'hands over work' })
  })
})

describe('hubs on a card’s border', () => {
  const start = (): { root: SketchCard; wire: string } => {
    const root = blankCard('root', '', 'system')
    const inside: SketchCard = { ...blankCard('c', 'Server', 'container'), children: [blankCard('k1', 'One', 'component'), blankCard('k2', 'Two', 'component')] }
    const [wired, wire] = addWire({ ...root, children: [blankCard('x', 'Browser', 'container'), inside] }, 'x', 'c')
    return { root: wired, wire }
  }
  const server = (root: SketchCard): SketchCard => root.children.find((c) => c.id === 'c')!
  const withHubWires = (root: SketchCard, wire: string): SketchCard => {
    const [one] = addWire(server(root), hubOf(wire), 'k1', 'calls')
    const [two] = addWire(one, hubOf(wire), 'k2', 'calls')
    return { ...root, children: root.children.map((c) => (c.id === 'c' ? two : c)) }
  }

  it('lets several parts inside link to one hub, with the kind of the wire', () => {
    const { root, wire } = start()
    const wires = server(withHubWires(root, wire)).wires
    expect(wires.map((w) => [w.from, w.to, w.kind])).toEqual([
      [hubOf(wire), 'k1', 'calls'],
      [hubOf(wire), 'k2', 'calls'],
    ])
  })

  it('wires a new card to a hub the way the hub’s own wire runs', () => {
    const { root, wire } = start()
    const [into] = placeCard(server(root), { x: 0, y: 0 }, 'card', hubOf(wire), { into: true, kind: 'calls' })
    expect(into.wires[0]!.from).toBe(hubOf(wire))
    const [out, id] = placeCard(server(root), { x: 0, y: 0 }, 'card', hubOf(wire), { into: false, kind: 'calls' })
    expect(out.wires[0]!.from).toBe(id)
    expect(out.wires[0]!.to).toBe(hubOf(wire))
  })

  it('takes what hangs off a hub when its wire goes', () => {
    const { root, wire } = start()
    expect(server(remove(withHubWires(root, wire), [wire])).wires).toEqual([])
  })

  it('takes it when the card at the far end goes, and the wire with it', () => {
    const { root, wire } = start()
    expect(server(remove(withHubWires(root, wire), ['x'])).wires).toEqual([])
  })

  it('takes it when the wire lets go of the card', () => {
    const { root, wire } = start()
    const next = rewire({ ...withHubWires(root, wire), children: [...withHubWires(root, wire).children, blankCard('y', 'Other', 'container')] }, wire, 'to', 'y')
    expect(next.wires[0]!.to).toBe('y')
    expect(server(next).wires).toEqual([])
  })

  it('keeps them when the far end of the wire moves', () => {
    const { root, wire } = start()
    const next = rewire({ ...withHubWires(root, wire), children: [...withHubWires(root, wire).children, blankCard('y', 'Other', 'container')] }, wire, 'from', 'y')
    expect(server(next).wires).toHaveLength(2)
  })

  it('carries a hub over to the copy of a wire copied with both its cards', () => {
    const { root, wire } = start()
    const full = withHubWires(root, wire)
    const [next, ids] = paste(full, copyOf(full, ['x', 'c']))
    const copied = next.wires.find((w) => w.id !== wire)!
    const inside = next.children.find((c) => ids.includes(c.id) && c.name === 'Server')!
    expect(inside.wires.every((w) => w.from === hubOf(copied.id))).toBe(true)
    expect(inside.wires).toHaveLength(2)
  })

  it('drops what hung off a hub when the wire was not copied', () => {
    const { root, wire } = start()
    const full = withHubWires(root, wire)
    const [next, ids] = paste(full, copyOf(full, ['c']))
    expect(next.children.find((c) => ids.includes(c.id))!.wires).toEqual([])
  })
})
