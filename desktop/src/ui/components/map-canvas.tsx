// codegraph: component map-canvas
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
  type RefObject,
} from 'react'
import { sentenceOf, type Said } from '../../modules/wording/index.js'
import { CanvasMenu, type MenuItem } from './canvas-menu.js'
import { CardPalette } from './card-palette.js'
import { ContextBar, type Picking } from './context-bar.js'
import { Glyph, KindGlyph, keeps, kindClass } from './kind-glyph.js'
import {
  boundsOf,
  isFrame,
  layOut,
  OPEN_PAD,
  sentenceWidth,
  sizeOf,
  spread,
  wirePath,
  type Box,
  type DrawnCard,
  type DrawnNote,
  type DrawnWire,
  type Placed,
  type Slots,
} from './map-layout.js'
import { Overview } from './overview.js'
import { QuickAdd } from './quick-add.js'
import { levelInside, type Alignment, type Arrangement } from './sketch-edits.js'
import { ToolRail } from './tool-rail.js'
import { ZoomBar } from './zoom-bar.js'

type View = { x: number; y: number; k: number }
type Arrival = 'in' | 'out' | 'none'
type Spot = { x: number; y: number }

export type Tool = 'pick' | 'pan' | 'area' | 'wire' | 'note'

/** What a sketch hands the canvas so a person can draw on it. Left out, the
 *  canvas only shows. Every change is in the level's own space, the space
 *  the cards inside the card being looked at are laid out in. */
export type Drawing = {
  selected: string[]
  mockups: Record<string, string>
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onSelect: (ids: string[]) => void
  /** Pins every card on a level where the canvas laid it out, so it stays. */
  onPin: (arrangement: Arrangement) => void
  /** A card of a kind, centred on a spot, wired from another card if given.
   *  Hands back the new card's id. */
  onPlace: (at: Spot, kind: string, from?: string) => string
  onNote: (at: Spot) => string
  /** Puts things down where they were dragged. Joining makes the move one
   *  step with the one before, as when Alt and drag copied what it carries. */
  onMove: (moves: Arrangement, join?: boolean) => void
  onWire: (from: string, to: string) => string
  onRewire: (id: string, end: 'from' | 'to', card: string) => void
  /** A card's name, a wire's words, or a note's words; or, for a card,
   *  what it is for. Writing the first words of something just made joins
   *  the step that made it, so one undo takes the whole thing away. */
  onText: (id: string, text: string, first?: boolean, field?: 'says') => void
  canPaste: boolean
  onCopy: (ids: string[]) => void
  onCut: (ids: string[]) => void
  /** Puts what Copy holds onto the level, near a spot if given, and hands
   *  back the new ids. */
  onPaste: (at?: Spot) => string[]
  /** Copies things where they are, and hands back the copies' ids. */
  onDuplicate: (ids: string[], by?: number) => string[]
  onSelectAll: () => void
  onKind: (id: string, kind: string) => void
  onMockup: (id: string) => void
  onRemove: (ids: string[]) => void
  onAlign: (ids: string[], how: Alignment) => void
}

const STEP_MS = 320

/** A small thing this window remembers about how a person likes it, such as
 *  whether the card library is open. Never anything that matters. */
export const remembered = (key: string, otherwise: boolean): boolean => {
  try {
    const kept = window.localStorage.getItem(key)
    return kept === null ? otherwise : kept === 'yes'
  } catch {
    return otherwise
  }
}

export const remember = (key: string, value: boolean): void => {
  try {
    window.localStorage.setItem(key, value ? 'yes' : 'no')
  } catch {
    // Not remembered; it is only a preference.
  }
}

/** More wires than this into one card and their sentences collapse to the
 *  verb alone: a diagram cannot say eight things at once, so the card lists
 *  them instead. */
const BUSY = 4

/** How near, on the screen, an edge has to come to another to snap to it. */
const SNAP_PX = 6
/** The grid a card settles on when no edge is near. Half the dots' pitch. */
const GRID = 12

type Side = 'n' | 'e' | 's' | 'w'

/** One thing being done with the pointer, from press to release. */
type Gesture =
  | { type: 'pan'; x: number; y: number; vx: number; vy: number; moved: boolean; button: number }
  | { type: 'zoombox'; from: Spot }
  | { type: 'select'; from: Spot; add: boolean; base: string[]; moved: boolean }
  | { type: 'move'; ids: string[]; grab: Spot; starts: Map<string, Box>; moved: boolean; sx: number; sy: number; copied?: boolean }
  | { type: 'connect'; from: string; side: Side | null; rewire?: { id: string; end: 'from' | 'to' }; moved: boolean; sx: number; sy: number }

/** What a gesture under way is showing, before it lands. */
type Live = {
  marquee?: Box
  picked?: string[]
  moves?: Map<string, Spot>
  guides?: { x: number[]; y: number[] }
  line?: { from: Spot; to: Spot; target: string }
}

/** The card a path of ids leads to, and every card on the way. */
export const walk = <C extends { id: string; children: C[] }>(root: C, path: string[]): C[] => {
  const trail = [root]
  for (const id of path.slice(1)) {
    const next = trail[trail.length - 1]!.children.find((c) => c.id === id)
    if (!next) break
    trail.push(next)
  }
  return trail
}

/** Tunnelling into a card carries on through any level with only one card
 *  in it, since there is nothing to choose there (ADR 0002). On a sketch it
 *  stops at the card asked for: an empty card is somewhere to draw. */
const deeper = (trail: DrawnCard[], drawing: boolean): string[] => {
  const path = trail.map((c) => c.id)
  if (drawing) return path
  let last = trail[trail.length - 1]!
  while (last.children.length === 1 && last.children[0]!.children.length > 0) {
    last = last.children[0]!
    path.push(last.id)
  }
  return path
}

/** Tunnelling out skips back over those same levels. */
const shallower = (trail: DrawnCard[], drawing: boolean): string[] => {
  const path = trail.map((c) => c.id)
  path.pop()
  if (drawing) return path
  while (path.length > 1 && walk(trail[0]!, path).at(-1)!.children.length === 1) path.pop()
  return path
}

const kindWords = (card: DrawnCard): string => card.kind || card.level

const inBox = (at: Spot, box: Box): boolean => at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/** The middle of one side of a box, where a wire drawn from it leaves. */
const sideOf = (box: Box, side: Side): Spot =>
  side === 'n'
    ? { x: box.x + box.w / 2, y: box.y }
    : side === 's'
      ? { x: box.x + box.w / 2, y: box.y + box.h }
      : side === 'e'
        ? { x: box.x + box.w, y: box.y + box.h / 2 }
        : { x: box.x, y: box.y + box.h / 2 }

/** The side of a box that faces a spot. */
const facing = (box: Box, at: Spot): Side => {
  const dx = at.x - (box.x + box.w / 2)
  const dy = at.y - (box.y + box.h / 2)
  return Math.abs(dx) / box.w > Math.abs(dy) / box.h ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n'
}

/** A gentle curve from one spot to another, leaving and arriving level. */
const curve = (a: Spot, b: Spot): string => {
  const bend = Math.max(30, Math.abs(b.x - a.x) / 2) * (b.x >= a.x ? 1 : -1)
  return `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`
}

const Inside = ({ card }: { card: DrawnCard }) => {
  if (card.level === 'code')
    return (
      <ul className="map-names">
        {card.names.slice(0, 8).map((name) => (
          <li key={name}>{name}</li>
        ))}
        {card.names.length > 8 ? <li className="map-more">and {card.names.length - 8} more</li> : null}
      </ul>
    )
  if (card.children.length === 0) return null
  return (
    <div className="map-chips">
      {card.children.slice(0, 6).map((child) => (
        <span key={child.id} className="map-chip">
          {child.name}
        </span>
      ))}
      {card.children.length > 6 ? <span className="map-chip map-more">+{card.children.length - 6}</span> : null}
    </div>
  )
}

const SIDES: Side[] = ['n', 'e', 's', 'w']

