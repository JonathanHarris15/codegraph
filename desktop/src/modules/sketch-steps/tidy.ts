// codegraph: module sketch-steps
import { isStore, type SketchCard, type SketchWire, type WireSides } from '../sketches/index.js'

/** Which way a tidied level reads: from the top down, or from left to right. */
export type Direction = 'down' | 'right'

type Side = 'n' | 'e' | 's' | 'w'
type Spot = { x: number; y: number }
export type Box = { x: number; y: number; w: number; h: number }

/** How a wire runs once its level is tidied: the sides it leaves and reaches,
 *  where along them, and where it turns. */
export type Routed = { sides: WireSides; along: { from: number; to: number }; bends: Spot[] }

/** A level laid out afresh: where each card goes, how each wire runs, and the
 *  box round all of it, with the room kept beside cards for their notes. */
export type Tidied = { places: Map<string, Spot>; wires: Map<string, Routed>; bounds: Box }

// ---------------------------------------------------------------------------
// How big a card is drawn. The canvas measures the real thing; this is near
// enough to lay a level out, and a route stays square whatever the real size,
// because the canvas joins a wire's ends to its bends at right angles.

const SHAPE_SIZES: Record<string, { w: number; h: number }> = {
  pill: { w: 300, h: 120 },
  circle: { w: 210, h: 210 },
  diamond: { w: 330, h: 210 },
  triangle: { w: 340, h: 230 },
  hexagon: { w: 300, h: 160 },
  parallelogram: { w: 320, h: 130 },
  person: { w: 210, h: 210 },
}

const linesFor = (text: string, width: number, letter: number): number => {
  let lines = 1
  let used = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const wide = word.length * letter
    const next = used ? used + letter + wide : wide
    if (next > width && used) {
      lines += Math.ceil(wide / width)
      used = wide % width
    } else used = next
  }
  return lines
}

const chipRows = (names: string[], inside: number): number => {
  const chips = [...names.slice(0, 6), ...(names.length > 6 ? [`+${names.length - 6}`] : [])]
  let rows = 1
  let used = 0
  for (const chip of chips) {
    const wide = Math.min(chip.length * 7.5 + 30, inside)
    if (used && used + 4 + wide > inside) {
      rows += 1
      used = wide
    } else used = used ? used + 4 + wide : wide
  }
  return rows
}

/** About how big the canvas draws a card on a sketch. */
export const cardSize = (card: SketchCard): { w: number; h: number } => {
  const shape = card.kind === 'person' ? 'person' : card.look?.shape && card.look.shape !== 'square' ? card.look.shape : ''
  if (shape && SHAPE_SIZES[shape]) return SHAPE_SIZES[shape]!
  const chips = (inside: number): number => (card.children.length ? 8 + chipRows(card.children.map((c) => c.name), inside) * 20 : 0)
  if (isStore(card.kind)) {
    const fields = card.fields ?? []
    const lines = Math.min(fields.length, 8) + (fields.length > 8 ? 1 : 0) + (card.others ? 1 : 0)
    const says = card.says ? 5 + Math.min(2, linesFor(card.says, 226, 6.6)) * 17 : 0
    return { w: 260, h: 96 + says + lines * 18 + chips(226) + 28 }
  }
  if (card.level === 'component' && (card.role ?? card.kind) === 'page') return { w: 260, h: 200 }
  if (card.level === 'code') return { w: 240, h: 104 + Math.min(card.names.length, 9) * 18 }
  const wide = card.level === 'system' || card.level === 'container'
  const inside = wide ? 246 : 206
  const says = card.says ? 4 + Math.min(2, linesFor(card.says, inside, 7)) * 17 : 0
  return { w: wide ? 280 : 240, h: Math.max(96, 72 + says + chips(inside) + 32) }
}

/** How wide a wire's sentence runs, as the canvas reckons it. */
const sentenceWidth = (wire: SketchWire): number =>
  Math.min(Math.round((24 + wire.kind.length + (wire.words ? wire.words.length + 4 : 0)) * 6.3 + 20), 260)

// ---------------------------------------------------------------------------
// The layout, in two axes: `main`, the way the level reads (down the page, or
// across it), and `cross`, square to it. Cards sit in ranks along main; each
// wire runs from one rank to a later one, through a gap between ranks, where
// it may turn once to cross over to where it is going.

// The level is laid out with room to spare, so what is wired to what reads
// at a glance: a still level shows no sentences (ADR 0031), so the gaps are
// for air and for the wires' tracks.

