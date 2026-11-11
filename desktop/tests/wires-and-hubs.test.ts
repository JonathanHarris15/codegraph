// codegraph: test ui canvas
import { describe, expect, it } from 'vitest'
import { blankProposal, proposalFrom, type DrawnCard as ReadCard } from '../src/modules/reader/index.js'
import { blankCard, hubOf, type SketchCard } from '../src/modules/sketches/schema.js'
import { annotationsClear, flowOf, layOut, loopSides, openLevels, reachingOpen, roomAround, spread, wirePath, wireThrough, type Box, type DrawnCard, type DrawnWire } from '../src/ui/components/map-layout.js'
import { TEMPLATES, lookOf } from '../src/ui/components/card-looks.js'
import { addWire, choicesAt, copyOf, moveThings, nudge, paste, placeCard, remove, rewire } from '../src/ui/components/sketch-edits.js'

const a: Box = { x: 0, y: 0, w: 200, h: 100 }
const b: Box = { x: 600, y: 0, w: 200, h: 100 }

const part = (id: string, kind: string): DrawnCard => blankCard(id, id, 'component', kind) as unknown as DrawnCard
const link = (from: string, to: string, kind = 'uses'): DrawnWire => ({ from, to, kind, words: '' })

describe('a level with wires lays itself out as a grid', () => {
  const cards = [part('m', 'module'), part('home', 'page'), part('add', 'feature'), part('db', 'module'), part('list', 'page'), part('drop', 'feature')]
  const wires = [link('home', 'add', 'asks'), link('list', 'drop', 'asks'), link('add', 'm'), link('drop', 'm'), link('m', 'db')]

  it('runs left to right along the wires, from pages through features to modules', () => {
    const flow = flowOf(cards, wires)!
    for (const wire of wires) expect(flow.get(wire.to)!.column).toBeGreaterThan(flow.get(wire.from)!.column)
  })

  it('keeps a kind in its column even with no wire saying so', () => {
    const flow = flowOf([part('p', 'page'), part('f', 'feature'), part('lone', 'feature'), part('m', 'module')], [link('p', 'f'), link('f', 'm')])!
    expect(flow.get('lone')!.column).toBe(flow.get('f')!.column)
  })

  it('puts a chain on one straight row', () => {
    const flow = flowOf([part('a', 'page'), part('b', 'feature'), part('c', 'module')], [link('a', 'b'), link('b', 'c')])!
    expect(new Set([...flow.values()].map((spot) => spot.row)).size).toBe(1)
  })

  it('sits a card level with what it is wired to, so two chains do not cross', () => {
    const shuffled = [part('p1', 'page'), part('p2', 'page'), part('f2', 'feature'), part('f1', 'feature')]
    const flow = flowOf(shuffled, [link('p1', 'f1'), link('p2', 'f2')])!
    expect(flow.get('p1')!.row).toBe(flow.get('f1')!.row)
    expect(flow.get('p2')!.row).toBe(flow.get('f2')!.row)
  })

  it('never puts two cards in one spot, and draws no two on top of each other', () => {
    const flow = flowOf(cards, wires)!
    expect(new Set([...flow.values()].map((spot) => `${spot.column}:${spot.row}`)).size).toBe(cards.length)
    const boxes = layOut(cards, wires).map((p) => p.box)
    boxes.forEach((a, i) =>
      boxes.slice(i + 1).forEach((b) => expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true)),
    )
  })

  it('lines cards of a column up, and rows across columns', () => {
    const boxes = layOut(cards, wires).map((p) => p.box)
    expect(new Set(boxes.map((box) => box.x)).size).toBeLessThan(boxes.length)
    expect(new Set(boxes.map((box) => box.y)).size).toBeLessThan(boxes.length)
  })

  it('copes with wires in a loop', () => {
    const flow = flowOf([part('a', 'module'), part('b', 'module')], [link('a', 'b'), link('b', 'a')])!
    expect(flow.get('a')!.column).not.toBe(flow.get('b')!.column)
  })

  it('does not treat one page leading to another as a step', () => {
    expect(flowOf([part('a', 'page'), part('b', 'page')], [link('a', 'b', 'leads to')])).toBeNull()
  })

  it('leaves a card a person put where they put it', () => {
    const pinned = { ...part('home', 'page'), x: 900, y: 900 }
    expect(layOut([pinned, part('add', 'feature')], [link('home', 'add')])[0]!.box).toMatchObject({ x: 900, y: 900 })
  })
})

