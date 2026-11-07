// codegraph: component map-canvas
import type { Card } from '../../features/show-map.js'
import { hubOf, type CardLook } from '../../modules/sketches/schema.js'
import { CARD_SHAPES, drawnShape } from './card-looks.js'

/** A wire as the canvas draws it, from the map or from a sketch. */
export type DrawnWire = {
  id?: string
  from: string
  to: string
  kind: string
  words: string
  /** Where the wire really starts and ends, when it is drawn a level up. */
  ends?: { from: string; to: string }[]
  /** How it stands against a proposal: drawn new, built, or crossed out. */
  state?: string
  /** Where a person put its sentence, by its middle, in the level's own
   *  space. Left out, the level lays the sentence out itself. */
  x?: number
  y?: number
}

/** A note a person left on a level of a sketch. */
export type DrawnNote = { id: string; text: string; x: number; y: number }

/** A card as the canvas draws it: a card of the map, or of a sketch, which
 *  may also say where a person put it and carry notes. */
export type DrawnCard = Omit<Card, 'children' | 'wires'> & {
  /** How a card of a person's own type looks. */
  look?: CardLook
  x?: number
  y?: number
  /** How much room it has when open, in the space its insides are laid out
   *  in. Left out, it gets most of the screen when it is opened. */
  room?: Box
  children: DrawnCard[]
  wires: DrawnWire[]
  notes?: DrawnNote[]
}

export type Box = { x: number; y: number; w: number; h: number }
export type Placed = { card: DrawnCard; box: Box }

const GAP_X = 120

/** The widest a wire's sentence runs before it wraps onto a second line. */
export const SENTENCE_MAX = 260

/** How wide a wire's sentence runs, near enough, before it is drawn and can be
 *  measured: two names, the verb, the words, and a little air either side. */
export const sentenceWidth = (wire: { kind: string; words: string }): number =>
  Math.min(Math.round((24 + wire.kind.length + (wire.words ? wire.words.length + 4 : 0)) * 6.3 + 20), SENTENCE_MAX)

/** The room a wire needs between two cards side by side: its sentence, and
 *  air either side of it. */
export const wordsWidth = (wire: { kind: string; words: string }): number => sentenceWidth(wire) + 56

/** The gap between cards side by side: wide enough for the longest sentence on
 *  any wire between them, so the words never press against a card. */
const gapFor = (wires: DrawnWire[]): number => Math.min(Math.max(GAP_X, ...wires.map(wordsWidth)), 360)
const GAP_Y = 36

/** The air between an open card's border and the level drawn inside it. */
export const OPEN_PAD = 32

/** The air an open card keeps around it when it pushes a card aside. */
const OPEN_AIR = 72

/** The most air a card wired to an open card keeps, for the wire's words. */
const WIRED_AIR = 180

/** The air a pushed card keeps from the next card it pushes on. */
const PUSHED_AIR = 24

/** The size of a note on the canvas. */
const NOTE_SIZE = { w: 180, h: 60 }

/** Pages are drawn as frames for their screenshot, the rest as cards. */
export const isFrame = (card: DrawnCard): boolean => card.level === 'component' && (card.role ?? card.kind) === 'page'

export const sizeOf = (card: DrawnCard): { w: number; h: number } => {
  const shape = drawnShape(card)
  if (shape) return { w: CARD_SHAPES[shape].w, h: CARD_SHAPES[shape].h }
  return isFrame(card)
    ? { w: 260, h: 200 }
    : card.level === 'code'
      ? { w: 240, h: 104 + Math.min(card.names.length, 9) * 18 }
      : card.level === 'system' || card.level === 'container'
        ? { w: 280, h: 150 }
        : { w: 240, h: card.says ? 124 : 104 }
}

/** Which column a card sits in, left to right, so most wires run one way:
 *  what starts things (pages and triggers), then what they ask for, then
 *  what does the work, then where things are kept. */
const columnOf = (card: DrawnCard): number => {
  if (card.level === 'component') {
    const role = card.role ?? card.kind
    return role === 'feature' ? 1 : role === 'module' ? 2 : 0
  }
  if (card.level === 'container') return /database|files/.test(card.kind) ? 1 : 0
  if (card.level === 'system') return card.kind === 'shallow software system' ? 1 : 0
  return 0
}

/** The air between one row of a wired level and the next, for the wires'
 *  sentences to sit in. */
const ROW_GAP = 56

/** Where each card goes on a level with wires: a column for how far along the
 *  flow it is, and a row, so the level reads as a grid from left to right. A
 *  card is always in a column right of what reaches it, but never left of where
 *  its kind belongs. Within a column, cards sit level with what they are wired
 *  to, so wires run as straight as they can and cross as little as they can.
 *  Left out if nothing here is wired. */