/** The air between cards side by side in a rank. */
const CARD_GAP = { down: 150, right: 90 }
/** The air beside a wire passing through a rank, where no card is. */
const PASS_GAP = 32
/** The space between two wires running side by side in a gap. */
const TRACK = 24
/** The least gap between ranks: room for a wire's sentence when it shows. */
const RANK_GAP = { down: 200, right: 220 }
/** The air between a card and its notes. */
const NOTE_AIR = 20
/** The room a frame keeps round the cards it holds, and for its name. */
const FRAME_PAD = 44
const FRAME_TAB = 32

/** A card in the node that holds it: how far across and along the node it
 *  starts, and how wide it is across. */
type Part = { card: string; offset: number; mainAt: number; cross: number }

type Node = {
  id: string
  /** A spot a long wire passes through a rank at, where no card is. */
  pass: boolean
  rank: number
  /** Its size along main, and across, with the room kept for notes and, for
   *  the cards in a frame, round them. */
  main: number
  cross: number
  /** The cards it holds: one, or every card in one frame, side by side. */
  parts: Part[]
  /** Where its middle is across, as the layout goes. */
  at: number
}

/** One piece of a wire from one rank to the next, and the cards at its ends
 *  ('' where it passes through a rank). */
type Link = { upper: string; lower: string; upperCard: string; lowerCard: string; chain: Chain; index: number }
/** A whole wire through the ranks: the node it leaves from, the places it
 *  passes through, and the node it reaches, upper rank first. */
type Chain = { wire: SketchWire; nodes: string[]; topCard: string; bottomCard: string; flipped: boolean }

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** The closest spots to the ones wanted that keep their order and keep apart:
 *  each at least `apart[i]` after the one before (pool-adjacent violators). */
const settle = (wanted: number[], weights: number[], apart: number[]): number[] => {
  const offsets: number[] = []
  let sum = 0
  wanted.forEach((_, i) => {
    if (i) sum += apart[i - 1]!
    offsets.push(sum)
  })
  const blocks: { total: number; weight: number; count: number }[] = []
  wanted.forEach((want, i) => {
    blocks.push({ total: (want - offsets[i]!) * weights[i]!, weight: weights[i]!, count: 1 })
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1]!
      const before = blocks[blocks.length - 2]!
      if (before.total / before.weight <= last.total / last.weight) break
      blocks.pop()
      before.total += last.total
      before.weight += last.weight
      before.count += last.count
    }
  })
  const out: number[] = []
  for (const block of blocks) for (let k = 0; k < block.count; k += 1) out.push(block.total / block.weight + offsets[out.length]!)
  return out
}

/** Lays one level of a sketch out the way a diagram tool would: each card a
 *  rank after what reaches it, the ranks ordered so wires cross as little as
 *  they can, and every wire run at right angles through the gaps between
 *  ranks, each on its own track, so no two lie on top of each other and none
 *  runs through a card. Cards with no wires go in rows after the rest.
 *  `beside` is the room to keep beside a card for its notes: to its right on
 *  a level that reads down, above it on one that reads right. The cards in
 *  each of `groups`, a frame's, sit side by side in one rank, so the frame
 *  round them holds nothing else. */
