// codegraph: component annotation-layer
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactElement } from 'react'
import type { Annotation, AnnotationEnd, Layer } from '../../modules/annotations/index.js'
import {
  addPointer,
  changeAnnotation,
  duplicateAnnotations,
  holdPointers,
  linePath,
  movePointer,
  nearestCard,
  placeAnnotation,
  placeAt,
  pointerOut,
  removeAnnotations,
  removePointer,
  snapBox,
  type Box,
  type Guides,
  type Side,
} from './annotation-edits.js'
import { shapeOf, type AnnotationShape } from './annotation-shapes.js'
import { meetOutline, seamFacing, seamOf, seamsOf, textAreaOf, type Seam } from './shape-outline.js'

type Spot = { x: number; y: number }
type Card = { id: string; box: Box; d?: string }

/** One annotation as drawn now: where it sits on the board, and for a line,
 *  its two ends. */
export type Drawn = {
  a: Annotation
  layer: Layer
  box: Box
  ends?: [Spot, Spot]
  /** Which seam each end of a line holds; none for a loose end. */
  ways?: [Seam | null, Seam | null]
}

const inBox = (p: Spot, b: Box): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h

/** Every annotation of the shown layers on one level, where it sits on the
 *  board: beside the card it keeps to, if that card is here, or where it was
 *  put. A line runs between whatever its ends hold. */
export const drawnOn = (layers: Layer[], level: string, shift: Spot, cards: Card[], moved?: Map<string, Box>): Drawn[] => {
  const cardBox = new Map(cards.map((c) => [c.id, c]))
  const boxes: Drawn[] = []
  for (const layer of layers) {
    if (!layer.shown) continue
    for (const a of layer.items) {
      if (a.at !== level || a.from) continue
      const near = a.near ? cardBox.get(a.near.card)?.box : undefined
      const box = moved?.get(a.id) ?? (near
        ? { x: near.x + a.near!.dx, y: near.y + a.near!.dy, w: a.w, h: a.h }
        : { x: a.x + shift.x, y: a.y + shift.y, w: a.w, h: a.h })
      boxes.push({ a, layer, box })
    }
  }
  const annoAt = new Map(boxes.map((d) => [d.a.id, d]))
  const outlineAt = (end: { card: string } | { annotation: string }): { box: Box; d: string } | null => {
    if ('card' in end) {
      const card = cardBox.get(end.card)
      return card ? { box: card.box, d: card.d ?? '' } : null
    }
    const held = annoAt.get(end.annotation)
    return held ? { box: held.box, d: shapeOf(held.a.kind).d } : null
  }
  /** Where a line's end sits: on the seam it holds, else the one facing the
   *  other end. Asked with nothing to face, the middle of what it holds. */
  const point = (end: AnnotationEnd | undefined, loose: Box | undefined, toward: Spot | null): Spot | null => {
    if (!end) return null
    if ('x' in end) return loose ? { x: loose.x, y: loose.y } : { x: end.x + shift.x, y: end.y + shift.y }
    const held = outlineAt(end)
    if (!held) return null
    if (end.seam) return seamOf(held.d, held.box, end.seam)
    return toward ? seamOf(held.d, held.box, seamFacing(held.box, toward)) : { x: held.box.x + held.box.w / 2, y: held.box.y + held.box.h / 2 }
  }
  for (const layer of layers) {
    if (!layer.shown) continue
    for (const a of layer.items) {
      if (a.at !== level || !a.from) continue
      const looseFrom = moved?.get(`${a.id}:from`)
      const looseTo = moved?.get(`${a.id}:to`)
      const roughFrom = point(a.from, looseFrom, null)
      const roughTo = point(a.to, looseTo, null)
      if (!roughFrom || !roughTo) continue
      const from = point(a.from, looseFrom, roughTo)!
      const to = point(a.to, looseTo, roughFrom)!
      const wayOf = (end: AnnotationEnd | undefined, other: Spot): Seam | null => {
        if (!end || 'x' in end) return null
        if (end.seam) return end.seam
        const held = outlineAt(end)
        return held ? seamFacing(held.box, other) : null
      }
      const box = {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        w: Math.abs(to.x - from.x),
        h: Math.abs(to.y - from.y),
      }
      boxes.push({ a, layer, box, ends: [from, to], ways: [wayOf(a.from, to), wayOf(a.to, from)] })
    }
  }
  return boxes
}

const inReach = (p: Spot, b: Box, reach: number): boolean => inBox(p, { x: b.x - reach, y: b.y - reach, w: b.w + reach * 2, h: b.h + reach * 2 })

/** What a line's end lands on: an annotation, a card if its layer snaps, or a
 *  frame behind them. Dropped by one of its seams, it holds that seam; dropped
 *  elsewhere on it, whichever seam faces the other end. */
