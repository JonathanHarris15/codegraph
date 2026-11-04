// codegraph: component annotation-layer
import type { Annotation, AnnotationEnd, Layer } from '../../modules/annotations/index.js'
import { shapeOf } from './annotation-shapes.js'

export type Box = { x: number; y: number; w: number; h: number }

let count = 0
const newId = (): string => `a${Date.now().toString(36)}${(count++).toString(36)}`

/** The layers, with one layer changed. */
const inLayer = (layers: Layer[], layerId: string, change: (layer: Layer) => Layer): Layer[] =>
  layers.map((l) => (l.id === layerId ? change(l) : l))

/** Every annotation changed by one rule, whichever layer it is in. */
const everywhere = (layers: Layer[], change: (a: Annotation) => Annotation | null): Layer[] =>
  layers.map((l) => ({ ...l, items: l.items.flatMap((a) => (change(a) ? [change(a)!] : [])) }))

/** A new layer, put on top and made the one drawn on. */
export const addLayer = (layers: Layer[], name: string): [Layer[], string] => {
  const layer: Layer = { id: newId(), name, shown: true, snaps: true, items: [] }
  return [[...layers, layer], layer.id]
}

export const changeLayer = (layers: Layer[], id: string, change: Partial<Layer>): Layer[] =>
  inLayer(layers, id, (l) => ({ ...l, ...change }))

export const removeLayer = (layers: Layer[], id: string): Layer[] => layers.filter((l) => l.id !== id)

/** A shape put down on a level, centred on a spot, or a line from one end
 *  to the other. Hands back its id. */
export const placeAnnotation = (
  layers: Layer[],
  layerId: string,
  at: string,
  kind: string,
  spot: { x: number; y: number },
  ends?: { from: AnnotationEnd; to: AnnotationEnd },
): [Layer[], string] => {
  const shape = shapeOf(kind)
  const item: Annotation = {
    id: newId(),
    at,
    kind,
    x: Math.round(spot.x - shape.w / 2),
    y: Math.round(spot.y - shape.h / 2),
    w: shape.w,
    h: shape.h,
    text: '',
    color: shape.color ?? '',
    ...(shape.line
      ? { from: ends?.from ?? { x: Math.round(spot.x - shape.w / 2), y: Math.round(spot.y) }, to: ends?.to ?? { x: Math.round(spot.x + shape.w / 2), y: Math.round(spot.y) } }
      : {}),
  }
  return [inLayer(layers, layerId, (l) => ({ ...l, shown: true, items: [...l.items, item] })), item.id]
}

/** Moves and resizes annotations, and says which card each now keeps beside;
 *  none, when it is not near one or its layer does not snap. */
export const placeAt = (
  layers: Layer[],
  moves: Map<string, { box: Box; near?: Annotation['near'] }>,
): Layer[] =>
  everywhere(layers, (a) => {
    const to = moves.get(a.id)
    if (!to) return a
    const { near: _, ...rest } = a
    return {
      ...rest,
      x: Math.round(to.box.x),
      y: Math.round(to.box.y),
      w: Math.max(12, Math.round(to.box.w)),
      h: Math.max(a.from ? 0 : 12, Math.round(to.box.h)),
      ...(to.near ? { near: to.near } : {}),
    }
  })

export const changeAnnotation = (layers: Layer[], id: string, change: Partial<Annotation>): Layer[] =>
  everywhere(layers, (a) => (a.id === id ? { ...a, ...change } : a))

/** Takes annotations away, and lets go of any line end that held one. */
export const removeAnnotations = (layers: Layer[], ids: string[]): Layer[] => {
  const gone = new Set(ids)
  const loose = (end: AnnotationEnd | undefined, fallback: { x: number; y: number }): AnnotationEnd | undefined =>
    end && 'annotation' in end && gone.has(end.annotation) ? fallback : end
  return everywhere(layers, (a) => {
    if (gone.has(a.id)) return null
    if (!a.from) return a
    return { ...a, from: loose(a.from, { x: a.x, y: a.y }), to: loose(a.to, { x: a.x + a.w, y: a.y + a.h }) }
  })
}

