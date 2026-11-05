// codegraph: component map-canvas
import type { Card } from '../../features/show-map.js'

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
  x?: number
  y?: number
  children: DrawnCard[]
  wires: DrawnWire[]
  notes?: DrawnNote[]
}

export type Box = { x: number; y: number; w: number; h: number }
export type Placed = { card: DrawnCard; box: Box }

/** A card that has been opened in place keeps its spot on the level and grows
 *  to hold the level drawn inside it. */
export type Opened = { id: string; w: number; h: number }

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

/** The air between an opened card's border and the level drawn inside it. */
export const OPEN_PAD = 32

/** Pages are drawn as frames for their screenshot, the rest as cards. */
export const isFrame = (card: DrawnCard): boolean => card.level === 'component' && card.kind === 'page'

export const sizeOf = (card: DrawnCard): { w: number; h: number } =>
  isFrame(card)
    ? { w: 260, h: 200 }
    : card.level === 'code'
      ? { w: 240, h: 104 + Math.min(card.names.length, 9) * 18 }
      : card.level === 'system' || card.level === 'container'
        ? { w: 280, h: 150 }
        : { w: 240, h: card.says ? 124 : 104 }

/** Which column a card sits in, left to right, so most wires run one way:
 *  what starts things (pages and triggers), then what they ask for, then
 *  what does the work, then where things are kept. */
const columnOf = (card: DrawnCard): number => {
  if (card.level === 'component') return card.kind === 'feature' ? 1 : card.kind === 'module' ? 2 : 0
  if (card.level === 'container') return /database|files/.test(card.kind) ? 1 : 0
  if (card.level === 'system') return card.kind === 'shallow software system' ? 1 : 0
  return 0
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
 *  there; the rest are laid out by kind, centred on the origin. A card that
 *  has been opened takes the size the level inside it needs. */
export const layOut = (all: DrawnCard[], wires: DrawnWire[] = [], opened?: Opened): Placed[] => {
  const gap = gapFor(wires)
  const sizeHere = (card: DrawnCard): { w: number; h: number } =>
    opened && card.id === opened.id ? { w: opened.w, h: opened.h } : sizeOf(card)
  let put: Placed[] = all
    .filter((card) => card.x !== undefined && card.y !== undefined)
    .map((card) => ({ card, box: { x: card.x!, y: card.y!, ...sizeHere(card) } }))
  // A card someone put somewhere, opened in place, grows; the cards put
  // beside it and below it step aside by as much, so it never swallows
  // them. Only on screen: where they were put stays as it was.
  const grown = opened ? put.find((p) => p.card.id === opened.id) : undefined
  if (grown && opened) {
    const was = sizeOf(grown.card)
    const wider = opened.w - was.w
    const taller = opened.h - was.h
    put = put.map((p) => {
      if (p === grown) return p
      const right = p.box.x >= grown.box.x + was.w / 2
      const below = !right && p.box.y >= grown.box.y + was.h / 2
      return right || below
        ? { ...p, box: { ...p.box, x: p.box.x + (right ? wider : 0), y: p.box.y + (below ? taller : 0) } }
        : p
    })
  }
  const cards = all.filter((card) => card.x === undefined || card.y === undefined)
  if (cards.length === 0) return put
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
        const { w, h } = sizeHere(card)
        placed.push({ card, box: { x, y, w, h } })
        x += w + gap
        tallest = Math.max(tallest, h)
      }
      y += tallest + GAP_Y
    }
  } else {
    let x = 0
    const heights = lanes.map((lane) => lane.reduce((sum, card) => sum + sizeHere(card).h + GAP_Y, -GAP_Y))
    const tallest = Math.max(...heights)
    lanes.forEach((lane, i) => {
      let y = (tallest - heights[i]!) / 2
      const widest = Math.max(...lane.map((card) => sizeHere(card).w))
      for (const card of lane) {
        const { w, h } = sizeHere(card)
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

/** A curved path from one card to another, leaving and arriving on the
 *  sides that face each other. One card above another goes straight down
 *  between them when nothing is in the way; otherwise it loops round the
 *  side. */
export const wirePath = (
  from: Box,
  to: Box,
  slots: Slots = { from: 0.5, to: 0.5 },
  others: Box[] = [],
): WireShape => {
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
      const c1 = { x: a.x, y: a.y + bend }
      const c2 = { x: b.x, y: b.y - bend }
      return {
        d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
        at: middleOf(a, c1, c2, b),
        tail: a,
        head: b,
      }
    }
  }

  if (sideways) {
    const forward = toMid.x > fromMid.x
    const a = { x: forward ? from.x + from.w : from.x, y: from.y + from.h * slots.from }
    const b = { x: forward ? to.x : to.x + to.w, y: to.y + to.h * slots.to }
    const bend = Math.max(40, Math.abs(b.x - a.x) / 2) * (forward ? 1 : -1)
    const c1 = { x: a.x + bend, y: a.y }
    const c2 = { x: b.x - bend, y: b.y }
    return {
      d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
      at: middleOf(a, c1, c2, b),
      tail: a,
      head: b,
    }
  }
  // Stacked in one column: loop out to the right and back in.
  const down = toMid.y > fromMid.y
  const a = { x: from.x + from.w, y: from.y + from.h * (down ? 0.7 : 0.3) }
  const b = { x: to.x + to.w, y: to.y + to.h * (down ? 0.3 : 0.7) }
  const out = Math.max(a.x, b.x) + 50 + Math.abs(b.y - a.y) * 0.12
  const c1 = { x: out, y: a.y }
  const c2 = { x: out, y: b.y }
  return {
    d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
    at: middleOf(a, c1, c2, b),
    tail: a,
    head: b,
  }
}

/** A sentence sits in the middle of its own wire. Where that would put it on
 *  another sentence or on a card, it slides along the wire, either way, and
 *  then steps off to one side of it, the nearest clear spot winning. It is
 *  never left on a card when anywhere else will do. */
export const spread = (
  chips: {
    at: { x: number; y: number }
    w: number
    h: number
    tail: { x: number; y: number }
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
  const along = (chip: (typeof chips)[number], by: number): { x: number; y: number } => {
    const end = by < 0 ? chip.tail : chip.head
    const share = Math.abs(by)
    return { x: chip.at.x + (end.x - chip.at.x) * share, y: chip.at.y + (end.y - chip.at.y) * share }
  }
  const SLIDES = [0, -0.16, 0.16, -0.32, 0.32, -0.48, 0.48, -0.62, 0.62]
  return chips.map((chip) => {
    if (chip.fixed) return chip.at
    const tries: { x: number; y: number }[] = []
    for (const side of [0, -1, 1, -2, 2])
      for (const by of SLIDES) {
        const on = along(chip, by)
        tries.push({ x: on.x, y: on.y + side * (chip.h + AIR) })
      }
    const free = tries.find((at) => {
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