export const flowOf = (cards: DrawnCard[], wires: DrawnWire[]): Map<string, { column: number; row: number }> | null => {
  const ids = new Set(cards.map((card) => card.id))
  // One page leading to another is getting around, not a step along the flow.
  const seen = new Set<string>()
  const wanted = wires.filter((wire) => {
    const key = `${wire.from}>${wire.to}`
    if (seen.has(key) || wire.from === wire.to || wire.kind === 'leads to' || !ids.has(wire.from) || !ids.has(wire.to)) return false
    seen.add(key)
    return true
  })
  if (wanted.length === 0) return null

  // A wire that loops back to where it came from says nothing about the order.
  const outOf = new Map<string, string[]>()
  for (const wire of wanted) outOf.set(wire.from, [...(outOf.get(wire.from) ?? []), wire.to])
  const edges: { from: string; to: string }[] = []
  const walking = new Set<string>()
  const walked = new Set<string>()
  const walk = (id: string): void => {
    walking.add(id)
    for (const to of outOf.get(id) ?? []) {
      if (walking.has(to)) continue
      edges.push({ from: id, to })
      if (!walked.has(to)) walk(to)
    }
    walking.delete(id)
    walked.add(id)
  }
  for (const card of cards) if (!walked.has(card.id)) walk(card.id)

  const rank = new Map(cards.map((card) => [card.id, columnOf(card)]))
  for (let pass = 0, moved = true; moved && pass <= cards.length; pass += 1) {
    moved = false
    for (const { from, to } of edges)
      if (rank.get(to)! <= rank.get(from)!) {
        rank.set(to, rank.get(from)! + 1)
        moved = true
      }
  }
  const steps = [...new Set(rank.values())].sort((a, b) => a - b)
  const columns: string[][] = steps.map((step) => cards.filter((card) => rank.get(card.id) === step).map((card) => card.id))

  const neighbours = new Map<string, string[]>()
  for (const { from, to } of edges) {
    neighbours.set(from, [...(neighbours.get(from) ?? []), to])
    neighbours.set(to, [...(neighbours.get(to) ?? []), from])
  }
  const meanOf = (id: string, at: Map<string, number>): number | null => {
    const near = (neighbours.get(id) ?? []).flatMap((other) => (at.has(other) ? [at.get(other)!] : []))
    return near.length ? near.reduce((sum, one) => sum + one, 0) / near.length : null
  }

  // Each column in turn sorts itself by where its neighbours are, there and back.
  const place = new Map<string, number>()
  for (const column of columns) column.forEach((id, i) => place.set(id, i))
  for (let sweep = 0; sweep < 6; sweep += 1) {
    const order = sweep % 2 === 0 ? columns : [...columns].reverse()
    for (const column of order) {
      const own = new Map(column.map((id) => [id, place.get(id)!]))
      const others = new Map([...place].filter(([id]) => !own.has(id)))
      // What is wired comes first; a card with no wires waits at the bottom.
      const key = (id: string): number => meanOf(id, others) ?? Number.MAX_SAFE_INTEGER / 2 + own.get(id)!
      column.sort((a, b) => key(a) - key(b))
      column.forEach((id, i) => place.set(id, i))
    }
  }

  // Then rows: as level with its neighbours as the column's order lets it be.
  const rows = new Map<string, number>()
  for (const column of columns) column.forEach((id, i) => rows.set(id, i))
  for (let sweep = 0; sweep < 6; sweep += 1) {
    const order = sweep % 2 === 0 ? columns : [...columns].reverse()
    for (const column of order) {
      const own = new Set(column)
      const others = new Map([...rows].filter(([id]) => !own.has(id)))
      const wish = column.map((id) => meanOf(id, others))
      let next = Number.NEGATIVE_INFINITY
      const put = column.map((id, i) => {
        const row = Math.max(Math.round(wish[i] ?? next + 1), next + 1)
        next = row
        return { id, row: Number.isFinite(row) ? row : rows.get(id)! }
      })
      // Pushed down by those above, the column settles back as a whole.
      const off = put.flatMap((one, i) => (wish[i] === null ? [] : [wish[i]! - one.row]))
      const by = off.length ? Math.round(off.reduce((sum, one) => sum + one, 0) / off.length) : 0
      for (const one of put) rows.set(one.id, one.row + by)
    }
  }
  const top = Math.min(...rows.values())
  const out = new Map<string, { column: number; row: number }>()
  columns.forEach((column, i) => column.forEach((id) => out.set(id, { column: i, row: rows.get(id)! - top })))
  return out
}

const ROW_LIMIT = 4

/** A column taller than this is split into columns side by side, so a busy
 *  level stays wide rather than tall, and readable without zooming. */
const COLUMN_LIMIT = 4

const split = (lane: DrawnCard[]): DrawnCard[][] => {
  const parts = Math.ceil(lane.length / COLUMN_LIMIT)
  const each = Math.ceil(lane.length / parts)
  return Array.from({ length: parts }, (_, i) => lane.slice(i * each, i * each + each))
}

/** Lays out the cards inside one card. A card a person put somewhere stays
 *  there; the rest are laid out by kind, centred on the origin. */