describe('wires between cards stacked in a column', () => {
  const card = (row: number): Box => ({ x: 0, y: row * 240, w: 260, h: 200 })
  const boxes = new Map<string, Box>([
    ['login', card(0)],
    ['join', card(1)],
    ['home', card(2)],
    ['feature', { x: 600, y: 240, w: 240, h: 104 }],
  ])
  const all = [...boxes.values()]

  it('takes the side away from the column’s other wires', () => {
    const across = link('login', 'feature')
    const across2 = link('home', 'feature')
    const stacked = link('login', 'home', 'leads to')
    expect(loopSides([across, across2, stacked], boxes, all).get(stacked)?.side).toBe('w')
  })

  it('shares several out between the two sides', () => {
    const wires = [link('login', 'home', 'leads to'), link('home', 'login', 'leads to'), link('login', 'home', 'reads'), link('home', 'login', 'reads')]
    const sides = [...loopSides(wires, boxes, all).values()].map((loop) => loop.side)
    expect(sides).toContain('e')
    expect(sides).toContain('w')
  })

  it('leaves two sharing a side at different places on the card', () => {
    const wires = [link('login', 'home', 'leads to'), link('home', 'login', 'leads to'), link('login', 'home', 'reads')]
    const loops = [...loopSides(wires, boxes, all).entries()].filter(([, loop]) => loop.side === 'e')
    expect(new Set(loops.map(([wire, loop]) => (wire.from === 'login' ? loop.from : loop.to))).size).toBe(loops.length)
  })

  it('needs no loop for two next to each other with a clear run between them', () => {
    const near = new Map<string, Box>([['a', card(0)], ['b', card(1)]])
    expect(loopSides([link('a', 'b')], near, [...near.values()]).size).toBe(0)
  })

  it('draws the loop on the side it was given', () => {
    const shape = wirePath(card(0), card(2), { from: 0.5, to: 0.5 }, all, {}, { side: 'w', from: 0.25, to: 0.75 })
    expect(shape.tail).toEqual({ x: 0, y: 50 })
    expect(shape.head).toEqual({ x: 0, y: 630 })
    expect(shape.c1.x).toBeLessThan(0)
  })
})