/** Copies annotations a little down and across, in the same layers, and
 *  hands back the copies' ids. */
export const duplicateAnnotations = (layers: Layer[], ids: string[], by = 24): [Layer[], string[]] => {
  const made: string[] = []
  const next = layers.map((l) => {
    const copies = l.items
      .filter((a) => ids.includes(a.id))
      .map((a) => {
        const id = newId()
        made.push(id)
        const moved = (end: AnnotationEnd | undefined): AnnotationEnd | undefined =>
          end && 'x' in end ? { x: end.x + by, y: end.y + by } : end
        return { ...a, id, x: a.x + by, y: a.y + by, from: moved(a.from), to: moved(a.to) }
      })
    return { ...l, items: [...l.items, ...copies] }
  })
  return [next, made]
}

/** The layer an annotation is in. */
export const layerOf = (layers: Layer[], id: string): Layer | undefined => layers.find((l) => l.items.some((a) => a.id === id))

/** A card a box sits on or just beside, to keep it there: the one whose
 *  middle is nearest, among those within reach. */
export const nearestCard = (box: Box, cards: { id: string; box: Box }[], reach = 28): { id: string; box: Box } | null => {
  const mid = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
  let best: { id: string; box: Box } | null = null
  let bestGap = Infinity
  for (const card of cards) {
    const c = card.box
    const apart =
      box.x > c.x + c.w + reach || box.x + box.w < c.x - reach || box.y > c.y + c.h + reach || box.y + box.h < c.y - reach
    // A box drawn round several cards keeps to none of them.
    const around = box.x < c.x && box.y < c.y && box.x + box.w > c.x + c.w && box.y + box.h > c.y + c.h
    if (apart || around) continue
    const gap = Math.hypot(mid.x - (c.x + c.w / 2), mid.y - (c.y + c.h / 2))
    if (gap < bestGap) {
      bestGap = gap
      best = card
    }
  }
  return best
}

export type Guides = { x: number[]; y: number[] }

/** Lines a moving box up with others: its edges and middle against theirs,
 *  within a few pixels. Hands back how far to shift it, and the lines it
 *  lines up on. */
export const snapBox = (box: Box, others: Box[], within: number): { dx: number; dy: number; guides: Guides } => {
  const xs = [box.x, box.x + box.w / 2, box.x + box.w]
  const ys = [box.y, box.y + box.h / 2, box.y + box.h]
  let dx = 0
  let dy = 0
  let bestX = within + 1
  let bestY = within + 1
  const guides: Guides = { x: [], y: [] }
  for (const o of others) {
    for (const ox of [o.x, o.x + o.w / 2, o.x + o.w])
      for (const x of xs)
        if (Math.abs(ox - x) < bestX) {
          bestX = Math.abs(ox - x)
          dx = ox - x
          guides.x = [ox]
        }
    for (const oy of [o.y, o.y + o.h / 2, o.y + o.h])
      for (const y of ys)
        if (Math.abs(oy - y) < bestY) {
          bestY = Math.abs(oy - y)
          dy = oy - y
          guides.y = [oy]
        }
  }
  if (bestX > within) {
    dx = 0
    guides.x = []
  }
  if (bestY > within) {
    dy = 0
    guides.y = []
  }
  return { dx, dy, guides }
}

/** Where a line leaves a box toward a spot: the point on its edge. */
export const edgeToward = (b: Box, to: { x: number; y: number }): { x: number; y: number } => {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const dx = to.x - cx
  const dy = to.y - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const sx = dx === 0 ? Infinity : b.w / 2 / Math.abs(dx)
  const sy = dy === 0 ? Infinity : b.h / 2 / Math.abs(dy)
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}
