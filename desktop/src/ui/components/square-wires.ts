// codegraph: component map-canvas
import type { Box, Side, Spot } from './map-layout.js'
import { polygonsOf } from './shape-outline.js'

/** How a board draws its wires: as smooth curves from card to card, or as
 *  straight pieces that turn only at right angles, which a person can move
 *  piece by piece. */
export type WireStyle = 'curved' | 'square'

export type Point = Spot

/** How far a right-angle wire runs straight out of a card before it may turn. */
export const STUB = 24

const OUT: Record<Side, Point> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } }
const across = (side: Side): boolean => side === 'e' || side === 'w'

/** A spot on one side of a box, a share of the way along it from its top or
 *  left end. */
export const spotOn = (box: Box, side: Side, share = 0.5): Point =>
  side === 'n'
    ? { x: box.x + box.w * share, y: box.y }
    : side === 's'
      ? { x: box.x + box.w * share, y: box.y + box.h }
      : side === 'e'
        ? { x: box.x + box.w, y: box.y + box.h * share }
        : { x: box.x, y: box.y + box.h * share }

/** The side of a box that faces a spot. */
const facing = (box: Box, at: Point): Side => {
  const dx = at.x - (box.x + box.w / 2)
  const dy = at.y - (box.y + box.h / 2)
  return Math.abs(dx) / box.w > Math.abs(dy) / box.h ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n'
}

/** The sides two cards' wire leaves and reaches when no one has plugged it
 *  in: down out of one card above another, across between two side by side,
 *  and out of the right of both when they overlap. */
const sidesBetween = (from: Box, to: Box): [Side, Side] => {
  const a = { x: from.x + from.w / 2, y: from.y + from.h / 2 }
  const b = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
  const open = Math.abs(b.x - a.x) - (from.w + to.w) / 2
  const gap = Math.abs(b.y - a.y) - (from.h + to.h) / 2
  if (gap > STUB && gap > open) return b.y > a.y ? ['s', 'n'] : ['n', 's']
  if (Math.abs(b.x - a.x) > Math.max(from.w, to.w) / 2) return b.x > a.x ? ['e', 'w'] : ['w', 'e']
  return ['e', 'e']
}

const same = (p: Point, q: Point): boolean => Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01
const inLine = (p: Point, q: Point, r: Point): boolean =>
  (Math.abs(p.x - q.x) < 0.01 && Math.abs(q.x - r.x) < 0.01) || (Math.abs(p.y - q.y) < 0.01 && Math.abs(q.y - r.y) < 0.01)

/** A route with no spot twice in a row and no turn that is not a turn. */
const tidy = (route: Point[]): Point[] => {
  const kept = route.filter((p, i) => i === 0 || !same(p, route[i - 1]!))
  return kept.filter((p, i) => i === 0 || i === kept.length - 1 || !inLine(kept[i - 1]!, p, kept[i + 1]!))
}

/** Joins two spots that are not in line, turning once: the first leaving
 *  across or down as it is told. */
const turn = (p: Point, q: Point, leaveAcross: boolean): Point[] =>
  Math.abs(p.x - q.x) < 0.01 || Math.abs(p.y - q.y) < 0.01 ? [] : [leaveAcross ? { x: q.x, y: p.y } : { x: p.x, y: q.y }]

/** The way from a spot leaving one side to a spot arriving at another, with
 *  no bends given: as few turns as it can, never back into either card. */