describe('what is drawn around the card open now', () => {
  const at = (id: string, children: DrawnCard[] = []) => ({ card: { ...part(id, 'module'), children }, box: a })

  it('on the level around it, is whatever is wired to it', () => {
    const wires = [link('in', 'open'), link('open', 'out'), link('in', 'far')]
    const { notDrawn, wires: shown } = reachingOpen([
      { open: at('open'), placed: [at('in'), at('out'), at('far')], wires },
      { open: null, placed: [at('inside')], wires: [] },
    ])
    expect([...notDrawn]).toEqual(['far'])
    expect(shown.has(wires[2]!)).toBe(false)
  })

  const now = part('now', 'feature')
  const web = { ...part('web', 'container'), children: [now, part('notes', 'module')] }
  const levels = (outer: DrawnWire[], inner: DrawnWire[] = []) => [
    { open: { card: web, box: a }, placed: [at('db'), at('cdn')], wires: outer },
    { open: { card: now, box: a }, placed: [], wires: inner },
    { open: null, placed: [], wires: [] },
  ]

  it('further out, leaves out a wire to the outer card that does not come on to it', () => {
    // On a map, web keeps things in db only by way of notes, not this card.
    const toDb = { ...link('web', 'db', 'keeps'), ends: [{ from: 'notes', to: 'db' }] }
    const { notDrawn, wires } = reachingOpen(levels([toDb]))
    expect([...notDrawn]).toEqual(['db', 'cdn'])
    expect(wires.has(toDb)).toBe(false)
  })

  it('further out, keeps a wire whose real end is the card open now', () => {
    const toDb = { ...link('web', 'db', 'keeps'), ends: [{ from: 'now', to: 'db' }, { from: 'notes', to: 'db' }] }
    const { notDrawn, wires } = reachingOpen(levels([toDb]))
    expect([...notDrawn]).toEqual(['cdn'])
    expect(wires.has(toDb)).toBe(true)
  })

  it('counts an end inside the card open now', () => {
    const deep = { ...part('now', 'feature'), children: [part('now/file', 'file')] }
    const wire = { ...link('web', 'db'), ends: [{ from: 'now/file', to: 'db' }] }
    const { wires } = reachingOpen([
      { open: { card: web, box: a }, placed: [at('db')], wires: [wire] },
      { open: { card: deep, box: a }, placed: [], wires: [] },
      { open: null, placed: [], wires: [] },
    ])
    expect(wires.has(wire)).toBe(true)
  })

  it('on a drawing, keeps an outer wire only if a wire inside comes on from its hub', () => {
    const outer: DrawnWire = { ...link('db', 'web'), id: 'w' }
    const other: DrawnWire = { ...link('cdn', 'web'), id: 'x' }
    const inner: DrawnWire = { ...link(hubOf('w'), 'now'), id: 'i' }
    const { notDrawn, wires } = reachingOpen(levels([outer, other], [inner]))
    expect(wires.has(outer)).toBe(true)
    expect(wires.has(other)).toBe(false)
    expect([...notDrawn]).toEqual(['cdn'])
  })

  it('draws everything when nothing is open', () => {
    expect([...reachingOpen([{ open: null, placed: [at('a')], wires: [] }]).notDrawn]).toEqual([])
  })
})

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