export const layOut = (all: DrawnCard[], wires: DrawnWire[] = []): Placed[] => {
  const gap = gapFor(wires)
  const put: Placed[] = all
    .filter((card) => card.x !== undefined && card.y !== undefined)
    .map((card) => ({ card, box: { x: card.x!, y: card.y!, ...sizeOf(card) } }))
  const cards = all.filter((card) => card.x === undefined || card.y === undefined)
  if (cards.length === 0) return put

  const flow = flowOf(cards, wires)
  if (flow) {
    const widths = new Map<number, number>()
    for (const card of cards) {
      const { column } = flow.get(card.id)!
      widths.set(column, Math.max(widths.get(column) ?? 0, sizeOf(card).w))
    }
    const pitch = Math.max(...cards.map((card) => sizeOf(card).h)) + ROW_GAP
    const lefts = new Map<number, number>()
    let across = 0
    for (const column of [...widths.keys()].sort((a, b) => a - b)) {
      lefts.set(column, across)
      across += widths.get(column)! + gap
    }
    const grid = cards.map((card): Placed => {
      const { column, row } = flow.get(card.id)!
      const { w, h } = sizeOf(card)
      return { card, box: { x: lefts.get(column)! + (widths.get(column)! - w) / 2, y: row * pitch + (pitch - ROW_GAP - h) / 2, w, h } }
    })
    const around = boundsOf(grid.map((p) => p.box))
    return [
      ...put,
      ...grid.map((p) => ({
        ...p,
        box: { ...p.box, x: Math.round(p.box.x - around.x - around.w / 2), y: Math.round(p.box.y - around.y - around.h / 2) },
      })),
    ]
  }

  const columns = new Map<number, DrawnCard[]>()
  for (const card of cards) columns.set(columnOf(card), [...(columns.get(columnOf(card)) ?? []), card])

  // A level with only one column, like the systems in a project or the
  // files in a component, wraps into a grid instead of one long line.
  const lanes: DrawnCard[][] =
    columns.size === 1
      ? Array.from({ length: Math.ceil(cards.length / ROW_LIMIT) }, (_, i) => cards.slice(i * ROW_LIMIT, i * ROW_LIMIT + ROW_LIMIT))
      : [...columns.keys()].sort((a, b) => a - b).flatMap((key) => split(columns.get(key)!))

  const placed: Placed[] = []
  if (columns.size === 1) {
    let y = 0
    for (const row of lanes) {
      let x = 0
      let tallest = 0
      for (const card of row) {
        const { w, h } = sizeOf(card)
        placed.push({ card, box: { x, y, w, h } })
        x += w + gap
        tallest = Math.max(tallest, h)
      }
      y += tallest + GAP_Y
    }
  } else {
    let x = 0
    const heights = lanes.map((lane) => lane.reduce((sum, card) => sum + sizeOf(card).h + GAP_Y, -GAP_Y))
    const tallest = Math.max(...heights)
    lanes.forEach((lane, i) => {
      let y = (tallest - heights[i]!) / 2
      const widest = Math.max(...lane.map((card) => sizeOf(card).w))
      for (const card of lane) {
        const { w, h } = sizeOf(card)
        placed.push({ card, box: { x: x + (widest - w) / 2, y, w, h } })
        y += h + GAP_Y
      }
      x += widest + gap
    })
  }

  const bounds = boundsOf(placed.map((p) => p.box))
  return [
    ...put,
    ...placed.map((p) => ({
      ...p,
      box: { ...p.box, x: p.box.x - bounds.x - bounds.w / 2, y: p.box.y - bounds.y - bounds.h / 2 },
    })),
  ]
}

export const boundsOf = (boxes: Box[]): Box => {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  const left = Math.min(...boxes.map((b) => b.x))
  const top = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.w))
  const bottom = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

const middleOfBox = (box: Box): { x: number; y: number } => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 })

/** Pushes things out of the way of an open card, the way a thing swelling on
 *  a table shoves what is on it. Each moves straight out from the open card's
 *  middle until it is clear, and what it lands on is pushed on in turn.
 *  Anything nothing pushed stays exactly where it is, so two cards a person
 *  stacked stay stacked. The result is only where they are drawn: where they
 *  were put stays as it was, and they come back when the card closes.
 *
 *  `held` is what is under the hand, which never moves. `air` is extra room a
 *  thing needs beside the open card, such as for the words on a wire to it. */
export const pushAside = (
  open: Box,
  things: { id: string; box: Box }[],
  held: Set<string> = new Set(),
  air: Map<string, number> = new Map(),
): Map<string, Box> => {
  const from = middleOfBox(open)
  const reach = (one: { x: number; y: number }): number => Math.hypot(one.x - from.x, one.y - from.y)
  const order = [...things].sort((a, b) => reach(middleOfBox(a.box)) - reach(middleOfBox(b.box)))
  const out = new Map(things.map((thing) => [thing.id, thing.box]))
  const pushers: { box: Box; open: boolean }[] = [{ box: open, open: true }]
  /** A pusher's edges, grown by half the thing and the air between them, so
   *  the thing is clear once its middle is outside. */
  const zoneOf = (pusher: { box: Box; open: boolean }, id: string, size: Box): Box => {
    const wanted = air.get(id) ?? 0
    const across = pusher.open ? Math.max(OPEN_AIR, wanted) : PUSHED_AIR
    const down = pusher.open ? OPEN_AIR : PUSHED_AIR
    return {
      x: pusher.box.x - across - size.w / 2,
      y: pusher.box.y - down - size.h / 2,
      w: pusher.box.w + across * 2 + size.w,
      h: pusher.box.h + down * 2 + size.h,
    }
  }
  const within = (at: { x: number; y: number }, zone: Box): boolean =>
    at.x > zone.x && at.x < zone.x + zone.w && at.y > zone.y && at.y < zone.y + zone.h

  const moved = new Set<string>()
  for (let pass = 0, changed = true; changed && pass <= things.length; pass += 1) {
    changed = false
    for (const thing of order) {
      if (moved.has(thing.id) || held.has(thing.id)) continue
      let at = middleOfBox(thing.box)
      if (!pushers.some((pusher) => within(at, zoneOf(pusher, thing.id, thing.box)))) continue
      const length = reach(at)
      const way = length < 1 ? { x: -1, y: 0 } : { x: (at.x - from.x) / length, y: (at.y - from.y) / length }
      // Out along that line until it is outside every pusher's reach.
      for (let tries = 0; tries <= pushers.length * 2; tries += 1) {
        const inside = pushers.find((pusher) => within(at, zoneOf(pusher, thing.id, thing.box)))
        if (!inside) break
        const zone = zoneOf(inside, thing.id, thing.box)
        const across = way.x > 0 ? (zone.x + zone.w - at.x) / way.x : way.x < 0 ? (zone.x - at.x) / way.x : Infinity
        const down = way.y > 0 ? (zone.y + zone.h - at.y) / way.y : way.y < 0 ? (zone.y - at.y) / way.y : Infinity
        const by = Math.min(across, down) + 0.5
        at = { x: at.x + way.x * by, y: at.y + way.y * by }
      }
      const box = { ...thing.box, x: Math.round(at.x - thing.box.w / 2), y: Math.round(at.y - thing.box.h / 2) }
      out.set(thing.id, box)
      moved.add(thing.id)
      pushers.push({ box, open: false })
      changed = true
    }
  }
  return out
}