const findWay = (from: Box, to: Box, a: Point, b: Point, leaves: Side, arrives: Side): Point[] => {
  const out = OUT[leaves]
  const back = OUT[arrives]
  const a1 = { x: a.x + out.x * STUB, y: a.y + out.y * STUB }
  const b1 = { x: b.x + back.x * STUB, y: b.y + back.y * STUB }
  // Whether going from p to q runs the way a direction points, or at least
  // not against it.
  const ahead = (p: Point, q: Point, d: Point): boolean => (q.x - p.x) * d.x + (q.y - p.y) * d.y >= 0
  if (across(leaves) && across(arrives)) {
    if (leaves !== arrives && ahead(a, b, out) && ahead(b, a, back)) {
      const x = (a.x + b.x) / 2
      return [a, { x, y: a.y }, { x, y: b.y }, b]
    }
    if (leaves === arrives) {
      const x = leaves === 'e' ? Math.max(a1.x, b1.x) : Math.min(a1.x, b1.x)
      return [a, { x, y: a.y }, { x, y: b.y }, b]
    }
    // Facing away from each other: out, round the gap between them, and in.
    const gap = from.y + from.h < to.y ? (from.y + from.h + to.y) / 2 : to.y + to.h < from.y ? (to.y + to.h + from.y) / 2 : Math.max(from.y + from.h, to.y + to.h) + STUB
    return [a, a1, { x: a1.x, y: gap }, { x: b1.x, y: gap }, b1, b]
  }
  if (!across(leaves) && !across(arrives)) {
    if (leaves !== arrives && ahead(a, b, out) && ahead(b, a, back)) {
      const y = (a.y + b.y) / 2
      return [a, { x: a.x, y }, { x: b.x, y }, b]
    }
    if (leaves === arrives) {
      const y = leaves === 's' ? Math.max(a1.y, b1.y) : Math.min(a1.y, b1.y)
      return [a, { x: a.x, y }, { x: b.x, y }, b]
    }
    const gap = from.x + from.w < to.x ? (from.x + from.w + to.x) / 2 : to.x + to.w < from.x ? (to.x + to.w + from.x) / 2 : Math.max(from.x + from.w, to.x + to.w) + STUB
    return [a, a1, { x: gap, y: a1.y }, { x: gap, y: b1.y }, b1, b]
  }
  // One leaves across and the other arrives down, or the other way: one turn
  // where that runs the right way out of both, or round by the two stubs.
  const corner = across(leaves) ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
  if (ahead(a, corner, out) && ahead(b, corner, back)) return [a, corner, b]
  return [a, a1, across(leaves) ? { x: a1.x, y: b1.y } : { x: b1.x, y: a1.y }, b1, b]
}

/** A right-angle wire from one card to another: the spots it turns at, from
 *  where it leaves the one to where it reaches the other. It leaves the side
 *  it was plugged into, where along that side it was put, or else the sides
 *  that face; and it runs through any bends a person gave it, joined to the
 *  cards at right angles. */
export const squareRoute = ({
  from,
  to,
  sides = {},
  along = {},
  slots = { from: 0.5, to: 0.5 },
  bends = [],
}: {
  from: Box
  to: Box
  sides?: { from?: Side; to?: Side }
  /** Where along the side each end meets, as a share of it. */
  along?: { from?: number; to?: number }
  /** Where along the side each end meets when no one has put it anywhere, so
   *  wires into one card arrive apart. */
  slots?: { from: number; to: number }
  bends?: Point[]
}): Point[] => {
  const [autoFrom, autoTo] = sidesBetween(from, to)
  const leaves = sides.from ?? (sides.to ? facing(from, spotOn(to, sides.to)) : autoFrom)
  const arrives = sides.to ?? (sides.from ? facing(to, spotOn(from, sides.from)) : autoTo)
  const a = spotOn(from, leaves, along.from ?? slots.from)
  const b = spotOn(to, arrives, along.to ?? slots.to)
  if (!bends.length) return tidy(findWay(from, to, a, b, leaves, arrives))
  const first = bends[0]!
  const last = bends.at(-1)!
  const middle = bends.flatMap((p, i) => (i === 0 ? [p] : [...turn(bends[i - 1]!, p, true), p]))
  return tidy([a, ...turn(a, first, across(leaves)), ...middle, ...turn(last, b, !across(arrives)), b])
}

/** Whether a piece of a route runs across. */
const flat = (p: Point, q: Point): boolean => Math.abs(p.y - q.y) < 0.01 && Math.abs(p.x - q.x) >= 0.01

/** A route with one piece moved square to the way it runs, to `to`: across
 *  for a piece running down, down for one running across. The pieces either
 *  side stretch to follow it. A piece that leaves or reaches a card keeps a
 *  short stub at the card and gains two bends, so the wire still meets the
 *  card where it did; so does a piece whose neighbour runs the same way. */
export const dragPiece = (route: Point[], piece: number, to: number): Point[] => {
  const p = route[piece]
  const q = route[piece + 1]
  if (!p || !q) return route
  const runsAcross = flat(p, q) || (same(p, q) && piece > 0 && !flat(route[piece - 1]!, p))
  const move = (at: Point): Point => (runsAcross ? { x: at.x, y: to } : { x: to, y: at.y })
  const length = Math.hypot(q.x - p.x, q.y - p.y)
  const stub = Math.min(STUB, length / 3)
  const toward = (from: Point, at: Point): Point => {
    const d = Math.hypot(at.x - from.x, at.y - from.y) || 1
    return { x: from.x + ((at.x - from.x) / d) * stub, y: from.y + ((at.y - from.y) / d) * stub }
  }
  // The neighbour on a side, if it turns square to this piece.
  const turnsBefore = piece > 0 && flat(route[piece - 1]!, p) !== runsAcross
  const turnsAfter = piece + 2 < route.length && flat(q, route[piece + 2]!) !== runsAcross
  const head = piece === 0 ? [p, toward(p, q)] : turnsBefore ? [] : [p]
  const tail = piece + 2 === route.length ? [toward(q, p), q] : turnsAfter ? [] : [q]
  const start = head.length ? head.at(-1)! : p
  const end = tail.length ? tail[0]! : q
  return tidy([...route.slice(0, piece), ...head, move(start), move(end), ...tail, ...route.slice(piece + 2)])
}

