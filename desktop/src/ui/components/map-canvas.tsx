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
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react'
import { sentenceOf } from '../../modules/wording/index.js'
import { ArrowLeft, Copy as CopyIcon, Trash2 } from 'lucide-react'
import { roomKey } from '../../modules/arrangements/schema.js'
import type { Layer } from '../../modules/annotations/index.js'
import type { CardType } from '../../modules/card-types/schema.js'
import type { CardLook } from '../../modules/sketches/schema.js'
import { addLayer, changeAnnotation, changeLayer, duplicateAnnotations, layerOf, placeAnnotation, removeAnnotations, removeLayer } from './annotation-edits.js'
import { AnnotationLayer, AnnotationPlacer, caughtBy, drawnAmong, drawnOn } from './annotation-layer.js'
import { AnnotationLibrary, LayersPanel } from './annotation-library.js'
import { COLOR_NAMES, COLORS, shapeOf } from './annotation-shapes.js'
import { IconPick } from './card-look-editor.js'
import { BLANK_LOOK, CARD_SHAPES, drawnShape, lookOf } from './card-looks.js'
import { meetOutline, textAreaOf } from './shape-outline.js'
import { CanvasMenu, type MenuItem } from './canvas-menu.js'
import { SidePanel } from './side-panel.js'
import { CardPalette } from './card-palette.js'
import { hotkeyFor } from './hotkeys.js'
import { KeyList } from './key-list.js'
import { ContextBar, type Picking } from './context-bar.js'
import { isStore, KindGlyph, LookGlyph, kindClass, lookClass } from './kind-glyph.js'
import {
  between,
  boundsOf,
  curve,
  deeper,
  facing,
  holds,
  inBox,
  isFrame,
  keyOf,
  layOut,
  loopSides,
  openLevels,
  overlaps,
  reachingOpen,
  resized,
  roomAround,
  sentenceWidth,
  shallower,
  sideOf,
  sizeOf,
  spread,
  springy,
  walk,
  wirePath,
  wireThrough,
  type AnnoThing,
  type Box,
  type DrawnCard,
  type DrawnNote,
  type DrawnWire,
  type Grip,
  type OpenLevel,
  type Placed,
  type Side,
  type Slots,
  type Spot,
} from './map-layout.js'
import { CardFace, Sentence, kindWords } from './map-faces.js'
import { Overview } from './overview.js'
import { QuickAdd } from './quick-add.js'
import { choicesIn, endsAtHub, hubOfWire, levelIn, levelInside, ownTypesAt, type Alignment, type Arrangement, type CardChoice } from './sketch-edits.js'
import { TogetherLayer, type Other } from './together-layer.js'
import { ToolRail } from './tool-rail.js'
import { ZoomBar } from './zoom-bar.js'

type View = { x: number; y: number; k: number }

export type Tool = 'pick' | 'pan' | 'area' | 'wire' | 'note'

/** What a sketch hands the canvas so a person can draw on it. Left out, the
 *  canvas only shows. Every change is to the level being worked on, the one
 *  last pressed, in that level's own space. */
export type Drawing = {
  /** Which level is being worked on now, by the card it is inside. */
  onLevel: (id: string) => void
  /** How much room an open card has, by the path to it. Joining makes it one
   *  step with the one before. */
  onRoom: (path: string[], room: Box, join?: boolean) => void
  selected: string[]
  mockups: Record<string, string>
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onSelect: (ids: string[]) => void
  /** Pins every card on a level where the canvas laid it out, so it stays. */
  onPin: (arrangement: Arrangement) => void
  /** A card of a kind, centred on a spot, wired from another card if given,
   *  or to a hub the way the hub's wire runs. Hands back the new card's id. */
  onPlace: (at: Spot, kind: string, from?: string, hub?: { into: boolean; kind: string }, look?: CardLook) => string
  onNote: (at: Spot) => string
  /** Puts things down where they were dragged. Joining makes the move one
   *  step with the one before, as when Alt and drag copied what it carries. */
  onMove: (moves: Arrangement, join?: boolean) => void
  onWire: (from: string, to: string, kind?: string) => string
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
  onKind: (id: string, kind: string, look?: CardLook) => void
  /** How a card looks: its icon, shape and colour. */
  onLook: (id: string, look: CardLook) => void
  /** The types of card a person has saved, and changing them. */
  cardTypes: CardType[]
  onCardTypes: (types: CardType[]) => void
  onMockup: (id: string) => void
  onRemove: (ids: string[]) => void
  onAlign: (ids: string[], how: Alignment) => void
  /** Drawing over the map: cards of this level are not opened, since what
   *  is inside them is the agent's to decide. */
  floor?: string
  /** Things from the code, which can be crossed out but not written on. */
  locked?: string[]
  /** What taking something away is called: off a sketch, or crossed out. */
  removeName?: string
}

/** How long the board takes to glide through one click of a mouse wheel. */
const WHEEL_GLIDE_MS = 140

/** How long the board takes to bring an open card into view. */
const STEP_MS = 320
/** How long cards take to settle as a card opens or closes. */
const SETTLE_MS = 420

/** How much of the board's visible space a newly opened card takes. */
const ROOM_ACROSS = 0.7
const ROOM_DOWN = 0.78

const GRIPS: Grip[] = ['n', 'e', 's', 'w', 'nw', 'ne', 'sw', 'se']

/** What a map hands the canvas so a person can shift its cards and its
 *  wires' sentences out of each other's way. The map is still only shown:
 *  where things sit is kept beside it, and moving one changes no code. */
export type Rearranging = {
  /** Where things have been put, by card id or by wire key, and how much
   *  room a card has when open, by `roomKey`. */
  spots: Arrangement
  /** Every card on the level where it now sits, with any sentence moved and
   *  any room changed, and the wires whose moved sentences a moved card has
   *  let go of. */
  onMove: (moves: Arrangement, letGo?: string[]) => void
  /** Forgets where these were put, so the map lays them out again. */
  onForget: (ids: string[]) => void
  /** A viewer's: things stay where they are put. */
  frozen?: boolean
}

/** What a map or a sketch hands the canvas so annotations can be drawn over
 *  it: its layers, and where changes to them go. A viewer sees them frozen. */
export type Annotating = {
  layers: Layer[]
  onChange: (layers: Layer[], step?: string) => void
  frozen?: boolean
}

/** Who else is on this board, and how this member's hands reach them. */
export type Together = {
  others: Other[]
  /** What others have hold of, and whose name to show. */
  heldBy: Map<string, string>
  onCursor: (inside: string, x: number, y: number) => void
  onDragging: (moves: { id: string; x: number; y: number }[]) => void
  /** Takes hold of things before moving or typing on them. False if someone
   *  else has one of them. */
  onHold: (ids: string[]) => Promise<boolean>
  onLetGo: (ids: string[]) => void
  /** Goes where a member is. */
  onGo: (inside: string) => void
}

/** Whether a wheel event comes from a trackpad rather than a mouse wheel.
 *  A wheel moves in whole notches, straight up and down; a trackpad sends
 *  small, uneven steps, often sideways too. A Mac speeds up a wheel spun fast,
 *  which makes its steps uneven as well, but it still counts whole notches of
 *  120, and a trackpad does not. Once a trackpad is heard, the rest of the
 *  same swipe counts as one, though its last steps may be big. */
const isTrackpad = (event: WheelEvent, until: { current: number }): boolean => {
  const now = performance.now()
  const step = event.deltaY || event.deltaX
  const { wheelDeltaX, wheelDeltaY } = event as WheelEvent & { wheelDeltaX: number; wheelDeltaY: number }
  const notched = (wheelDeltaX !== 0 || wheelDeltaY !== 0) && wheelDeltaX % 120 === 0 && wheelDeltaY % 120 === 0
  const pad =
    event.deltaMode === 0 &&
    ((event.deltaX !== 0 && event.deltaY !== 0) ||
      (event.deltaX !== 0 && !event.shiftKey) ||
      // A notch is whole, give or take the screen's scaling.
      (Math.abs(step - Math.round(step)) > 0.01 && !notched) ||
      Math.abs(step) < 40)
  if (pad || now < until.current) {
    until.current = now + 400
    return true
  }
  return false
}

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

/** One thing being done with the pointer, from press to release. */
type Gesture =
  | { type: 'pan'; x: number; y: number; vx: number; vy: number; moved: boolean; button: number }
  | { type: 'zoombox'; from: Spot }
  /** A box drawn to pick with, and the level under where it was started. */
  | { type: 'select'; from: Spot; base: string[]; annoBase: string[]; depth: number; moved: boolean }
  | {
      type: 'move'
      ids: string[]
      grab: Spot
      starts: Map<string, Box>
      moved: boolean
      sx: number
      sy: number
      copied?: boolean
      /** A wire's sentence, nudged aside: it settles where it is let go,
       *  with no grid and nothing to line up with. */
      free?: boolean
    }
  | { type: 'connect'; from: string; side: Side | null; rewire?: { id: string; end: 'from' | 'to' }; moved: boolean; sx: number; sy: number }
  /** Dragging a handle on an open card. */
  | { type: 'resize'; id: string; depth: number; grip: Grip; grab: Spot; start: Box; moved: boolean }

/** What a gesture under way is showing, before it lands. */
type Live = {
  marquee?: Box
  picked?: string[]
  moves?: Map<string, Spot>
  guides?: { x: number[]; y: number[] }
  line?: { from: Spot; to: Spot; target: string }
  /** The room of an open card whose handle is being dragged. */
  room?: { id: string; box: Box }
}

/** The outline of a card that is not a plain box, if it is one. */
const outlineOf = (card: DrawnCard): string => {
  const shape = drawnShape(card)
  return shape ? CARD_SHAPES[shape].d : ''
}

/** A place on the border of an open card that a wire from outside meets, for
 *  the parts inside to wire to. */
type Hub = {
  id: string
  at: Spot
  /** The wire comes in here, rather than going out. */
  into: boolean
  kind: string
  /** The card at the other end of the wire. */
  name: string
  /** The level the open card sits on. */
  depth: number
  wire: string
}

/** Whether a card's icon, type and colour are a person's to change. A database,
 *  a store and a page are their own kinds, and a card on the context level is
 *  one of three. */
const restyles = (card: DrawnCard): boolean =>
  ownTypesAt(card.level) && card.kind !== 'database' && !isStore(card.kind) && (card.role ?? card.kind) !== 'page'

/** A database or a store holds stores, which are not a look a person makes up. */
const holdsStores = (card: { level: DrawnCard['level']; kind: string }): boolean =>
  isStore(card.kind) || (card.level === 'container' && (card.kind === 'database' || card.kind === 'files on disk'))

/** Whether anything can be drawn inside a card: anything but code, and a
 *  store, whose inner stores sit at its own level. */
const holdsCards = (card: { level: DrawnCard['level']; kind: string }): boolean =>
  levelInside[card.level] !== card.level || isStore(card.kind)

/** How wide a hub is on the board. */
const HUB_SIZE = 16

/** How far a level is from the one in hand: how faded it is. */
const upClass = (up: number): string => (up > 0 ? ` map-up map-up--${Math.min(up, 3)}` : '')

/** Everything the library offers inside a card, in one list. */
const pickChoice = (card: Parameters<typeof choicesIn>[0], types: CardType[]): CardChoice[] =>
  choicesIn(card, types).flatMap((group) => group.choices)