/** The room a card gets when opened with none of its own: at least a given
 *  size, centred on what is inside it. */
export const roomAround = (inside: Box | null, least: { w: number; h: number }): Box => {
  const w = Math.max(least.w, inside?.w ?? 0)
  const h = Math.max(least.h, inside?.h ?? 0)
  const middle = inside ? middleOfBox(inside) : { x: 0, y: 0 }
  return { x: Math.round(middle.x - w / 2), y: Math.round(middle.y - h / 2), w, h }
}

const holdsId = (card: DrawnCard, id: string): boolean => card.id === id || card.children.some((child) => holdsId(child, id))

/** What is drawn around the card open now: only what really reaches it (ADR
 *  0012). On the level around it, that is whatever is wired to it. Further out,
 *  a wire to the open card there counts only if it comes on to the card open now:
 *  read from code, it says so in its real ends; on a drawing, a wire inside ends
 *  at its hub. The rest fades away and is not drawn until a person backs out. */
export const reachingOpen = (levels: Pick<OpenLevel, 'open' | 'placed' | 'wires'>[]): { wires: Set<DrawnWire>; notDrawn: Set<string> } => {
  const wires = new Set<DrawnWire>()
  const notDrawn = new Set<string>()
  const opens = levels.filter((level) => level.open)
  const now = opens.at(-1)?.open?.card
  if (!now) return { wires, notDrawn }
  let inside: DrawnWire[] = []
  for (let at = opens.length - 1; at >= 0; at -= 1) {
    const level = opens[at]!
    const open = level.open!.card.id
    const touching = level.wires.filter((wire) => wire.from === open || wire.to === open)
    const reaching =
      at === opens.length - 1
        ? touching
        : touching.filter((wire) => {
            const here = wire.to === open ? 'to' : 'from'
            if (wire.ends?.some((end) => holdsId(now, end[here]))) return true
            if (!wire.id) return false
            const hub = hubOf(wire.id)
            return inside.some((one) => one.from === hub || one.to === hub)
          })
    const wired = new Set(reaching.flatMap((wire) => [wire.from, wire.to]))
    for (const wire of reaching) wires.add(wire)
    for (const { card } of level.placed) if (!wired.has(card.id)) notDrawn.add(card.id)
    inside = reaching
  }
  return { wires, notDrawn }
}

/** Which edges of an open card a handle moves: a corner, or one side. */
export type Grip = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** A room with the edges of one handle moved. It stops at the smallest it can
 *  be with the far edge held still. */
