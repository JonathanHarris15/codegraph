// codegraph: component annotation-layer
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactElement } from 'react'
import type { Annotation, AnnotationEnd, Layer } from '../../modules/annotations/index.js'
import {
  addPointer,
  changeAnnotation,
  duplicateAnnotations,
  edgeToward,
  holdPointers,
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
import { shapeOf } from './annotation-shapes.js'

type Spot = { x: number; y: number }
type Card = { id: string; box: Box }

/** One annotation as drawn now: where it sits on the board, and for a line,
 *  its two ends. */
export type Drawn = { a: Annotation; layer: Layer; box: Box; ends?: [Spot, Spot] }

const inBox = (p: Spot, b: Box): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h

/** Every annotation of the shown layers on one level, where it sits on the
 *  board: beside the card it keeps to, if that card is here, or where it was
 *  put. A line runs between whatever its ends hold. */
export const drawnOn = (layers: Layer[], level: string, shift: Spot, cards: Card[]): Drawn[] => {
  const cardBox = new Map(cards.map((c) => [c.id, c.box]))
  const boxes: Drawn[] = []
  for (const layer of layers) {
    if (!layer.shown) continue
    for (const a of layer.items) {
      if (a.at !== level || a.from) continue
      const near = a.near ? cardBox.get(a.near.card) : undefined
      const box = near
        ? { x: near.x + a.near!.dx, y: near.y + a.near!.dy, w: a.w, h: a.h }
        : { x: a.x + shift.x, y: a.y + shift.y, w: a.w, h: a.h }
      boxes.push({ a, layer, box })
    }
  }
  const annoBox = new Map(boxes.map((d) => [d.a.id, d.box]))
  const point = (end: AnnotationEnd | undefined, toward: Spot | null): Spot | null => {
    if (!end) return null
    if ('x' in end) return { x: end.x + shift.x, y: end.y + shift.y }
    const b = 'card' in end ? cardBox.get(end.card) : annoBox.get(end.annotation)
    if (!b) return null
    return toward ? edgeToward(b, toward) : { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  }
  for (const layer of layers) {
    if (!layer.shown) continue
    for (const a of layer.items) {
      if (a.at !== level || !a.from) continue
      const roughFrom = point(a.from, null)
      const roughTo = point(a.to, null)
      if (!roughFrom || !roughTo) continue
      const from = point(a.from, roughTo)!
      const to = point(a.to, roughFrom)!
      const box = {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        w: Math.abs(to.x - from.x),
        h: Math.abs(to.y - from.y),
      }
      boxes.push({ a, layer, box, ends: [from, to] })
    }
  }
  return boxes
}

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
  const drawn = useMemo(() => drawnOn(layers, level, shift, cards), [layers, level, shift, cards])
  const drag = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<Map<string, Box> | null>(null)
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

  /** What a line's end lands on: a card, if its layer snaps, or another
   *  annotation, or the spot itself. */
  const endOn = (at: Spot, id: string, snaps: boolean): AnnotationEnd => {
    const onCard = snaps ? cards.find((c) => inBox(at, c.box)) : undefined
    if (onCard) return { card: onCard.id }
    const onAnno = drawn.find((d) => d.a.id !== id && !d.a.from && inBox(at, d.box))
    if (onAnno) return { annotation: onAnno.a.id }
    return { x: Math.round(at.x - shift.x), y: Math.round(at.y - shift.y) }
  }

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
    const classes = ['map-anno', `map-anno--${d.a.kind}`]
    if (d.a.color) classes.push(`map-anno-fill--${d.a.color}`)
    if (kind.behind) classes.push('map-anno--behind')
    if (picked) classes.push('map-anno--picked')
    if (d.a.near) classes.push('map-anno--kept')
    const words = d.a.text
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
        {kind.d ? (
          <svg className="map-anno-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d={kind.d} vectorEffect="non-scaling-stroke" />
          </svg>
        ) : null}
        {kind.behind ? <div className="map-anno-title">{words || kind.name}</div> : null}
        {editing === d.a.id ? (
          <textarea
            className="map-anno-edit"
            aria-label="Annotation text"
            autoFocus
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
          d.a.kind === 'list' ? (
            <ul className="map-anno-list">
              {(words || 'A list').split('\n').map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <div className={d.a.kind === 'code' ? 'map-anno-text map-anno-text--code' : 'map-anno-text'}>
              {words || (d.a.kind === 'text' ? 'Text' : '')}
            </div>
          )
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
      return { index, to, from: edgeToward(box, to) }
    })
    if (aiming?.id === d.a.id && aiming.index === null)
      arrows.push({ index: arrows.length, to: aiming.at, from: edgeToward(box, aiming.at) })
    return arrows
  }

  const lines = drawn.filter((d) => d.ends)
  const lineEnds = (d: Drawn): [Spot, Spot] => {
    const [from, to] = d.ends!
    const moved = preview?.get(d.a.id)
    const dx = moved ? moved.x - d.box.x : 0
    const dy = moved ? moved.y - d.box.y : 0
    const loose = (end: AnnotationEnd | undefined, p: Spot): Spot => (end && 'x' in end ? { x: p.x + dx, y: p.y + dy } : p)
    let a = loose(d.a.from, from)
    let b = loose(d.a.to, to)
    if (endAt?.id === d.a.id) endAt.end === 'from' ? (a = endAt.at) : (b = endAt.at)
    return [a, b]
  }

  return (
    <>
      {part === 'behind' ? drawn.map((d) => shape(d, false)) : null}
      {part === 'front' ? (
      <>
      <svg className="map-anno-lines" width="1" height="1">
        <defs>
          <marker id="map-anno-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="map-anno-head" />
          </marker>
        </defs>
        {lines.map((d) => {
          const [a, b] = lineEnds(d)
          const picked = selected.includes(d.a.id)
          return (
            <g
              key={d.a.id}
              className={`map-anno-line map-anno-line--${d.a.kind}${picked ? ' map-anno-line--picked' : ''}${d.a.color ? ` map-anno-fill--${d.a.color}` : ''}`}
            >
              <path d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} markerEnd={d.a.kind === 'arrow' ? 'url(#map-anno-head)' : undefined} />
              <path
                d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
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
      </svg>
      {lines.map((d) => {
        const [a, b] = lineEnds(d)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
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
        ) : d.a.text ? (
          <div key={d.a.id} className="map-anno-line-words" style={{ left: mid.x, top: mid.y }}>
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
  onPress,
  transform,
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
  /** A press landed here, so the canvas can work on the level it landed on. */
  onPress?: (at: Spot) => void
  onPlaced: (layers: Layer[], id: string, keepGoing: boolean) => void
}) => {
  const start = useRef<{ at: Spot; screen: Spot } | null>(null)
  const [box, setBox] = useState<{ a: Spot; b: Spot } | null>(null)
  const shape = shapeOf(kind)
  const snaps = layers.find((l) => l.id === layerId)?.snaps ?? true
  const drawnHere = drawnOn(layers, level, shift, cards)
  const endOn = (at: Spot): AnnotationEnd => {
    const onCard = snaps ? cards.find((c) => inBox(at, c.box)) : undefined
    if (onCard) return { card: onCard.id }
    const onAnno = drawnHere.find((d) => !d.a.from && inBox(at, d.box))
    if (onAnno) return { annotation: onAnno.a.id }
    return { x: Math.round(at.x - shift.x), y: Math.round(at.y - shift.y) }
  }

  return (
    <div
      className="map-anno-placer"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        start.current = { at: toWorld(event.clientX, event.clientY), screen: { x: event.clientX, y: event.clientY } }
        onPress?.(start.current.at)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
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
      {box ? (
        shape.line ? (
          <svg className="map-anno-lines map-anno-lines--live" width="1" height="1">
            <line x1={box.a.x} y1={box.a.y} x2={box.b.x} y2={box.b.y} />
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