const CardFace = ({
  placed,
  picture,
  opens,
  selected,
  receded,
  target,
  handles,
  drawing,
  onOpen,
  onPress,
  onHandle,
  onEdit,
}: {
  placed: Placed
  picture: string
  opens: boolean
  selected: boolean
  receded: boolean
  /** A wire being drawn would land here. */
  target: boolean
  /** Show the dots a wire can be drawn from. */
  handles: boolean
  drawing: boolean
  onOpen: () => void
  onPress?: (event: PointerEvent<HTMLDivElement>) => void
  onHandle?: (side: Side, event: PointerEvent<HTMLSpanElement>) => void
  onEdit?: () => void
}) => {
  const { card, box } = placed
  const classes = ['map-card', `map-card--${card.level}`, kindClass(card.kind)]
  if (keeps(card.kind)) classes.push('map-card--keeps')
  if (!card.setUp || card.kind === 'shallow software system') classes.push('map-card--bare')
  if (card.kind === 'person') classes.push('map-card--person')
  if (isFrame(card)) classes.push('map-frame')
  if (selected) classes.push('map-card--selected')
  if (receded) classes.push('map-card--outside')
  if (target) classes.push('map-card--target')
  if (drawing) classes.push('map-card--drawn')
  return (
    <div
      className={classes.join(' ')}
      data-card={card.id}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      role={opens || drawing ? 'button' : undefined}
      aria-label={drawing ? card.name || 'Unnamed card' : opens ? `Open ${card.name}` : card.name}
      aria-pressed={drawing ? selected : undefined}
      tabIndex={opens || drawing ? 0 : undefined}
      onPointerDown={onPress}
      onClick={(event) => {
        event.stopPropagation()
        if (opens && !drawing) onOpen()
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (drawing) onEdit?.()
      }}
      onKeyDown={(event) => {
        if (!drawing && opens && event.key === 'Enter') onOpen()
      }}
    >
      {isFrame(card) ? (
        <>
          <div className="map-frame-bar">
            <span className="map-dot" />
            <span className="map-dot" />
            <span className="map-dot" />
            {card.at ? (
              <span className="map-frame-at">{card.at}</span>
            ) : (
              <span className="map-frame-at map-frame-at--none">no address</span>
            )}
          </div>
          {picture ? (
            <img className="map-shot map-shot--real" src={picture} alt={`${card.name} as it looks`} draggable={false} />
          ) : (
            <div className="map-shot">{drawing ? 'No mockup yet' : 'No screenshot yet'}</div>
          )}
          <div className="map-frame-name">
            <span className="map-kind-word">{kindWords(card)}</span>
            {card.start ? (
              <span className="map-start" title="The start page">
                <Glyph of="start" size={10} />
              </span>
            ) : null}
            <span className="map-name">{card.name || <span className="map-more">Unnamed</span>}</span>
          </div>
        </>
      ) : (
        <>
          <div className="map-kind">
            <span className="map-glyph">
              <KindGlyph kind={card.kind} />
            </span>
            <span className="map-kind-word">{kindWords(card)}</span>
          </div>
          <div className="map-name">{card.name || <span className="map-more">Unnamed</span>}</div>
          {card.says ? <div className="map-says">{card.says}</div> : null}
          <Inside card={card} />
        </>
      )}
      {handles && onHandle
        ? SIDES.map((side) => (
            <span
              key={side}
              className={`map-handle map-handle--${side}`}
              title="Click to add a card here, wired; drag to wire it to another card"
              onPointerDown={(event) => {
                event.stopPropagation()
                onHandle(side, event)
              }}
            />
          ))
        : null}
    </div>
  )
}

/** A wire read aloud, in a chip on its own curve: who acts, how, on what,
 *  and what for. On a level too busy for that, the verb alone. */
const Sentence = ({
  said,
  verb,
  at,
  small,
  missing,
  unfinished,
  selected,
  pickable,
  hidden,
  measure,
  onPick,
  onEdit,
}: {
  said: Said
  verb: string
  at: Spot
  small: boolean
  /** On the map, the code gave this wire no words: a problem to show. */
  missing: boolean
  /** On a sketch, nobody has said what this wire is for yet. */
  unfinished: boolean
  selected: boolean
  pickable: boolean
  hidden: boolean
  measure: (element: HTMLDivElement | null) => void
  onPick: (event: PointerEvent<HTMLDivElement>) => void
  onEdit: () => void
}) => {
  const classes = ['map-sentence']
  if (small) classes.push('map-sentence--small')
  if (missing) classes.push('map-sentence--missing')
  if (selected) classes.push('map-sentence--selected')
  if (pickable) classes.push('map-sentence--pickable')
  const words = said.map((part) => part.text).join('')
  return (
    <div
      ref={measure}
      className={classes.join(' ')}
      style={{ left: at.x, top: at.y, visibility: hidden ? 'hidden' : undefined }}
      role={pickable ? 'button' : undefined}
      aria-label={`Wire: ${words}`}
      title={small ? words : undefined}
      onPointerDown={(event) => {
        if (!pickable) return
        event.stopPropagation()
        onPick(event)
      }}
      onDoubleClick={(event) => {
        if (!pickable) return
        event.stopPropagation()
        onEdit()
      }}
    >
      {small ? (
        <span className="map-said-verb">{verb}</span>
      ) : (
        <span className="map-said">
          {said.map((part, i) => (
            <span key={i} className={`map-said-${part.role}`}>
              {part.text}
            </span>
          ))}
          {missing ? <span className="map-said-missing"> · no words yet</span> : null}
          {unfinished ? (
            <span
              className="map-said-missing map-said-ask"
              role="button"
              aria-label="Say what the wire is for"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onEdit()
              }}
            >
              {' '}
              · what for?
            </span>
          ) : null}
        </span>
      )}
    </div>
  )
}