export const resized = (room: Box, grip: Grip, dx: number, dy: number, least: { w: number; h: number }): Box => {
  let { x, y, w, h } = room
  if (grip.includes('e')) w = Math.max(least.w, w + dx)
  if (grip.includes('s')) h = Math.max(least.h, h + dy)
  if (grip.includes('w')) {
    const right = x + w
    w = Math.max(least.w, w - dx)
    x = right - w
  }
  if (grip.includes('n')) {
    const bottom = y + h
    h = Math.max(least.h, h - dy)
    y = bottom - h
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

/** An annotation on a level, as far as laying the level out goes. A line's
 *  loose end is one of these too, with no size. */
export type AnnoThing = {
  id: string
  /** Where it sits in the level's own space. */
  box: Box
  /** A card it keeps beside, which it moves with. */
  near?: { card: string; dx: number; dy: number }
  /** It frames what is inside it, so it grows with that, not away from it. */
  around?: boolean
}

/** Where a level's annotations go to keep clear of the card open on it, if
 *  any. Each is pushed straight out, the way a card is, but no card ever moves
 *  for an annotation, so only the open card and other annotations push them. A
 *  frame round some cards stays round them, however far they were pushed. It
 *  is only where they are drawn, so they return when the card closes. */
export const annotationsClear = (
  annos: AnnoThing[],
  natural: Placed[],
  open: { id: string; closed: Box; box: Box } | null,
  cardNow: (placed: Placed) => Box,
): Map<string, Box> => {
  const out = new Map<string, Box>()
  const free: { id: string; box: Box }[] = []
  for (const anno of annos) {
    const near = anno.near?.card
    if (near && near !== open?.id && natural.some((p) => p.card.id === near)) continue
    const box = near && open && near === open.id ? { ...anno.box, x: open.closed.x + anno.near!.dx, y: open.closed.y + anno.near!.dy } : anno.box
    if (!open) {
      out.set(anno.id, box)
      continue
    }
    if (anno.around) {
      const held = natural.filter((p) => {
        const at = middleOfBox(p.box)
        return at.x > box.x && at.x < box.x + box.w && at.y > box.y && at.y < box.y + box.h
      })
      if (held.length) {
        const was = boundsOf(held.map((p) => p.box))
        const now = boundsOf(held.map(cardNow))
        const left = was.x - box.x
        const top = was.y - box.y
        const right = box.x + box.w - was.x - was.w
        const bottom = box.y + box.h - was.y - was.h
        out.set(anno.id, { x: now.x - left, y: now.y - top, w: now.w + left + right, h: now.h + top + bottom })
        continue
      }
    }
    free.push({ id: anno.id, box })
  }
  if (open) for (const [id, box] of pushAside(open.box, free)) out.set(id, box)
  return out
}

/** What is on one level, before it is placed. */
export type LevelContents = { card: DrawnCard; children: DrawnCard[]; wires: DrawnWire[]; notes: DrawnNote[]; annos?: AnnoThing[] }

/** One level of the cards that are open, placed on the board. */
export type OpenLevel = LevelContents & {
  /** From the level's own space to the board. */
  shift: { x: number; y: number }
  /** Every card where it was put, before anything pushed it, in the level's
   *  own space, including the one that is open. */
  natural: Placed[]
  /** The cards drawn as cards, on the board, pushed clear of the open one. */
  placed: Placed[]
  noteBoxes: { note: DrawnNote; box: Box }[]
  /** The card open on this level, if any, and how big it has grown. */
  open: Placed | null
  /** What the open card pushed, and the open card itself. */
  pushed: Set<string>
  /** How much room this level has, in its own space. */
  room: Box
  /** Where its annotations are drawn, on the board, by annotation; a line's
   *  loose ends by the line's id and which end. One that keeps beside a card
   *  is not here, unless that card is the open one. */
  annoBoxes: Map<string, Box>
}

/** Places a chain of open cards, each inside the one before, from the inside
 *  out, since each is as big as what it holds.
 *
 *  An open card is pinned to the middle of where it sits on its level by a
 *  point in its own space, its anchor, settled when it is first opened and
 *  then kept. That is what lets it grow in any direction without anything
 *  already inside it sliding. */
export const openLevels = ({
  levels,
  roomOf,
  anchors,
  held,
}: {
  /** From the outermost card to the innermost. */
  levels: LevelContents[]
  /** The room a card should have, given what is inside it. */
  roomOf: (card: DrawnCard, inside: Box | null) => Box
  /** Each open card's anchor, kept from one call to the next. */
  anchors: Map<string, { x: number; y: number }>
  /** What is under the hand, which nothing pushes. */
  held?: Set<string>
}): OpenLevel[] => {
  const worked: (Omit<OpenLevel, 'shift' | 'placed' | 'noteBoxes' | 'open' | 'annoBoxes'> & {
    annoBoxes: Map<string, Box>
    placed: Placed[]
    noteBoxes: { note: DrawnNote; box: Box }[]
    open: Placed | null
    /** The open card's middle, less its anchor: from its insides to here. */
    step: { x: number; y: number }
  })[] = []
  let innerRoom: Box | null = null
  let innerId = ''

  for (let i = levels.length - 1; i >= 0; i -= 1) {
    const level = levels[i]!
    const natural = layOut(level.children, level.wires)
    const found: Placed | undefined = innerRoom ? natural.find((p) => p.card.id === innerId) : undefined
    const things = [
      ...natural.filter((p) => p !== found).map((p) => ({ id: p.card.id, box: p.box })),
      ...level.notes.map((n) => ({ id: n.id, box: { x: n.x, y: n.y, ...NOTE_SIZE } })),
    ]
    let open: Placed | null = null
    let pushedTo = new Map(things.map((thing) => [thing.id, thing.box]))
    const pushed = new Set<string>()
    let step = { x: 0, y: 0 }
    if (found && innerRoom) {
      const anchor = anchors.get(innerId) ?? middleOfBox(innerRoom)
      anchors.set(innerId, anchor)
      const middle = middleOfBox(found.box)
      step = { x: middle.x - anchor.x, y: middle.y - anchor.y }
      const box: Box = { x: innerRoom.x + step.x, y: innerRoom.y + step.y, w: innerRoom.w, h: innerRoom.h }
      open = { card: found.card, box }
      // A card wired to the open one needs room for the words between them,
      // though not so much that it is pushed off the screen for them.
      const air = new Map<string, number>()
      for (const wire of level.wires) {
        const room = Math.min(wordsWidth(wire), WIRED_AIR)
        if (wire.from === innerId) air.set(wire.to, Math.max(air.get(wire.to) ?? 0, room))
        if (wire.to === innerId) air.set(wire.from, Math.max(air.get(wire.from) ?? 0, room))
      }
      pushedTo = pushAside(box, things, held, air)
      pushed.add(innerId)
      for (const thing of things) if (pushedTo.get(thing.id) !== thing.box) pushed.add(thing.id)
    }
    const placed: Placed[] = natural.filter((p) => p !== found).map((p) => ({ card: p.card, box: pushedTo.get(p.card.id) ?? p.box }))
    const annoBoxes = annotationsClear(
      level.annos ?? [],
      natural,
      found && open ? { id: found.card.id, closed: found.box, box: open.box } : null,
      (p) => (p === found && open ? open.box : (pushedTo.get(p.card.id) ?? p.box)),
    )
    const noteBoxes = level.notes.map((note) => ({ note, box: pushedTo.get(note.id) ?? { x: note.x, y: note.y, ...NOTE_SIZE } }))
    const boxes: Box[] = [...placed.map((p) => p.box), ...noteBoxes.map((n) => n.box), ...(open ? [open.box] : [])]
    const around = boundsOf(boxes)
    const inside: Box | null =
      boxes.length === 0
        ? null
        : { x: around.x - OPEN_PAD, y: around.y - OPEN_PAD, w: around.w + OPEN_PAD * 2, h: around.h + OPEN_PAD * 2 }
    // The root has no border, so it needs no room.
    const wanted = i === 0 ? (inside ?? { x: 0, y: 0, w: 0, h: 0 }) : roomOf(level.card, inside)
    const room: Box = inside ? boundsOf([wanted, inside]) : wanted
    worked.unshift({ ...level, natural, placed, noteBoxes, open, pushed, room, step, annoBoxes })
    innerRoom = room
    innerId = level.card.id
  }

  // Anything no longer open is forgotten, so it settles afresh next time.
  const opens = new Set(levels.slice(1).map((level) => level.card.id))
  for (const id of anchors.keys()) if (!opens.has(id)) anchors.delete(id)

  // Then from the outside in, each level taking the place of the one around it.
  const out: OpenLevel[] = []
  let shift = { x: 0, y: 0 }
  worked.forEach((level) => {
    const by = (box: Box): Box => ({ ...box, x: box.x + shift.x, y: box.y + shift.y })
    const { step, ...rest } = level
    out.push({
      ...rest,
      shift,
      placed: level.placed.map((p) => ({ card: p.card, box: by(p.box) })),
      noteBoxes: level.noteBoxes.map((n) => ({ note: n.note, box: by(n.box) })),
      open: level.open ? { card: level.open.card, box: by(level.open.box) } : null,
      annoBoxes: new Map([...level.annoBoxes].map(([id, box]) => [id, by(box)])),
    })
    shift = { x: shift.x + step.x, y: shift.y + step.y }
  })
  return out
}

/** Where along a side a wire meets a card, as a share of that side, so
 *  several wires into one card arrive apart. */
export type Slots = { from: number; to: number }

export type WireShape = {
  d: string
  /** The middle of the curve, where the sentence sits. */
  at: { x: number; y: number }
  /** Where the wire leaves the card it starts on, for a port. */
  tail: { x: number; y: number }
  /** Where the wire crosses into the card it reaches, for a port. */
  head: { x: number; y: number }
  /** How it bends leaving the one and reaching the other. */
  c1: { x: number; y: number }
  c2: { x: number; y: number }
}

/** A wire whose sentence a person has moved: drawn through it, so the two can
 *  never come apart. It leaves and arrives as it always did, and is only bent
 *  on the way. A sentence nobody has moved already sits on the wire's own
 *  curve, which needs no bending. */
export const wireThrough = (shape: WireShape, at: { x: number; y: number }): string => {
  if (Math.hypot(at.x - shape.at.x, at.y - shape.at.y) < 0.5) return shape.d
  const a = shape.tail
  const b = shape.head
  const unit = (p: { x: number; y: number }, q: { x: number; y: number }): { x: number; y: number } => {
    const length = Math.hypot(q.x - p.x, q.y - p.y)
    return length < 0.001 ? { x: 0, y: 0 } : { x: (q.x - p.x) / length, y: (q.y - p.y) / length }
  }
  const leaving = unit(a, shape.c1)
  const arriving = unit(b, shape.c2)
  const across = unit(a, b)
  const first = Math.hypot(at.x - a.x, at.y - a.y)
  const second = Math.hypot(b.x - at.x, b.y - at.y)
  const out = { x: a.x + leaving.x * first * 0.45, y: a.y + leaving.y * first * 0.45 }
  const into = { x: at.x - across.x * first * 0.35, y: at.y - across.y * first * 0.35 }
  const on = { x: at.x + across.x * second * 0.35, y: at.y + across.y * second * 0.35 }
  const last = { x: b.x + arriving.x * second * 0.45, y: b.y + arriving.y * second * 0.45 }
  return `M ${a.x} ${a.y} C ${out.x} ${out.y}, ${into.x} ${into.y}, ${at.x} ${at.y} C ${on.x} ${on.y}, ${last.x} ${last.y}, ${b.x} ${b.y}`
}

/** The middle of a cubic curve, where its sentence goes. Eight wires fanning
 *  into one card have eight different middles and only one arrowhead, which
 *  is why the words live here and not by the arrow. */
const middleOf = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): { x: number; y: number } => ({
  x: (a.x + 3 * b.x + 3 * c.x + d.x) / 8,
  y: (a.y + 3 * b.y + 3 * c.y + d.y) / 8,
})

/** How a wire between two cards stacked in a column loops round them: which
 *  side, and where along that side it leaves and arrives. */
export type Loop = { side: 'e' | 'w'; from: number; to: number }

const isSideways = (from: Box, to: Box): boolean => {
  const across = Math.abs(to.x + to.w / 2 - (from.x + from.w / 2))
  const down = Math.abs(to.y + to.h / 2 - (from.y + from.h / 2))
  const open = across - (from.w + to.w) / 2
  const gap = down - (from.h + to.h) / 2
  return !(gap > 24 && gap > open) && across > Math.max(from.w, to.w) / 2
}

/** Shares out the wires between stacked cards between the two sides of their
 *  column, so they do not all pile up on one. The shortest choose first, each
 *  taking whichever side is less busy at its two cards, counting the wires that
 *  already leave that way. A wire with a clear run straight down needs no loop. */
export const loopSides = <W extends { from: string; to: string }>(wires: W[], boxes: Map<string, Box>, others: Box[] = []): Map<W, Loop> => {
  const busy = new Map<string, number>()
  const load = (id: string, side: string): number => busy.get(`${id}:${side}`) ?? 0
  const add = (id: string, side: string): void => {
    busy.set(`${id}:${side}`, load(id, side) + 1)
  }
  const stacked: { wire: W; from: Box; to: Box }[] = []
  for (const wire of wires) {
    const from = boxes.get(wire.from)
    const to = boxes.get(wire.to)
    if (!from || !to || wire.from === wire.to) continue
    if (isSideways(from, to)) {
      const forward = to.x > from.x
      add(wire.from, forward ? 'e' : 'w')
      add(wire.to, forward ? 'w' : 'e')
      continue
    }
    const top = Math.min(from.y + from.h, to.y + to.h)
    const bottom = Math.max(from.y, to.y)
    const left = Math.min(from.x + from.w / 2, to.x + to.w / 2) - 8
    const right = Math.max(from.x + from.w / 2, to.x + to.w / 2) + 8
    const blocked = others.some((o) => o !== from && o !== to && o.x < right && o.x + o.w > left && o.y < bottom && o.y + o.h > top)
    if (bottom - top > 24 && !blocked) continue
    stacked.push({ wire, from, to })
  }
  const span = (one: { from: Box; to: Box }): number => Math.abs(one.to.y - one.from.y)
  const sides = new Map<W, 'e' | 'w'>()
  for (const one of [...stacked].sort((a, b) => span(a) - span(b))) {
    const score = (side: string): number => load(one.wire.from, side) + load(one.wire.to, side)
    const side = score('w') < score('e') ? 'w' : 'e'
    sides.set(one.wire, side)
    add(one.wire.from, side)
    add(one.wire.to, side)
  }
  // Where each leaves its card along that side, in the order of where it goes,
  // so the ones sharing a side do not start from one spot or cross near the card.
  const atCard = new Map<string, { wire: W; end: 'from' | 'to'; toward: number }[]>()
  for (const one of stacked) {
    const side = sides.get(one.wire)!
    for (const end of ['from', 'to'] as const) {
      const key = `${one.wire[end]}:${side}`
      const other = end === 'from' ? one.to : one.from
      atCard.set(key, [...(atCard.get(key) ?? []), { wire: one.wire, end, toward: other.y }])
    }
  }
  const shares = new Map<W, { from: number; to: number }>()
  for (const list of atCard.values()) {
    list.sort((a, b) => a.toward - b.toward)
    list.forEach((entry, i) => {
      const share = (i + 1) / (list.length + 1)
      shares.set(entry.wire, { ...(shares.get(entry.wire) ?? { from: 0.5, to: 0.5 }), [entry.end]: share })
    })
  }
  return new Map(stacked.map((one) => [one.wire, { side: sides.get(one.wire)!, ...shares.get(one.wire)! }]))
}

/** A curved path from one card to another, leaving and arriving on the
 *  sides that face each other. One card above another goes straight down
 *  between them when nothing is in the way; otherwise it loops round the
 *  side. */
export const wirePath = (
  from: Box,
  to: Box,
  slots: Slots = { from: 0.5, to: 0.5 },
  others: Box[] = [],
  /** Where a spot on a card's box lands on the card's real edge, for a card
   *  that is not a plain box. */
  fit: { from?: (at: { x: number; y: number }) => { x: number; y: number }; to?: (at: { x: number; y: number }) => { x: number; y: number } } = {},
  /** How it loops round, if the two are stacked and it has to. */
  loop?: Loop,
): WireShape => {
  const finish = (
    rawA: { x: number; y: number },
    rawC1: { x: number; y: number },
    rawC2: { x: number; y: number },
    rawB: { x: number; y: number },
  ): WireShape => {
    const tail = fit.from ? fit.from(rawA) : rawA
    const head = fit.to ? fit.to(rawB) : rawB
    const c1 = { x: rawC1.x + tail.x - rawA.x, y: rawC1.y + tail.y - rawA.y }
    const c2 = { x: rawC2.x + head.x - rawB.x, y: rawC2.y + head.y - rawB.y }
    return {
      d: `M ${tail.x} ${tail.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${head.x} ${head.y}`,
      at: middleOf(tail, c1, c2, head),
      tail,
      head,
      c1,
      c2,
    }
  }
  const fromMid = { x: from.x + from.w / 2, y: from.y + from.h / 2 }
  const toMid = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
  // The open air between the two cards, across and down. Whichever there is
  // more of is the way the wire runs.
  const across = Math.abs(toMid.x - fromMid.x) - (from.w + to.w) / 2
  const downward = Math.abs(toMid.y - fromMid.y) - (from.h + to.h) / 2
  const vertical = downward > 24 && downward > across
  const sideways = !vertical && Math.abs(toMid.x - fromMid.x) > Math.max(from.w, to.w) / 2

  if (vertical || !sideways) {
    const down = toMid.y > fromMid.y
    const a = { x: from.x + from.w * slots.from, y: down ? from.y + from.h : from.y }
    const b = { x: to.x + to.w * slots.to, y: down ? to.y : to.y + to.h }
    const gap = down ? b.y - a.y : a.y - b.y
    const lane = { x: Math.min(a.x, b.x) - 8, y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 16, h: Math.abs(b.y - a.y) }
    const blocked = others.some(
      (o) => o !== from && o !== to && o.x < lane.x + lane.w && o.x + o.w > lane.x && o.y < lane.y + lane.h && o.y + o.h > lane.y,
    )
    if (gap > 24 && !blocked) {
      const bend = Math.max(24, gap / 2) * (down ? 1 : -1)
      return finish(a, { x: a.x, y: a.y + bend }, { x: b.x, y: b.y - bend }, b)
    }
  }

  if (sideways) {
    const forward = toMid.x > fromMid.x
    const a = { x: forward ? from.x + from.w : from.x, y: from.y + from.h * slots.from }
    const b = { x: forward ? to.x : to.x + to.w, y: to.y + to.h * slots.to }
    const bend = Math.max(40, Math.abs(b.x - a.x) / 2) * (forward ? 1 : -1)
    return finish(a, { x: a.x + bend, y: a.y }, { x: b.x - bend, y: b.y }, b)
  }
  // Stacked in one column: loop out to one side and back in.
  const down = toMid.y > fromMid.y
  const east = (loop?.side ?? 'e') === 'e'
  const a = { x: east ? from.x + from.w : from.x, y: from.y + from.h * (loop?.from ?? (down ? 0.7 : 0.3)) }
  const b = { x: east ? to.x + to.w : to.x, y: to.y + to.h * (loop?.to ?? (down ? 0.3 : 0.7)) }
  const reach = 50 + Math.abs(b.y - a.y) * 0.12
  const out = east ? Math.max(a.x, b.x) + reach : Math.min(a.x, b.x) - reach
  return finish(a, { x: out, y: a.y }, { x: out, y: b.y }, b)
}

/** A point on a cubic curve, `t` of the way along it. */
const pointOn = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
  t: number,
): { x: number; y: number } => {
  const u = 1 - t
  const mix = (axis: 'x' | 'y'): number => u * u * u * a[axis] + 3 * u * u * t * b[axis] + 3 * u * t * t * c[axis] + t * t * t * d[axis]
  return { x: mix('x'), y: mix('y') }
}

