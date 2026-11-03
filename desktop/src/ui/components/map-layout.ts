// codegraph: component map-canvas
import type { Card } from '../../features/show-map.js'

/** A wire as the canvas draws it, from the map or from a sketch. */
export type DrawnWire = { id?: string; from: string; to: string; kind: string; words: string }

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

const GAP_X = 120
const GAP_Y = 36

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
 *  there; the rest are laid out by kind, centred on the origin. */
export const layOut = (all: DrawnCard[]): Placed[] => {
  const put: Placed[] = all
    .filter((card) => card.x !== undefined && card.y !== undefined)
    .map((card) => ({ card, box: { x: card.x!, y: card.y!, ...sizeOf(card) } }))
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
        const { w, h } = sizeOf(card)
        placed.push({ card, box: { x, y, w, h } })
        x += w + GAP_X / 2
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
      x += widest + GAP_X
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
  /** Where the words go, and which way they run from there. */
  label: { x: number; y: number; anchor: 'start' | 'middle' | 'end' }
}

/** A curved path from one card to another, leaving and arriving on the
 *  sides that face each other. Its words sit just before the arrow, in the
 *  gap beside the card it reaches, where no other card is. */
export const wirePath = (from: Box, to: Box, slots: Slots = { from: 0.5, to: 0.5 }): WireShape => {
  const fromMid = { x: from.x + from.w / 2, y: from.y + from.h / 2 }
  const toMid = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
  const sideways = Math.abs(toMid.x - fromMid.x) > Math.max(from.w, to.w) / 2

  if (sideways) {
    const forward = toMid.x > fromMid.x
    const a = { x: forward ? from.x + from.w : from.x, y: from.y + from.h * slots.from }
    const b = { x: forward ? to.x : to.x + to.w, y: to.y + to.h * slots.to }
    const bend = Math.max(40, Math.abs(b.x - a.x) / 2) * (forward ? 1 : -1)
    return {
      d: `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`,
      label: { x: b.x + (forward ? -14 : 14), y: b.y, anchor: forward ? 'end' : 'start' },
    }
  }
  // Stacked in one column: loop out to the right and back in.
  const down = toMid.y > fromMid.y
  const a = { x: from.x + from.w, y: from.y + from.h * (down ? 0.7 : 0.3) }
  const b = { x: to.x + to.w, y: to.y + to.h * (down ? 0.3 : 0.7) }
  const out = Math.max(a.x, b.x) + 50 + Math.abs(b.y - a.y) * 0.12
  return {
    d: `M ${a.x} ${a.y} C ${out} ${a.y}, ${out} ${b.y}, ${b.x} ${b.y}`,
    label: { x: out - 14, y: (a.y + b.y) / 2, anchor: 'start' },
  }
}
