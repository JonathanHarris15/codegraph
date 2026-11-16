// codegraph: component context-bar
import { Layers } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Level } from '../../features/show-map.js'
import type { CardLook } from '../../modules/sketches/schema.js'
import { ColorPick } from './card-look-editor.js'
import { CardMark, Glyph, type ToolGlyph } from './kind-glyph.js'
import { wireKinds, type Alignment, type CardChoice } from './sketch-edits.js'

/** What is picked, as the bar over it needs to know. */
export type Picking =
  | {
      what: 'card'
      id: string
      kind: string
      look?: CardLook
      restyles?: boolean
      level: Level
      page: boolean
      opens: boolean
      /** A store, whose fields and inner stores can be designed, or a
       *  database, whose stores can. */
      stores?: 'store' | 'database'
    }
  /** A wire, and whether it is drawn curved or at right angles. */
  | { what: 'wire'; id: string; kind: string; shape: 'curved' | 'square' }
  | { what: 'note'; id: string }
  | { what: 'many'; ids: string[]; cards: number }

const Act = ({
  glyph,
  name,
  onAct,
  danger = false,
  children,
}: {
  glyph?: ToolGlyph
  name: string
  onAct: () => void
  danger?: boolean
  children?: ReactNode
}) => (
  <button
    type="button"
    className={danger ? 'map-act map-act--danger' : 'map-act'}
    title={name}
    aria-label={name}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={onAct}
  >
    {glyph ? <Glyph of={glyph} size={16} /> : null}
    {children}
  </button>
)

type Box = { left: number; right: number; top: number; bottom: number }
const overlaps = (a: Box, b: Box): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/** How far a bar keeps inside the board's edges. */
const EDGE = 8
/** How far a bar keeps from what is picked. */
const GAP = 8

/** What a bar keeps off: other cards, the tabs of open ones, notes, wires' words and
 *  annotations. */
const AROUND =
  '.map-card:not(.map-card--selected):not(.map-card--open):not(.map-up), .map-lip, .map-note:not(.map-card--selected), .map-sentence:not(.map-sentence--selected), .map-anno:not(.map-anno--behind):not(.map-anno--picked), .map-anno-wire-words:not(.map-anno-wire-words--picked), .map-anno-line-words'
/** What is picked, which a bar never covers. */
const PICKED =
  '.map-card--selected, .map-sentence--selected, .map-anno--picked, .map-anno-line--picked, .map-anno-wire-words--picked'

/** The panels that float over the board, which a bar keeps clear of. */
const PANELS = '.sketch-panel, .map-side, .map-proposal-list'

/** The bar's top left on the board. */
type Placed = { left: number; top: number }

/** Where on the board a bar goes. It never covers what is picked: it tries
 *  over it, then under, then to its right and left, and takes the first
 *  spot that stays on the board and covers nothing else. When none is clear
 *  it takes the one that covers least. The board is read as it is drawn, so
 *  the bar needs to be told nothing more than where it would go: `at` is
 *  the middle of the picked thing's top edge, or of its bottom edge when it
 *  should hang below. */