/** The nearest spot to `at` on one piece of a route. */
const onPiece = (p: Point, q: Point, at: Point): Point => {
  const dx = q.x - p.x
  const dy = q.y - p.y
  const span = dx * dx + dy * dy
  const t = span ? Math.max(0, Math.min(1, ((at.x - p.x) * dx + (at.y - p.y) * dy) / span)) : 0
  return { x: p.x + dx * t, y: p.y + dy * t }
}

/** The piece of a route nearest a spot, by its place in the route. */
export const pieceOf = (route: Point[], at: Point): number => {
  let best = 0
  let far = Infinity
  route.slice(1).forEach((q, i) => {
    const near = onPiece(route[i]!, q, at)
    const d = Math.hypot(near.x - at.x, near.y - at.y)
    if (d < far) {
      far = d
      best = i
    }
  })
  return best
}

/** The spot on a route nearest another. */
export const nearestOn = (route: Point[], at: Point): Point => {
  const piece = pieceOf(route, at)
  return onPiece(route[piece]!, route[piece + 1] ?? route[piece]!, at)
}

/** A route with one more spot on one of its pieces, nearest where it was
 *  asked for, which splits the piece in two so either half can be moved. */
export const addBend = (route: Point[], piece: number, at: Point): Point[] => {
  const p = route[piece]
  const q = route[piece + 1]
  if (!p || !q) return route
  const spot = onPiece(p, q, at)
  if (same(spot, p) || same(spot, q)) return route
  return [...route.slice(0, piece + 1), spot, ...route.slice(piece + 1)]
}

/** How far each end of a route may slide along the side of the card it
 *  meets, as the lowest and highest it may reach on that side's axis. An end
 *  left out stays where it is. */
export type EndRoom = { from?: [number, number]; to?: [number, number] }

/** A route with one piece taken out, and the turn at each end of it: the piece
 *  after it slides into line with the piece before, or the piece before into
 *  line with the piece after, so the route still runs in straight pieces at
 *  right angles. An end of the route slides along its card's side only where
 *  it has to and there is room for it; one that need not move never does.
 *  Null where no way works: for a piece that leaves or reaches a card, or
 *  where a slide would take an end off its side or turn it back through its
 *  card. */
export const takePieceOut = (route: Point[], piece: number, room: EndRoom = {}): Point[] | null => {
  const last = route.length - 1
  if (piece <= 0 || piece + 1 >= last) return null
  const p = route[piece]!
  const q = route[piece + 1]!
  const across = flat(p, q)
  /** A spot moved onto the line a neighbour runs along. */
  const onto = (at: Point, line: Point): Point => (across ? { x: line.x, y: at.y } : { x: at.x, y: line.y })
  /** Which way a piece runs, as a sign along each axis. */
  const way = (from: Point, to: Point): string => `${Math.sign(Math.round(to.x - from.x))},${Math.sign(Math.round(to.y - from.y))}`
  /** An end that moved stays on its side, and only where it may. */
  const onSide = (end: 'from' | 'to', at: Point): boolean => {
    const was = end === 'from' ? route[0]! : route[last]!
    if (same(at, was)) return true
    const span = room[end]
    const v = across ? at.x : at.y
    return Boolean(span) && v >= span![0] && v <= span![1]
  }
  // Still leaving and reaching each card the way it did, not back through it.
  const fits = (next: Point[]): boolean =>
    next.length >= 2 &&
    onSide('from', next[0]!) &&
    onSide('to', next.at(-1)!) &&
    way(next[0]!, next[1]!) === way(route[0]!, route[1]!) &&
    way(next.at(-2)!, next.at(-1)!) === way(route[last - 1]!, route[last]!)
  // The piece after slides onto the line of the piece before; or else the
  // piece before onto the line of the piece after. A way that keeps both ends
  // where they are comes first.
  const after = tidy([...route.slice(0, piece + 1), onto(q, p), onto(route[piece + 2]!, p), ...route.slice(piece + 3)])
  const before = tidy([...route.slice(0, piece - 1), onto(route[piece - 1]!, q), onto(p, q), ...route.slice(piece + 1)])
  const still = (next: Point[]): boolean => same(next[0]!, route[0]!) && same(next.at(-1)!, route[last]!)
  const ways = [after, before].sort((x, y) => Number(still(y)) - Number(still(x)))
  return ways.find(fits) ?? null
}