/** A sentence sits in the middle of its own wire. Where that would put it on
 *  another sentence or on a card, it slides along the wire, either way, the
 *  nearest clear spot winning. It never leaves the wire, so the wire stays a
 *  smooth curve from card to card (ADR 0016). */
export const spread = (
  chips: {
    at: { x: number; y: number }
    w: number
    h: number
    tail: { x: number; y: number }
    c1: { x: number; y: number }
    c2: { x: number; y: number }
    head: { x: number; y: number }
    /** A sentence a person has moved stays exactly where they put it, and
     *  the rest keep clear of it. */
    fixed?: boolean
  }[],
  cards: Box[] = [],
): { x: number; y: number }[] => {
  const AIR = 6
  const hits = (one: Box, other: Box): boolean =>
    one.x < other.x + other.w + AIR && one.x + one.w + AIR > other.x && one.y < other.y + other.h + AIR && one.y + one.h + AIR > other.y
  const boxAt = (at: { x: number; y: number }, w: number, h: number): Box => ({ x: at.x - w / 2, y: at.y - h / 2, w, h })
  const placed: Box[] = chips.filter((chip) => chip.fixed).map((chip) => boxAt(chip.at, chip.w, chip.h))
  const SLIDES = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.1, 0.9]
  return chips.map((chip) => {
    if (chip.fixed) return chip.at
    const free = SLIDES.map((t) => pointOn(chip.tail, chip.c1, chip.c2, chip.head, t)).find((at) => {
      const box = boxAt(at, chip.w, chip.h)
      return !cards.some((card) => hits(box, card)) && !placed.some((other) => hits(box, other))
    })
    // On a level too crowded for anywhere to be clear, the middle is still
    // the most honest place for it.
    const at = free ?? chip.at
    placed.push(boxAt(at, chip.w, chip.h))
    return at
  })
}