describe('a wire plugged into a side of a card', () => {
  it('arrives on the side it was plugged into, not the side facing', () => {
    const shape = wirePath(a, b, { from: 0.5, to: 0.5 }, [], {}, undefined, { to: 'n' })
    expect(shape.head).toEqual({ x: 700, y: 0 })
    expect(shape.c2.y).toBeLessThan(0)
  })

  it('leaves from the side it was drawn from', () => {
    const shape = wirePath(a, b, { from: 0.5, to: 0.5 }, [], {}, undefined, { from: 's' })
    expect(shape.tail).toEqual({ x: 100, y: 100 })
    expect(shape.c1.y).toBeGreaterThan(100)
  })

  it('takes the side facing the plugged end at the end left loose', () => {
    const shape = wirePath(a, b, { from: 0.5, to: 0.5 }, [], {}, undefined, { to: 'w' })
    expect(shape.tail).toEqual({ x: 200, y: 50 })
    expect(shape.head).toEqual({ x: 600, y: 50 })
  })

  it('keeps the sides it was drawn with', () => {
    const root = { ...blankCard('root', 'Root', 'system'), children: [blankCard('x', 'X', 'container'), blankCard('y', 'Y', 'container')] }
    const [wired, id] = addWire(root, 'x', 'y', undefined, { from: 'e', to: 'n' })
    expect(wired.wires.find((w) => w.id === id)!.sides).toEqual({ from: 'e', to: 'n' })
  })

  it('moves to another side when drawn again', () => {
    const root = { ...blankCard('root', 'Root', 'system'), children: [blankCard('x', 'X', 'container'), blankCard('y', 'Y', 'container')] }
    const [once, id] = addWire(root, 'x', 'y', undefined, { to: 'n' })
    const [twice, again] = addWire(once, 'x', 'y', undefined, { to: 'w' })
    expect(again).toBe(id)
    expect(twice.wires).toHaveLength(1)
    expect(twice.wires[0]!.sides).toEqual({ to: 'w' })
  })

  it('takes the side it is let go on when one end moves, and lets go of the old one', () => {
    const root = { ...blankCard('root', 'Root', 'system'), children: ['x', 'y', 'z'].map((id) => blankCard(id, id, 'container')) }
    const [wired, id] = addWire(root, 'x', 'y', undefined, { from: 'e', to: 'n' })
    expect(rewire(wired, id, 'to', 'z', 's').wires[0]!.sides).toEqual({ from: 'e', to: 's' })
    expect(rewire(wired, id, 'to', 'z').wires[0]!.sides).toEqual({ from: 'e' })
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

describe("a wire's sentence and its line", () => {
  const curve = { tail: { x: 0, y: 0 }, c1: { x: 200, y: 0 }, c2: { x: 400, y: 200 }, head: { x: 600, y: 200 } }
  const on = (t: number): { x: number; y: number } => {
    const u = 1 - t
    const mix = (axis: 'x' | 'y'): number =>
      u * u * u * curve.tail[axis] + 3 * u * u * t * curve.c1[axis] + 3 * u * t * t * curve.c2[axis] + t * t * t * curve.head[axis]
    return { x: mix('x'), y: mix('y') }
  }
  const distanceToCurve = (at: { x: number; y: number }): number =>
    Math.min(...Array.from({ length: 201 }, (_, i) => on(i / 200)).map((point) => Math.hypot(point.x - at.x, point.y - at.y)))

  it('slides along the curve itself to get clear, so the line need not bend', () => {
    const middle = on(0.5)
    const [at] = spread([{ ...curve, at: middle, w: 80, h: 24 }], [{ x: middle.x - 60, y: middle.y - 60, w: 120, h: 120 }])
    expect(at).not.toEqual(middle)
    expect(distanceToCurve(at!)).toBeLessThan(0.5)
  })

  it('stays on the curve when nowhere on it is clear', () => {
    const [at] = spread([{ ...curve, at: on(0.5), w: 80, h: 24 }], [{ x: -50, y: -50, w: 700, h: 300 }])
    expect(at).toEqual(on(0.5))
  })

  it('stays where a person put it', () => {
    const [at] = spread([{ ...curve, at: { x: 40, y: 400 }, w: 80, h: 24, fixed: true }])
    expect(at).toEqual({ x: 40, y: 400 })
  })

  describe('on a sketch', () => {
    const level = (): SketchCard => {
      const focus = blankCard('top', 'top', 'component', 'module')
      const one = { ...blankCard('one', 'one', 'component', 'module'), x: 0, y: 0 }
      const two = { ...blankCard('two', 'two', 'component', 'module'), x: 500, y: 0 }
      return { ...focus, children: [one, two], wires: [{ id: 'w', from: 'one', to: 'two', kind: 'uses', words: '', x: 250, y: 300 }] }
    }
    const put = (focus: SketchCard): { x?: number; y?: number } => {
      const { x, y } = focus.wires[0]!
      return { x, y }
    }

    it('lets go of a moved sentence when a card its wire joins moves', () => {
      expect(put(moveThings(level(), [{ id: 'one', x: 40, y: 40 }]))).toEqual({ x: undefined, y: undefined })
    })

    it('lets go of it when a card is nudged with the arrow keys, too', () => {
      expect(put(nudge(level(), ['two'], 10, 0))).toEqual({ x: undefined, y: undefined })
    })

    it('keeps it when the sentence itself is what moved', () => {
      expect(put(moveThings(level(), [{ id: 'w', x: 10, y: 20 }]))).toEqual({ x: 10, y: 20 })
    })

    it('keeps it when some other card moves', () => {
      const more = level()
      more.children.push({ ...blankCard('three', 'three', 'component', 'module'), x: 900, y: 0 })
      expect(put(moveThings(more, [{ id: 'three', x: 950, y: 0 }]))).toEqual({ x: 250, y: 300 })
    })
  })
})