export const MapCanvas = ({
  root,
  path,
  onPath,
  drawing,
  rearranging,
  annotating,
  agent,
  cardExtra,
  onStartSketch,
  together,
}: {
  /** What the page puts on a card, if anything, by the card. */
  cardExtra?: (card: DrawnCard) => ReactNode
  root: DrawnCard
  path: string[]
  onPath: (path: string[]) => void
  drawing?: Drawing
  /** Left out, the map's cards and sentences stay where it lays them. */
  rearranging?: Rearranging
  /** Left out, no annotations are shown or drawn. */
  annotating?: Annotating
  /** Where an agent says it is working, to mark on the card or the card it
   *  is inside. */
  agent?: { card: string; words: string } | null
  onStartSketch?: () => void
  /** Others working here, if anyone. */
  together?: Together
}) => {
  const frame = useRef<HTMLDivElement>(null)
  const [view, showView] = useState<View>({ x: 0, y: 0, k: 1 })
  // A click of a mouse wheel glides to where it is going. Anything else that
  // moves the board takes over from the glide at once.
  const wheelGlide = useRef<{ to: View; frame: number } | null>(null)
  const setView = useCallback((next: SetStateAction<View>): void => {
    if (wheelGlide.current) cancelAnimationFrame(wheelGlide.current.frame)
    wheelGlide.current = null
    showView(next)
  }, [])
  useEffect(() => () => {
    if (wheelGlide.current) cancelAnimationFrame(wheelGlide.current.frame)
  }, [])
  const [moving, setMoving] = useState(false)
  const [tool, setTool] = useState<Tool>('pick')
  const [palette, setPaletteNow] = useState(() => remembered('codegraph-palette', true))
  const setPalette = (open: boolean | ((was: boolean) => boolean)): void =>
    setPaletteNow((was) => {
      const next = typeof open === 'function' ? open(was) : open
      remember('codegraph-palette', next)
      return next
    })
  /** Something from the library waiting to be placed with a click, by its key. */
  const [armed, setArmed] = useState('')
  // Annotations: the library and the layers list, a shape waiting to be put
  // down, what is picked and what is being typed into, and which layer new
  // ones go on.
  const [annoOpen, setAnnoOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [annoArmed, setAnnoArmed] = useState('')
  // The cards and the annotations share one side panel: opening one shuts the other.
  const openPalette = (open: boolean): void => {
    setPalette(open)
    if (open) {
      setAnnoOpen(false)
      setAnnoArmed('')
    }
  }
  const openAnnotations = (open: boolean): void => {
    setAnnoOpen(open)
    setAnnoArmed('')
    if (open) setPalette(false)
  }
  const [annoPicked, setAnnoPicked] = useState<string[]>([])
  const [annoEditing, setAnnoEditing] = useState('')
  const [activeLayer, setActiveLayer] = useState('')
  const [annoFresh, setAnnoFresh] = useState('')
  /** Where an annotation being dragged or sized has got to. */
  const [annoPreview, setAnnoPreview] = useState<Map<string, Box> | null>(null)
  const [keysOpen, setKeysOpen] = useState(false)
  /** Says which layer a key just stepped to, for a moment. */
  const [layerSaid, setLayerSaid] = useState('')

  /** The layer new annotations go on: the one picked, else the top one. */
  const layerFor = (layers: Layer[]): [Layer[], string] => {
    if (layers.some((l) => l.id === activeLayer)) return [layers, activeLayer]
    if (layers.length) return [layers, layers[layers.length - 1]!.id]
    return addLayer([], 'Annotations')
  }

  /** The layers to put a new annotation into, and which: worked out once a
   *  render, since a first layer made twice would be two different layers. */
  const ready = useMemo(() => (annotating ? layerFor(annotating.layers) : ([[], ''] as [Layer[], string])), [annotating?.layers, activeLayer])

  /** A kind picked up from the library, following the pointer. */
  const [lifting, setLifting] = useState<{ kind: string; x: number; y: number; moved: boolean } | null>(null)
  const [shutOverview, setShutOverview] = useState(true)
  const [hover, setHover] = useState('')
  /** What is picked on a map that is only shown. A sketch keeps its own. */
  const [held, setHeld] = useState<string[]>([])
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
    /** A card's type, rather than its name. */
    type?: boolean
  } | null>(null)
  /** The card whose icon is being picked. */
  const [iconsFor, setIconsFor] = useState('')
  /** The menu a right-click opened, and what it was over. */
  const [menu, setMenu] = useState<{ screen: Spot; inside: Spot; ids: string[] } | null>(null)
  /** Asking what to put where a wire was dropped, or the board double-clicked. */
  const [quick, setQuick] = useState<{ screen: Spot; inside: Spot; from: string } | null>(null)
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({})
  const chips = useRef(new Map<string, HTMLDivElement>())
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

  /** Moves the board to a view in a straight line, a little at a time. A new
   *  aim while one is under way sets off from wherever the board has got to. */
  const glideTo = useCallback(
    (to: View): void => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setView(to)
        return
      }
      const from = seen.current
      const start = performance.now()
      if (wheelGlide.current) cancelAnimationFrame(wheelGlide.current.frame)
      const step = (now: number): void => {
        const t = Math.min(Math.max((now - start) / WHEEL_GLIDE_MS, 0), 1)
        if (t >= 1) {
          wheelGlide.current = null
          showView(to)
          return
        }
        wheelGlide.current = { to, frame: requestAnimationFrame(step) }
        showView({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, k: from.k + (to.k - from.k) * t })
      }
      wheelGlide.current = { to, frame: requestAnimationFrame(step) }
    },
    [setView],
  )

  const selected = drawing?.selected ?? held
  /** Picking something, on a sketch or on a map. */
  const select = useCallback(
    (ids: string[]): void => {
      if (drawing) drawing.onSelect(ids)
      else setHeld(ids)
    },
    [drawing],
  )
  /** Things can be moved about on a sketch, and on a map that says so. */
  const canMove = Boolean(drawing) || Boolean(rearranging && !rearranging.frozen)
  const trail = useMemo(() => walk(root, path), [root, path])
  /** The level in hand: the innermost card open. Everything drawn or moved
   *  goes there, and nothing outside it can be touched until a person has
   *  backed out to it (ADR 0012). */
  const workAt = trail.length - 1
  const focus = trail[workAt]!
  const typesHere = drawing?.cardTypes
  /** What the library and the quick menu offer on this level. */
  const choices = useMemo(
    () => (drawing ? pickChoice(focus, typesHere ?? []) : []),
    [Boolean(drawing), focus.level, focus.kind, typesHere],
  )

  // Where a person has moved a map's cards and sentences. It is laid over the
  // map rather than written into it, so re-reading the code leaves it alone.
  const spotsAt = useMemo(() => new Map((rearranging?.spots ?? []).map((spot) => [spot.id, spot])), [rearranging?.spots])
  // What others are dragging shows where their hand has it, before it lands.
  const theirDrags = useMemo(() => new Map((together?.others ?? []).flatMap((o) => o.dragging).map((d) => [d.id, d])), [together?.others])
  const asPut = useCallback(
    (card: DrawnCard): { children: DrawnCard[]; wires: DrawnWire[] } => {
      if (spotsAt.size === 0 && theirDrags.size === 0) return { children: card.children, wires: card.wires }
      return {
        children: card.children.map((child) => {
          const spot = theirDrags.get(child.id) ?? spotsAt.get(child.id)
          return spot ? { ...child, x: spot.x, y: spot.y } : child
        }),
        wires: card.wires.map((wire) => {
          const spot = spotsAt.get(keyOf(wire))
          return spot ? { ...wire, x: spot.x, y: spot.y } : wire
        }),
      }
    },
    [spotsAt, theirDrags],
  )

  /** The annotations on a level, for it to keep them clear of an open card. A
   *  line is only as much as its loose ends: an end holding something goes
   *  with whatever it holds. */
  const annosOf = useCallback(
    (level: string): AnnoThing[] =>
      (annotating?.layers ?? [])
        .filter((layer) => layer.shown)
        .flatMap((layer) => layer.items)
        .filter((a) => a.at === level)
        .flatMap((a): AnnoThing[] => {
          if (!a.from) return [{ id: a.id, box: { x: a.x, y: a.y, w: a.w, h: a.h }, near: a.near, around: Boolean(shapeOf(a.kind).behind) }]
          const ends: AnnoThing[] = []
          if ('x' in a.from) ends.push({ id: `${a.id}:from`, box: { x: a.from.x, y: a.from.y, w: 0, h: 0 } })
          if (a.to && 'x' in a.to) ends.push({ id: `${a.id}:to`, box: { x: a.to.x, y: a.to.y, w: 0, h: 0 } })
          return ends
        }),
    [annotating?.layers],
  )

  // What is on each level of the cards that are open, with anything being
  // dragged where the hand has it, so the card it is in can grow to hold it
  // and push its neighbours as it does.
  const contents = useMemo(
    () =>
      trail.map((card, depth) => {
        const put = asPut(card)
        const moves = depth === workAt ? live.moves : undefined
        return {
          card,
          wires: put.wires,
          // Everything else holds still under the drag, even a card nobody
          // has put anywhere yet, which would otherwise be laid out afresh.
          children: moves
            ? layOut(put.children, put.wires).map(({ card: child, box }) => {
                const to = moves.get(child.id)
                return { ...child, x: to?.x ?? box.x, y: to?.y ?? box.y }
              })
            : put.children,
          notes: (card.notes ?? []).map((note) => {
            const to = moves?.get(note.id)
            return to ? { ...note, x: to.x, y: to.y } : note
          }),
          annos: annosOf(card.id),
        }
      }),
    [trail, workAt, asPut, live.moves, annosOf],
  )

  const anchors = useRef(new Map<string, Spot>())
  /** The room given to a card just opened, so it holds still until a person
   *  changes it. Never kept: opened on another screen, it fits that one. */
  const defaults = useRef(new Map<string, Box>())

  /** How much room a card has been given, if anyone has said. */
  const roomGiven = useCallback(
    (card: DrawnCard): Box | undefined => {
      const spot = spotsAt.get(roomKey(card.id))
      return spot && spot.w !== undefined && spot.h !== undefined ? { x: spot.x, y: spot.y, w: spot.w, h: spot.h } : card.room
    },
    [spotsAt],
  )

  /** Every open card, placed, each inside the one before. */
  const levels = useMemo(
    () =>
      openLevels({
        levels: contents,
        anchors: anchors.current,
        held: live.moves ? new Set(live.moves.keys()) : undefined,
        roomOf: (card, inside) => {
          if (live.room?.id === card.id) return live.room.box
          const given = roomGiven(card)
          if (given) return given
          const made = defaults.current.get(card.id)
          if (made) return made
          const el = frame.current
          const k = seen.current.k
          const room = roomAround(inside, {
            w: Math.max(sizeOf(card).w, Math.round((el ? el.clientWidth : 1300) * ROOM_ACROSS / k)),
            h: Math.max(sizeOf(card).h, Math.round((el ? el.clientHeight : 800) * ROOM_DOWN / k)),
          })
          defaults.current.set(card.id, room)
          return room
        },
      }),
    [contents, live.moves, live.room, roomGiven],
  )

  // As a card opens or closes, everything on the board slides from where it
  // was to where it now belongs, and the wires go with it.
  const [settling, setSettling] = useState<{ from: Map<string, Box>; t: number } | null>(null)
  const shown = useMemo((): OpenLevel[] => {
    if (!settling) return levels
    const by = springy(settling.t)
    const slide = (id: string, box: Box): Box => {
      const was = settling.from.get(id)
      return was ? between(was, box, by) : box
    }
    return levels.map((level) => ({
      ...level,
      placed: level.placed.map((p) => ({ card: p.card, box: slide(p.card.id, p.box) })),
      noteBoxes: level.noteBoxes.map((n) => ({ note: n.note, box: slide(n.note.id, n.box) })),
      open: level.open ? { card: level.open.card, box: slide(level.open.card.id, level.open.box) } : null,
      annoBoxes: new Map([...level.annoBoxes].map(([id, box]) => [id, slide(id, box)])),
    }))
  }, [levels, settling])

  const working = shown[workAt]!
  const children = working.children
  const wires = working.wires
  const notes: DrawnNote[] = working.notes
  const shift = working.shift
  const placed = working.placed
  const laid = placed
  const noteBoxes = working.noteBoxes
  /** Every card drawn as a card, innermost first, with the level it is on. */
  const everyCard = useMemo(
    () => shown.flatMap((level, depth) => level.placed.map((p) => ({ ...p, depth }))).reverse(),
    [shown],
  )
  /** What really reaches the open card from around it. The other cards around
   *  it are not drawn. */
  const reaching = useMemo(() => reachingOpen(shown), [shown])
  const unwired = reaching.notDrawn
  /** What is fading away or back for as long as the cards take to settle. */
  const [passing, setPassing] = useState<{ leaving: Set<string>; arriving: Set<string> } | null>(null)
  /** What is not on the board at all right now. */
  const notDrawn = useMemo(() => {
    if (!passing) return unwired
    return new Set([...unwired].filter((id) => !passing.leaving.has(id)))
  }, [unwired, passing])
  const passingOf = (id: string): 'leaving' | 'arriving' | undefined =>
    passing?.leaving.has(id) ? 'leaving' : passing?.arriving.has(id) ? 'arriving' : undefined
  const outside = useMemo(() => everyCard.filter((p) => p.depth !== workAt && !notDrawn.has(p.card.id)).reverse(), [everyCard, workAt, notDrawn])
  const everyNote = useMemo(() => shown.flatMap((level, depth) => level.noteBoxes.map((n) => ({ ...n, depth }))), [shown])

  // A sketch keeps every card where the canvas first showed it, so moving one
  // never shuffles the rest.
  useEffect(() => {
    if (!drawing) return
    if (children.some((c) => c.x === undefined || c.y === undefined))
      drawing.onPin(levels[workAt]!.natural.map((p) => ({ id: p.card.id, x: Math.round(p.box.x), y: Math.round(p.box.y) })))
  }, [drawing, children, levels, workAt])

  const where = useMemo(() => {
    const all = new Map<string, Box>(everyCard.map((p) => [p.card.id, p.box]))
    for (const level of shown) if (level.open) all.set(level.open.card.id, level.open.box)
    return all
  }, [everyCard, shown])

  const nameOf = useMemo(() => {
    const all = new Map<string, string>()
    for (const level of shown) for (const child of level.children) all.set(child.id, child.name || 'unnamed')
    return all
  }, [shown])

  const canDraw = Boolean(drawing)
  const cardBoxes = useMemo(() => [...where.values()], [where])
  const shapedAt = useMemo(() => {
    const all = new Map<string, string>()
    for (const p of everyCard) {
      const d = outlineOf(p.card)
      if (d) all.set(p.card.id, d)
    }
    return all
  }, [everyCard])

  /** Every wire on screen, with its curve, its sentence, and where that sits,
   *  and the hubs where those wires meet the border of an open card. A level's
   *  hubs are worked out before the level inside it, whose wires end there. */
  const shapes = useMemo(() => {
    const boxes = new Map(where)
    const names = new Map(nameOf)
    const hubs: Hub[] = []
    const draw = (level: OpenLevel, depth: number) => {
      const outs = new Map<string, string[]>()
      const ins = new Map<string, string[]>()
      const height = (id: string): number => boxes.get(id)?.y ?? 0
      for (const wire of level.wires) {
        outs.set(wire.from, [...(outs.get(wire.from) ?? []), wire.to])
        ins.set(wire.to, [...(ins.get(wire.to) ?? []), wire.from])
      }
      for (const list of [...outs.values(), ...ins.values()]) list.sort((a, b) => height(a) - height(b))
      const share = (ends: Map<string, string[]>, id: string, other: string): number => {
        const list = ends.get(id) ?? []
        return (list.indexOf(other) + 1) / (list.length + 1)
      }
      const slots = (from: string, to: string): Slots => ({ from: share(outs, from, to), to: share(ins, to, from) })
      const fitTo = (id: string, box: Box): ((at: Spot) => Spot) | undefined => {
        const d = shapedAt.get(id)
        return d ? (at) => meetOutline(d, box, at) : undefined
      }
      const loops = loopSides(level.wires, boxes, cardBoxes)
      const rows = level.wires.flatMap((wire) => {
        const from = boxes.get(wire.from)
        const to = boxes.get(wire.to)
        if (!from || !to) return []
        // Around an open card, only the wires that reach it are drawn.
        if (level.open && !reaching.wires.has(wire)) {
          const wasShowing = passing && (notDrawn.has(wire.from) || notDrawn.has(wire.to) || passing.leaving.has(wire.from) || passing.leaving.has(wire.to))
          if (!wasShowing) return []
        }
        if (notDrawn.has(wire.from) || notDrawn.has(wire.to)) return []
        const key = keyOf(wire)
        return [
          {
            wire,
            key,
            depth,
            shape: wirePath(from, to, slots(wire.from, wire.to), cardBoxes, { from: fitTo(wire.from, from), to: fitTo(wire.to, to) }, loops.get(wire)),
            small: (ins.get(wire.to) ?? []).length > BUSY,
            said: sentenceOf(names.get(wire.from) ?? '', wire.kind, names.get(wire.to) ?? '', wire.words),
          },
        ]
      })
      const open = level.open?.card.id
      if (open && canDraw)
        for (const { wire, shape, key } of rows) {
          if (!wire.id || (wire.to !== open && wire.from !== open)) continue
          const into = wire.to === open
          const at = into ? shape.head : shape.tail
          const id = hubOfWire(wire.id)
          const name = names.get(into ? wire.from : wire.to) ?? ''
          boxes.set(id, { x: at.x - HUB_SIZE / 2, y: at.y - HUB_SIZE / 2, w: HUB_SIZE, h: HUB_SIZE })
          names.set(id, name)
          hubs.push({ id, at, into, kind: wire.kind, name, depth, wire: key })
        }
      return rows
    }
    const all = shown.flatMap(draw)
    // Each sentence keeps clear of every card and of every other sentence,
    // at the size it was really drawn.
    const chipsNow = all.map((one) => {
        const size = sizes[one.key]
        const level = shown[one.depth]!
        // A sentence under the hand goes where the hand has it. One a person
        // has moved stays put, unless a card it joins is moving, in the hand
        // or pushed by a card opening, when it goes with its wire.
        const moving = one.depth === workAt ? live.moves : undefined
        const held = moving?.get(one.key)
        const put =
          one.wire.x !== undefined &&
          one.wire.y !== undefined &&
          !level.pushed.has(one.wire.from) &&
          !level.pushed.has(one.wire.to) &&
          !moving?.has(one.wire.from) &&
          !moving?.has(one.wire.to)
        return {
          at: held
            ? { x: held.x + level.shift.x, y: held.y + level.shift.y }
            : put
              ? { x: one.wire.x! + level.shift.x, y: one.wire.y! + level.shift.y }
              : one.shape.at,
          w: size?.w ?? (one.small ? 60 : sentenceWidth(one.wire)),
          h: size?.h ?? 24,
          tail: one.shape.tail,
          c1: one.shape.c1,
          c2: one.shape.c2,
          head: one.shape.head,
          fixed: Boolean(held) || put,
        }
      })
    const spots = spread(
      chipsNow,
      [...everyCard.filter((p) => !notDrawn.has(p.card.id)).map((p) => p.box), ...everyNote.map((n) => n.box)],
    )
    // Only a sentence a person has moved bends its wire; the rest sit on it.
    const at = all.map((one, i) => ({
      ...one,
      at: spots[i]!,
      shape: { ...one.shape, d: chipsNow[i]!.fixed ? wireThrough(one.shape, spots[i]!) : one.shape.d },
    }))
    return { all: at, outer: at.filter((one) => one.depth !== workAt), inner: at.filter((one) => one.depth === workAt), hubs, boxes }
  }, [shown, where, cardBoxes, shapedAt, canDraw, nameOf, sizes, everyCard, everyNote, workAt, live.moves, notDrawn, passing, reaching])

  /** The hubs on the border of the card open now: the only ones in reach. */
  const hubsHere = useMemo(() => shapes.hubs.filter((hub) => hub.depth + 1 === workAt), [shapes.hubs, workAt])

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

  /** Where a wire from outside crosses the border of a card that is open,
   *  and the card inside it the wire really reaches, to carry it through to. */
  const ports = useMemo(
    () =>
      shown.flatMap((level, depth) => {
        const open = level.open
        const within = shown[depth + 1]
        if (!open || !within) return []
        // Every card drawn inside the open one, and everything inside those,
        // by the card on that level that holds it.
        const holder = new Map<string, string>()
        const hold = (card: DrawnCard, top: string): void => {
          holder.set(card.id, top)
          for (const child of card.children) hold(child, top)
        }
        for (const child of within.children) hold(child, child.id)
        const id = open.card.id
        return shapes.all
          .filter((one) => one.depth === depth && (one.wire.to === id || one.wire.from === id))
          .map((one) => {
            const into = one.wire.to === id
            const meets = into ? one.shape.head : one.shape.tail
            // Further out than the level around the open card, a wire is only
            // carried on through the card it comes on through.
            const onward = depth + 1 < workAt ? within.open?.card.id : undefined
            const reached = [
              ...new Set((one.wire.ends ?? []).map((end) => holder.get(into ? end.to : end.from)).filter((held): held is string => Boolean(held) && (!onward || held === onward))),
            ]
            const through = reached.flatMap((held) => {
              const box = where.get(held)
              if (!box) return []
              const to = sideOf(box, facing(box, meets))
              return [{ id: held, d: into ? curve(meets, to) : curve(to, meets), into }]
            })
            return { open: id, key: one.key, verb: one.wire.kind, x: meets.x, y: meets.y, through }
          })
          .filter((port) => port.x >= open.box.x - 2 && port.x <= open.box.x + open.box.w + 2)
      }),
    [shapes, shown, where],
  )

  /** What reaches a busy card, listed beside it, because a wall of chips
   *  says nothing and a list says everything. */
  const pins = useMemo(() => {
    const id = selected.length === 1 ? selected[0]! : hover
    if (!id) return null
    const rows = wires.filter((wire) => wire.to === id)
    if (rows.length <= BUSY) return null
    const at = where.get(id)
    const card = children.find((c) => c.id === id)
    if (!at || !card) return null
    return { at, name: card.name, rows: rows.slice(0, 6), more: rows.length - 6 }
  }, [selected, hover, children, wires, where])

  /** The wires of the card under the pointer, which light up so a person can
   *  see at a glance what reaches it and what it reaches, and the cards at
   *  their other ends. A wire to a hub carries on along the hub's own wire. */
  const { lit, linked, litHubs } = useMemo(() => {
    const keys = new Set<string>()
    const cards = new Set<string>()
    const hubIds = new Set<string>()
    if (!hover || live.moves) return { lit: keys, linked: cards, litHubs: hubIds }
    cards.add(hover)
    const follow = (one: (typeof shapes.all)[number]): void => {
      keys.add(one.key)
      for (const end of [one.wire.from, one.wire.to]) {
        if (!endsAtHub(end)) {
          cards.add(end)
          continue
        }
        hubIds.add(end)
        const hub = shapes.hubs.find((h) => h.id === end)
        const outer = hub && shapes.all.find((other) => other.key === hub.wire)
        if (outer && !keys.has(outer.key)) follow(outer)
      }
    }
    for (const one of shapes.all) if (one.wire.from === hover || one.wire.to === hover) follow(one)
    return { lit: keys, linked: cards, litHubs: hubIds }
  }, [hover, shapes, live.moves])

  const fitted = useCallback((): View => {
    const el = frame.current
    // Fitting with a card open takes in the cards wired to it as well, because
    // keeping how the outside world reaches it is the point of opening it in
    // place rather than replacing the screen.
    const at = levels.length - 2
    const level = at >= 0 ? levels[at]! : null
    const open = level?.open ?? null
    const bounds = level && open
      ? boundsOf([
          open.box,
          ...level.placed
            .filter((p) => level.wires.some((wire) => (wire.from === open.card.id && wire.to === p.card.id) || (wire.to === open.card.id && wire.from === p.card.id)))
            .map((p) => p.box),
        ])
      : boundsOf([...levels[0]!.placed.map((p) => p.box), ...levels[0]!.noteBoxes.map((n) => n.box)])
    if (!el || bounds.w === 0) return { x: (el?.clientWidth ?? 0) / 2, y: (el?.clientHeight ?? 0) / 2, k: 1 }
    const pad = 120
    const k = Math.min((el.clientWidth - pad) / bounds.w, (el.clientHeight - pad) / bounds.h, 1.3)
    return {
      x: el.clientWidth / 2 - (bounds.x + bounds.w / 2) * k,
      y: el.clientHeight / 2 - (bounds.y + bounds.h / 2) * k,
      k,
    }
  }, [levels])
  const fittedNow = useRef(fitted)
  fittedNow.current = fitted

  const fit = useCallback((): void => setView(fittedNow.current()), [])

  /** Glides the board somewhere rather than jumping. */
  const glide = useCallback((to: View): void => {
    setMoving(true)
    setView(to)
    setTimeout(() => setMoving(false), STEP_MS)
  }, [])

  // The board opens fitted to what is there. Drawing on a level leaves the
  // view where the person has it.
  useLayoutEffect(() => {
    setView(fittedNow.current())
  }, [drawing ? '' : root])

  // A card opening or closing changes nothing else on the screen: the cards
  // slide to their new places, and the board glides just enough to keep the
  // open card in view. It only ever zooms out, and only if the card would not
  // fit. Backing out puts the board back as it was.
  const pathKey = path.join('/')
  const drawnPath = useRef(path)
  const drawnAt = useRef(new Map<string, Box>())
  const drawnUnwired = useRef(new Set<string>())
  const viewsAt = useRef(new Map<string, View>())
  useLayoutEffect(() => {
    const was = drawnPath.current
    if (was.join('/') !== pathKey) {
      const el = frame.current
      const now = seen.current
      const closed = was.filter((id) => !path.includes(id))
      const opened = path.filter((id) => !was.includes(id))
      for (const id of opened) viewsAt.current.set(id, now)
      setSettling({ from: drawnAt.current, t: 0 })
      setPassing({
        leaving: new Set([...unwired].filter((id) => !drawnUnwired.current.has(id))),
        arriving: new Set([...drawnUnwired.current].filter((id) => !unwired.has(id))),
      })
      drawing?.onLevel(path[path.length - 1] ?? '')
      select([])
      setAnnoPicked([])
      setAnnoEditing('')
      // What was under the pointer may have just opened, or gone out of reach.
      setHover('')
      setEditing(null)
      setQuick(null)
      const around = levels.at(-2)
      const deepest = around?.open
      if (opened.length && around && deepest && el) {
        const pad = 36
        const lip = 40
        const k = Math.min(now.k, (el.clientWidth - pad * 2) / deepest.box.w, (el.clientHeight - pad * 2 - lip) / deepest.box.h)
        // In the middle, or as far towards the cards wired to it as it can go
        // with the whole card still on screen, so they stay in sight.
        const wired = around.placed.filter((p) =>
          around.wires.some((w) => (w.from === deepest.card.id && w.to === p.card.id) || (w.to === deepest.card.id && w.from === p.card.id)),
        )
        const middle = boundsOf([deepest.box, ...wired.map((p) => p.box)])
        const onto = (size: number, at: number, length: number, centre: number, before: number): number =>
          Math.max(before - at * k, Math.min(size - pad - (at + length) * k, size / 2 - centre * k))
        glide({
          k,
          x: onto(el.clientWidth, deepest.box.x, deepest.box.w, middle.x + middle.w / 2, pad),
          y: onto(el.clientHeight, deepest.box.y, deepest.box.h, middle.y + middle.h / 2, pad + lip),
        })
      } else if (closed.length) {
        const back = viewsAt.current.get(closed[0]!)
        if (back) glide(back)
      }
      for (const id of closed) {
        viewsAt.current.delete(id)
        defaults.current.delete(id)
      }
    }
    drawnPath.current = path
    drawnUnwired.current = unwired
    drawnAt.current = new Map([
      ...where,
      ...everyNote.map((n) => [n.note.id, n.box] as const),
      ...shown.flatMap((level) => [...level.annoBoxes]),
    ])
  })

  useEffect(() => {
    if (!settling) setPassing(null)
  }, [settling])

  useEffect(() => {
    if (!settling) return
    const from = settling.from
    const began = performance.now()
    let tick = 0
    const step = (): void => {
      const t = (performance.now() - began) / SETTLE_MS
      if (t >= 1) {
        setSettling(null)
        return
      }
      setSettling((was) => (was && was.from === from ? { from, t } : was))
      tick = requestAnimationFrame(step)
    }
    tick = requestAnimationFrame(step)
    // A hidden window gets no frames; it still has to finish.
    const stop = setTimeout(() => setSettling((was) => (was?.from === from ? null : was)), SETTLE_MS + 200)
    return () => {
      cancelAnimationFrame(tick)
      clearTimeout(stop)
    }
  }, [settling?.from])

  useEffect(() => {
    const refit = (): void => setView(fittedNow.current())
    window.addEventListener('resize', refit)
    return () => window.removeEventListener('resize', refit)
  }, [])

  // A person has nothing inside, so a person's card is never opened.
  const canOpen = (card: DrawnCard): boolean =>
    drawnShape(card) !== 'person' && (drawing ? card.level !== 'code' && card.level !== drawing.floor : card.children.length > 0)

  /** Opening a card: it grows where it is, and any card already open on its
   *  level, with whatever is open inside that, closes. */
  const openCard = useCallback(
    (card: DrawnCard, depth: number): void => {
      if (!canOpen(card)) return
      onPath(deeper([...trail.slice(0, depth + 1), card], Boolean(drawing)))
    },
    [trail, onPath, drawing],
  )

  /** Closes the card at a place in the trail, with anything open inside it. */
  const closeCard = useCallback(
    (depth: number): void => {
      if (depth < 1) return
      onPath(shallower(trail.slice(0, depth + 1), Boolean(drawing)))
    },
    [trail, onPath, drawing],
  )

  /** Backing out one level. */
  const backOut = useCallback((): void => closeCard(trail.length - 1), [closeCard, trail.length])

  /** Fills the screen with one card, without going into it: a way to read a
   *  crowded level one card at a time. */
  /** Fills the screen with one box on the board: a card, or an annotation. */
  const frameBox = useCallback((at: Box): void => {
    const el = frame.current
    if (!el || at.w <= 0 || at.h <= 0) return
    const k = Math.min(Math.min(el.clientWidth / at.w, el.clientHeight / at.h) * 0.9, 4)
    setMoving(true)
    setView({ k, x: el.clientWidth / 2 - (at.x + at.w / 2) * k, y: el.clientHeight / 2 - (at.y + at.h / 2) * k })
    setTimeout(() => setMoving(false), STEP_MS)
  }, [])

  const frameOn = useCallback((id: string): void => {
    const at = where.get(id)
    if (at) frameBox(at)
  }, [where, frameBox])

  /** Where the pointer is over the board now, for keys that act on what is under it. */
  const pointerNow = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const move = (event: globalThis.PointerEvent): void => {
      pointerNow.current = { x: event.clientX, y: event.clientY }
    }
    const leave = (): void => {
      pointerNow.current = null
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [])

  /** The annotation right under the pointer, as a box on the board. */
  const annotationUnderPointer = (): Box | null => {
    const at = pointerNow.current
    const el = frame.current
    if (!at || !el) return null
    const hit = document
      .elementsFromPoint(at.x, at.y)
      .find((one) => one instanceof Element && one.closest('[data-anno]'))
      ?.closest('[data-anno]')
    if (!hit) return null
    const box = hit.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    return {
      x: (box.left - rect.left - view.x) / view.k,
      y: (box.top - rect.top - view.y) / view.k,
      w: box.width / view.k,
      h: box.height / view.k,
    }
  }

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

  // A trackpad and a mouse wheel ask for different things. Two fingers on a
  // trackpad pan, and with Ctrl (or a pinch) zoom. A mouse wheel zooms; with
  // Ctrl it pans up and down, with Shift across. Zooming only ever zooms: it
  // never opens or closes a card.
  const padUntil = useRef(0)
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const wheel = (event: WheelEvent): void => {
      event.preventDefault()
      const pad = isTrackpad(event, padUntil)
      const v = seen.current
      const held = event.ctrlKey || event.metaKey
      if (pad && !held) {
        setView({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY })
        return
      }
      if (!pad && held) {
        setView({ ...v, y: v.y - (event.deltaY || event.deltaX) })
        return
      }
      if (!pad && event.shiftKey) {
        setView({ ...v, x: v.x - (event.deltaX || event.deltaY) })
        return
      }
      const rect = el.getBoundingClientRect()
      const cx = event.clientX - rect.left
      const cy = event.clientY - rect.top
      // A wheel spun fast sends huge steps; each counts for one notch at most,
      // or one flick would throw the board from one end of the zoom to the other.
      const step = pad ? event.deltaY : Math.min(Math.max(event.deltaY, -120), 120)
      // A click adds to where the last one was going, not to where it has got.
      const base = pad ? v : (wheelGlide.current?.to ?? v)
      const k = Math.min(Math.max(base.k * Math.exp(-step * (pad ? 0.01 : 0.0015)), 0.08), 5)
      const worldX = (cx - base.x) / base.k
      const worldY = (cy - base.y) / base.k
      const to = { k, x: cx - worldX * k, y: cy - worldY * k }
      if (pad) setView(to)
      else glideTo(to)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [setView, glideTo])

  const startEditing = useCallback(
    (id: string, says = false): void => {
      if (!drawing || drawing.locked?.includes(id)) return
      const card = children.find((c) => c.id === id)
      const wire = wires.find((w) => w.id === id)
      const note = notes.find((n) => n.id === id)
      const was = card ? (says ? card.says : card.name) : wire ? wire.words : note ? note.text : null
      if (was === null) return
      drawing.onSelect([id])
      setEditing({ id, text: was, was, says: Boolean(card && says), since: Date.now() })
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
      if (keep && editing.text !== editing.was) {
        if (editing.type) {
          const card = children.find((c) => c.id === editing.id)
          if (card) drawing.onKind(editing.id, editing.text.trim() || 'card', lookOf(card) ?? BLANK_LOOK)
        } else drawing.onText(editing.id, editing.text, editing.first, editing.says ? 'says' : undefined)
      }
      setEditing(null)
    },
    [editing, drawing, children],
  )

  /** Starts writing a card's type where it is shown. A blank card has none yet,
   *  so the box starts empty rather than saying "card". */
  const startTyping = (card: DrawnCard): void => {
    const was = card.kind === 'card' ? '' : card.kind
    setIconsFor('')
    setEditing({ id: card.id, text: was, was, type: true, since: Date.now() })
  }

  /** Writing starts once the press that made the thing has finished, or
   *  the press would take the typing away from it as it lands. */
  const writeSoon = (id: string): void => {
    setTimeout(() => setEditing({ id, text: '', was: '', first: true, since: Date.now() }), 0)
  }

  /** A card put down, and then straight into writing its name. It is made from
   *  whatever the library has under that key, or else as that kind. */
  const placeAt = useCallback(
    (at: Spot, key: string, from = '', look?: CardLook): void => {
      if (!drawing) return
      const choice = choices.find((one) => one.key === key)
      const hub = shapes.hubs.find((one) => one.id === from)
      const id = drawing.onPlace(at, choice?.kind ?? key, from, hub ? { into: hub.into, kind: hub.kind } : undefined, look ?? choice?.look)
      drawing.onSelect([id])
      writeSoon(id)
    },
    [drawing, choices, shapes.hubs],
  )

  /** A note is a sticky note: an annotation, put on the layer in use and
   *  opened for typing. Without annotations, the sketch's own note. */
  const noteAt = useCallback(
    (at: Spot): void => {
      if (annotating) {
        const [layers, layerId] = ready
        const [next, id] = placeAnnotation(layers, layerId, focus.id, 'sticky', { x: at.x + 90, y: at.y + 55 })
        annotating.onChange(next)
        drawing?.onSelect([])
        setAnnoPicked([id])
        setAnnoFresh(id)
        setTimeout(() => setAnnoEditing(id), 0)
        return
      }
      if (!drawing) return
      const id = drawing.onNote(at)
      drawing.onSelect([id])
      writeSoon(id)
    },
    [drawing, annotating, focus.id, ready],
  )

  /** One thing in hand at a time: picking a tool, a card or a shape puts down
   *  whichever was held. Pressing the key of the one held puts it down too. */
  const pickTool = (next: Tool): void => {
    setArmed('')
    setAnnoArmed('')
    setTool(next)
  }
  const armCard = (kind: string): void => {
    setAnnoArmed('')
    // The card library and the annotation library share a place; show the
    // one the key reached for.
    setAnnoOpen(false)
    if (drawing) setPalette(true)
    setTool('pick')
    setArmed((held) => (held === kind ? '' : kind))
  }
  const armShape = (kind: string): void => {
    if (annotating?.frozen) return
    setArmed('')
    setTool('pick')
    setAnnoArmed((held) => (held === kind ? '' : kind))
  }

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
        if (iconsFor) setIconsFor('')
        else if (keysOpen) setKeysOpen(false)
        else if (annoArmed) setAnnoArmed('')
        else if (annoPicked.length) setAnnoPicked([])
        else if (quick) setQuick(null)
        else if (armed) setArmed('')
        else if (tool !== 'pick') setTool('pick')
        else if (selected.length) select([])
        else backOut()
        return
      }
      // Backspace on a picked annotation takes it away, not the level.
      if (!drawing && event.key === 'Backspace' && !annoPicked.length) backOut()
      if (!event.altKey && (event.key === '0' || event.key === '+' || event.key === '=' || event.key === '-')) {
        event.preventDefault()
        if (event.key === '0') fit()
        else zoomBy(event.key === '-' ? 0.8 : 1.25)
        return
      }
      // f fills the screen with what is under the pointer: an annotation drawn
      // there, or else the card.
      if (plain && (event.key === 'f' || event.key === 'F')) {
        const shape = annotationUnderPointer()
        if (shape || hover) {
          event.preventDefault()
          if (shape) frameBox(shape)
          else frameOn(hover)
          return
        }
      }
      if (!plain) return
      // Letters and numbers pick tools whatever is picked, the way an art
      // program's do. No key writes on anything: that is a double-click.
      const hotkey = event.repeat ? null : hotkeyFor(event, { drawing: Boolean(drawing), annotating: Boolean(annotating && !annotating.frozen) })
      if (!hotkey) return
      event.preventDefault()
      if (hotkey.do === 'tool') pickTool(hotkey.tool)
      else if (hotkey.do === 'shape') armShape(hotkey.kind)
      else if (hotkey.do === 'card') {
        // The numbers count down the card library, so they follow the level.
        const key = holdsCards(focus) ? choices[hotkey.index]?.key : undefined
        if (key) armCard(key)
      } else if (hotkey.do === 'palette') openPalette(!palette)
      else if (hotkey.do === 'keys') setKeysOpen((open) => !open)
      else if (hotkey.do === 'layers') setLayersOpen((open) => !open)
      else if (hotkey.do === 'library') openAnnotations(!annoOpen)
      else if (hotkey.do === 'layer' && annotating?.layers.length) {
        const all = annotating.layers
        const next = all[(all.findIndex((l) => l.id === ready[1]) + hotkey.by + all.length) % all.length]!
        setActiveLayer(next.id)
        setLayerSaid(next.name)
      }
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
  }, [backOut, drawing, fit, zoomBy, quick, armed, tool, selected, startEditing, hover, frameOn, frameBox, view, palette, annoOpen, annotating, annoArmed, annoPicked, select, keysOpen, focus.level, ready, choices, iconsFor])

  useEffect(() => {
    if (!layerSaid) return
    const later = setTimeout(() => setLayerSaid(''), 1400)
    return () => clearTimeout(later)
  }, [layerSaid])

  // Typing on something holds it, just as dragging does.
  const typingOn = editing?.id ?? ''
  useEffect(() => {
    if (!together || !typingOn) return
    void together.onHold([typingOn]).then((got) => {
      if (!got) setEditing(null)
    })
    return () => together.onLetGo([typingOn])
  }, [typingOn])
  useEffect(() => {
    if (!together || !annoEditing) return
    void together.onHold([annoEditing]).then((got) => {
      if (!got) setAnnoEditing('')
    })
    return () => together.onLetGo([annoEditing])
  }, [annoEditing])
  const annoDragged = annoPreview ? [...annoPreview.keys()].join(',') : ''
  useEffect(() => {
    if (!together || !annoDragged) return
    void together.onHold(annoDragged.split(','))
    return () => together.onLetGo(annoDragged.split(','))
  }, [annoDragged])
  // Leaving the board in the middle of a drag lets go of what was in hand.
  const togetherNow = useRef(together)
  togetherNow.current = together
  useEffect(
    () => () => {
      const was = gesture.current
      if (was?.type !== 'move') return
      togetherNow.current?.onDragging([])
      togetherNow.current?.onLetGo(was.ids)
    },
    [],
  )

  const worldOf = (event: { clientX: number; clientY: number }): Spot => {
    const rect = frame.current!.getBoundingClientRect()
    const v = seen.current
    return { x: (event.clientX - rect.left - v.x) / v.k, y: (event.clientY - rect.top - v.y) / v.k }
  }
  /** A spot on the screen as a spot on the board. */
  const toWorld = (clientX: number, clientY: number): Spot => worldOf({ clientX, clientY })

  /** The diagram's cards on this level, as annotations see them: something
   *  to line up with and keep beside, never the other way round. */
  const annoCards = useMemo(() => placed.map((p) => ({ id: p.card.id, box: p.box, d: outlineOf(p.card) })), [placed])
  /** The same for any level, with the card open on it, so a line holding that
   *  card still has something to hold. */
  const annoCardsOf = (level: OpenLevel): { id: string; box: Box; d: string }[] => [
    ...level.placed.map((p) => ({ id: p.card.id, box: p.box, d: outlineOf(p.card) })),
    ...(level.open ? [{ id: level.open.card.id, box: level.open.box, d: '' }] : []),
  ]


  // Picking a card lets go of any annotation, and the other way round.
  useEffect(() => {
    if (selected.length) setAnnoPicked([])
  }, [selected.length])

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

  /** Pressing a card or a note: picks it, and picks it up. */
  const press = (id: string) => (event: PointerEvent<HTMLElement>): void => {
    if (!canMove || event.button !== 0 || space.current || tool === 'pan') return
    event.stopPropagation()
    setQuick(null)
    setIconsFor('')
    if (editing && editing.id !== id) finishEditing(true)
    if (drawing && tool === 'wire' && children.some((c) => c.id === id)) {
      gesture.current = { type: 'connect', from: id, side: null, moved: false, sx: event.clientX, sy: event.clientY }
      pending.current = event.pointerId
      return
    }
    // Something another member has hold of cannot be picked up.
    if (together?.heldBy.has(id)) return
    const add = event.shiftKey || event.ctrlKey || event.metaKey
    let picked = selected
    if (add) picked = selected.includes(id) ? selected.filter((one) => one !== id) : [...selected, id]
    else if (!selected.includes(id)) picked = [id]
    if (together) picked = picked.filter((one) => !together.heldBy.has(one))
    select(picked)
    if (!picked.includes(id)) return
    const starts = new Map<string, Box>()
    for (const p of laid) if (picked.includes(p.card.id)) starts.set(p.card.id, { ...p.box, x: p.box.x - shift.x, y: p.box.y - shift.y })
    for (const n of notes) if (picked.includes(n.id)) starts.set(n.id, { x: n.x, y: n.y, w: 180, h: 60 })
    // Alt and drag leaves the originals where they are and carries copies,
    // the way a diagram tool does.
    let carried = picked
    if (event.altKey && drawing) {
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
    gesture.current = {
      type: 'move',
      ids: carried,
      grab: worldOf(event),
      starts,
      moved: false,
      sx: event.clientX,
      sy: event.clientY,
      copied: Boolean(drawing) && event.altKey,
    }
    pending.current = event.pointerId
  }

  /** Pressing a handle on the open card, to change how much room it has. */
  const pressGrip = (depth: number, id: string, grip: Grip) => (event: PointerEvent<HTMLSpanElement>): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    if (editing) finishEditing(true)
    setQuick(null)
    setMenu(null)
    gesture.current = { type: 'resize', id, depth, grip, grab: worldOf(event), start: levels[depth]!.room, moved: false }
    pending.current = event.pointerId
  }

  /** Pressing a wire's sentence: picks the wire, and picks the sentence up,
   *  so an explainer sitting on top of something can be moved off it. Its
   *  spot is its middle, which is how it is drawn. */
  const pressSaid = (key: string, at: Spot) => (event: PointerEvent<HTMLDivElement>): void => {
    if (!canMove || event.button !== 0 || space.current || tool === 'pan') return
    event.stopPropagation()
    setQuick(null)
    if (editing && editing.id !== key) finishEditing(true)
    const wire = shapes.inner.find((one) => one.key === key)?.wire
    if (drawing && wire?.id) select(event.shiftKey ? [...selected, wire.id] : [wire.id])
    const starts = new Map<string, Box>([[key, { x: at.x - shift.x, y: at.y - shift.y, w: 0, h: 0 }]])
    gesture.current = {
      type: 'move',
      ids: [key],
      grab: worldOf(event),
      starts,
      moved: false,
      sx: event.clientX,
      sy: event.clientY,
      free: true,
    }
    pending.current = event.pointerId
  }

  const pressHandle = (id: string) => (side: Side, event: PointerEvent<HTMLSpanElement>): void => {
    if (!drawing) return
    setQuick(null)
    gesture.current = { type: 'connect', from: id, side, moved: false, sx: event.clientX, sy: event.clientY }
    pending.current = event.pointerId
  }

  /** Pressing a hub, to wire it to a part inside the card. */
  const pressHub = (id: string) => (event: PointerEvent<HTMLElement>): void => {
    if (!drawing || event.button !== 0) return
    event.stopPropagation()
    setQuick(null)
    if (editing) finishEditing(true)
    gesture.current = { type: 'connect', from: id, side: null, moved: false, sx: event.clientX, sy: event.clientY }
    pending.current = event.pointerId
  }

  /** What a wire being drawn lands on: a card, or a hub, unless that hub runs
   *  the wrong way for the end being moved. Two hubs never join. */
  const landing = (at: Spot, from: string, end?: 'from' | 'to'): string => {
    const reach = 16 / seen.current.k
    if (!endsAtHub(from)) {
      const hub = hubsHere.find((one) => Math.hypot(one.at.x - at.x, one.at.y - at.y) < reach)
      if (hub && (!end || (end === 'from') === hub.into)) return hub.id
    }
    return cardUnder(at, from)
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
    placeAt(at, source.card.kind, id, source.card.look)
  }

  /** The menu for a right-click, on what is under the pointer or the board. */
  const openMenu = (event: { clientX: number; clientY: number }, at: Spot): void => {
    const card = cardUnder(at)
    const note = noteBoxes.find((n) => inBox(at, n.box))?.note.id ?? ''
    const under = card || note
    let ids = selected
    if (under && !selected.includes(under)) {
      ids = [under]
      select(ids)
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

  /** The level under a spot on the board: the innermost open card it is in. */
  const levelAt = (at: Spot): number => {
    for (let depth = shown.length - 1; depth >= 1; depth -= 1)
      if (inBox(at, shown[depth - 1]!.open?.box ?? { x: 0, y: 0, w: 0, h: 0 })) return depth
    return 0
  }

  /** The annotations a box catches, added to what was picked before, on one
   *  level only: the first with something in the box, starting with the level
   *  under the start of the box, then the card open now, then outwards. Where
   *  the box starts decides little, because annotations sit wherever a person
   *  put them, and that is often out past the border of the room they belong to. */
  const annosPicked = (box: Box, depth: number, before: string[]): string[] => {
    const levels = [...new Set([depth, workAt, ...shown.map((_, i) => workAt - 1 - i).filter((i) => i >= 0)])]
    const hit = levels.find((i) => annosCaught(box, i).length > 0)
    if (hit === undefined) return before
    const here = shown[hit]!.card.id
    return [...new Set([...before.filter((id) => annoLevel.get(id) === here), ...annosCaught(box, hit)])]
  }

  /** The annotations a box catches on one level, leaving out any not drawn. */
  const annosCaught = (box: Box, depth: number): string[] => {
    const level = shown[depth]
    if (!annotating || !level) return []
    return caughtBy(box, drawnAmong(annotating.layers, level.card.id, level.shift, annoCardsOf(level), level.annoBoxes, notDrawn))
  }

  const down = (event: PointerEvent<HTMLDivElement>): void => {
    // Holding Shift draws a box to pick with, on a drawing or over a map, and
    // it works out around the open card too, where annotations can be picked
    // though nothing else can (ADR 0017).
    if (
      event.button === 0 &&
      (drawing || annotating) &&
      !armed &&
      tool === 'pick' &&
      !space.current &&
      (event.shiftKey || event.ctrlKey || event.metaKey)
    ) {
      const depth = levelAt(worldOf(event))
      if (editing) finishEditing(true)
      setQuick(null)
      setIconsFor('')
      setMenu(null)
      gesture.current = { type: 'select', from: worldOf(event), base: selected, annoBase: annoPicked, depth, moved: false }
      capture(event)
      return
    }
    // Out around the open card nothing else can be touched, but the board still
    // moves. A card picked from the library is of the level in hand, so it
    // stays there and the open card grows to reach it.
    if (!armed && levelAt(worldOf(event)) !== workAt) {
      if (editing) finishEditing(true)
      setAnnoPicked([])
      setQuick(null)
      setMenu(null)
      gesture.current = { type: 'pan', x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false, button: event.button }
      capture(event)
      return
    }
    setAnnoPicked([])
    setQuick(null)
    setIconsFor('')
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
    gesture.current = { type: 'pan', x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false, button: event.button }
    capture(event)
  }

  const move = (event: PointerEvent<HTMLDivElement>): void => {
    if (together) {
      const here = worldOf(event)
      together.onCursor(focus.id, here.x - shift.x, here.y - shift.y)
    }
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
        // Cards and annotations cannot be picked together. A box started in
        // the open card goes for its cards first, and one started out around
        // it for annotations first. Only the open card's own cards can be picked.
        const cards = drawing
          ? [
              ...placed.filter((p) => overlaps(box, p.box)).map((p) => p.card.id),
              ...noteBoxes.filter((n) => overlaps(box, n.box)).map((n) => n.note.id),
            ]
          : []
        const annos = annosPicked(box, now.depth, now.annoBase)
        const caught = now.depth === workAt || !annos.some((id) => !now.annoBase.includes(id)) ? cards : []
        setAnnoPicked(caught.length ? now.annoBase : annos)
        setLive({ marquee: box, picked: [...new Set([...now.base, ...caught])] })
      } else {
        hold()
        setLive({ marquee: box })
      }
      return
    }
    if (now.type === 'move') {
      if (!now.moved && Math.hypot(event.clientX - now.sx, event.clientY - now.sy) < 3) return
      if (!now.moved && together) {
        // Lost to someone a moment quicker: the drag stops, and nothing moves.
        void together.onHold(now.ids).then((got) => {
          if (got || gesture.current !== now) return
          gesture.current = null
          setLive({})
          together.onDragging([])
        })
      }
      now.moved = true
      hold()
      let dx = at.x - now.grab.x
      let dy = at.y - now.grab.y
      if (now.free) {
        const moves = new Map<string, Spot>()
        for (const [id, box] of now.starts) moves.set(id, { x: box.x + dx, y: box.y + dy })
        setLive({ moves })
        together?.onDragging([...moves].map(([id, spot]) => ({ id, ...spot })))
        return
      }
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
      together?.onDragging([...moves].map(([id, spot]) => ({ id, ...spot })))
      return
    }
    if (now.type === 'resize') {
      const dx = at.x - now.grab.x
      const dy = at.y - now.grab.y
      now.moved = true
      hold()
      const card = trail[now.depth]
      if (!card) return
      setLive({ room: { id: now.id, box: resized(now.start, now.grip, dx, dy, sizeOf(card)) } })
      return
    }
    if (now.type === 'connect') {
      // A wire is drawn once the pointer has really moved; a press and
      // release on a dot is a click, which adds a card beside.
      if (!now.moved && Math.hypot(event.clientX - now.sx, event.clientY - now.sy) < 4) return
      now.moved = true
      hold()
      const source = shapes.boxes.get(now.from)
      if (!source) return
      const target = landing(at, now.from, now.rewire?.end)
      const targetBox = target ? shapes.boxes.get(target) : undefined
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

  /** The level as it now stands, for a map to keep beside it: every card
   *  where it sits, so moving one never shuffles the rest, and every
   *  sentence a person has moved, less those a moved card has let go of. */
  const lettingGo = (moves: Map<string, Spot>): string[] =>
    levels[workAt]!.wires.map(keyOf).filter((key, i) => {
      const wire = levels[workAt]!.wires[i]!
      return !moves.has(key) && (moves.has(wire.from) || moves.has(wire.to))
    })
  const levelNow = (moves: Map<string, Spot>): Arrangement => [
    ...levels[workAt]!.natural.map((p) => {
      const to = moves.get(p.card.id)
      return { id: p.card.id, x: Math.round(to?.x ?? p.box.x), y: Math.round(to?.y ?? p.box.y) }
    }),
    ...shapes.inner
      .filter((one) => moves.has(one.key) || (one.wire.x !== undefined && !lettingGo(moves).includes(one.key)))
      .map((one) => {
        const to = moves.get(one.key) ?? { x: one.wire.x!, y: one.wire.y! }
        return { id: one.key, x: Math.round(to.x), y: Math.round(to.y) }
      }),
  ]

  /** Keeps how much room an open card has: on the sketch, or beside the map. */
  const keepRoom = (depth: number, id: string, room: Box, join = false): void => {
    defaults.current.set(id, room)
    if (drawing) drawing.onRoom(trail.slice(0, depth + 1).map((card) => card.id), room, join)
    else rearranging?.onMove([{ id: roomKey(id), ...room }])
  }

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
      if (!now.moved && now.button === 2 && canMove && levelAt(at) === workAt) openMenu(event, at)
      // A click on the empty board, not a drag, lets go of what is picked.
      else if (!now.moved && now.button === 0 && canMove && tool === 'pick') select([])
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
      dragged.current = now.moved
      if (now.moved) {
        const cards = shown.picked ?? now.base
        const added = cards.length > now.base.length
        // Whatever the box caught is what is picked: cards or annotations.
        select(added || !annoPicked.some((id) => !now.annoBase.includes(id)) ? cards : [])
        return
      }
      // A Shift-click out around the open card, where an annotation cannot
      // hear the press itself, picks it or lets it go.
      if (now.depth !== workAt) {
        const was = now.annoBase
        const after = annosPicked({ x: at.x, y: at.y, w: 0, h: 0 }, now.depth, was)
        if (after.some((id) => !was.includes(id))) {
          setAnnoPicked(after)
          select([])
          dragged.current = true
        }
      }
      return
    }
    if (now.type === 'resize') {
      dragged.current = now.moved
      if (now.moved) keepRoom(now.depth, now.id, levels[now.depth]!.room)
      return
    }
    if (now.type === 'move') {
      if (now.moved) {
        together?.onDragging([])
        together?.onLetGo(now.ids)
      }
      if (now.moved && shown.moves) {
        // Whatever was carried past the edge of the card it is in has made
        // that card bigger, and it stays that way when the thing comes back.
        const room = workAt > 0 && !now.free ? levels[workAt]!.room : null
        const before = room ? (roomGiven(focus) ?? defaults.current.get(focus.id)) : undefined
        const grew = room && !(before && before.x === room.x && before.y === room.y && before.w === room.w && before.h === room.h)
        if (drawing) {
          drawing.onMove([...shown.moves].map(([id, spot]) => ({ id, x: spot.x, y: spot.y })), now.copied)
          if (room && grew) keepRoom(workAt, focus.id, room, true)
        } else {
          rearranging?.onMove([...levelNow(shown.moves), ...(room && grew ? [{ id: roomKey(focus.id), ...room }] : [])], lettingGo(shown.moves))
          if (room && grew) defaults.current.set(focus.id, room)
        }
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
      const target = landing(at, now.from, now.rewire?.end)
      if (now.rewire) {
        if (target) drawing.onRewire(now.rewire.id, now.rewire.end, target)
        return
      }
      if (target) {
        // A wire with a hub at one end runs the way the hub's own wire does.
        const hub = shapes.hubs.find((one) => one.id === target || one.id === now.from)
        const other = hub?.id === target ? now.from : target
        const [from, to] = hub ? (hub.into ? [hub.id, other] : [other, hub.id]) : [now.from, target]
        const id = drawing.onWire(from, to, hub?.kind)
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

  /** Annotations pressed on the level they belong to, by that level's card. */
  const annoLevel = useMemo(
    () => new Map((annotating?.layers ?? []).flatMap((layer) => layer.items.map((item) => [item.id, item.at] as const))),
    [annotating?.layers],
  )

  const empty = children.length === 0 && notes.length === 0
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
          look: lookOf(card.card) ?? (restyles(card.card) ? BLANK_LOOK : undefined),
          restyles: restyles(card.card),
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

  /** Everything on this level the person has moved, for putting back. */
  const movedHere = (): string[] =>
    (rearranging?.spots ?? [])
      .map((spot) => spot.id)
      .filter((id) => children.some((c) => c.id === id) || shapes.inner.some((one) => one.key === id))

  /** What the right-click menu offers, for what was under the pointer. */
  const menuItems = (ids: string[], inside: Spot): MenuItem[] => {
    if (!drawing) {
      if (!rearranging) return []
      const moved = movedHere()
      const mine = ids.filter((id) => moved.includes(id))
      return [
        ...(mine.length
          ? [
              {
                name: mine.length > 1 ? `Put these ${mine.length} back` : 'Put it back where the map had it',
                glyph: 'undo' as const,
                act: () => {
                  rearranging.onForget(mine)
                  select([])
                },
              },
            ]
          : []),
        ...(moved.length
          ? [
              {
                name: 'Lay this whole level out again',
                glyph: 'cards' as const,
                act: () => {
                  rearranging.onForget(moved)
                  select([])
                },
              },
            ]
          : []),
        { name: 'Fit it all on screen', glyph: 'keys' as const, keys: '0', act: fit },
      ]
    }
    const one = ids.length === 1 ? ids[0]! : ''
    const card = one ? children.find((c) => c.id === one) : undefined
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
      ...(one ? [{ name: card ? 'Rename' : 'Edit the words', glyph: 'edit' as const, act: () => startEditing(one) }] : []),
      ...(card ? [{ name: 'Say what it is for', act: () => startEditing(one, true) }] : []),
      ...(card && canOpen(card as DrawnCard)
        ? [{ name: 'Draw inside it', glyph: 'inside' as const, act: () => {
            const placedCard = placed.find((p) => p.card.id === one)
            if (placedCard) openCard(placedCard.card, workAt)
          } }]
        : []),
      ...(card?.kind === 'page' ? [{ name: 'Add a mockup', glyph: 'mockup' as const, act: () => drawing.onMockup(one) }] : []),
      'rule',
      { name: 'Cut', keys: 'Ctrl+X', act: () => drawing.onCut(ids) },
      { name: 'Copy', glyph: 'copy', keys: 'Ctrl+C', act: () => drawing.onCopy(ids) },
      { name: 'Duplicate', keys: 'Ctrl+D', act: () => drawing.onSelect(drawing.onDuplicate(ids)) },
      'rule',
      { name: drawing.removeName ?? (ids.length > 1 ? `Take these ${ids.length} off` : 'Take it off the sketch'), glyph: 'bin', keys: 'Delete', danger: true, act: () => {
        drawing.onRemove(ids)
        drawing.onSelect([])
      } },
    ]
  }

  const wireGroup = (list: typeof shapes.inner): ReactElement[] =>
    list.map(({ wire, key, shape, depth }) => (
      <g
        key={key}
        className={`map-wire map-wire--${wire.kind.replace(/\s+/g, '-')}${
          drawing && wire.id && selected.includes(wire.id) ? ' map-wire--selected' : ''
        }${upClass(workAt - depth)}${wire.state ? ` map-wire--${wire.state}` : ''}${
          lit.has(key) ? ' map-wire--lit' : ''
        }`}
      >
        <path d={shape.d} markerEnd="url(#map-head)" />
        {lit.has(key) ? <path d={shape.d} className="map-wire-flow" /> : null}
        {drawing && wire.id && depth === workAt ? (
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
  /** On a shaped card, the words are written where its words go. */
  const editingCard = editing ? placed.find((p) => p.card.id === editing.id)?.card : undefined
  const editingShape = editingCard ? drawnShape(editingCard) : null
  const editingArea = editingShape && editingBox ? textAreaOf(CARD_SHAPES[editingShape].d) : null
  const editingNote = editing ? noteBoxes.find((n) => n.note.id === editing.id) : undefined
  const editingWire = editing ? shapes.inner.find((one) => one.wire.id === editing.id) : undefined
  const pickedWire = drawing && selected.length === 1 ? shapes.inner.find((one) => one.wire.id === selected[0]) : undefined
  const childLevel = levelIn(focus)
  const liftedChoice = lifting ? choices.find((one) => one.key === lifting.kind) : undefined
  const armedChoice = armed ? choices.find((one) => one.key === armed) : undefined

  return (
    <>
      <ToolRail
        tool={annoArmed === 'sticky' ? 'note' : tool}
        sketch={Boolean(drawing)}
        palette={palette}
        canUndo={drawing?.canUndo ?? false}
        canRedo={drawing?.canRedo ?? false}
        onTool={(next) => {
          // A note is a sticky note wherever annotations can be drawn.
          if (next === 'note' && annotating) armShape('sticky')
          else pickTool(next)
        }}
        onPalette={() => openPalette(!palette)}
        onUndo={() => drawing?.onUndo()}
        onRedo={() => drawing?.onRedo()}
        onStartSketch={() => onStartSketch?.()}
        onFit={fit}
        onOverview={() => setShutOverview(!shutOverview)}
        annotations={annoOpen}
        layers={layersOpen}
        onAnnotations={() => openAnnotations(!annoOpen)}
        onLayers={() => setLayersOpen(!layersOpen)}
        keys={keysOpen}
        onKeys={() => setKeysOpen(!keysOpen)}
      />
      {annotating && !annotating.frozen && annoOpen ? (
        <SidePanel key="annotations" name="annotations" start={280}>
        <AnnotationLibrary
          armed={annoArmed}
          onArm={(kind) => {
            setArmed('')
            setTool('pick')
            setAnnoArmed(kind)
          }}
          onClose={() => {
            setAnnoOpen(false)
            setAnnoArmed('')
          }}
        />
        </SidePanel>
      ) : drawing && palette && holdsCards(focus) ? (
        <SidePanel key="cards" name="cards" start={216}>
        <CardPalette
          groups={choicesIn(focus, drawing.cardTypes)}
          canMakeTypes={ownTypesAt(childLevel) && !holdsStores(focus)}
          types={drawing.cardTypes}
          armed={armed}
          onArm={(kind) => {
            setArmed(kind)
            setTool('pick')
          }}
          onLift={(kind, event) => setLifting({ kind, x: event.clientX, y: event.clientY, moved: false })}
          onTypes={drawing.onCardTypes}
          onClose={() => setPalette(false)}
        />
        </SidePanel>
      ) : null}
      <div
        ref={frame}
        className={`map-frame-area map-frame-area--${armed ? 'card' : tool}${space.current ? ' map-frame-area--pan' : ''}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          const was = gesture.current
          gesture.current = null
          setLive({})
          together?.onDragging([])
          if (was?.type === 'move') together?.onLetGo(was.ids)
        }}
        onContextMenu={(event) => event.preventDefault()}
        onScroll={(event) => {
          event.currentTarget.scrollLeft = 0
          event.currentTarget.scrollTop = 0
        }}
        onDoubleClick={(event) => {
          if (!drawing || event.target !== event.currentTarget || levelAt(worldOf(event)) !== workAt) return
          setQuick({ screen: screenOf(event), inside: insideOf(worldOf(event)), from: '' })
        }}
        onClickCapture={(event) => {
          if (dragged.current) event.stopPropagation()
          dragged.current = false
        }}
      >
        {annotating && annoArmed ? (
          <div className="map-hint" role="status">
            {shapeOf(annoArmed).line
              ? `${shapeOf(annoArmed).name}: drag from one place to another.`
              : `${shapeOf(annoArmed).name}: click the board, or drag to size it.`}{' '}
            {annotating.layers.length > 1 ? `On ${ready[0].find((l) => l.id === ready[1])?.name ?? 'the first layer'}.` : ''}
            <span className="map-hint-keys">
              <kbd>Esc</kbd> to stop
            </span>
          </div>
        ) : layerSaid ? (
          <div className="map-hint" role="status">
            Drawing on {layerSaid}
          </div>
        ) : null}
        {drawing && !annoArmed && (armed || tool === 'wire' || tool === 'note') ? (
          <div className="map-hint" role="status">
            {armed
              ? `Click to place a ${armedChoice?.kind ?? armed}. Hold Shift to place more.`
              : tool === 'wire'
                ? 'Drag from one card to another.'
                : 'Click to leave a note.'}
            <span className="map-hint-keys">
              <kbd>Esc</kbd> to stop
            </span>
          </div>
        ) : null}
        {empty && !drawing ? (
          <div className="map-empty">
            {focus.level === 'project'
                ? 'Link a software system to see its map.'
                : focus.setUp
                  ? 'Nothing inside this yet.'
                  : 'Not set up for codegraph yet, so there is nothing to draw inside it.'}
          </div>
        ) : null}
        <div
          className={`map-world${moving ? ' map-world--moving' : ''}${linked.size ? ' map-world--lit' : ''}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          {/* Open cards first, outermost first, so what is drawn inside each,
              wires included, is on top of its tint. */}
          {shown.map((level, depth) => {
            if (!level.open) return null
            const { card, box } = level.open
            const name = card.name || 'Unnamed'
            const here = depth + 1 === workAt
            return (
              <div
                key={card.id}
                className={`map-card map-card--open ${kindClass(card.kind)}${lookOf(card) ? ` ${lookClass(lookOf(card)!)}` : ''}${here ? ' map-card--here' : ''}${upClass(workAt - depth - 1)}${linked.has(card.id) ? ' map-card--wired' : ''}`}
                style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                data-open={card.id}
              >
                <span
                  className="map-lip"
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="map-back"
                    aria-label={`Back out of ${name}`}
                    title="Back out a level (Esc)"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      closeCard(depth + 1)
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <ArrowLeft size={13} />
                  </button>
                  <span className="map-kind-word">{kindWords(card)}</span>
                  <span className="map-name" style={{ marginTop: 0 }}>
                    {name}
                  </span>
                </span>
                {drawing ? null : ports
                  .filter((port) => port.open === card.id)
                  .map((port) => (
                    <span
                      key={port.key}
                      className="map-port"
                      title={port.verb}
                      style={{ left: port.x - box.x, top: port.y - box.y }}
                    />
                  ))}
                {here
                  ? GRIPS.map((grip) => (
                      <span
                        key={grip}
                        className={`map-grip map-grip--${grip}`}
                        aria-hidden
                        onPointerDown={pressGrip(depth + 1, card.id, grip)}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                      />
                    ))
                  : null}
              </div>
            )
          })}

          <svg className="map-wires" width="1" height="1">
            <defs>
              <marker id="map-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="map-head" />
              </marker>
              <marker id="map-head-live" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="map-head-live" />
              </marker>
            </defs>
            {wireGroup(shapes.outer)}
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

          {annotating
            ? shown.map((level, depth) => (
                <AnnotationLayer
                  key={level.card.id}
                  part="behind"
                  layers={annotating.layers}
                  level={level.card.id}
                  shift={level.shift}
                  cards={annoCardsOf(level)}
                  moved={level.annoBoxes}
                  up={workAt - depth}
                  notDrawn={notDrawn}
                  preview={annoPreview}
                  onPreview={setAnnoPreview}
                  k={view.k}
                  selected={annoPicked.filter((id) => annoLevel.get(id) === level.card.id)}
                  editing={annoEditing}
                  fresh={annoFresh}
                  toWorld={toWorld}
                  onSelect={(ids) => {
                    if (annotating.frozen) return
                    if (ids.length) select([])
                    setAnnoPicked(together ? ids.filter((id) => !together.heldBy.has(id)) : ids)
                  }}
                  onEdit={(id) => {
                    if (annotating.frozen || (id && together?.heldBy.has(id))) return
                    if (!id) setAnnoFresh('')
                    setAnnoEditing(id)
                  }}
                  onChange={annotating.onChange}
                />
              ))
            : null}

          {/* The cards around the open card that are wired to it stay in view,
              faded by how far out they are, and cannot be touched until a person
              backs out to them. The rest are not drawn at all. */}
          {outside.map((p) => (
            <CardFace
              key={p.card.id}
              placed={p}
              picture={drawing?.mockups[p.card.id] ?? p.card.shot}
              opens={canOpen(p.card)}
              selected={false}
              up={workAt - p.depth}
              linked={linked.has(p.card.id) ? 'wired' : undefined}
              passing={passingOf(p.card.id)}
              target={false}
              handles={false}
              drawing={Boolean(drawing)}
              agent={agent && holds(p.card, agent.card) ? agent.words : undefined}
              extra={cardExtra?.(p.card)}
              onOpen={() => undefined}
            />
          ))}

          {placed.map((p) => {
            const picked = (live.picked ?? selected).includes(p.card.id)
            return (
              <CardFace
                key={p.card.id}
                placed={p}
                picture={drawing?.mockups[p.card.id] ?? p.card.shot}
                opens={canOpen(p.card)}
                selected={picked}
                up={0}
                linked={p.card.id === hover ? 'self' : linked.has(p.card.id) ? 'wired' : undefined}
                passing={passingOf(p.card.id)}
                onIcon={drawing && restyles(p.card) && !drawing.locked?.includes(p.card.id) ? () => setIconsFor(p.card.id) : undefined}
                onType={drawing && restyles(p.card) && !drawing.locked?.includes(p.card.id) ? () => startTyping(p.card) : undefined}
                target={live.line?.target === p.card.id}
                handles={Boolean(drawing) && (tool === 'pick' || tool === 'wire') && !armed && (hover === p.card.id || (picked && selected.length === 1)) && !live.moves}
                movable={canMove}
                drawing={Boolean(drawing)}
                agent={agent && holds(p.card, agent.card) ? agent.words : undefined}
              extra={cardExtra?.(p.card)}
                onOpen={() => openCard(p.card, workAt)}
                onPress={canMove ? press(p.card.id) : undefined}
                onHandle={drawing ? pressHandle(p.card.id) : undefined}
                onEdit={(says) => startEditing(p.card.id, says)}
              />
            )
          })}

          {/* A hub is where a wire from outside meets the open card's border.
              A part inside wires to it to say which part the wire really
              reaches, and any number can. Those on cards further out are only
              shown. */}
          {shapes.hubs.map((hub) => {
            const inReach = hub.depth + 1 === workAt
            return (
              <button
                key={hub.id}
                type="button"
                className={`map-hub${hub.into ? ' map-hub--in' : ' map-hub--out'}${upClass(workAt - hub.depth - 1)}${live.line?.target === hub.id ? ' map-hub--target' : ''}${litHubs.has(hub.id) ? ' map-hub--lit' : ''}`}
                style={{ left: hub.at.x, top: hub.at.y }}
                disabled={!inReach}
                aria-label={hub.into ? `Hub: ${hub.name} ${hub.kind} this` : `Hub: this ${hub.kind} ${hub.name}`}
                title={hub.into ? `${hub.name} ${hub.kind} this. Drag to the part it reaches.` : `This ${hub.kind} ${hub.name}. Drag to the part that does.`}
                onPointerDown={inReach ? pressHub(hub.id) : undefined}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <span className="map-hub-name">{hub.name}</span>
              </button>
            )
          })}

          {/* Hovering is tracked on the board, not on each card, so a card's
              dots stay while the pointer crosses onto them. Only the level in
              hand answers. */}
          <HoverWatch placed={placed} where={frame} view={view} onHover={setHover} />

          {everyNote.map(({ note, box, depth }) => {
            const picked = (live.picked ?? selected).includes(note.id)
            const here = depth === workAt
            return (
              <div
                key={note.id}
                className={`${picked ? 'map-note map-card--selected' : 'map-note'}${upClass(workAt - depth)}`}
                style={{ left: box.x, top: box.y }}
                role={drawing && here ? 'button' : undefined}
                aria-label={`Note: ${note.text || 'empty'}`}
                onPointerDown={here ? press(note.id) : undefined}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  if (here) startEditing(note.id)
                }}
                onClick={(event) => event.stopPropagation()}
              >
                {editing?.id === note.id ? null : note.text || <span className="map-more">Empty note</span>}
              </div>
            )
          })}

          {/* Sentences go over the cards, so a wire that passes behind one
              still says what it is for. */}
          {shapes.all.map(({ wire, key, at, small, said, depth }) => {
            const own = depth === workAt
            const spot = at
            return (
              <Sentence
                key={key}
                said={said}
                verb={wire.kind}
                at={spot}
                state={wire.state}
                small={small}
                missing={!drawing && !wire.words && wire.kind !== 'leads to' && wire.kind !== 'keeps'}
                unfinished={Boolean(drawing) && !wire.words && wire.kind !== 'leads to' && Boolean(wire.id)}
                selected={Boolean(drawing && own && wire.id && selected.includes(wire.id))}
                pickable={Boolean(drawing && wire.id && own)}
                lit={lit.has(key)}
                up={workAt - depth}
                movable={canMove && own}
                hidden={Boolean(editing && wire.id && editing.id === wire.id)}
                measure={(element) => {
                  if (element) chips.current.set(key, element)
                  else chips.current.delete(key)
                }}
                onPick={pressSaid(key, spot)}
                onEdit={() => wire.id && startEditing(wire.id)}
              />
            )
          })}

          {annotating
            ? shown.map((level, depth) => (
                <AnnotationLayer
                  key={level.card.id}
                  part="front"
                  layers={annotating.layers}
                  level={level.card.id}
                  shift={level.shift}
                  cards={annoCardsOf(level)}
                  moved={level.annoBoxes}
                  up={workAt - depth}
                  notDrawn={notDrawn}
                  preview={annoPreview}
                  onPreview={setAnnoPreview}
                  k={view.k}
                  selected={annoPicked.filter((id) => annoLevel.get(id) === level.card.id)}
                  editing={annoEditing}
                  fresh={annoFresh}
                  toWorld={toWorld}
                  onSelect={(ids) => {
                    if (annotating.frozen) return
                    if (ids.length) select([])
                    setAnnoPicked(together ? ids.filter((id) => !together.heldBy.has(id)) : ids)
                  }}
                  onEdit={(id) => {
                    if (annotating.frozen || (id && together?.heldBy.has(id))) return
                    if (!id) setAnnoFresh('')
                    setAnnoEditing(id)
                  }}
                  onChange={annotating.onChange}
                />
              ))
            : null}

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
            ) : editingBox && editing.type ? (
              <input
                ref={focusQuietly}
                className="map-edit map-edit--type"
                aria-label="Type name"
                style={
                  editingArea
                    ? { left: editingBox.x + editingArea.x * editingBox.w, top: editingBox.y + editingArea.y * editingBox.h, width: editingArea.w * editingBox.w }
                    : { left: editingBox.x + 44, top: editingBox.y + 10, width: editingBox.w - 60 }
                }
                value={editing.text}
                placeholder="What type is it?"
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
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    finishEditing(true)
                  }
                  if (event.key === 'Escape') finishEditing(false)
                }}
              />
            ) : editingBox && editing.says ? (
              <textarea
                ref={focusQuietly}
                className="map-edit map-edit--says"
                aria-label="What it is for"
                style={
                  editingArea
                    ? { left: editingBox.x + editingArea.x * editingBox.w, top: editingBox.y + editingArea.y * editingBox.h + 44, width: editingArea.w * editingBox.w }
                    : { left: editingBox.x + 12, top: editingBox.y + 62, width: editingBox.w - 24 }
                }
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
                style={
                  editingArea
                    ? { left: editingBox.x + editingArea.x * editingBox.w, top: editingBox.y + editingArea.y * editingBox.h + 20, width: editingArea.w * editingBox.w }
                    : {
                        left: editingBox.x + 12,
                        top: isFrame(placed.find((p) => p.card.id === editing.id)?.card ?? root)
                          ? editingBox.y + editingBox.h - 34
                          : editingBox.y + 34,
                        width: editingBox.w - 24,
                      }
                }
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
                    setTimeout(() => startEditing(id, true), 0)
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

          {together ? (
            <TogetherLayer
              others={together.others}
              heldBy={together.heldBy}
              focusId={focus.id}
              shift={shift}
              k={view.k}
              placed={placed}
              contains={(cardId, inside) => {
                const holds = (card: DrawnCard): boolean => card.id === inside || card.children.some(holds)
                const card = placed.find((p) => p.card.id === cardId)?.card
                return card ? holds(card) : false
              }}
              onGo={together.onGo}
            />
          ) : null}

          {live.marquee ? (
            <div
              className={gesture.current?.type === 'select' ? 'map-marquee map-marquee--pick' : 'map-marquee'}
              style={{ left: live.marquee.x, top: live.marquee.y, width: live.marquee.w, height: live.marquee.h }}
            />
          ) : null}
        </div>

        {annotating && annoArmed ? (
          <AnnotationPlacer
            kind={annoArmed}
            layers={ready[0]}
            layerId={ready[1]}
            level={focus.id}
            shift={shift}
            cards={annoCards}
            toWorld={toWorld}
            k={view.k}
            transform={`translate(${view.x}px, ${view.y}px) scale(${view.k})`}
            onPlaced={(next, id, keepGoing) => {
              annotating.onChange(next)
              setActiveLayer(layerOf(next, id)?.id ?? '')
              select([])
              setAnnoPicked([id])
              if (!keepGoing) setAnnoArmed('')
              setAnnoFresh(id)
              if (['text', 'sticky', 'callout', 'rect', 'diamond', 'terminator', 'list', 'code', 'frame', 'lane', 'column', 'wire'].includes(annoArmed) && !keepGoing)
                setTimeout(() => setAnnoEditing(id), 0)
            }}
          />
        ) : null}

        {annotating && annoArmed ? (
          <div className="map-hint" role="status">
            Click to put it down, or drag to size it. Hold Shift to put down more.
            <span className="map-hint-keys">
              <kbd>Esc</kbd> to stop
            </span>
          </div>
        ) : null}

        {annotating && !annotating.frozen && annoPicked.length && !annoEditing ? (() => {
          // The level the picked annotations are on, which may be out around the open card.
          const barLevel = shown.find((level) => level.card.id === annoLevel.get(annoPicked[0]!)) ?? working
          const onBar = drawnOn(annotating.layers, barLevel.card.id, barLevel.shift, annoCardsOf(barLevel), barLevel.annoBoxes).filter((d) => annoPicked.includes(d.a.id))
          if (!onBar.length) return null
          const top = Math.min(...onBar.map((d) => d.box.y))
          const left = Math.min(...onBar.map((d) => d.box.x))
          const right = Math.max(...onBar.map((d) => d.box.x + d.box.w))
          const at = { x: view.x + ((left + right) / 2) * view.k, y: view.y + top * view.k - 12 }
          const one = onBar.length === 1 ? onBar[0]! : null
          return (
            <div
              className="map-context map-anno-bar"
              style={{ left: Math.max(160, at.x), top: Math.max(44, at.y) }}
              role="toolbar"
              aria-label="What to do with the annotation"
              onPointerDown={(event) => event.stopPropagation()}
            >
              {COLORS.map((color) => (
                <button
                  key={color || 'none'}
                  type="button"
                  className={`map-anno-swatch map-anno-fill--${color || 'none'}${one?.a.color === color ? ' map-anno-swatch--on' : ''}`}
                  aria-label={`Colour: ${COLOR_NAMES[color]}`}
                  title={COLOR_NAMES[color]}
                  onClick={() => {
                    let next = annotating.layers
                    for (const d of onBar) next = changeAnnotation(next, d.a.id, { color })
                    annotating.onChange(next)
                  }}
                />
              ))}
              <span className="map-context-rule" />
              {one ? (
                <span className="map-anno-bar-layer" title="The layer it is on">
                  {one.layer.name}
                </span>
              ) : null}
              <button
                type="button"
                className="map-act"
                aria-label="Duplicate (Ctrl+D)"
                title="Duplicate (Ctrl+D)"
                onClick={() => {
                  const [next, made] = duplicateAnnotations(annotating.layers, annoPicked)
                  annotating.onChange(next)
                  setAnnoPicked(made)
                }}
              >
                <CopyIcon size={15} />
              </button>
              <button
                type="button"
                className="map-act map-act--danger"
                aria-label="Delete (Delete)"
                title="Delete (Delete)"
                onClick={() => {
                  annotating.onChange(removeAnnotations(annotating.layers, annoPicked))
                  setAnnoPicked([])
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          )
        })() : null}

        {annotating && layersOpen ? (
          <LayersPanel
            layers={annotating.layers}
            active={layerFor(annotating.layers)[1]}
            onActive={setActiveLayer}
            onToggle={(id) => {
              const layer = annotating.layers.find((l) => l.id === id)
              if (layer) annotating.onChange(changeLayer(annotating.layers, id, { shown: !layer.shown }))
              setAnnoPicked([])
            }}
            onSnaps={(id) => {
              const layer = annotating.layers.find((l) => l.id === id)
              if (layer) annotating.onChange(changeLayer(annotating.layers, id, { snaps: !layer.snaps }))
            }}
            onRename={(id, name) => annotating.onChange(changeLayer(annotating.layers, id, { name }), `layer:${id}`)}
            onAdd={() => {
              const [next, id] = addLayer(annotating.layers, `Layer ${annotating.layers.length + 1}`)
              annotating.onChange(next)
              setActiveLayer(id)
            }}
            onRemove={(id) => {
              annotating.onChange(removeLayer(annotating.layers, id))
              setAnnoPicked([])
            }}
            onClose={() => setLayersOpen(false)}
          />
        ) : null}

        {keysOpen ? <KeyList onClose={() => setKeysOpen(false)} /> : null}

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
            choices={choices}
            onKind={(id, kind, look) => drawing?.onKind(id, kind, look)}
            onLook={(id, look) => drawing?.onLook(id, look)}
            onEdit={(id) => startEditing(id)}
            onOpen={(id) => {
              const card = placed.find((p) => p.card.id === id)
              if (card) openCard(card.card, workAt)
            }}
            onMockup={(id) => drawing?.onMockup(id)}
            onAlign={(ids, how) => drawing?.onAlign(ids, how)}
            locked={selected.length === 1 && Boolean(drawing?.locked?.includes(selected[0]!))}
            removeName={drawing?.removeName}
            onRemove={(ids) => {
              drawing?.onRemove(ids)
              select([])
            }}
          />
        ) : null}

        {iconsFor && drawing && where.get(iconsFor) ? (() => {
          const box = where.get(iconsFor)!
          const card = children.find((c) => c.id === iconsFor)
          if (!card) return null
          const look = lookOf(card) ?? BLANK_LOOK
          return (
            <div
              className="map-look-pop"
              role="radiogroup"
              aria-label="Icon"
              style={{ left: Math.max(8, view.x + box.x * view.k), top: view.y + (box.y + 38) * view.k }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <IconPick
                icon={look.icon}
                onPick={(icon) => {
                  drawing.onLook(iconsFor, { ...look, icon })
                  setIconsFor('')
                }}
              />
            </div>
          )
        })() : null}

        {menu && canMove ? (
          <CanvasMenu
            at={menu.screen}
            onClose={() => setMenu(null)}
            items={menuItems(menu.ids, menu.inside)}
          />
        ) : null}

        {quick && drawing ? (
          <QuickAdd
            choices={choices}
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
          onUp={backOut}
        />
        <Overview
          of={focus.name || 'This level'}
          placed={[...everyCard.filter((p) => !notDrawn.has(p.card.id)), ...shown.flatMap((level) => (level.open ? [level.open] : []))]}
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
        <div className={`map-lifted ${kindClass(liftedChoice?.kind ?? lifting.kind)}${liftedChoice?.look ? ` ${lookClass(liftedChoice.look)}` : ''}`} style={{ left: lifting.x, top: lifting.y }}>
          {liftedChoice?.look ? <LookGlyph icon={liftedChoice.look.icon} size={14} /> : <KindGlyph kind={lifting.kind} size={14} />}
          <span>{liftedChoice?.kind ?? lifting.kind}</span>
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