export const endLanding = (
  at: Spot,
  not: string,
  snaps: boolean,
  cards: Card[],
  drawn: Drawn[],
  k: number,
): { end: Exclude<AnnotationEnd, { x: number }>; box: Box; d: string } | null => {
  const reach = 10 / k
  const onAnno = (behind: boolean): Drawn | undefined =>
    [...drawn].reverse().find((d) => d.a.id !== not && !d.a.from && Boolean(shapeOf(d.a.kind).behind) === behind && inReach(at, d.box, reach))
  const seamNear = (d: string, box: Box): Seam | undefined =>
    seamsOf(d, box).find((one) => Math.hypot(one.at.x - at.x, one.at.y - at.y) < 24 / k)?.seam
  const shape = onAnno(false)
  if (shape) {
    const d = shapeOf(shape.a.kind).d
    const seam = seamNear(d, shape.box)
    return { end: { annotation: shape.a.id, ...(seam ? { seam } : {}) }, box: shape.box, d }
  }
  const card = snaps ? cards.find((c) => inReach(at, c.box, reach)) : undefined
  if (card) {
    const seam = seamNear(card.d ?? '', card.box)
    return { end: { card: card.id, ...(seam ? { seam } : {}) }, box: card.box, d: card.d ?? '' }
  }
  const frame = onAnno(true)
  if (frame) {
    const d = shapeOf(frame.a.kind).d
    const seam = seamNear(d, frame.box)
    return { end: { annotation: frame.a.id, ...(seam ? { seam } : {}) }, box: frame.box, d }
  }
  return null
}

/** The four places on a shape a line can hold, shown as a line's end comes near. */
const SeamDots = ({ box, d, at, k }: { box: Box; d: string; at: Spot; k: number }): ReactElement => (
  <>
    {seamsOf(d, box).map((one) => (
      <circle
        key={one.seam}
        cx={one.at.x}
        cy={one.at.y}
        r={5 / k}
        className={Math.hypot(one.at.x - at.x, one.at.y - at.y) < 24 / k ? 'map-anno-seam map-anno-seam--on' : 'map-anno-seam'}
      />
    ))}
  </>
)

/** Where a shape's words go, as shares of its box. */
const wordsAreaOf = (kind: AnnotationShape): { x: number; y: number; w: number; h: number } =>
  kind.text ?? (kind.d ? textAreaOf(kind.d) : { x: 0, y: 0, w: 1, h: 1 })

/** How thick a strip is: the same at any size, so a code block's header and
 *  a swimlane's side stay a header and a side however far they are pulled. */
export const STRIP = 22

/** Where a shape's words sit inside it, in pixels, keeping clear of a strip
 *  that does not grow with the shape. */
const wordsBoxOf = (kind: AnnotationShape, b: Box): Box => {
  if (kind.strip === 'top') return { x: 0, y: STRIP, w: b.w, h: Math.max(0, b.h - STRIP) }
  if (kind.strip === 'left') return { x: STRIP, y: 0, w: Math.max(0, b.w - STRIP), h: b.h }
  const area = wordsAreaOf(kind)
  return { x: area.x * b.w, y: area.y * b.h, w: area.w * b.w, h: area.h * b.h }
}

/** How tall one line of a shape's words is. */
const lineHeightOf = (kind: string): number => (kind === 'text' ? 20 : 18)
/** The air kept round a shape's words, up and down. */
const WORDS_AIR = 6

type Drag =
  | { type: 'move'; ids: string[]; from: Spot; boxes: Map<string, Box>; moved: boolean }
  | { type: 'size'; id: string; corner: string; from: Spot; box: Box }
  | { type: 'end'; id: string; end: 'from' | 'to'; at: Spot }
  | { type: 'pull'; id: string; side: Side; from: Spot; moved: boolean }
  | { type: 'tip'; id: string; index: number; from: Spot; moved: boolean }

/** What each edge of a sticky note is called, for a person. */
const SIDES: { side: Side; name: string }[] = [
  { side: 'n', name: 'top' },
  { side: 'e', name: 'right' },
  { side: 's', name: 'bottom' },
  { side: 'w', name: 'left' },
]

/** The annotations drawn over a level of a map or a sketch: shapes, text and
 *  lines a person or an agent reads, which are not the diagram. Shapes that
 *  frame things sit behind the cards; the rest sit over them. They line up
 *  with the cards and keep beside them when their layer says so; the cards
 *  never line up with them. */