export const tidyLevel = (
  level: SketchCard,
  direction: Direction,
  beside: Map<string, { w: number; h: number }> = new Map(),
  groups: string[][] = [],
): Tidied => {
  const down = direction === 'down'
  const cards = level.children
  const byId = new Map(cards.map((card) => [card.id, card]))
  const wires = level.wires.filter((w) => w.from !== w.to && byId.has(w.from) && byId.has(w.to))

  // Where the cards were, so the tidied level reads in roughly the same order.
  const was = (card: SketchCard, axis: 'main' | 'cross'): number => {
    const value = (down ? axis === 'main' : axis === 'cross') ? card.y : card.x
    return value ?? cards.indexOf(card) * 300
  }

  /** A card with its notes beside it: how much room across and along. */
  const slotOf = (card: SketchCard): { cross: number; main: number; cardAt: number; cardCross: number } => {
    const size = cardSize(card)
    const note = beside.get(card.id)
    const cardCross = down ? size.w : size.h
    const noteCross = note ? NOTE_AIR + (down ? note.w : note.h) : 0
    return {
      cross: cardCross + noteCross,
      main: down ? Math.max(size.h, note?.h ?? 0) : Math.max(size.w, note?.w ?? 0),
      // Notes go after the card on a level that reads down, before it on one
      // that reads right: always out of the way of the wires.
      cardAt: down ? 0 : noteCross,
      cardCross,
    }
  }

  // Each frame's cards make one node, laid side by side inside the frame.
  const nodeOf = new Map<string, string>()
  const nodes = new Map<string, Node>()
  groups.forEach((group, g) => {
    const members = [...new Set(group)].filter((id) => byId.has(id) && !nodeOf.has(id)).map((id) => byId.get(id)!)
    if (members.length < 2) return
    members.sort((a, b) => was(a, 'cross') - was(b, 'cross'))
    const id = `group:${g}`
    const slots = members.map(slotOf)
    const inner = Math.max(...slots.map((s) => s.main))
    const mainBefore = FRAME_PAD + (down ? FRAME_TAB : 0)
    let across = FRAME_PAD + (down ? 0 : FRAME_TAB)
    const parts = members.map((card, i) => {
      const slot = slots[i]!
      const part = { card: card.id, offset: across + slot.cardAt, mainAt: mainBefore + (inner - slot.main) / 2, cross: slot.cardCross }
      across += slot.cross + CARD_GAP[direction]
      nodeOf.set(card.id, id)
      return part
    })
    nodes.set(id, { id, pass: false, rank: 0, main: inner + mainBefore + FRAME_PAD, cross: across - CARD_GAP[direction] + FRAME_PAD, parts, at: 0 })
  })
  for (const card of cards) {
    if (nodeOf.has(card.id)) continue
    const slot = slotOf(card)
    nodeOf.set(card.id, card.id)
    nodes.set(card.id, { id: card.id, pass: false, rank: 0, main: slot.main, cross: slot.cross, parts: [{ card: card.id, offset: slot.cardAt, mainAt: 0, cross: slot.cardCross }], at: 0 })
  }
  const holders = [...nodes.values()]
  const wasNode = (node: Node, axis: 'main' | 'cross'): number => {
    const values = node.parts.map((p) => was(byId.get(p.card)!, axis))
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  // Wires between two cards in one frame run straight across inside it.
  const inside = wires.filter((w) => nodeOf.get(w.from) === nodeOf.get(w.to))
  const between = wires.filter((w) => nodeOf.get(w.from) !== nodeOf.get(w.to))

  // 1. Turn round the fewest wires that run back against the flow, so it has
  //    none: cards that only reach go first, cards only reached go last, and
  //    of the rest, the card that reaches most more than it is reached.
  const fromOf = (w: SketchWire): string => nodeOf.get(w.from)!
  const toOf = (w: SketchWire): string => nodeOf.get(w.to)!
  const byWas = [...holders].sort((a, b) => wasNode(a, 'main') - wasNode(b, 'main') || wasNode(a, 'cross') - wasNode(b, 'cross')).map((n) => n.id)
  const alive = new Set(byWas)
  const head: string[] = []
  const tail: string[] = []
  const count = (id: string, end: 'in' | 'out'): number =>
    between.filter((w) => (end === 'out' ? fromOf(w) === id && alive.has(toOf(w)) : toOf(w) === id && alive.has(fromOf(w)))).length
  while (alive.size) {
    let took = true
    while (took) {
      took = false
      for (const id of [...alive].reverse())
        if (count(id, 'out') === 0) {
          tail.unshift(id)
          alive.delete(id)
          took = true
        }
      for (const id of [...alive])
        if (count(id, 'in') === 0) {
          head.push(id)
          alive.delete(id)
          took = true
        }
    }
    if (!alive.size) break
    const pick = [...alive].reduce((a, b) => (count(b, 'out') - count(b, 'in') > count(a, 'out') - count(a, 'in') ? b : a))
    head.push(pick)
    alive.delete(pick)
  }
  const flowAt = new Map([...head, ...tail].map((id, i) => [id, i]))
  const flipped = new Set(between.filter((w) => flowAt.get(fromOf(w))! > flowAt.get(toOf(w))!))

  // The order cards are first met in, walking the flow, for each rank to
  // start from.
  const outOf = new Map<string, SketchWire[]>()
  for (const wire of between) {
    const [from] = flipped.has(wire) ? [toOf(wire)] : [fromOf(wire)]
    outOf.set(from, [...(outOf.get(from) ?? []), wire])
  }
  const walked = new Set<string>()
  const visitOrder: string[] = []
  const walk = (id: string): void => {
    walked.add(id)
    visitOrder.push(id)
    const next = (outOf.get(id) ?? []).map((w) => (flipped.has(w) ? fromOf(w) : toOf(w)))
    next.sort((a, b) => wasNode(nodes.get(a)!, 'cross') - wasNode(nodes.get(b)!, 'cross'))
    for (const to of next) if (!walked.has(to)) walk(to)
  }
  for (const id of head) if (!walked.has(id)) walk(id)
  for (const id of tail) if (!walked.has(id)) walk(id)

  const edges = between.map((wire) => {
    const [fromCard, toCard] = flipped.has(wire) ? [wire.to, wire.from] : [wire.from, wire.to]
    return { wire, from: nodeOf.get(fromCard)!, to: nodeOf.get(toCard)!, fromCard, toCard, flipped: flipped.has(wire) }
  })
  const wired = new Set(edges.flatMap((e) => [e.from, e.to]))

  // 2. Ranks: each card one after the furthest thing reaching it; then a card
  //    nothing reaches moves down to just before the first thing it reaches.
  const ins = new Map<string, string[]>()
  const outs = new Map<string, string[]>()
  for (const e of edges) {
    ins.set(e.to, [...(ins.get(e.to) ?? []), e.from])
    outs.set(e.from, [...(outs.get(e.from) ?? []), e.to])
  }
  const rank = new Map<string, number>()
  const left = new Map([...wired].map((id) => [id, (ins.get(id) ?? []).length]))
  const ready = [...wired].filter((id) => left.get(id) === 0)
  while (ready.length) {
    const id = ready.shift()!
    rank.set(id, Math.max(0, ...(ins.get(id) ?? []).map((from) => rank.get(from)! + 1)))
    for (const to of outs.get(id) ?? []) {
      left.set(to, left.get(to)! - 1)
      if (left.get(to) === 0) ready.push(to)
    }
  }
  for (let pass = 0, moved = true; moved && pass < holders.length; pass += 1) {
    moved = false
    for (const id of wired) {
      if ((ins.get(id) ?? []).length) continue
      const want = Math.min(...(outs.get(id) ?? []).map((to) => rank.get(to)!)) - 1
      if (want > rank.get(id)!) {
        rank.set(id, want)
        moved = true
      }
    }
  }
  for (const [id, r] of rank) nodes.get(id)!.rank = r
  const ranks = wired.size ? Math.max(...rank.values()) + 1 : 0

  // 3. A wire across more than one gap passes through the ranks between at a
  //    spot of its own, so it can be routed round the cards there.
  const chains: Chain[] = []
  const links: Link[] = []
  let passes = 0
  for (const e of edges) {
    const from = rank.get(e.from)!
    const to = rank.get(e.to)!
    const ids = [e.from]
    for (let r = from + 1; r < to; r += 1) {
      const id = `pass:${(passes += 1)}`
      nodes.set(id, { id, pass: true, rank: r, main: 0, cross: 0, parts: [], at: 0 })
      ids.push(id)
    }
    ids.push(e.to)
    const chain: Chain = { wire: e.wire, nodes: ids, topCard: e.fromCard, bottomCard: e.toCard, flipped: e.flipped }
    chains.push(chain)
    for (let i = 0; i + 1 < ids.length; i += 1)
      links.push({ upper: ids[i]!, lower: ids[i + 1]!, upperCard: i === 0 ? e.fromCard : '', lowerCard: i + 2 === ids.length ? e.toCard : '', chain, index: i })
  }
  const up = new Map<string, Link[]>()
  const below = new Map<string, Link[]>()
  for (const link of links) {
    below.set(link.upper, [...(below.get(link.upper) ?? []), link])
    up.set(link.lower, [...(up.get(link.lower) ?? []), link])
  }

  // 4. The order in each rank, so wires cross as little as they can: each
  //    rank sorted by where what it is wired to sits, down and back up, with
  //    neighbours swapped where that helps, keeping the best order seen.
  let layers: string[][] = Array.from({ length: ranks }, () => [])
  const firstSeen = new Map<string, number>()
  visitOrder.forEach((id, i) => firstSeen.set(id, i))
  for (const chain of chains) chain.nodes.forEach((id) => firstSeen.has(id) || firstSeen.set(id, firstSeen.get(chain.nodes[0]!)! + 0.5))
  for (const node of nodes.values()) if (wired.has(node.id) || node.pass) layers[node.rank]!.push(node.id)
  for (const layer of layers) layer.sort((a, b) => firstSeen.get(a)! - firstSeen.get(b)!)

  /** Where along a frame's node the card at one end of a piece sits, as a
   *  share of a place in the rank, so the order knows which card it reaches. */
  const shareOf = new Map<string, number>()
  for (const node of nodes.values())
    if (node.parts.length > 1) for (const part of node.parts) shareOf.set(`${node.id}|${part.card}`, ((part.offset + part.cross / 2) / node.cross - 0.5) * 0.9)
  const endAt = (link: Link, end: 'upper' | 'lower', at: Map<string, number>): number =>
    at.get(link[end])! + (shareOf.get(`${link[end]}|${end === 'upper' ? link.upperCard : link.lowerCard}`) ?? 0)
  const indexOf = (order: string[][]): Map<string, number> => new Map(order.flatMap((layer) => layer.map((id, i) => [id, i] as const)))
  const crossingsBetween = (order: string[][], r: number, at = indexOf(order)): number => {
    const pairs = order[r]!.flatMap((id) => (below.get(id) ?? []).map((l) => [endAt(l, 'upper', at), endAt(l, 'lower', at)] as const))
    let count = 0
    for (let i = 0; i < pairs.length; i += 1)
      for (let j = i + 1; j < pairs.length; j += 1) if ((pairs[i]![0] - pairs[j]![0]) * (pairs[i]![1] - pairs[j]![1]) < 0) count += 1
    return count
  }
  const crossings = (order: string[][]): number => {
    const at = indexOf(order)
    let sum = 0
    for (let r = 0; r + 1 < order.length; r += 1) sum += crossingsBetween(order, r, at)
    return sum
  }
  /** Crossings among the wires of two neighbours in a rank, with `a` first,
   *  towards the rank before or after. */
  const pairCrossings = (a: string, b: string, at: Map<string, number>, towards: 'upper' | 'lower'): number => {
    const ends = (id: string): number[] => (towards === 'upper' ? up.get(id) ?? [] : below.get(id) ?? []).map((l) => endAt(l, towards, at))
    let count = 0
    for (const x of ends(a)) for (const y of ends(b)) if (x > y) count += 1
    return count
  }
  // A seeded shuffle, so the same sketch always tidies the same way.
  let seed = 7
  const random = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const starts = [
    layers.map((layer) => [...layer]),
    layers.map((layer) => [...layer].reverse()),
    ...Array.from({ length: links.length > 300 ? 0 : 4 }, () => layers.map((layer) => [...layer].sort(() => random() - 0.5))),
  ]
  let best = layers.map((layer) => [...layer])
  let fewest = crossings(best)
  for (const start of starts) {
    if (fewest === 0) break
    layers = start
    for (let sweep = 0; sweep < 24 && fewest > 0; sweep += 1) {
      const goingDown = sweep % 2 === 0
      const at = indexOf(layers)
      const rs = goingDown ? [...Array(ranks).keys()].slice(1) : [...Array(ranks).keys()].reverse().slice(1)
      for (const r of rs) {
        const layer = layers[r]!
        const bary = new Map(
          layer.map((id) => {
            const near = goingDown ? (up.get(id) ?? []).map((l) => endAt(l, 'upper', at)) : (below.get(id) ?? []).map((l) => endAt(l, 'lower', at))
            return [id, near.length ? near.reduce((s, v) => s + v, 0) / near.length : at.get(id)!] as const
          }),
        )
        layer.sort((a, b) => bary.get(a)! - bary.get(b)!)
        layer.forEach((id, i) => at.set(id, i))
      }
      // Swap neighbours while it takes crossings away.
      for (let improved = true, rounds = 0; improved && rounds < 8; rounds += 1) {
        improved = false
        for (let r = 0; r < ranks; r += 1) {
          const layer = layers[r]!
          for (let i = 0; i + 1 < layer.length; i += 1) {
            const a = layer[i]!
            const b = layer[i + 1]!
            const now = pairCrossings(a, b, at, 'upper') + pairCrossings(a, b, at, 'lower')
            const swapped = pairCrossings(b, a, at, 'upper') + pairCrossings(b, a, at, 'lower')
            if (swapped < now) {
              layer[i] = b
              layer[i + 1] = a
              at.set(a, i + 1)
              at.set(b, i)
              improved = true
            }
          }
        }
      }
      const count = crossings(layers)
      if (count < fewest) {
        fewest = count
        best = layers.map((layer) => [...layer])
      }
    }
  }
  layers = best

  // 5. Where each sits across: as level as it can be with what it is wired to,
  //    in its order, kept apart. A wire's ends are spread along a card's side
  //    in the order of where they go, so they do not cross at the card.
  const gapBetween = (a: Node, b: Node): number => (a.pass && b.pass ? TRACK : a.pass || b.pass ? PASS_GAP : CARD_GAP[direction])
  const apartIn = (layer: string[]): number[] =>
    layer.slice(1).map((id, i) => {
      const a = nodes.get(layer[i]!)!
      const b = nodes.get(id)!
      return a.cross / 2 + b.cross / 2 + gapBetween(a, b)
    })
  for (const layer of layers) {
    const apart = apartIn(layer)
    let at = 0
    layer.forEach((id, i) => {
      if (i) at += apart[i - 1]!
      nodes.get(id)!.at = at
    })
  }

  /** Where each end of each piece meets its card, across, from the middle of
   *  the node that holds the card. */
  const portOf = new Map<Link, { upper: number; lower: number }>()
  const spreadPorts = (): void => {
    for (const link of links) if (!portOf.has(link)) portOf.set(link, { upper: 0, lower: 0 })
    for (const node of nodes.values()) {
      for (const part of node.parts) {
        const middle = part.offset + part.cross / 2 - node.cross / 2
        for (const [ends, towards] of [
          [(below.get(node.id) ?? []).filter((l) => l.upperCard === part.card), 'lower'],
          [(up.get(node.id) ?? []).filter((l) => l.lowerCard === part.card), 'upper'],
        ] as const) {
          const sorted = [...ends].sort((a, b) => nodes.get(a[towards])!.at + portOf.get(a)![towards] - (nodes.get(b[towards])!.at + portOf.get(b)![towards]))
          sorted.forEach((link, i) => {
            portOf.get(link)![towards === 'lower' ? 'upper' : 'lower'] = middle + ((i + 1) / (sorted.length + 1) - 0.5) * part.cross
          })
        }
      }
    }
  }
  spreadPorts()

  const place = (r: number, use: 'upper' | 'lower' | 'both'): void => {
    const layer = layers[r]!
    const wanted: number[] = []
    const weights: number[] = []
    for (const id of layer) {
      const node = nodes.get(id)!
      const near: number[] = []
      if (use !== 'lower')
        for (const link of up.get(id) ?? []) near.push(nodes.get(link.upper)!.at + portOf.get(link)!.upper - portOf.get(link)!.lower)
      if (use !== 'upper')
        for (const link of below.get(id) ?? []) near.push(nodes.get(link.lower)!.at + portOf.get(link)!.lower - portOf.get(link)!.upper)
      wanted.push(near.length ? median(near) : node.at)
      // A wire passing through holds its line hardest, so long wires run
      // straight; a card with nothing on this side barely minds.
      weights.push(near.length ? (node.pass ? 8 : 1 + near.length / 2) : 0.05)
    }
    const spots = settle(wanted, weights, apartIn(layer))
    layer.forEach((id, i) => (nodes.get(id)!.at = spots[i]!))
  }
  for (let round = 0; round < 6; round += 1) {
    for (let r = 1; r < ranks; r += 1) place(r, 'upper')
    for (let r = ranks - 2; r >= 0; r -= 1) place(r, 'lower')
    if (round >= 2) for (let r = 0; r < ranks; r += 1) place(r, 'both')
    spreadPorts()
  }
  for (let r = 1; r < ranks; r += 1) place(r, 'upper')
  spreadPorts()

  // 6. Each gap between ranks: every piece of wire that crosses over in it gets
  //    a track of its own, ordered so pieces cross each other as little as
  //    they can, and the gap is as deep as its tracks and sentences need.
  type Piece = { link: Link; from: number; to: number; track: number }
  const piecesIn: Piece[][] = Array.from({ length: Math.max(0, ranks - 1) }, () => [])
  const crossAt = (link: Link, end: 'upper' | 'lower'): number => nodes.get(link[end])!.at + portOf.get(link)![end]
  for (const link of links) piecesIn[nodes.get(link.upper)!.rank]!.push({ link, from: crossAt(link, 'upper'), to: crossAt(link, 'lower'), track: -1 })
  const tracksIn = piecesIn.map((pieces) => {
    const turning = pieces.filter((p) => Math.abs(p.from - p.to) >= 1)
    const span = (p: Piece): [number, number] => [Math.min(p.from, p.to), Math.max(p.from, p.to)]
    const overlap = (a: Piece, b: Piece): boolean => {
      const [a0, a1] = span(a)
      const [b0, b1] = span(b)
      return a0 < b1 + TRACK && b0 < a1 + TRACK
    }
    const within = (x: number, p: Piece): boolean => x > span(p)[0] && x < span(p)[1]
    // a above b crosses b where b comes down past a's track, and a where a
    // goes on down past b's.
    const costAbove = (a: Piece, b: Piece): number => (within(b.from, a) ? 1 : 0) + (within(a.to, b) ? 1 : 0)
    // Which of each two overlapping pieces goes above the other: the choices
    // that save the most crossings first, and none that would undo one made.
    const choices: { hi: Piece; lo: Piece; saves: number }[] = []
    for (let i = 0; i < turning.length; i += 1)
      for (let j = i + 1; j < turning.length; j += 1) {
        const a = turning[i]!
        const b = turning[j]!
        if (!overlap(a, b)) continue
        const ab = costAbove(a, b)
        const ba = costAbove(b, a)
        choices.push(ab <= ba ? { hi: a, lo: b, saves: ba - ab } : { hi: b, lo: a, saves: ab - ba })
      }
    choices.sort((x, y) => y.saves - x.saves)
    const above = new Map<Piece, Piece[]>()
    const isAbove = (hi: Piece, lo: Piece, seen = new Set<Piece>()): boolean => {
      if (hi === lo) return true
      seen.add(lo)
      return (above.get(lo) ?? []).some((next) => !seen.has(next) && isAbove(hi, next, seen))
    }
    for (const { hi, lo } of choices) {
      if (isAbove(lo, hi)) continue
      above.set(lo, [...(above.get(lo) ?? []), hi])
    }
    // Each piece one track below every piece that must be above it.
    const trackOf = (p: Piece): number => {
      if (p.track >= 0) return p.track
      p.track = Math.max(0, ...(above.get(p) ?? []).map((hi) => trackOf(hi) + 1))
      return p.track
    }
    turning.forEach(trackOf)
    return turning.length ? Math.max(...turning.map((p) => p.track)) + 1 : 0
  })
  const widestSentence = piecesIn.map((pieces) => Math.max(0, ...pieces.map((p) => sentenceWidth(p.link.chain.wire))))
  const gaps = tracksIn.map((tracks, r) =>
    down ? Math.max(RANK_GAP.down, 120 + tracks * TRACK) : Math.min(Math.max(RANK_GAP.right, widestSentence[r]! + 80 + tracks * TRACK), 440 + tracks * TRACK),
  )

  // 7. Where each rank starts along main, each node centred in its rank.
  const rankSize = layers.map((layer) => Math.max(0, ...layer.map((id) => nodes.get(id)!.main)))
  const rankStart: number[] = []
  let along = 0
  for (let r = 0; r < ranks; r += 1) {
    rankStart.push(along)
    along += rankSize[r]! + (gaps[r] ?? 0)
  }
  const trackAt = (r: number, track: number): number => {
    const top = rankStart[r]! + rankSize[r]!
    const used = (tracksIn[r]! - 1) * TRACK
    return top + (gaps[r]! - used) / 2 + track * TRACK
  }
  const mainStart = new Map<string, number>()
  for (const node of nodes.values()) if (wired.has(node.id)) mainStart.set(node.id, rankStart[node.rank]! + (rankSize[node.rank]! - node.main) / 2)

  // 8. Cards with no wires, in rows after the rest, four to a row.
  const loose = holders.filter((node) => !wired.has(node.id)).sort((a, b) => wasNode(a, 'main') - wasNode(b, 'main') || wasNode(a, 'cross') - wasNode(b, 'cross'))
  const crossMin = Math.min(0, ...[...nodes.values()].filter((n) => wired.has(n.id) || n.pass).map((n) => n.at - n.cross / 2))
  let rowStart = ranks ? along - (gaps[ranks - 1] ?? 0) + RANK_GAP[direction] : 0
  for (let i = 0; i < loose.length; i += 4) {
    const row = loose.slice(i, i + 4)
    let at = crossMin
    for (const node of row) {
      node.at = at + node.cross / 2
      at += node.cross + CARD_GAP[direction]
    }
    const deep = Math.max(...row.map((n) => n.main))
    for (const node of row) mainStart.set(node.id, rowStart + (deep - node.main) / 2)
    rowStart += deep + CARD_GAP[direction]
  }

  // 9. Into the level's own space.
  const toSpot = (main: number, cross: number): Spot => (down ? { x: cross, y: main } : { x: main, y: cross })
  const places = new Map<string, Spot>()
  const boxes: Box[] = []
  for (const node of holders) {
    const start = mainStart.get(node.id)!
    const roomAt = node.at - node.cross / 2
    for (const part of node.parts) places.set(part.card, toSpot(start + part.mainAt, roomAt + part.offset))
    const spot = toSpot(start, roomAt)
    boxes.push(down ? { ...spot, w: node.cross, h: node.main } : { ...spot, w: node.main, h: node.cross })
  }

  const sideBefore: Side = down ? 'n' : 'w'
  const sideAfter: Side = down ? 's' : 'e'
  const routed = new Map<string, Routed>()
  const shareOn = (node: Node, card: string, offset: number): number => {
    const part = node.parts.find((p) => p.card === card)!
    const cardStart = node.at - node.cross / 2 + part.offset
    return Math.round(((node.at + offset - cardStart) / part.cross) * 1000) / 1000
  }
  for (const chain of chains) {
    const chainLinks = links.filter((l) => l.chain === chain).sort((a, b) => a.index - b.index)
    const first = chainLinks[0]!
    const last = chainLinks[chainLinks.length - 1]!
    const bends: Spot[] = []
    for (const link of chainLinks) {
      const r = nodes.get(link.upper)!.rank
      const piece = piecesIn[r]!.find((p) => p.link === link)!
      if (piece.track < 0) continue
      const main = trackAt(r, piece.track)
      bends.push(toSpot(main, piece.from), toSpot(main, piece.to))
    }
    // A wire that runs straight is pinned in the first gap all the same, so it
    // stays straight where the canvas draws the card a little off.
    if (!bends.length) {
      const r = nodes.get(first.upper)!.rank
      bends.push(toSpot(rankStart[r]! + rankSize[r]! + gaps[r]! / 2, crossAt(first, 'upper')))
    }
    const topShare = shareOn(nodes.get(first.upper)!, chain.topCard, portOf.get(first)!.upper)
    const bottomShare = shareOn(nodes.get(last.lower)!, chain.bottomCard, portOf.get(last)!.lower)
    const rounded = bends.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y) }))
    routed.set(
      chain.wire.id,
      chain.flipped
        ? { sides: { from: sideBefore, to: sideAfter }, along: { from: bottomShare, to: topShare }, bends: rounded.reverse() }
        : { sides: { from: sideAfter, to: sideBefore }, along: { from: topShare, to: bottomShare }, bends: rounded },
    )
  }
  // Inside a frame, a wire runs straight across from one card to the next.
  for (const wire of inside) {
    const node = nodes.get(nodeOf.get(wire.from)!)!
    const ahead = node.parts.findIndex((p) => p.card === wire.from) < node.parts.findIndex((p) => p.card === wire.to)
    const [leaves, arrives]: [Side, Side] = down ? (ahead ? ['e', 'w'] : ['w', 'e']) : ahead ? ['s', 'n'] : ['n', 's']
    routed.set(wire.id, { sides: { from: leaves, to: arrives }, along: { from: 0.5, to: 0.5 }, bends: [] })
  }

  // 10. Round whole numbers, kept where the level was, or round the middle.
  const bounds = boxes.length
    ? (() => {
        const x = Math.min(...boxes.map((b) => b.x))
        const y = Math.min(...boxes.map((b) => b.y))
        return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y }
      })()
    : { x: 0, y: 0, w: 0, h: 0 }
  const placedBefore = cards.filter((c) => c.x !== undefined && c.y !== undefined)
  const to = placedBefore.length
    ? { x: Math.min(...placedBefore.map((c) => c.x!)), y: Math.min(...placedBefore.map((c) => c.y!)) }
    : { x: -bounds.w / 2, y: -bounds.h / 2 }
  const dx = Math.round(to.x - bounds.x)
  const dy = Math.round(to.y - bounds.y)
  const shift = (s: Spot): Spot => ({ x: Math.round(s.x + dx), y: Math.round(s.y + dy) })
  for (const [id, spot] of places) places.set(id, shift(spot))
  for (const route of routed.values()) route.bends = route.bends.map(shift)
  return { places, wires: routed, bounds: { x: Math.round(bounds.x + dx), y: Math.round(bounds.y + dy), w: Math.round(bounds.w), h: Math.round(bounds.h) } }
}