export const MapCanvas = ({
  root,
  path,
  onPath,
  drawing,
  onStartSketch,
}: {
  root: DrawnCard
  path: string[]
  onPath: (path: string[]) => void
  drawing?: Drawing
  onStartSketch?: () => void
}) => {
  const frame = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const [moving, setMoving] = useState(false)
  const [faded, setFaded] = useState(false)
  const [tool, setTool] = useState<Tool>('pick')
  const [palette, setPaletteNow] = useState(() => remembered('codegraph-palette', true))
  const setPalette = (open: boolean | ((was: boolean) => boolean)): void =>
    setPaletteNow((was) => {
      const next = typeof open === 'function' ? open(was) : open
      remember('codegraph-palette', next)
      return next
    })
  /** A kind waiting to be placed with a click on the board. */
  const [armed, setArmed] = useState('')
  /** A kind picked up from the library, following the pointer. */
  const [lifting, setLifting] = useState<{ kind: string; x: number; y: number; moved: boolean } | null>(null)
  const [shutOverview, setShutOverview] = useState(true)
  const [hover, setHover] = useState('')
  const [live, setLive] = useState<Live>({})
  /** Words being written in place: a card's name, a wire's, or a note's. */
  const [editing, setEditing] = useState<{
    id: string
    text: string
    was: string
    /** When writing started: a blur in the first moments is a stray focus
     *  change from the press that opened it, not the person leaving. */
    since?: number
    first?: boolean
    /** A card's second line, what it is for, rather than its name. */
    says?: boolean
  } | null>(null)
  /** The menu a right-click opened, and what it was over. */
  const [menu, setMenu] = useState<{ screen: Spot; inside: Spot; ids: string[] } | null>(null)
  /** Asking what to put where a wire was dropped, or the board double-clicked. */
  const [quick, setQuick] = useState<{ screen: Spot; inside: Spot; from: string } | null>(null)
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({})
  const chips = useRef(new Map<string, HTMLDivElement>())
  const arrival = useRef<Arrival>('none')
  const fitK = useRef(1)
  const busy = useRef(false)
  const space = useRef(false)
  const gesture = useRef<Gesture | null>(null)
  /** A pointer pressed on a card or a dot, held only once it starts to drag,
   *  so a plain click or double-click still lands on what was pressed. */
  const pending = useRef<number | null>(null)
  /** Where the pointer last was during a gesture, for the board to keep
   *  moving under it at an edge. */
  const lastPointer = useRef<{ clientX: number; clientY: number } | null>(null)
  const dragged = useRef(false)
  const seen = useRef(view)
  seen.current = view

  const selected = drawing?.selected ?? []
  const trail = useMemo(() => walk(root, path), [root, path])
  const focus = trail[trail.length - 1]!
  const parent = trail.length > 1 ? trail[trail.length - 2]! : null
  const notes: DrawnNote[] = focus.notes ?? []

  // The level inside the card being looked at, laid out in its own space.
  const inside = useMemo(() => layOut(focus.children, focus.wires), [focus])
  const insideBounds = useMemo(
    () => boundsOf([...inside.map((p) => p.box), ...notes.map((n) => ({ x: n.x, y: n.y, w: 180, h: 60 }))]),
    [inside, notes],
  )

  // A sketch keeps every card where the canvas first showed it, so moving one
  // never shuffles the rest.
  useEffect(() => {
    if (!drawing) return
    if (focus.children.some((c) => c.x === undefined || c.y === undefined))
      drawing.onPin(inside.map((p) => ({ id: p.card.id, x: Math.round(p.box.x), y: Math.round(p.box.y) })))
  }, [drawing, focus, inside])

  // Opening a card leaves it where it is on its own level and grows it to
  // hold what is inside, so the cards around it and their wires stay in view.
  const around = useMemo(
    () =>
      parent
        ? layOut(parent.children, parent.wires, {
            id: focus.id,
            w: Math.max(insideBounds.w + OPEN_PAD * 2, sizeOf(focus).w),
            h: Math.max(insideBounds.h + OPEN_PAD * 2, sizeOf(focus).h),
          })
        : [],
    [parent, focus, insideBounds],
  )
  const openBox = around.find((p) => p.card.id === focus.id)?.box ?? null
  const shift = useMemo(
    () =>
      openBox ? { x: openBox.x + OPEN_PAD - insideBounds.x, y: openBox.y + OPEN_PAD - insideBounds.y } : { x: 0, y: 0 },
    [openBox, insideBounds],
  )

  const laid = useMemo(
    () => inside.map((p) => ({ ...p, box: { ...p.box, x: p.box.x + shift.x, y: p.box.y + shift.y } })),
    [inside, shift],
  )
  const placed = useMemo(() => {
    const moves = live.moves
    if (!moves) return laid
    return laid.map((p) => {
      const to = moves.get(p.card.id)
      return to ? { ...p, box: { ...p.box, x: to.x + shift.x, y: to.y + shift.y } } : p
    })
  }, [laid, live.moves, shift])
  const outside = useMemo(() => around.filter((p) => p.card.id !== focus.id), [around, focus])

  const where = useMemo(() => {
    const all = new Map<string, Box>(placed.map((p) => [p.card.id, p.box]))
    for (const p of around) all.set(p.card.id, p.box)
    return all
  }, [placed, around])

  const nameOf = useMemo(() => {
    const all = new Map<string, string>()
    for (const p of [...placed, ...around]) all.set(p.card.id, p.card.name || 'unnamed')
    return all
  }, [placed, around])

  const noteBoxes = useMemo(
    () =>
      notes.map((note) => {
        const to = live.moves?.get(note.id)
        const at = to ?? note
        return { note, box: { x: at.x + shift.x, y: at.y + shift.y, w: 180, h: 60 } }
      }),
    [notes, live.moves, shift],
  )

  /** Every wire on screen, with its curve, its sentence, and where that sits. */
  const shapes = useMemo(() => {
    const draw = (wires: DrawnWire[]) => {
      const outs = new Map<string, string[]>()
      const ins = new Map<string, string[]>()
      const height = (id: string): number => where.get(id)?.y ?? 0
      for (const wire of wires) {
        outs.set(wire.from, [...(outs.get(wire.from) ?? []), wire.to])
        ins.set(wire.to, [...(ins.get(wire.to) ?? []), wire.from])
      }
      for (const list of [...outs.values(), ...ins.values()]) list.sort((a, b) => height(a) - height(b))
      const share = (ends: Map<string, string[]>, id: string, other: string): number => {
        const list = ends.get(id) ?? []
        return (list.indexOf(other) + 1) / (list.length + 1)
      }
      const slots = (from: string, to: string): Slots => ({ from: share(outs, from, to), to: share(ins, to, from) })
      return wires.flatMap((wire) => {
        const from = where.get(wire.from)
        const to = where.get(wire.to)
        if (!from || !to) return []
        const key = wire.id ?? `${wire.from}>${wire.to}>${wire.kind}`
        return [
          {
            wire,
            key,
            shape: wirePath(from, to, slots(wire.from, wire.to), [...where.values()]),
            small: (ins.get(wire.to) ?? []).length > BUSY,
            said: sentenceOf(nameOf.get(wire.from) ?? '', wire.kind, nameOf.get(wire.to) ?? '', wire.words),
          },
        ]
      })
    }
    const inner = draw(focus.wires)
    const outer = parent ? draw(parent.wires) : []
    const all = [...outer, ...inner]
    // Each sentence keeps clear of every card and of every other sentence,
    // at the size it was really drawn.
    const spots = spread(
      all.map((one) => {
        const size = sizes[one.key]
        return {
          at: one.shape.at,
          w: size?.w ?? (one.small ? 60 : sentenceWidth(one.wire)),
          h: size?.h ?? 24,
          tail: one.shape.tail,
          head: one.shape.head,
        }
      }),
      [...placed.map((p) => p.box), ...outside.map((p) => p.box), ...noteBoxes.map((n) => n.box)],
    )
    const at = all.map((one, i) => ({ ...one, at: spots[i]! }))
    return { outer: at.slice(0, outer.length), inner: at.slice(outer.length) }
  }, [focus, parent, where, nameOf, sizes, placed, outside, noteBoxes])

  // Sentences are measured as drawn, so the next layout keeps each one clear
  // of the cards at its true size rather than a guess at it.
  useLayoutEffect(() => {
    let changed = false
    const next: Record<string, { w: number; h: number }> = {}
    for (const [key, element] of chips.current) {
      const w = element.offsetWidth
      const h = element.offsetHeight
      next[key] = { w, h }
      const was = sizes[key]
      if (!was || Math.abs(was.w - w) > 1 || Math.abs(was.h - h) > 1) changed = true
    }
    if (changed) setSizes(next)
  })

  /** Where a wire from outside crosses the border of the card that is open,
   *  and the card inside it the wire really reaches, to carry it through to. */
  const ports = useMemo(() => {
    if (!openBox) return []
    // Every card drawn inside the open one, and everything inside those, by
    // the card on this level that holds it.
    const holder = new Map<string, string>()
    const hold = (card: DrawnCard, top: string): void => {
      holder.set(card.id, top)
      for (const child of card.children) hold(child, top)
    }
    for (const child of focus.children) hold(child, child.id)
    return shapes.outer
      .filter((one) => one.wire.to === focus.id || one.wire.from === focus.id)
      .map((one) => {
        const into = one.wire.to === focus.id
        const meets = into ? one.shape.head : one.shape.tail
        const reached = [
          ...new Set((one.wire.ends ?? []).map((end) => holder.get(into ? end.to : end.from)).filter((id): id is string => Boolean(id))),
        ]
        const through = reached.flatMap((id) => {
          const box = where.get(id)
          if (!box) return []
          const to = sideOf(box, facing(box, meets))
          return [{ id, d: into ? curve(meets, to) : curve(to, meets), into }]
        })
        return { key: one.key, verb: one.wire.kind, x: meets.x, y: meets.y, through }
      })
      .filter((port) => port.x >= openBox.x - 2 && port.x <= openBox.x + openBox.w + 2)
  }, [shapes, openBox, focus, where])

  /** What reaches a busy card, listed beside it, because a wall of chips
   *  says nothing and a list says everything. */
  const pins = useMemo(() => {
    const id = selected.length === 1 ? selected[0]! : hover
    if (!id) return null
    const rows = focus.wires.filter((wire) => wire.to === id)
    if (rows.length <= BUSY) return null
    const at = where.get(id)
    const card = focus.children.find((c) => c.id === id)
    if (!at || !card) return null
    return { at, name: card.name, rows: rows.slice(0, 6), more: rows.length - 6 }
  }, [selected, hover, focus, where])

  const fitted = useCallback((): View => {
    const el = frame.current
    // Fitting an opened card takes in the cards wired to it as well, because
    // keeping how the outside world reaches this one is the point of opening
    // it in place rather than replacing the screen.
    const reaches = openBox
      ? around
          .filter(
            (p) =>
              p.card.id !== focus.id &&
              (parent?.wires ?? []).some(
                (wire) =>
                  (wire.from === focus.id && wire.to === p.card.id) || (wire.to === focus.id && wire.from === p.card.id),
              ),
          )
          .map((p) => p.box)
      : []
    const bounds = openBox
      ? boundsOf([openBox, ...reaches])
      : boundsOf([...laid.map((p) => p.box), ...notes.map((n) => ({ x: n.x + shift.x, y: n.y + shift.y, w: 180, h: 60 }))])
    if (!el || bounds.w === 0) {
      fitK.current = 1
      return { x: (el?.clientWidth ?? 0) / 2, y: (el?.clientHeight ?? 0) / 2, k: 1 }
    }
    const pad = 120
    const k = Math.min((el.clientWidth - pad) / bounds.w, (el.clientHeight - pad) / bounds.h, 1.3)
    fitK.current = k
    return {
      x: el.clientWidth / 2 - (bounds.x + bounds.w / 2) * k,
      y: el.clientHeight / 2 - (bounds.y + bounds.h / 2) * k,
      k,
    }
  }, [laid, notes, openBox, shift, around, parent, focus])
  const fittedNow = useRef(fitted)
  fittedNow.current = fitted

  const fit = useCallback((): void => setView(fittedNow.current()), [])

  // Each new level arrives from the direction it was reached. Drawing on a
  // level leaves the view where the person has it.
  useLayoutEffect(() => {
    const target = fittedNow.current()
    const came = arrival.current
    arrival.current = 'none'
    if (came === 'none') {
      setMoving(false)
      setFaded(false)
      setView(target)
      busy.current = false
      return
    }
    const scale = came === 'in' ? 0.55 : 1.8
    const el = frame.current!
    setMoving(false)
    setFaded(true)
    setView({
      k: target.k * scale,
      x: el.clientWidth / 2 - (el.clientWidth / 2 - target.x) * scale,
      y: el.clientHeight / 2 - (el.clientHeight / 2 - target.y) * scale,
    })
    const settle = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setMoving(true)
        setFaded(false)
        setView(target)
        setTimeout(() => {
          setMoving(false)
          busy.current = false
        }, STEP_MS)
      }),
    )
    return () => cancelAnimationFrame(settle)
  }, [focus.id, drawing ? '' : root])

  useEffect(() => {
    const refit = (): void => setView(fittedNow.current())
    window.addEventListener('resize', refit)
    return () => window.removeEventListener('resize', refit)
  }, [])

  const canOpen = (card: DrawnCard): boolean => (drawing ? card.level !== 'code' : card.children.length > 0)

  /** Opening a card: one inside the card we are in goes deeper; one beside
   *  it moves sideways, into that card instead. */
  const tunnelIn = useCallback(
    (card: DrawnCard, sideways = false): void => {
      const at = where.get(card.id)
      const el = frame.current
      if (!at || !el || busy.current || !canOpen(card)) return
      busy.current = true
      setEditing(null)
      setQuick(null)
      const k = Math.min(el.clientWidth / at.w, el.clientHeight / at.h) * 0.9
      setMoving(true)
      setFaded(true)
      setView({ k, x: el.clientWidth / 2 - (at.x + at.w / 2) * k, y: el.clientHeight / 2 - (at.y + at.h / 2) * k })
      setTimeout(() => {
        arrival.current = 'in'
        drawing?.onSelect([])
        const base = sideways ? trail.slice(0, -1) : trail
        onPath(deeper([...base, card], Boolean(drawing)))
      }, STEP_MS)
    },
    [where, trail, onPath, drawing],
  )

  const tunnelOut = useCallback((): void => {
    if (trail.length < 2 || busy.current) return
    busy.current = true
    setEditing(null)
    setQuick(null)
    setMoving(true)
    setFaded(true)
    setView((v) => {
      const el = frame.current!
      const scale = 0.4
      return {
        k: v.k * scale,
        x: el.clientWidth / 2 - (el.clientWidth / 2 - v.x) * scale,
        y: el.clientHeight / 2 - (el.clientHeight / 2 - v.y) * scale,
      }
    })
    setTimeout(() => {
      arrival.current = 'out'
      drawing?.onSelect([])
      onPath(shallower(trail, Boolean(drawing)))
    }, STEP_MS)
  }, [trail, onPath, drawing])

  const zoomBy = useCallback((by: number): void => {
    const el = frame.current
    if (!el) return
    setView((v) => {
      const k = Math.min(Math.max(v.k * by, 0.1), 4)
      const cx = el.clientWidth / 2
      const cy = el.clientHeight / 2
      return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k }
    })
  }, [])

  // Zooming far enough into a card tunnels into it; far enough out tunnels
  // out. A trackpad's two fingers pan; pinching, or ctrl with the wheel, zooms.
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const wheel = (event: WheelEvent): void => {
      event.preventDefault()
      if (busy.current) return
      const rect = el.getBoundingClientRect()
      const cx = event.clientX - rect.left
      const cy = event.clientY - rect.top
      const v = seen.current
      const trackpad = event.deltaMode === 0 && Math.abs(event.deltaY) < 50 && !Number.isInteger(event.deltaY * 2)
      if (!event.ctrlKey && !event.metaKey && (event.shiftKey || (event.deltaMode === 0 && Math.abs(event.deltaX) > 0) || trackpad)) {
        const dx = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX
        const dy = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY
        setView({ ...v, x: v.x - dx, y: v.y - dy })
        return
      }
      const k = Math.min(Math.max(v.k * Math.exp(-event.deltaY * 0.0015), 0.08), 5)
      const worldX = (cx - v.x) / v.k
      const worldY = (cy - v.y) / v.k
      if (k > fitK.current * 3) {
        const under = placed.find((p) => inBox({ x: worldX, y: worldY }, p.box))
        if (under && canOpen(under.card)) tunnelIn(under.card)
        else setView({ k, x: cx - worldX * k, y: cy - worldY * k })
        return
      }
      if (k < fitK.current * 0.5) {
        if (trail.length > 1) tunnelOut()
        else setView({ k, x: cx - worldX * k, y: cy - worldY * k })
        return
      }
      setView({ k, x: cx - worldX * k, y: cy - worldY * k })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [placed, trail, tunnelIn, tunnelOut])

  const startEditing = useCallback(
    (id: string, seed?: string, says = false): void => {
      if (!drawing) return
      const card = focus.children.find((c) => c.id === id)
      const wire = focus.wires.find((w) => w.id === id)
      const note = notes.find((n) => n.id === id)
      const was = card ? (says ? card.says : card.name) : wire ? wire.words : note ? note.text : null
      if (was === null) return
      drawing.onSelect([id])
      setEditing({ id, text: seed ?? was, was, says: Boolean(card && says), since: Date.now() })
    },
    [drawing, focus, notes],
  )

  // Something being written on is always in sight: a card made off the edge
  // of the board, or under the panel, brings the board round to it.
  useEffect(() => {
    if (!editing) return
    const box = where.get(editing.id) ?? noteBoxes.find((n) => n.note.id === editing.id)?.box
    const el = frame.current
    if (!box || !el) return
    const MARGIN = 48
    const v = seen.current
    const left = v.x + box.x * v.k
    const top = v.y + box.y * v.k
    const right = left + box.w * v.k
    const bottom = top + box.h * v.k
    let dx = 0
    let dy = 0
    if (right > el.clientWidth - MARGIN) dx = el.clientWidth - MARGIN - right
    if (left + dx < MARGIN) dx = MARGIN - left
    if (bottom > el.clientHeight - MARGIN) dy = el.clientHeight - MARGIN - bottom
    if (top + dy < MARGIN) dy = MARGIN - top
    if (dx || dy) setView((now) => ({ ...now, x: now.x + dx, y: now.y + dy }))
  }, [editing?.id, where, noteBoxes])

  const finishEditing = useCallback(
    (keep: boolean): void => {
      if (!editing || !drawing) return
      if (keep && editing.text !== editing.was)
        drawing.onText(editing.id, editing.text, editing.first, editing.says ? 'says' : undefined)
      setEditing(null)
    },
    [editing, drawing],
  )

  /** Writing starts once the press that made the thing has finished, or
   *  the press would take the typing away from it as it lands. */
  const writeSoon = (id: string): void => {
    setTimeout(() => setEditing({ id, text: '', was: '', first: true, since: Date.now() }), 0)
  }

  /** A card put down, and then straight into writing its name. */
  const placeAt = useCallback(
    (at: Spot, kind: string, from = ''): void => {
      if (!drawing) return
      const id = drawing.onPlace(at, kind, from)
      drawing.onSelect([id])
      writeSoon(id)
    },
    [drawing],
  )

  const noteAt = useCallback(
    (at: Spot): void => {
      if (!drawing) return
      const id = drawing.onNote(at)
      drawing.onSelect([id])
      writeSoon(id)
    },
    [drawing],
  )

  useEffect(() => {
    const typing = (target: EventTarget | null): boolean =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    const down = (event: KeyboardEvent): void => {
      if (event.key === ' ' && !typing(event.target)) {
        space.current = true
        return
      }
      if (typing(event.target)) return
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey
      if (event.key === 'Escape') {
        if (quick) setQuick(null)
        else if (armed) setArmed('')
        else if (tool !== 'pick') setTool('pick')
        else if (selected.length) drawing?.onSelect([])
        else tunnelOut()
        return
      }
      if (!drawing && event.key === 'Backspace') tunnelOut()
      // Ctrl and 0, = or - always zoom the board. The keys alone zoom too,
      // unless something is picked, when they are words being typed on it.
      const zoomKeys = (event.ctrlKey || event.metaKey) && !event.altKey ? true : plain && !(drawing && selected.length)
      if (zoomKeys && (event.key === '0' || event.key === '+' || event.key === '=' || event.key === '-')) {
        event.preventDefault()
        if (event.key === '0') fit()
        else zoomBy(event.key === '-' ? 0.8 : 1.25)
        return
      }
      if (!drawing || !plain) return
      // With one thing picked, typing writes its words, the way a diagram
      // tool lets you just start typing on a shape.
      if (selected.length === 1 && (event.key === 'Enter' || event.key === 'F2')) {
        event.preventDefault()
        startEditing(selected[0]!)
        return
      }
      if (selected.length === 1 && event.key.length === 1 && /\S/.test(event.key)) {
        event.preventDefault()
        startEditing(selected[0]!, event.key)
        return
      }
      if (selected.length) return
      const key = event.key.toLowerCase()
      if (key === 'v') setTool('pick')
      if (key === 'h') setTool('pan')
      if (key === 'w') setTool('wire')
      if (key === 'n') setTool('note')
      if (key === 'c') setPalette((open) => !open)
    }
    const up = (event: KeyboardEvent): void => {
      if (event.key === ' ') space.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [tunnelOut, drawing, fit, zoomBy, quick, armed, tool, selected, startEditing])

  const worldOf = (event: { clientX: number; clientY: number }): Spot => {
    const rect = frame.current!.getBoundingClientRect()
    const v = seen.current
    return { x: (event.clientX - rect.left - v.x) / v.k, y: (event.clientY - rect.top - v.y) / v.k }
  }
  /** A spot on the board, in the board's own pixels, kept far enough from its
   *  edges that a menu opened there fits. */
  const screenOf = (event: { clientX: number; clientY: number }): Spot => {
    const rect = frame.current!.getBoundingClientRect()
    const MENU_W = 248
    const MENU_H = 380
    return {
      x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - MENU_W)),
      y: Math.max(8, Math.min(event.clientY - rect.top, rect.height - MENU_H)),
    }
  }
  /** The same spot, in the space the cards inside the open card are laid out in. */
  const insideOf = (at: Spot): Spot => ({ x: at.x - shift.x, y: at.y - shift.y })

  const cardUnder = (at: Spot, not = ''): string =>
    placed.find((p) => p.card.id !== not && inBox(at, p.box))?.card.id ?? ''

  /** Holds on to the pointer once a press turns into a drag, and not
   *  before, so a plain click still lands on what was clicked. */
  const capture = (event: PointerEvent<HTMLElement>): void => {
    pending.current = event.pointerId
  }

  /** Pressing a card or a note on a sketch: picks it, and picks it up. */
  const press = (id: string) => (event: PointerEvent<HTMLElement>): void => {
    if (!drawing || event.button !== 0 || space.current || tool === 'pan') return
    event.stopPropagation()
    setQuick(null)
    if (editing && editing.id !== id) finishEditing(true)
    if (tool === 'wire' && focus.children.some((c) => c.id === id)) {
      gesture.current = { type: 'connect', from: id, side: null, moved: false, sx: event.clientX, sy: event.clientY }
      pending.current = event.pointerId
      return
    }
    const add = event.shiftKey || event.ctrlKey || event.metaKey
    let picked = selected
    if (add) picked = selected.includes(id) ? selected.filter((one) => one !== id) : [...selected, id]
    else if (!selected.includes(id)) picked = [id]
    drawing.onSelect(picked)
    if (!picked.includes(id)) return
    const starts = new Map<string, Box>()
    for (const p of laid) if (picked.includes(p.card.id)) starts.set(p.card.id, { ...p.box, x: p.box.x - shift.x, y: p.box.y - shift.y })
    for (const n of notes) if (picked.includes(n.id)) starts.set(n.id, { x: n.x, y: n.y, w: 180, h: 60 })
    // Alt and drag leaves the originals where they are and carries copies,
    // the way a diagram tool does.
    let carried = picked
    if (event.altKey) {
      const copies = drawing.onDuplicate(picked, 0)
      const order = [...starts.keys()]
      const copied = new Map<string, Box>()
      order.forEach((was, i) => {
        const copy = copies[i]
        if (copy) copied.set(copy, starts.get(was)!)
      })
      starts.clear()
      for (const [key, box] of copied) starts.set(key, box)
      carried = copies
      drawing.onSelect(copies)
    }
    gesture.current = { type: 'move', ids: carried, grab: worldOf(event), starts, moved: false, sx: event.clientX, sy: event.clientY, copied: event.altKey }
    pending.current = event.pointerId
  }

  const pressHandle = (id: string) => (side: Side, event: PointerEvent<HTMLSpanElement>): void => {
    if (!drawing) return
    setQuick(null)
    gesture.current = { type: 'connect', from: id, side, moved: false, sx: event.clientX, sy: event.clientY }
    pending.current = event.pointerId
  }

  /** Pressing one end of a picked wire, to point it at another card. */
  const pressEnd = (wireId: string, end: 'from' | 'to', other: string) => (event: PointerEvent<SVGCircleElement>): void => {
    if (!drawing) return
    event.stopPropagation()
    gesture.current = { type: 'connect', from: other, side: null, rewire: { id: wireId, end }, moved: false, sx: event.clientX, sy: event.clientY }
    pending.current = event.pointerId
  }

  /** A new card of the same kind as one already there, put on one side of
   *  it, wired from it, and straight into writing its name. */
  const besideOf = (id: string, side: Side): void => {
    const source = laid.find((p) => p.card.id === id)
    if (!source) return
    const box = { ...source.box, x: source.box.x - shift.x, y: source.box.y - shift.y }
    const size = sizeOf(source.card)
    const gapAcross = Math.max(200, size.w * 0.7)
    const gapDown = Math.max(120, size.h * 0.8)
    const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
    const at =
      side === 'e'
        ? { x: centre.x + box.w / 2 + gapAcross + size.w / 2, y: centre.y }
        : side === 'w'
          ? { x: centre.x - box.w / 2 - gapAcross - size.w / 2, y: centre.y }
          : side === 's'
            ? { x: centre.x, y: centre.y + box.h / 2 + gapDown + size.h / 2 }
            : { x: centre.x, y: centre.y - box.h / 2 - gapDown - size.h / 2 }
    placeAt(at, source.card.kind, id)
  }

  /** The menu for a right-click, on what is under the pointer or the board. */
  const openMenu = (event: { clientX: number; clientY: number }, at: Spot): void => {
    const card = cardUnder(at)
    const note = noteBoxes.find((n) => inBox(at, n.box))?.note.id ?? ''
    const under = card || note
    let ids = selected
    if (under && !selected.includes(under)) {
      ids = [under]
      drawing?.onSelect(ids)
    } else if (!under) ids = []
    const rect = frame.current!.getBoundingClientRect()
    setMenu({
      screen: {
        x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - 240)),
        y: Math.max(8, Math.min(event.clientY - rect.top, rect.height - 320)),
      },
      inside: insideOf(at),
      ids,
    })
  }

  const down = (event: PointerEvent<HTMLDivElement>): void => {
    setQuick(null)
    if (editing) finishEditing(true)
    setMenu(null)
    const panning = event.button === 1 || event.button === 2 || space.current || tool === 'pan'
    if (panning) {
      gesture.current = { type: 'pan', x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false, button: event.button }
      capture(event)
      return
    }
    if (event.button !== 0) return
    if (drawing && armed) {
      placeAt(insideOf(worldOf(event)), armed)
      if (!event.shiftKey) setArmed('')
      dragged.current = true
      return
    }
    if (drawing && tool === 'note') {
      noteAt(insideOf(worldOf(event)))
      setTool('pick')
      dragged.current = true
      return
    }
    if (!drawing && tool === 'area') {
      gesture.current = { type: 'zoombox', from: worldOf(event) }
      capture(event)
      return
    }
    if (drawing && tool === 'pick') {
      const add = event.shiftKey || event.ctrlKey || event.metaKey
      gesture.current = { type: 'select', from: worldOf(event), add, base: add ? selected : [], moved: false }
      capture(event)
      return
    }
    gesture.current = { type: 'pan', x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false, button: event.button }
    capture(event)
  }

  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const now = gesture.current
    if (!now) return
    lastPointer.current = { clientX: event.clientX, clientY: event.clientY }
    const at = worldOf(event)
    const hold = (): void => {
      if (pending.current === null) return
      try {
        frame.current?.setPointerCapture(pending.current)
      } catch {
        // A pointer the browser will not hand over still works within the board.
      }
      pending.current = null
    }
    if (now.type === 'pan') {
      const dx = event.clientX - now.x
      const dy = event.clientY - now.y
      if (!now.moved && Math.hypot(dx, dy) < 4) return
      now.moved = true
      hold()
      setView((v) => ({ ...v, x: now.vx + dx, y: now.vy + dy }))
      return
    }
    if (now.type === 'zoombox' || now.type === 'select') {
      const box = { x: Math.min(now.from.x, at.x), y: Math.min(now.from.y, at.y), w: Math.abs(at.x - now.from.x), h: Math.abs(at.y - now.from.y) }
      if (now.type === 'select') {
        if (!now.moved && box.w * seen.current.k < 4 && box.h * seen.current.k < 4) return
        now.moved = true
        hold()
        const caught = [
          ...placed.filter((p) => overlaps(box, p.box)).map((p) => p.card.id),
          ...noteBoxes.filter((n) => overlaps(box, n.box)).map((n) => n.note.id),
        ]
        setLive({ marquee: box, picked: [...new Set([...now.base, ...caught])] })
      } else {
        hold()
        setLive({ marquee: box })
      }
      return
    }
    if (now.type === 'move') {
      if (!now.moved && Math.hypot(event.clientX - now.sx, event.clientY - now.sy) < 3) return
      now.moved = true
      hold()
      let dx = at.x - now.grab.x
      let dy = at.y - now.grab.y
      // The group lines up with cards that are staying put: an edge or a
      // centre comes within a few pixels of another's and settles on it.
      const group = boundsOf([...now.starts.values()].map((b) => ({ ...b, x: b.x + shift.x + dx, y: b.y + shift.y + dy })))
      const still = placed.filter((p) => !now.ids.includes(p.card.id)).map((p) => p.box)
      const near = SNAP_PX / seen.current.k
      const lines = { x: [] as number[], y: [] as number[] }
      const xs = [group.x, group.x + group.w / 2, group.x + group.w]
      const ys = [group.y, group.y + group.h / 2, group.y + group.h]
      let bestX: { by: number; line: number } | null = null
      let bestY: { by: number; line: number } | null = null
      for (const box of still) {
        for (const x of [box.x, box.x + box.w / 2, box.x + box.w])
          for (const mine of xs) if (Math.abs(x - mine) < near && (!bestX || Math.abs(x - mine) < Math.abs(bestX.by))) bestX = { by: x - mine, line: x }
        for (const y of [box.y, box.y + box.h / 2, box.y + box.h])
          for (const mine of ys) if (Math.abs(y - mine) < near && (!bestY || Math.abs(y - mine) < Math.abs(bestY.by))) bestY = { by: y - mine, line: y }
      }
      const first = [...now.starts.values()][0]!
      if (bestX) {
        dx += bestX.by
        lines.x.push(bestX.line)
      } else dx = Math.round((first.x + dx) / GRID) * GRID - first.x
      if (bestY) {
        dy += bestY.by
        lines.y.push(bestY.line)
      } else dy = Math.round((first.y + dy) / GRID) * GRID - first.y
      const moves = new Map<string, Spot>()
      for (const [id, box] of now.starts) moves.set(id, { x: box.x + dx, y: box.y + dy })
      setLive({ moves, guides: lines })
      return
    }
    if (now.type === 'connect') {
      // A wire is drawn once the pointer has really moved; a press and
      // release on a dot is a click, which adds a card beside.
      if (!now.moved && Math.hypot(event.clientX - now.sx, event.clientY - now.sy) < 4) return
      now.moved = true
      hold()
      const source = where.get(now.from)
      if (!source) return
      const target = cardUnder(at, now.from)
      const targetBox = target ? where.get(target) : undefined
      const from = now.side ? sideOf(source, now.side) : sideOf(source, facing(source, at))
      const to = targetBox ? sideOf(targetBox, facing(targetBox, sideOf(source, 'e'))) : at
      setLive({ line: { from, to, target } })
    }
  }

  // Carrying something to the edge of the board moves the board along, so
  // a card, a wire or a pick box can go past what is on screen.
  const moveNow = useRef(move)
  moveNow.current = move
  useEffect(() => {
    let frameId = 0
    const EDGE = 36
    const FASTEST = 18
    const tick = (): void => {
      frameId = requestAnimationFrame(tick)
      const now = gesture.current
      const at = lastPointer.current
      const el = frame.current
      if (!now || !at || !el || now.type === 'pan' || now.type === 'zoombox') return
      if (now.type !== 'select' && !now.moved) return
      const rect = el.getBoundingClientRect()
      const push = (near: number): number => (near < EDGE ? Math.ceil(((EDGE - near) / EDGE) * FASTEST) : 0)
      const dx = push(at.clientX - rect.left) - push(rect.right - at.clientX)
      const dy = push(at.clientY - rect.top) - push(rect.bottom - at.clientY)
      if (!dx && !dy) return
      const v = seen.current
      const next = { ...v, x: v.x + dx, y: v.y + dy }
      seen.current = next
      setView(next)
      moveNow.current(at as PointerEvent<HTMLDivElement>)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [])

  const up = (event: PointerEvent<HTMLDivElement>): void => {
    lastPointer.current = null
    const now = gesture.current
    gesture.current = null
    pending.current = null
    const shown = live
    setLive({})
    if (!now) return
    const at = worldOf(event)
    if (now.type === 'pan') {
      dragged.current = now.moved
      if (!now.moved && now.button === 2 && drawing) openMenu(event, at)
      return
    }
    if (now.type === 'zoombox') {
      const box = shown.marquee
      if (box && box.w > 20 && box.h > 20) {
        const el = frame.current!
        const k = Math.min(el.clientWidth / box.w, el.clientHeight / box.h, 4)
        setView({ k, x: el.clientWidth / 2 - (box.x + box.w / 2) * k, y: el.clientHeight / 2 - (box.y + box.h / 2) * k })
        setTool('pick')
      }
      return
    }
    if (now.type === 'select') {
      if (now.moved) drawing?.onSelect(shown.picked ?? now.base)
      else if (!now.add) drawing?.onSelect([])
      dragged.current = now.moved
      return
    }
    if (now.type === 'move') {
      if (now.moved && shown.moves && drawing) {
        drawing.onMove([...shown.moves].map(([id, spot]) => ({ id, x: spot.x, y: spot.y })), now.copied)
        dragged.current = true
      }
      return
    }
    if (now.type === 'connect' && drawing) {
      dragged.current = true
      if (!now.moved) {
        // A click on a dot, not a drag: a card of the same kind on that side,
        // wired to this one, the way a diagram tool's quick-add arrows work.
        if (now.side && !now.rewire) besideOf(now.from, now.side)
        return
      }
      const target = cardUnder(at, now.from)
      if (now.rewire) {
        if (target) drawing.onRewire(now.rewire.id, now.rewire.end, target)
        return
      }
      if (target) {
        const id = drawing.onWire(now.from, target)
        drawing.onSelect([id])
        return
      }
      // A wire let go on empty board asks what it reaches, and makes it.
      setQuick({ screen: screenOf(event), inside: insideOf(at), from: now.from })
    }
  }

  // A kind lifted from the library follows the pointer until it is let go.
  useEffect(() => {
    if (!lifting) return
    const follow = (event: globalThis.PointerEvent): void =>
      setLifting((was) =>
        was ? { ...was, x: event.clientX, y: event.clientY, moved: was.moved || Math.hypot(event.clientX - was.x, event.clientY - was.y) > 4 } : was,
      )
    const drop = (event: globalThis.PointerEvent): void => {
      const rect = frame.current?.getBoundingClientRect()
      const was = lifting
      setLifting(null)
      if (!was || !rect) return
      const over = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      if (over && (was.moved || Math.hypot(event.clientX - was.x, event.clientY - was.y) > 4)) {
        placeAt(insideOf(worldOf(event)), was.kind)
        setArmed('')
      }
    }
    window.addEventListener('pointermove', follow)
    window.addEventListener('pointerup', drop)
    return () => {
      window.removeEventListener('pointermove', follow)
      window.removeEventListener('pointerup', drop)
    }
  }, [lifting, placeAt, shift])

  const empty = focus.children.length === 0 && notes.length === 0
  const screen: Box = {
    x: -view.x / view.k,
    y: -view.y / view.k,
    w: (frame.current?.clientWidth ?? 0) / view.k,
    h: (frame.current?.clientHeight ?? 0) / view.k,
  }

  /** What is picked, and where its bar floats, on the screen. */
  const picking = useMemo((): { what: Picking; box: Box } | null => {
    if (!drawing || selected.length === 0 || editing || menu || live.moves || live.marquee) return null
    if (selected.length > 1) {
      const boxes = [
        ...placed.filter((p) => selected.includes(p.card.id)).map((p) => p.box),
        ...noteBoxes.filter((n) => selected.includes(n.note.id)).map((n) => n.box),
      ]
      if (!boxes.length) return null
      return {
        what: { what: 'many', ids: selected, cards: placed.filter((p) => selected.includes(p.card.id)).length },
        box: boundsOf(boxes),
      }
    }
    const id = selected[0]!
    const card = placed.find((p) => p.card.id === id)
    if (card)
      return {
        what: {
          what: 'card',
          id,
          kind: card.card.kind,
          level: card.card.level,
          page: card.card.kind === 'page',
          opens: canOpen(card.card),
        },
        box: card.box,
      }
    const wire = shapes.inner.find((one) => one.wire.id === id)
    if (wire) {
      const size = sizes[wire.key] ?? { w: 160, h: 24 }
      return { what: { what: 'wire', id, kind: wire.wire.kind }, box: { x: wire.at.x - size.w / 2, y: wire.at.y - size.h / 2, ...size } }
    }
    const note = noteBoxes.find((n) => n.note.id === id)
    return note ? { what: { what: 'note', id }, box: note.box } : null
  }, [drawing, selected, editing, menu, live, placed, noteBoxes, shapes, sizes])

  /** What the right-click menu offers, for what was under the pointer. */
  const menuItems = (ids: string[], inside: Spot): MenuItem[] => {
    if (!drawing) return []
    const one = ids.length === 1 ? ids[0]! : ''
    const card = one ? focus.children.find((c) => c.id === one) : undefined
    if (ids.length === 0)
      return [
        { name: 'Add a card here…', glyph: 'card', keys: 'Double-click', act: () => setQuick({ screen: menu!.screen, inside, from: '' }) },
        { name: 'Add a note here', glyph: 'note', act: () => noteAt(inside) },
        'rule',
        ...(drawing.canPaste
          ? [{ name: 'Paste here', glyph: 'copy' as const, keys: 'Ctrl+V', act: () => drawing.onSelect(drawing.onPaste(inside)) }]
          : []),
        { name: 'Pick everything', keys: 'Ctrl+A', act: () => drawing.onSelectAll() },
      ]
    return [
      ...(one ? [{ name: card ? 'Rename' : 'Edit the words', glyph: 'edit' as const, keys: 'Enter', act: () => startEditing(one) }] : []),
      ...(card ? [{ name: 'Say what it is for', act: () => startEditing(one, undefined, true) }] : []),
      ...(card && canOpen(card as DrawnCard)
        ? [{ name: 'Draw inside it', glyph: 'inside' as const, act: () => {
            const placedCard = placed.find((p) => p.card.id === one)
            if (placedCard) tunnelIn(placedCard.card)
          } }]
        : []),
      ...(card?.kind === 'page' ? [{ name: 'Add a mockup', glyph: 'mockup' as const, act: () => drawing.onMockup(one) }] : []),
      'rule',
      { name: 'Cut', keys: 'Ctrl+X', act: () => drawing.onCut(ids) },
      { name: 'Copy', glyph: 'copy', keys: 'Ctrl+C', act: () => drawing.onCopy(ids) },
      { name: 'Duplicate', keys: 'Ctrl+D', act: () => drawing.onSelect(drawing.onDuplicate(ids)) },
      'rule',
      { name: ids.length > 1 ? `Take these ${ids.length} off` : 'Take it off the sketch', glyph: 'bin', keys: 'Delete', danger: true, act: () => {
        drawing.onRemove(ids)
        drawing.onSelect([])
      } },
    ]
  }

  const wireGroup = (list: typeof shapes.inner, opts: { faint?: boolean } = {}): ReactElement[] =>
    list.map(({ wire, key, shape }) => (
      <g
        key={key}
        className={`map-wire map-wire--${wire.kind.replace(/\s+/g, '-')}${
          drawing && wire.id && selected.includes(wire.id) ? ' map-wire--selected' : ''
        }${opts.faint ? ' map-wire--outside' : ''}`}
      >
        <path d={shape.d} markerEnd="url(#map-head)" />
        {drawing && wire.id && !opts.faint ? (
          <path
            d={shape.d}
            className="map-wire-hit"
            onPointerDown={(event) => {
              event.stopPropagation()
              drawing.onSelect(event.shiftKey ? [...selected, wire.id!] : [wire.id!])
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              startEditing(wire.id!)
            }}
          />
        ) : null}
      </g>
    ))

  const editingBox = editing ? where.get(editing.id) : undefined
  const editingNote = editing ? noteBoxes.find((n) => n.note.id === editing.id) : undefined
  const editingWire = editing ? shapes.inner.find((one) => one.wire.id === editing.id) : undefined
  const pickedWire = drawing && selected.length === 1 ? shapes.inner.find((one) => one.wire.id === selected[0]) : undefined
  const childLevel = levelInside[focus.level]

  return (
    <>
      <ToolRail
        tool={tool}
        sketch={Boolean(drawing)}
        palette={palette}
        canUndo={drawing?.canUndo ?? false}
        canRedo={drawing?.canRedo ?? false}
        onTool={(next) => {
          setArmed('')
          setTool(next)
        }}
        onPalette={() => setPalette(!palette)}
        onUndo={() => drawing?.onUndo()}
        onRedo={() => drawing?.onRedo()}
        onStartSketch={() => onStartSketch?.()}
        onFit={fit}
        onOverview={() => setShutOverview(!shutOverview)}
      />
      {drawing && palette && childLevel !== focus.level ? (
        <CardPalette
          level={childLevel}
          armed={armed}
          onArm={(kind) => {
            setArmed(kind)
            setTool('pick')
          }}
          onLift={(kind, event) => setLifting({ kind, x: event.clientX, y: event.clientY, moved: false })}
          onClose={() => setPalette(false)}
        />
      ) : null}
      <div
        ref={frame}
        className={`map-frame-area map-frame-area--${armed ? 'card' : tool}${space.current ? ' map-frame-area--pan' : ''}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          gesture.current = null
          setLive({})
        }}
        onContextMenu={(event) => event.preventDefault()}
        onScroll={(event) => {
          event.currentTarget.scrollLeft = 0
          event.currentTarget.scrollTop = 0
        }}
        onDoubleClick={(event) => {
          if (!drawing || event.target !== event.currentTarget) return
          setQuick({ screen: screenOf(event), inside: insideOf(worldOf(event)), from: '' })
        }}
        onClickCapture={(event) => {
          if (dragged.current) event.stopPropagation()
          dragged.current = false
        }}
      >
        {drawing && (armed || tool === 'wire' || tool === 'note') ? (
          <div className="map-hint" role="status">
            {armed
              ? `Click to place a ${armed}. Hold Shift to place more.`
              : tool === 'wire'
                ? 'Drag from one card to another.'
                : 'Click to leave a note.'}
            <span className="map-hint-keys">
              <kbd>Esc</kbd> to stop
            </span>
          </div>
        ) : null}
        {empty ? (
          <div className="map-empty">
            {drawing
              ? 'Nothing drawn here yet. Drag a card in from the left, or double-click anywhere to add one.'
              : focus.level === 'project'
                ? 'Link a software system to see its map.'
                : focus.setUp
                  ? 'Nothing inside this yet.'
                  : 'Not set up for codegraph yet, so there is nothing to draw inside it.'}
          </div>
        ) : null}
        <div
          className={moving ? 'map-world map-world--moving' : 'map-world'}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, opacity: faded ? 0 : 1 }}
        >
          <svg className="map-wires" width="1" height="1">
            <defs>
              <marker id="map-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="map-head" />
              </marker>
              <marker id="map-head-live" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="map-head-live" />
              </marker>
            </defs>
            {wireGroup(shapes.outer, { faint: true })}
            {ports.flatMap((port) =>
              port.through.map((one) => (
                <path
                  key={`${port.key}>${one.id}`}
                  d={one.d}
                  className="map-through"
                  markerEnd={one.into ? 'url(#map-head)' : undefined}
                />
              )),
            )}
            {wireGroup(shapes.inner)}
            {live.line ? (
              <path d={curve(live.line.from, live.line.to)} className="map-wire-live" markerEnd="url(#map-head-live)" />
            ) : null}
            {live.guides
              ? [
                  ...live.guides.x.map((x) => (
                    <line key={`x${x}`} x1={x} x2={x} y1={screen.y} y2={screen.y + screen.h} className="map-guide" />
                  )),
                  ...live.guides.y.map((y) => (
                    <line key={`y${y}`} y1={y} y2={y} x1={screen.x} x2={screen.x + screen.w} className="map-guide" />
                  )),
                ]
              : null}
          </svg>

          {/* The cards beside the one that is open stay in view, so you keep
              how the outside world reaches what you are looking at. */}
          {outside.map((p) => (
            <CardFace
              key={p.card.id}
              placed={p}
              picture={drawing?.mockups[p.card.id] ?? p.card.shot}
              opens={canOpen(p.card)}
              selected={false}
              receded
              target={false}
              handles={false}
              drawing={false}
              onOpen={() => tunnelIn(p.card, true)}
            />
          ))}

          {openBox ? (
            <div
              className={`map-card map-card--open ${kindClass(focus.kind)}`}
              style={{ left: openBox.x, top: openBox.y, width: openBox.w, height: openBox.h }}
            >
              <span className="map-lip">
                <span className="map-kind-word">{kindWords(focus)}</span>
                <span className="map-name" style={{ marginTop: 0 }}>
                  {focus.name || 'Unnamed'}
                </span>
              </span>
              {ports.map((port) => (
                <span
                  key={port.key}
                  className="map-port"
                  title={port.verb}
                  style={{ left: port.x - openBox.x, top: port.y - openBox.y }}
                />
              ))}
            </div>
          ) : null}

          {placed.map((p) => {
            const picked = (live.picked ?? selected).includes(p.card.id)
            return (
              <CardFace
                key={p.card.id}
                placed={p}
                picture={drawing?.mockups[p.card.id] ?? p.card.shot}
                opens={canOpen(p.card)}
                selected={picked}
                receded={false}
                target={live.line?.target === p.card.id}
                handles={Boolean(drawing) && (tool === 'pick' || tool === 'wire') && !armed && (hover === p.card.id || (picked && selected.length === 1)) && !live.moves}
                drawing={Boolean(drawing)}
                onOpen={() => tunnelIn(p.card)}
                onPress={drawing ? press(p.card.id) : undefined}
                onHandle={drawing ? pressHandle(p.card.id) : undefined}
                onEdit={() => startEditing(p.card.id)}
              />
            )
          })}

          {/* Hovering is tracked on the board, not on each card, so a card's
              dots stay while the pointer crosses onto them. */}
          <HoverWatch placed={placed} where={frame} view={view} onHover={setHover} />

          {noteBoxes.map(({ note, box }) => {
            const picked = (live.picked ?? selected).includes(note.id)
            return (
              <div
                key={note.id}
                className={picked ? 'map-note map-card--selected' : 'map-note'}
                style={{ left: box.x, top: box.y }}
                role={drawing ? 'button' : undefined}
                aria-label={`Note: ${note.text || 'empty'}`}
                onPointerDown={press(note.id)}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  startEditing(note.id)
                }}
                onClick={(event) => event.stopPropagation()}
              >
                {editing?.id === note.id ? null : note.text || <span className="map-more">Empty note</span>}
              </div>
            )
          })}

          {/* Sentences go over the cards, so a wire that passes behind one
              still says what it is for. */}
          {[...shapes.outer, ...shapes.inner].map(({ wire, key, at, small, said }) => (
            <Sentence
              key={key}
              said={said}
              verb={wire.kind}
              at={at}
              small={small}
              missing={!drawing && !wire.words && wire.kind !== 'leads to' && wire.kind !== 'keeps'}
              unfinished={Boolean(drawing) && !wire.words && wire.kind !== 'leads to' && Boolean(wire.id)}
              selected={Boolean(drawing && wire.id && selected.includes(wire.id))}
              pickable={Boolean(drawing && wire.id)}
              hidden={Boolean(editing && wire.id && editing.id === wire.id)}
              measure={(element) => {
                if (element) chips.current.set(key, element)
                else chips.current.delete(key)
              }}
              onPick={(event) => {
                if (!wire.id || !drawing) return
                setQuick(null)
                drawing.onSelect(event.shiftKey ? [...selected, wire.id] : [wire.id])
              }}
              onEdit={() => wire.id && startEditing(wire.id)}
            />
          ))}

          {/* The two ends of a picked wire, to drag onto another card. */}
          {pickedWire && pickedWire.wire.id ? (
            <svg className="map-wires map-wires--ends" width="1" height="1">
              <circle
                cx={pickedWire.shape.tail.x}
                cy={pickedWire.shape.tail.y}
                r={6}
                className="map-wire-end"
                onPointerDown={pressEnd(pickedWire.wire.id, 'from', pickedWire.wire.to)}
              />
              <circle
                cx={pickedWire.shape.head.x}
                cy={pickedWire.shape.head.y}
                r={6}
                className="map-wire-end"
                onPointerDown={pressEnd(pickedWire.wire.id, 'to', pickedWire.wire.from)}
              />
            </svg>
          ) : null}

          {editing && drawing ? (
            editingNote ? (
              <textarea
                ref={focusQuietly}
                className="map-edit map-edit--note"
                aria-label="Note"
                style={{ left: editingNote.box.x, top: editingNote.box.y }}
                value={editing.text}
                placeholder="Write a note"
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                onBlur={(event) => {
                  if (Date.now() - (editing.since ?? 0) < 250) {
                    const box = event.currentTarget
                    setTimeout(() => box.focus({ preventScroll: true }), 0)
                    return
                  }
                  finishEditing(true)
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) finishEditing(true)
                }}
              />
            ) : editingWire ? (
              <input
                ref={focusQuietly}
                className="map-edit map-edit--wire"
                aria-label="What the wire is for"
                style={{ left: editingWire.at.x, top: editingWire.at.y }}
                value={editing.text}
                placeholder="what it is for, e.g. saves the note"
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                onBlur={(event) => {
                  if (Date.now() - (editing.since ?? 0) < 250) {
                    const box = event.currentTarget
                    setTimeout(() => box.focus({ preventScroll: true }), 0)
                    return
                  }
                  finishEditing(true)
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter') finishEditing(true)
                  if (event.key === 'Escape') finishEditing(false)
                }}
              />
            ) : editingBox && editing.says ? (
              <textarea
                ref={focusQuietly}
                className="map-edit map-edit--says"
                aria-label="What it is for"
                style={{ left: editingBox.x + 12, top: editingBox.y + 62, width: editingBox.w - 24 }}
                rows={2}
                value={editing.text}
                placeholder="What it is for, in one line"
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                onBlur={(event) => {
                  if (Date.now() - (editing.since ?? 0) < 250) {
                    const box = event.currentTarget
                    setTimeout(() => box.focus({ preventScroll: true }), 0)
                    return
                  }
                  finishEditing(true)
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Tab' && event.shiftKey) {
                    event.preventDefault()
                    const id = editing.id
                    finishEditing(true)
                    setTimeout(() => startEditing(id), 0)
                    return
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    finishEditing(true)
                  }
                  if (event.key === 'Escape') finishEditing(false)
                }}
              />
            ) : editingBox ? (
              <input
                className={`map-edit map-edit--name${isFrame(placed.find((p) => p.card.id === editing.id)?.card ?? root) ? ' map-edit--frame' : ''}`}
                aria-label="Card name"
                ref={focusQuietly}
                style={{
                  left: editingBox.x + 12,
                  top: isFrame(placed.find((p) => p.card.id === editing.id)?.card ?? root) ? editingBox.y + editingBox.h - 34 : editingBox.y + 34,
                  width: editingBox.w - 24,
                }}
                value={editing.text}
                placeholder="Name it"
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                onBlur={(event) => {
                  if (Date.now() - (editing.since ?? 0) < 250) {
                    const box = event.currentTarget
                    setTimeout(() => box.focus({ preventScroll: true }), 0)
                    return
                  }
                  finishEditing(true)
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Tab' && !event.shiftKey) {
                    // Tab goes on to say what it is for, without the mouse.
                    event.preventDefault()
                    const id = editing.id
                    finishEditing(true)
                    setTimeout(() => startEditing(id, undefined, true), 0)
                    return
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    finishEditing(true)
                  }
                  if (event.key === 'Escape') finishEditing(false)
                }}
              />
            ) : null
          ) : null}

          {pins ? (
            <div className="map-pins" style={{ left: pins.at.x + pins.at.w + 16, top: pins.at.y }}>
              <div className="map-pins-head">What reaches {pins.name}</div>
              {pins.rows.map((row) => (
                <div key={`${row.from}>${row.kind}`} className="map-pins-row map-pins-row--said">
                  {sentenceOf(nameOf.get(row.from) ?? row.from, row.kind, pins.name, row.words).map((part, i) => (
                    <span key={i} className={`map-said-${part.role}`}>
                      {part.text}
                    </span>
                  ))}
                </div>
              ))}
              {pins.more > 0 ? <div className="map-pins-row map-more">… {pins.more} more</div> : null}
            </div>
          ) : null}

          {live.marquee ? (
            <div
              className={gesture.current?.type === 'select' ? 'map-marquee map-marquee--pick' : 'map-marquee'}
              style={{ left: live.marquee.x, top: live.marquee.y, width: live.marquee.w, height: live.marquee.h }}
            />
          ) : null}
        </div>

        {picking ? (
          <ContextBar
            key={selected.join(',')}
            picking={picking.what}
            below={view.y + picking.box.y * view.k < 56}
            at={{
              x: Math.max(160, Math.min(view.x + (picking.box.x + picking.box.w / 2) * view.k, (frame.current?.clientWidth ?? 0) - 160)),
              y:
                view.y + picking.box.y * view.k < 56
                  ? view.y + (picking.box.y + picking.box.h) * view.k + 12
                  : view.y + picking.box.y * view.k - 12,
            }}
            onKind={(id, kind) => drawing?.onKind(id, kind)}
            onEdit={(id) => startEditing(id)}
            onOpen={(id) => {
              const card = placed.find((p) => p.card.id === id)
              if (card) tunnelIn(card.card)
            }}
            onMockup={(id) => drawing?.onMockup(id)}
            onAlign={(ids, how) => drawing?.onAlign(ids, how)}
            onRemove={(ids) => {
              drawing?.onRemove(ids)
              drawing?.onSelect([])
            }}
          />
        ) : null}

        {menu && drawing ? (
          <CanvasMenu
            at={menu.screen}
            onClose={() => setMenu(null)}
            items={menuItems(menu.ids, menu.inside)}
          />
        ) : null}

        {quick && drawing ? (
          <QuickAdd
            level={childLevel}
            at={quick.screen}
            wired={Boolean(quick.from)}
            onPick={(kind) => {
              placeAt(quick.inside, kind, quick.from)
              setQuick(null)
            }}
            onNote={() => {
              noteAt(quick.inside)
              setQuick(null)
            }}
            onClose={() => setQuick(null)}
          />
        ) : null}

        <ZoomBar
          scale={view.k}
          atTop={trail.length < 2}
          onIn={() => zoomBy(1.25)}
          onOut={() => zoomBy(0.8)}
          onFit={fit}
          onUp={tunnelOut}
        />
        <Overview
          of={focus.name || 'This level'}
          placed={laid}
          view={screen}
          shut={shutOverview}
          onToggle={() => setShutOverview(!shutOverview)}
          onGo={(at) => {
            const el = frame.current!
            setView((v) => ({ ...v, x: el.clientWidth / 2 - at.x * v.k, y: el.clientHeight / 2 - at.y * v.k }))
          }}
        />
      </div>

      {lifting && lifting.moved ? (
        <div className={`map-lifted ${kindClass(lifting.kind)}`} style={{ left: lifting.x, top: lifting.y }}>
          <KindGlyph kind={lifting.kind} size={14} />
          <span>{lifting.kind}</span>
        </div>
      ) : null}
    </>
  )
}

/** Puts the caret in a box that has just appeared, without scrolling the
 *  board to show it: the board is placed by its own view, never by scroll. */
const focusQuietly = (element: HTMLInputElement | HTMLTextAreaElement | null): void => {
  if (!element || element === document.activeElement) return
  element.focus({ preventScroll: true })
  const end = element.value.length
  element.setSelectionRange(end, end)
}

/** Works out which card the pointer is over from where it is on the board,
 *  so the dots a wire is drawn from do not vanish as the pointer moves onto
 *  them, half outside the card. */
const HoverWatch = ({
  placed,
  where,
  view,
  onHover,
}: {
  placed: Placed[]
  where: RefObject<HTMLDivElement>
  view: View
  onHover: (id: string) => void
}) => {
  useEffect(() => {
    const el = where.current
    if (!el) return
    const REACH = 14
    const watch = (event: globalThis.PointerEvent): void => {
      const rect = el.getBoundingClientRect()
      const at = { x: (event.clientX - rect.left - view.x) / view.k, y: (event.clientY - rect.top - view.y) / view.k }
      const reach = REACH / view.k
      const over = placed.find((p) =>
        inBox(at, { x: p.box.x - reach, y: p.box.y - reach, w: p.box.w + reach * 2, h: p.box.h + reach * 2 }),
      )
      onHover(over?.card.id ?? '')
    }
    const leave = (): void => onHover('')
    el.addEventListener('pointermove', watch)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', watch)
      el.removeEventListener('pointerleave', leave)
    }
  }, [placed, where, view, onHover])
  return null
}