/** The spot a share of the way along a route, by its length. */
export const pointAlong = (route: Point[], t: number): Point => {
  const lengths = route.slice(1).map((q, i) => Math.hypot(q.x - route[i]!.x, q.y - route[i]!.y))
  let left = lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, t))
  for (const [i, length] of lengths.entries()) {
    if (left <= length || i === lengths.length - 1) {
      const p = route[i]!
      const q = route[i + 1]!
      const by = length ? Math.min(1, left / length) : 0
      return { x: p.x + (q.x - p.x) * by, y: p.y + (q.y - p.y) * by }
    }
    left -= length
  }
  return route[0] ?? { x: 0, y: 0 }
}

/** The path a route is drawn as, its corners a little rounded. */
export const pathOf = (route: Point[], round = 6): string => {
  if (route.length < 2) return ''
  const parts = [`M ${route[0]!.x} ${route[0]!.y}`]
  for (let i = 1; i < route.length - 1; i++) {
    const p = route[i - 1]!
    const c = route[i]!
    const n = route[i + 1]!
    const r = Math.min(round, Math.hypot(c.x - p.x, c.y - p.y) / 2, Math.hypot(n.x - c.x, n.y - c.y) / 2)
    const inTo = (from: Point): Point => {
      const d = Math.hypot(from.x - c.x, from.y - c.y) || 1
      return { x: c.x + ((from.x - c.x) / d) * r, y: c.y + ((from.y - c.y) / d) * r }
    }
    const before = inTo(p)
    const after = inTo(n)
    parts.push(`L ${before.x} ${before.y}`, `Q ${c.x} ${c.y} ${after.x} ${after.y}`)
  }
  const end = route.at(-1)!
  parts.push(`L ${end.x} ${end.y}`)
  return parts.join(' ')
}

/** A right-angle line from one spot to another, for a wire being drawn: across,
 *  down, and across again. */
export const squareBetween = (a: Point, b: Point): string =>
  pathOf(tidy([a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b]))

/** A route whose two ends are drawn in to meet a card's real outline, for a
 *  card that is not a plain box, such as a person. Each end moves only along
 *  the piece it is on, so the piece still runs straight across or down. */
export const toOutlines = (route: Point[], outlines: { from?: { d: string; box: Box }; to?: { d: string; box: Box } }): Point[] => {
  if (route.length < 2) return route
  const meet = (end: Point, next: Point, outline: { d: string; box: Box } | undefined): Point => {
    if (!outline) return end
    const { box } = outline
    const length = Math.hypot(next.x - end.x, next.y - end.y)
    if (length < 0.01) return end
    // Inward is away from where the piece runs.
    const dir = { x: (end.x - next.x) / length, y: (end.y - next.y) / length }
    let best = Infinity
    for (const polygon of polygonsOf(outline.d)) {
      const world = polygon.map((p) => ({ x: box.x + (p.x / 100) * box.w, y: box.y + (p.y / 100) * box.h }))
      world.forEach((p, i) => {
        const q = world[(i + 1) % world.length]!
        if (Math.abs(dir.y) < 0.5) {
          if ((p.y - end.y) * (q.y - end.y) > 0 || p.y === q.y) return
          const x = p.x + ((end.y - p.y) * (q.x - p.x)) / (q.y - p.y)
          const t = (x - end.x) * dir.x
          if (t > -0.5 && t < best) best = t
        } else {
          if ((p.x - end.x) * (q.x - end.x) > 0 || p.x === q.x) return
          const y = p.y + ((end.x - p.x) * (q.y - p.y)) / (q.x - p.x)
          const t = (y - end.y) * dir.y
          if (t > -0.5 && t < best) best = t
        }
      })
    }
    // Never further in than the piece is long, nor further than half the card.
    const most = Math.min(length - 1, (Math.abs(dir.x) > 0.5 ? box.w : box.h) / 2)
    return best === Infinity || best > most ? end : { x: end.x + dir.x * best, y: end.y + dir.y * best }
  }
  const out = [...route]
  out[0] = meet(route[0]!, route[1]!, outlines.from)
  out[out.length - 1] = meet(route.at(-1)!, route.at(-2)!, outlines.to)
  return out
}