export const AnnotationLayer = ({
  layers,
  level,
  shift,
  cards,
  moved,
  up: levelsOut = 0,
  notDrawn,
  preview,
  onPreview: setPreview,
  k,
  selected,
  editing,
  fresh = '',
  toWorld,
  onSelect,
  onEdit,
  onChange,
  part,
}: {
  /** Where they are drawn to keep clear of a card open on this level. */
  moved?: Map<string, Box>
  /** How many levels out from the one in hand this is. Past none, its
   *  annotations are faded and cannot be touched. */
  up?: number
  /** Cards not on the board right now: what keeps beside or holds one goes too. */
  notDrawn?: Set<string>
  /** Where what is being dragged or sized has got to. It is shared, because a
   *  shape behind the cards is drawn apart from the lines holding it. */
  preview: Map<string, Box> | null
  onPreview: (preview: Map<string, Box> | null) => void
  /** Frames and boxes, drawn behind the cards, or everything else, over
   *  them: the canvas draws the layer twice, once on each side. */
  part: 'behind' | 'front'
  layers: Layer[]
  level: string
  shift: Spot
  /** The diagram's cards on this level, where they sit on the board. */
  cards: Card[]
  k: number
  selected: string[]
  editing: string
  /** One just put down: its first words join the step that made it, so one
   *  undo takes the whole thing away. */
  fresh?: string
  toWorld: (x: number, y: number) => Spot
  onSelect: (ids: string[]) => void
  onEdit: (id: string) => void
  onChange: (layers: Layer[], step?: string) => void
}) => {
  const drawn = useMemo(() => {
    const gone = (end: AnnotationEnd | undefined): boolean => Boolean(end && 'card' in end && notDrawn?.has(end.card))
    return drawnOn(layers, level, shift, cards, moved).filter((d) => !(d.a.near && notDrawn?.has(d.a.near.card)) && !gone(d.a.from) && !gone(d.a.to))
  }, [layers, level, shift, cards, moved, notDrawn])
  const upped = levelsOut > 0 ? ` map-up map-up--${Math.min(levelsOut, 3)} map-anno--locked` : ''
  const drag = useRef<Drag | null>(null)

  const [endAt, setEndAt] = useState<{ id: string; end: 'from' | 'to'; at: Spot } | null>(null)
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] })
  /** A sticky note's arrow on its way: a new one being pulled out, or one
   *  whose tip is being moved. */
  const [aiming, setAiming] = useState<{ id: string; index: number | null; at: Spot } | null>(null)
  /** The one arrow picked on the picked note: Delete takes that, not the note. */
  const [arrow, setArrow] = useState<{ id: string; index: number } | null>(null)
  const pickedArrow = arrow && selected.length === 1 && selected[0] === arrow.id ? arrow : null

  const layerSnaps = (id: string): boolean => drawn.find((d) => d.a.id === id)?.layer.snaps ?? true

  // The keys act on what is picked, while nothing is being typed.
  const now = useRef({ layers, selected, pickedArrow })
  now.current = { layers, selected, pickedArrow }
  useEffect(() => {
    if (selected.length === 0 || part !== 'front') return
    const keys = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const { layers: all, selected: ids, pickedArrow: picked } = now.current
      const mod = event.ctrlKey || event.metaKey
      if ((event.key === 'Delete' || event.key === 'Backspace') && picked) {
        event.preventDefault()
        onChange(removePointer(all, picked.id, picked.index))
        setArrow(null)
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        onChange(removeAnnotations(all, ids))
        onSelect([])
      } else if (event.key === 'Escape') onSelect([])
      else if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        const [next, made] = duplicateAnnotations(all, ids)
        onChange(next)
        onSelect(made)
      } else if (event.key.startsWith('Arrow') && !mod) {
        event.preventDefault()
        const by = event.shiftKey ? 24 : 4
        const steps: Record<string, [number, number]> = { ArrowLeft: [-by, 0], ArrowRight: [by, 0], ArrowUp: [0, -by], ArrowDown: [0, by] }
        const [dx, dy] = steps[event.key] ?? [0, 0]
        let next = all
        for (const id of ids) {
          const d = drawn.find((x) => x.a.id === id)
          if (!d) continue
          if (d.a.from) {
            const nudge = (end: AnnotationEnd | undefined): AnnotationEnd | undefined =>
              end && 'x' in end ? { x: end.x + dx, y: end.y + dy } : end
            next = changeAnnotation(next, id, { from: nudge(d.a.from), to: nudge(d.a.to) })
          } else
            next = changeAnnotation(next, id, d.a.near ? { near: { ...d.a.near, dx: d.a.near.dx + dx, dy: d.a.near.dy + dy } } : { x: d.a.x + dx, y: d.a.y + dy })
        }
        onChange(next, 'nudge')
      }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [selected.length > 0, drawn, onChange, onSelect, onEdit, part])

  const world = (event: PointerEvent): Spot => toWorld(event.clientX, event.clientY)

  /** What a box lines up with: the diagram's cards, if its layer snaps, and
   *  the other annotations on the level. */
  const others = (ids: string[], snaps: boolean): Box[] => [
    ...(snaps ? cards.map((c) => c.box) : []),
    ...drawn.filter((d) => !ids.includes(d.a.id) && !d.a.from).map((d) => d.box),
  ]

  const press = (d: Drawn) => (event: PointerEvent<Element>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    if (editing === d.a.id) return
    const ids = event.shiftKey ? (selected.includes(d.a.id) ? selected.filter((x) => x !== d.a.id) : [...selected, d.a.id]) : selected.includes(d.a.id) ? selected : [d.a.id]
    onSelect(ids)
    setArrow(null)
    const boxes = new Map(drawn.filter((x) => ids.includes(x.a.id)).map((x) => [x.a.id, x.box]))
    drag.current = { type: 'move', ids, from: world(event), boxes, moved: false }
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }

  const pressCorner = (d: Drawn, corner: string) => (event: PointerEvent<Element>) => {
    event.stopPropagation()
    drag.current = { type: 'size', id: d.a.id, corner, from: world(event), box: d.box }
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }

  const pressEnd = (d: Drawn, end: 'from' | 'to') => (event: PointerEvent<Element>) => {
    event.stopPropagation()
    drag.current = { type: 'end', id: d.a.id, end, at: world(event) }
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }

  /** Pressing one of the dots on a sticky note's edges starts a new arrow. */
  const pressPull = (d: Drawn, side: Side) => (event: PointerEvent<Element>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelect([d.a.id])
    setArrow(null)
    drag.current = { type: 'pull', id: d.a.id, side, from: world(event), moved: false }
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }

  const pressTip = (d: Drawn, index: number) => (event: PointerEvent<Element>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    setArrow({ id: d.a.id, index })
    drag.current = { type: 'tip', id: d.a.id, index, from: world(event), moved: false }
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }

  /** Pressing an arrow picks its note and moves it, as the note's own body
   *  does, and picks that arrow too, so Delete takes only the arrow. */
  const pressArrow = (d: Drawn, index: number) => (event: PointerEvent<Element>) => {
    press(d)(event)
    if (event.button === 0) setArrow({ id: d.a.id, index })
  }

  const move = (event: PointerEvent<Element>): void => {
    const g = drag.current
    if (!g) return
    const at = world(event)
    if (g.type === 'pull' || g.type === 'tip') {
      if (!g.moved && Math.hypot(at.x - g.from.x, at.y - g.from.y) * k < 4) return
      g.moved = true
      setAiming({ id: g.id, index: g.type === 'tip' ? g.index : null, at })
    } else if (g.type === 'move') {
      const dx = at.x - g.from.x
      const dy = at.y - g.from.y
      if (!g.moved && Math.hypot(dx, dy) * k < 4) return
      g.moved = true
      const first = [...g.boxes.values()][0]!
      const snaps = g.ids.every(layerSnaps)
      const snap = event.altKey ? { dx: 0, dy: 0, guides: { x: [], y: [] } } : snapBox({ ...first, x: first.x + dx, y: first.y + dy }, others(g.ids, snaps), 6 / k)
      setGuides(snap.guides)
      setPreview(new Map([...g.boxes].map(([id, b]) => [id, { ...b, x: b.x + dx + snap.dx, y: b.y + dy + snap.dy }])))
    } else if (g.type === 'size') {
      const b = g.box
      let { x, y, w, h } = b
      const dx = at.x - g.from.x
      const dy = at.y - g.from.y
      if (g.corner.includes('e')) w = b.w + dx
      if (g.corner.includes('s')) h = b.h + dy
      if (g.corner.includes('w')) {
        x = b.x + dx
        w = b.w - dx
      }
      if (g.corner.includes('n')) {
        y = b.y + dy
        h = b.h - dy
      }
      if (event.shiftKey) h = (w * b.h) / b.w
      setPreview(new Map([[g.id, { x, y, w: Math.max(12, w), h: Math.max(12, h) }]]))
    } else {
      setEndAt({ id: g.id, end: g.end, at })
    }
  }

  /** What a line's end lands on, or the spot itself. */
  const endOn = (at: Spot, id: string, snaps: boolean): AnnotationEnd =>
    endLanding(at, id, snaps, cards, drawn, k)?.end ?? { x: Math.round(at.x - shift.x), y: Math.round(at.y - shift.y) }

  const up = (event: PointerEvent<Element>): void => {
    const g = drag.current
    drag.current = null
    setGuides({ x: [], y: [] })
    if (!g) return
    if (g.type === 'pull' || g.type === 'tip') {
      setAiming(null)
      const d = drawn.find((x) => x.a.id === g.id)
      if (!d || (g.type === 'tip' && !g.moved)) return
      const at = world(event)
      // Let go on its own note and the arrow is not wanted.
      const inside = inBox(at, d.box)
      const tip = { dx: Math.round(at.x - d.box.x), dy: Math.round(at.y - d.box.y) }
      if (g.type === 'tip') {
        onChange(inside ? removePointer(layers, g.id, g.index) : movePointer(layers, g.id, g.index, tip))
        if (inside) setArrow(null)
      } else if (!g.moved || !inside) {
        const [next, index] = addPointer(layers, g.id, g.moved ? tip : pointerOut(d.box, g.side))
        onChange(next)
        setArrow({ id: g.id, index })
      }
      return
    }
    if (g.type === 'end') {
      setEndAt(null)
      onChange(changeAnnotation(layers, g.id, { [g.end]: endOn(world(event), g.id, layerSnaps(g.id)) }))
      return
    }
    const shown = preview
    setPreview(null)
    if (!shown || (g.type === 'move' && !g.moved)) return
    const moves = new Map<string, { box: Box; near?: Annotation['near'] }>()
    let next = layers
    for (const [id, box] of shown) {
      const d = drawn.find((x) => x.a.id === id)
      if (!d) continue
      if (d.a.from) {
        // A line moves its loose ends; ends held by something stay held.
        const dx = box.x - d.box.x
        const dy = box.y - d.box.y
        const shiftEnd = (end: AnnotationEnd | undefined): AnnotationEnd | undefined =>
          end && 'x' in end ? { x: Math.round(end.x + dx), y: Math.round(end.y + dy) } : end
        next = changeAnnotation(next, id, { from: shiftEnd(d.a.from), to: shiftEnd(d.a.to) })
        continue
      }
      const level = { x: box.x - shift.x, y: box.y - shift.y, w: box.w, h: box.h }
      const card = d.layer.snaps && !shapeOf(d.a.kind).behind ? nearestCard(box, cards, 28 / k) : null
      moves.set(id, { box: level, near: card ? { card: card.id, dx: Math.round(box.x - card.box.x), dy: Math.round(box.y - card.box.y) } : undefined })
    }
    next = placeAt(next, moves)
    // A resized note's arrows keep pointing where they pointed.
    if (g.type === 'size' && shown.get(g.id)) next = holdPointers(next, g.id, shown.get(g.id)!.x - g.box.x, shown.get(g.id)!.y - g.box.y)
    onChange(next)
  }

  const boxOf = (d: Drawn): Box => preview?.get(d.a.id) ?? d.box

  const shape = (d: Drawn, front: boolean): ReactElement | null => {
    const kind = shapeOf(d.a.kind)
    if (Boolean(kind.behind) === front || d.a.from) return null
    const b = boxOf(d)
    const picked = selected.includes(d.a.id)
    const classes = [`map-anno map-anno--${d.a.kind}${upped}`]
    if (d.a.color) classes.push(`map-anno-fill--${d.a.color}`)
    if (kind.behind) classes.push('map-anno--behind')
    if (picked) classes.push('map-anno--picked')
    if (d.a.near) classes.push('map-anno--kept')
    const words = d.a.text
    const words_ = wordsBoxOf(kind, b)
    const inArea = { left: words_.x, top: words_.y, width: words_.w, height: words_.h }
    // As many lines as the shape has room for at this size, so the words are
    // cut with an ellipsis, and more show the moment it grows.
    const lineHeight = lineHeightOf(d.a.kind)
    const lines = Math.max(1, Math.floor((words_.h - WORDS_AIR * 2) / lineHeight))
    const shownWords = d.a.kind === 'list' ? (words || 'A list').split('\n').map((line) => `•  ${line}`).join('\n') : words || (d.a.kind === 'text' ? 'Text' : '')
    return (
      <div
        key={d.a.id}
        className={classes.join(' ')}
        style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
        data-anno={d.a.id}
        role="button"
        aria-label={`Annotation: ${kind.name}${words ? `, ${words}` : ''}`}
        aria-pressed={picked}
        onPointerDown={press(d)}
        onPointerMove={move}
        onPointerUp={up}
        onDoubleClick={(event) => {
          event.stopPropagation()
          onEdit(d.a.id)
        }}
      >
        {kind.d || kind.band || kind.marks ? (
          <svg className="map-anno-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {kind.d ? <path className="map-anno-edge" d={kind.d} vectorEffect="non-scaling-stroke" /> : null}
            {kind.band ? <path className="map-anno-band" d={kind.band} vectorEffect="non-scaling-stroke" /> : null}
            {kind.marks ? <path className="map-anno-marks" d={kind.marks} vectorEffect="non-scaling-stroke" /> : null}
            {/* A frame is picked by a wide invisible stroke along its edge,
                so the board inside it still pans and picks cards. */}
            {kind.behind ? <path className="map-anno-grab" d={kind.d || kind.marks || ''} vectorEffect="non-scaling-stroke" /> : null}
          </svg>
        ) : null}
        {kind.strip ? <div className={`map-anno-strip map-anno-strip--${kind.strip}`} aria-hidden="true" /> : null}
        {kind.behind ? (
          <div className={kind.title === 'strip' ? `map-anno-title map-anno-title--in-${kind.strip}` : 'map-anno-title'}>{words || kind.name}</div>
        ) : null}
        {editing === d.a.id ? (
          <textarea
            // Writing on a shape looks like reading it: a code block stays
            // mono, a note stays hand-written, a frame's name stays on its
            // tab or in its strip.
            className={`map-anno-edit map-anno-edit--${d.a.kind}${kind.title === 'strip' ? ` map-anno-edit--in-${kind.strip}` : kind.title === 'tab' ? ' map-anno-edit--on-tab' : ''}`}
            aria-label="Annotation text"
            autoFocus
            style={kind.behind ? undefined : { ...inArea, inset: 'auto' }}
            defaultValue={words}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
                ;(event.target as HTMLTextAreaElement).blur()
              }
            }}
            onBlur={(event) => {
              if (event.target.value !== words)
                onChange(changeAnnotation(layers, d.a.id, { text: event.target.value }), d.a.id === fresh ? 'join' : `text:${d.a.id}`)
              onEdit('')
            }}
          />
        ) : !kind.behind ? (
          <div className="map-anno-words" style={inArea}>
            <div
              className={`map-anno-text${d.a.kind === 'code' ? ' map-anno-text--code' : ''}${d.a.kind === 'list' ? ' map-anno-text--list' : ''}`}
              style={{ WebkitLineClamp: lines, lineHeight: `${lineHeight}px` }}
            >
              {shownWords}
            </div>
          </div>
        ) : null}
        {picked && selected.length === 1 && editing !== d.a.id
          ? ['nw', 'ne', 'sw', 'se'].map((corner) => (
              <span
                key={corner}
                className={`map-anno-corner map-anno-corner--${corner}`}
                onPointerDown={pressCorner(d, corner)}
                onPointerMove={move}
                onPointerUp={up}
              />
            ))
          : null}
        {d.a.kind === 'sticky' && editing !== d.a.id && selected.length <= 1
          ? SIDES.map(({ side, name }) => (
              <span
                key={side}
                className={`map-anno-pull map-anno-pull--${side}`}
                role="button"
                aria-label={`Pull an arrow out of the ${name} of the note`}
                title="Drag to point an arrow, or click for a short one"
                onPointerDown={pressPull(d, side)}
                onPointerMove={move}
                onPointerUp={up}
                onDoubleClick={(event) => event.stopPropagation()}
              />
            ))
          : null}
      </div>
    )
  }

  /** A note's arrows as drawn now. A resize leaves the tips where they are;
   *  anything else carries them along with the note. */
  const arrowsOf = (d: Drawn): { index: number; from: Spot; to: Spot }[] => {
    const box = boxOf(d)
    const corner = drag.current?.type === 'size' ? d.box : box
    const arrows = (d.a.pointers ?? []).map((p, index) => {
      const tip = { x: corner.x + p.dx, y: corner.y + p.dy }
      const to = aiming?.id === d.a.id && aiming.index === index ? aiming.at : tip
      return { index, to, from: meetOutline(shapeOf(d.a.kind).d, box, to) }
    })
    if (aiming?.id === d.a.id && aiming.index === null)
      arrows.push({ index: arrows.length, to: aiming.at, from: meetOutline(shapeOf(d.a.kind).d, box, aiming.at) })
    return arrows
  }

  const lines = drawn.filter((d) => d.ends)
  /** The same lines while a shape they hold is being dragged or sized, so they
   *  stay on it the whole way. */
  const liveEnds = useMemo(() => {
    if (!preview) return null
    const carried = new Map(moved ?? [])
    for (const [id, box] of preview) carried.set(id, box)
    return new Map(drawnOn(layers, level, shift, cards, carried).flatMap((d) => (d.ends ? [[d.a.id, d] as const] : [])))
  }, [preview, moved, layers, level, shift, cards])
  const lineEnds = (d: Drawn): [Spot, Spot] => {
    const [from, to] = liveEnds?.get(d.a.id)?.ends ?? d.ends!
    const carried = preview?.get(d.a.id)
    const dx = carried ? carried.x - d.box.x : 0
    const dy = carried ? carried.y - d.box.y : 0
    const loose = (end: AnnotationEnd | undefined, p: Spot): Spot => (end && 'x' in end ? { x: p.x + dx, y: p.y + dy } : p)
    let a = loose(d.a.from, from)
    let b = loose(d.a.to, to)
    if (endAt?.id === d.a.id) endAt.end === 'from' ? (a = endAt.at) : (b = endAt.at)
    return [a, b]
  }
  /** A line's path as drawn now. An end being dragged holds no seam yet. */
  const pathOf = (d: Drawn): { d: string; mid: Spot } => {
    const [a, b] = lineEnds(d)
    const ways = liveEnds?.get(d.a.id)?.ways ?? d.ways ?? [null, null]
    const dragged = endAt?.id === d.a.id ? endAt.end : null
    return linePath(d.a.kind, a, b, [dragged === 'from' ? null : ways[0], dragged === 'to' ? null : ways[1]])
  }
  /** The shape a line's end being dragged is over, to show what it can hold. */
  const endOver = endAt ? endLanding(endAt.at, endAt.id, layerSnaps(endAt.id), cards, drawn, k) : null

  return (
    <>
      {part === 'behind' ? drawn.map((d) => shape(d, false)) : null}
      {part === 'front' ? (
      <>
      <svg className={`map-anno-lines${upped}`} width="1" height="1">
        <defs>
          <marker id="map-anno-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="map-anno-head" />
          </marker>
        </defs>
        {lines.map((d) => {
          const [a, b] = lineEnds(d)
          const picked = selected.includes(d.a.id)
          const path = pathOf(d).d
          return (
            <g
              key={d.a.id}
              className={`map-anno-line map-anno-line--${d.a.kind}${picked ? ' map-anno-line--picked' : ''}${d.a.color ? ` map-anno-fill--${d.a.color}` : ''}`}
            >
              <path d={path} markerEnd={d.a.kind === 'arrow' || shapeOf(d.a.kind).bends ? 'url(#map-anno-head)' : undefined} />
              <path
                d={path}
                className="map-anno-line-hit"
                data-anno={d.a.id}
                role="button"
                aria-label={`Annotation: ${shapeOf(d.a.kind).name}${d.a.text ? `, ${d.a.text}` : ''}`}
                onPointerDown={press(d)}
                onPointerMove={move}
                onPointerUp={up}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  onEdit(d.a.id)
                }}
              />
              {picked && selected.length === 1
                ? (['from', 'to'] as const).map((end) => {
                    const p = end === 'from' ? a : b
                    return (
                      <circle
                        key={end}
                        cx={p.x}
                        cy={p.y}
                        r={6 / k}
                        className="map-anno-end"
                        onPointerDown={pressEnd(d, end)}
                        onPointerMove={move}
                        onPointerUp={up}
                      />
                    )
                  })
                : null}
            </g>
          )
        })}
        {drawn.flatMap((d) =>
          arrowsOf(d).map(({ index, from, to }) => {
            const picked = pickedArrow?.id === d.a.id && pickedArrow.index === index
            const path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`
            return (
              <g
                key={`${d.a.id}:${index}`}
                className={`map-anno-line map-anno-pointer${picked ? ' map-anno-line--picked' : ''}${d.a.color ? ` map-anno-fill--${d.a.color}` : ''}`}
              >
                <path d={path} markerEnd="url(#map-anno-head)" />
                <path
                  d={path}
                  className="map-anno-line-hit"
                  role="button"
                  aria-label="The note’s arrow"
                  onPointerDown={pressArrow(d, index)}
                  onPointerMove={move}
                  onPointerUp={up}
                />
                {selected.length === 1 && selected[0] === d.a.id ? (
                  <circle
                    cx={to.x}
                    cy={to.y}
                    r={6 / k}
                    className="map-anno-end"
                    role="button"
                    aria-label="The tip of the note’s arrow"
                    onPointerDown={pressTip(d, index)}
                    onPointerMove={move}
                    onPointerUp={up}
                  />
                ) : null}
              </g>
            )
          }),
        )}
        {guides.x.map((x) => (
          <line key={`x${x}`} x1={x} x2={x} y1={-100000} y2={100000} className="map-anno-guide" />
        ))}
        {guides.y.map((y) => (
          <line key={`y${y}`} y1={y} y2={y} x1={-100000} x2={100000} className="map-anno-guide" />
        ))}
        {endAt && endOver ? <SeamDots box={endOver.box} d={endOver.d} at={endAt.at} k={k} /> : null}
      </svg>
      {lines.map((d) => {
        const { mid } = pathOf(d)
        return editing === d.a.id ? (
          <textarea
            key={d.a.id}
            className="map-anno-edit map-anno-edit--line"
            aria-label="Annotation text"
            style={{ left: mid.x - 80, top: mid.y - 18 }}
            autoFocus
            defaultValue={d.a.text}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Escape' || event.key === 'Enter') (event.target as HTMLTextAreaElement).blur()
            }}
            onBlur={(event) => {
              if (event.target.value !== d.a.text)
                onChange(changeAnnotation(layers, d.a.id, { text: event.target.value }), d.a.id === fresh ? 'join' : `text:${d.a.id}`)
              onEdit('')
            }}
          />
        ) : d.a.kind === 'wire' ? (
          // The line runs through its words, which are the wire's handle too.
          <div
            key={d.a.id}
            className={`map-anno-wire-words${selected.includes(d.a.id) ? ' map-anno-wire-words--picked' : ''}${upped}`}
            style={{ left: mid.x, top: mid.y }}
            role="button"
            aria-label={`Wire words: ${d.a.text || 'none yet'}`}
            onPointerDown={press(d)}
            onPointerMove={move}
            onPointerUp={up}
            onDoubleClick={(event) => {
              event.stopPropagation()
              onEdit(d.a.id)
            }}
          >
            {d.a.text || <span className="map-said-ask">what is it for?</span>}
          </div>
        ) : d.a.text ? (
          <div key={d.a.id} className={`map-anno-line-words${upped}`} style={{ left: mid.x, top: mid.y }}>
            {d.a.text}
          </div>
        ) : null
      })}
      {drawn.map((d) => shape(d, true))}
      </>
      ) : null}
      {part === 'behind' && (guides.x.length || guides.y.length) ? (
        <svg className="map-anno-lines" width="1" height="1">
          {guides.x.map((x) => (
            <line key={`x${x}`} x1={x} x2={x} y1={-100000} y2={100000} className="map-anno-guide" />
          ))}
          {guides.y.map((y) => (
            <line key={`y${y}`} y1={y} y2={y} x1={-100000} x2={100000} className="map-anno-guide" />
          ))}
        </svg>
      ) : null}
    </>
  )
}

/** Putting a shape down: a click places it at its usual size, a drag draws
 *  it to size, and for a line the drag runs from one end to the other, each
 *  end holding whatever card or annotation it lands on. It covers the board
 *  while a shape is picked from the library. */
export const AnnotationPlacer = ({
  kind,
  layers,
  layerId,
  level,
  shift,
  cards,
  toWorld,
  transform,
  k,
  onPlaced,
}: {
  /** The board's own move and zoom, so what is drawn lines up with it. */
  transform: string
  kind: string
  layers: Layer[]
  layerId: string
  level: string
  shift: Spot
  cards: Card[]
  toWorld: (x: number, y: number) => Spot
  k: number
  onPlaced: (layers: Layer[], id: string, keepGoing: boolean) => void
}) => {
  const start = useRef<{ at: Spot; screen: Spot } | null>(null)
  const [box, setBox] = useState<{ a: Spot; b: Spot } | null>(null)
  const shape = shapeOf(kind)
  const snaps = layers.find((l) => l.id === layerId)?.snaps ?? true
  const drawnHere = drawnOn(layers, level, shift, cards)
  const endOn = (at: Spot): AnnotationEnd =>
    endLanding(at, '', snaps, cards, drawnHere, k)?.end ?? { x: Math.round(at.x - shift.x), y: Math.round(at.y - shift.y) }
  /** Where a line being drawn would end, and what it would hold there. */
  const [hovering, setHovering] = useState<Spot | null>(null)
  const over = shape.line && hovering ? endLanding(hovering, '', snaps, cards, drawnHere, k) : null
  const startOver = shape.line && box ? endLanding(box.a, '', snaps, cards, drawnHere, k) : null

  return (
    <div
      className="map-anno-placer"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        start.current = { at: toWorld(event.clientX, event.clientY), screen: { x: event.clientX, y: event.clientY } }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerLeave={() => setHovering(null)}
      onPointerMove={(event) => {
        setHovering(toWorld(event.clientX, event.clientY))
        if (!start.current) return
        if (Math.hypot(event.clientX - start.current.screen.x, event.clientY - start.current.screen.y) < 4 && !box) return
        setBox({ a: start.current.at, b: toWorld(event.clientX, event.clientY) })
      }}
      onPointerUp={(event) => {
        const began = start.current
        start.current = null
        setBox(null)
        if (!began) return
        const end = toWorld(event.clientX, event.clientY)
        const dragged = Math.hypot(event.clientX - began.screen.x, event.clientY - began.screen.y) >= 4
        const keepGoing = event.shiftKey
        if (shape.line) {
          const from = dragged ? began.at : { x: began.at.x - shape.w / 2, y: began.at.y }
          const to = dragged ? end : { x: began.at.x + shape.w / 2, y: began.at.y }
          const level0 = { x: began.at.x - shift.x, y: began.at.y - shift.y }
          const [next, id] = placeAnnotation(layers, layerId, level, kind, level0, { from: endOn(from), to: endOn(to) })
          onPlaced(next, id, keepGoing)
          return
        }
        const spot = dragged
          ? { x: (began.at.x + end.x) / 2 - shift.x, y: (began.at.y + end.y) / 2 - shift.y }
          : { x: began.at.x - shift.x, y: began.at.y - shift.y }
        let [next, id] = placeAnnotation(layers, layerId, level, kind, spot)
        if (dragged) {
          const w = Math.max(24, Math.abs(end.x - began.at.x))
          const h = Math.max(24, Math.abs(end.y - began.at.y))
          next = changeAnnotation(next, id, { x: Math.round(spot.x - w / 2), y: Math.round(spot.y - h / 2), w: Math.round(w), h: Math.round(h) })
        }
        onPlaced(next, id, keepGoing)
      }}
    >
      <div className="map-anno-placer-world" style={{ transform }}>
      {over || startOver ? (
        <svg className="map-anno-lines map-anno-lines--seams" width="1" height="1">
          {over && hovering ? <SeamDots box={over.box} d={over.d} at={hovering} k={k} /> : null}
          {startOver && box ? <SeamDots box={startOver.box} d={startOver.d} at={box.a} k={k} /> : null}
        </svg>
      ) : null}
      {box ? (
        shape.line ? (
          <svg className="map-anno-lines map-anno-lines--live" width="1" height="1">
            <path d={linePath(kind, box.a, box.b).d} fill="none" />
          </svg>
        ) : (
          <div
            className="map-anno-sizing"
            style={{
              left: Math.min(box.a.x, box.b.x),
              top: Math.min(box.a.y, box.b.y),
              width: Math.abs(box.b.x - box.a.x),
              height: Math.abs(box.b.y - box.a.y),
            }}
          />
        )
      ) : null}
      </div>
    </div>
  )
}