const placeBar = (bar: HTMLElement | null, at: { x: number; y: number }, below: boolean): Placed | null => {
  const board = bar?.offsetParent
  if (!bar || !(board instanceof HTMLElement)) return null
  const origin = board.getBoundingClientRect()
  const w = bar.offsetWidth
  const h = bar.offsetHeight
  const room = { w: board.clientWidth, h: board.clientHeight }
  const local = (one: DOMRect): Box => ({
    left: one.left - origin.left,
    right: one.right - origin.left,
    top: one.top - origin.top,
    bottom: one.bottom - origin.top,
  })
  const boxes = (find: string): Box[] =>
    [...board.querySelectorAll(find)].filter((one) => !bar.contains(one)).map((one) => local(one.getBoundingClientRect()))
  const marked = boxes(PICKED)
  const picked: Box = marked.length
    ? {
        left: Math.min(...marked.map((one) => one.left)),
        right: Math.max(...marked.map((one) => one.right)),
        top: Math.min(...marked.map((one) => one.top)),
        bottom: Math.max(...marked.map((one) => one.bottom)),
      }
    : below
      ? { left: at.x, right: at.x, top: at.y - 12, bottom: at.y - 12 }
      : { left: at.x, right: at.x, top: at.y + 12, bottom: at.y + 12 }
  // Panels float over the board's edges from outside it, and are kept off too.
  const panels = [...document.querySelectorAll(PANELS)].map((one) => local(one.getBoundingClientRect()))
  const others = [...boxes(AROUND), ...panels]
  const slide = (from: number, size: number, span: number): number =>
    size > span - 2 * EDGE ? EDGE : Math.min(span - EDGE - size, Math.max(EDGE, from))
  const midX = slide((picked.left + picked.right) / 2 - w / 2, w, room.w)
  const over = { left: midX, top: picked.top - GAP - h }
  const boxOf = (spot: Placed): Box => ({ left: spot.left, right: spot.left + w, top: spot.top, bottom: spot.top + h })
  const fits = (box: Box): boolean =>
    box.left >= EDGE - 0.5 && box.right <= room.w - EDGE + 0.5 && box.top >= EDGE - 0.5 && box.bottom <= room.h - EDGE + 0.5
  const coveredBy = (box: Box): Box[] => others.filter((other) => overlaps(box, other))

  type Way = 'over' | 'under' | 'right' | 'left'
  const ways: Way[] = below ? ['under', 'over', 'right', 'left'] : ['over', 'under', 'right', 'left']
  /** From its first spot one way, the bar steps on past whatever it would
   *  cover, until it is clear or off the board. */
  const clearOf = (way: Way, along: number): Placed | null => {
    let spot: Placed =
      way === 'over'
        ? { left: along, top: picked.top - GAP - h }
        : way === 'under'
          ? { left: along, top: picked.bottom + GAP }
          : way === 'right'
            ? { left: picked.right + GAP, top: along }
            : { left: picked.left - GAP - w, top: along }
    for (let step = 0; step < 12; step += 1) {
      const box = boxOf(spot)
      if (!fits(box) || overlaps(box, picked)) return null
      const hit = coveredBy(box)
      if (!hit.length) return spot
      spot =
        way === 'over'
          ? { ...spot, top: Math.min(...hit.map((one) => one.top)) - GAP - h }
          : way === 'under'
            ? { ...spot, top: Math.max(...hit.map((one) => one.bottom)) + GAP }
            : way === 'right'
              ? { ...spot, left: Math.max(...hit.map((one) => one.right)) + GAP }
              : { ...spot, left: Math.min(...hit.map((one) => one.left)) - GAP - w }
    }
    return null
  }
  // Over and under, it may sit centred, or lined up with either end of
  // what is picked; beside, centred, or level with its top or bottom.
  const xs = [midX, slide(picked.left, w, room.w), slide(picked.right - w, w, room.w)]
  const ys = [(picked.top + picked.bottom) / 2 - h / 2, picked.top, picked.bottom - h].map((y) => slide(y, h, room.h))
  /** How far a spot is from what is picked, with a little more for each way
   *  further down the order, so near and over wins. */
  const away = (spot: Placed, order: number): number => {
    const box = boxOf(spot)
    const dx = Math.max(0, picked.left - box.right, box.left - picked.right)
    const dy = Math.max(0, picked.top - box.bottom, box.top - picked.bottom)
    return dx + dy + order * 6
  }
  let best: Placed | null = null
  let nearest = Infinity
  ways.forEach((way, order) => {
    for (const along of way === 'over' || way === 'under' ? xs : ys) {
      const spot = clearOf(way, along)
      if (spot && away(spot, order) < nearest) {
        nearest = away(spot, order)
        best = spot
      }
    }
  })
  if (best) return best
  // Nowhere is clear: the spot round it that covers least, and failing that,
  // on the board over it.
  let fewest = Infinity
  for (const spot of [over, { left: midX, top: picked.bottom + GAP }]) {
    const box = boxOf(spot)
    if (!fits(box) || overlaps(box, picked)) continue
    if (coveredBy(box).length < fewest) {
      fewest = coveredBy(box).length
      best = spot
    }
  }
  return best ?? { left: midX, top: slide(over.top, h, room.h) }
}

/** A bar floating by what is picked, kept on the board and clear of what is
 *  round it. `at` is where its bottom middle sits, or its top middle when it
 *  hangs below; it moves from there to the first clear spot. */
export const FloatingBar = ({
  at,
  below = false,
  label,
  className,
  children,
}: {
  at: { x: number; y: number }
  below?: boolean
  label: string
  className?: string
  children: ReactNode
}) => {
  const bar = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<Placed | null>(null)
  useLayoutEffect(() => {
    setPlace(placeBar(bar.current, at, below))
  }, [at.x, at.y, below])
  return (
    <div
      ref={bar}
      className={`map-context${place ? ' map-context--placed' : below ? ' map-context--below' : ''}${className ? ` ${className}` : ''}`}
      style={place ? { left: place.left, top: place.top } : { left: at.x, top: at.y }}
      role="toolbar"
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  )
}

/** The layer a picked annotation is on, as a control that opens the layers. */
export const LayerChip = ({ name, onLayers }: { name: string; onLayers?: () => void }) =>
  onLayers ? (
    <button type="button" className="map-anno-bar-layer" aria-label={`Layer: ${name}, show the layers`} title="The layer it is on" onClick={onLayers}>
      <Layers size={13} aria-hidden="true" />
      <span>{name}</span>
      <Glyph of="down" size={12} />
    </button>
  ) : (
    <span className="map-anno-bar-layer" title="The layer it is on">
      <Layers size={13} aria-hidden="true" />
      <span>{name}</span>
    </span>
  )

/** The few things a person most often does to what they picked, floating
 *  just over it: change its kind, write its words, draw inside it, line a
 *  group up, take it away. The panel at the side has the rest. */
export const ContextBar = ({
  picking,
  at,
  below = false,
  choices: cardChoices,
  onKind,
  onLook,
  onEdit,
  onOpen,
  onMockup,
  onStore,
  onAlign,
  onRemove,
  onShape,
  locked = false,
  removeName = 'Delete from sketch',
}: {
  picking: Picking
  /** Where on the screen the bar's bottom middle sits, or its top middle
   *  when it hangs below what is picked. */
  at: { x: number; y: number }
  below?: boolean
  /** What a card here can be changed to. */
  choices: CardChoice[]
  onKind: (id: string, kind: string, look?: CardLook) => void
  onLook: (id: string, look: CardLook) => void
  onEdit: (id: string) => void
  onOpen: (id: string) => void
  onMockup: (id: string) => void
  /** Opens the design of a store, or of a database's stores, beside it. */
  onStore?: (id: string) => void
  onAlign: (ids: string[], how: Alignment) => void
  onRemove: (ids: string[]) => void
  /** Draws a wire curved or at right angles. */
  onShape?: (id: string, shape: 'curved' | 'square') => void
  /** From the code: it keeps its kind and words, and can only be crossed out. */
  locked?: boolean
  removeName?: string
}) => {
  const [kinds, setKinds] = useState(false)
  const choices: CardChoice[] =
    picking.what === 'card'
      ? cardChoices
      : picking.what === 'wire'
        ? wireKinds.map((kind) => ({ key: kind, kind, hint: '' }))
        : []

  return (
    <FloatingBar at={at} below={below} label="What to do with what is picked">
      {(picking.what === 'card' || picking.what === 'wire') && !locked ? (
        <span className="map-context-kind">
          <button
            type="button"
            className="map-act map-act--wide"
            aria-label={`Kind: ${picking.kind}`}
            aria-expanded={kinds}
            onClick={() => setKinds(!kinds)}
          >
            {picking.what === 'card' ? <CardMark kind={picking.kind} look={picking.look} size={12} small /> : null}
            <span>{picking.kind}</span>
            <Glyph of="down" size={12} />
          </button>
          {kinds ? (
            <div className="map-context-list" role="menu">
              {choices.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={choice.kind === picking.kind}
                  className={choice.kind === picking.kind ? 'map-quick-row map-quick-row--on' : 'map-quick-row'}
                  onClick={() => {
                    onKind(picking.id, choice.kind, choice.look)
                    setKinds(false)
                  }}
                >
                  {picking.what === 'card' ? <CardMark kind={choice.kind} look={choice.look} size={14} /> : null}
                  {choice.kind}
                </button>
              ))}
            </div>
          ) : null}
        </span>
      ) : null}

      {picking.what === 'wire' && onShape && !locked ? (
        <>
          <span className="map-context-shape" role="group" aria-label="How the wire is drawn">
            {(
              [
                ['curved', 'curvedWires', 'Curved'],
                ['square', 'squareWires', 'Right angles'],
              ] as const
            ).map(([shape, glyph, name]) => (
              <button
                key={shape}
                type="button"
                className="map-act"
                aria-pressed={picking.shape === shape}
                title={`${name} (Tab switches)`}
                aria-label={name}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onShape(picking.id, shape)}
              >
                <Glyph of={glyph} size={16} />
              </button>
            ))}
          </span>
          <span className="map-context-rule" />
        </>
      ) : null}
      {picking.what === 'card' && picking.restyles && picking.look && !locked ? (
        <>
          <ColorPick color={picking.look.color} onPick={(color) => onLook(picking.id, { ...picking.look!, color })} />
          <span className="map-context-rule" />
        </>
      ) : null}
      {picking.what !== 'many' && !locked ? (
        <Act
          glyph="edit"
          name={picking.what === 'card' ? 'Rename' : picking.what === 'wire' ? 'Say what it is for' : 'Edit the note'}
          onAct={() => onEdit(picking.id)}
        >
          <span className="map-act-words">{picking.what === 'card' ? 'Rename' : picking.what === 'wire' ? 'Words' : 'Edit'}</span>
        </Act>
      ) : null}
      {picking.what === 'card' && picking.opens ? (
        <Act glyph="inside" name="Draw inside it" onAct={() => onOpen(picking.id)}>
          <span className="map-act-words">Draw inside</span>
        </Act>
      ) : null}
      {picking.what === 'card' && picking.stores && onStore && !locked ? (
        <Act
          glyph="fields"
          name={picking.stores === 'store' ? 'Fields and inner stores' : 'Its stores'}
          onAct={() => onStore(picking.id)}
        >
          <span className="map-act-words">{picking.stores === 'store' ? 'Fields' : 'Stores'}</span>
        </Act>
      ) : null}
      {picking.what === 'card' && picking.page ? (
        <Act glyph="mockup" name="Add a mockup" onAct={() => onMockup(picking.id)} />
      ) : null}

      {picking.what === 'many' && picking.cards > 1 ? (
        <>
          <span className="map-context-words">{picking.ids.length} picked</span>
          <span className="map-context-rule" />
          <Act glyph="alignLeft" name="Line up their left edges" onAct={() => onAlign(picking.ids, 'left')} />
          <Act glyph="alignCenter" name="Line up their centres, down" onAct={() => onAlign(picking.ids, 'center')} />
          <Act glyph="alignRight" name="Line up their right edges" onAct={() => onAlign(picking.ids, 'right')} />
          <span className="map-context-rule" />
          <Act glyph="alignTop" name="Line up their tops" onAct={() => onAlign(picking.ids, 'top')} />
          <Act glyph="alignMiddle" name="Line up their middles, across" onAct={() => onAlign(picking.ids, 'middle')} />
          <Act glyph="alignBottom" name="Line up their bottoms" onAct={() => onAlign(picking.ids, 'bottom')} />
          {picking.cards > 2 ? (
            <>
              <span className="map-context-rule" />
              <Act glyph="spaceAcross" name="Space them evenly across" onAct={() => onAlign(picking.ids, 'across')} />
              <Act glyph="spaceDown" name="Space them evenly down" onAct={() => onAlign(picking.ids, 'down')} />
            </>
          ) : null}
        </>
      ) : picking.what === 'many' ? (
        <span className="map-context-words">{picking.ids.length} picked</span>
      ) : null}

      <span className="map-context-rule" />
      <Act
        glyph="bin"
        danger
        name={`${removeName} (Delete)`}
        onAct={() => onRemove(picking.what === 'many' ? picking.ids : [picking.id])}
      />
    </FloatingBar>
  )
}
