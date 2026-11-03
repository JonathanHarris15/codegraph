// codegraph: component map-canvas
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactElement } from 'react'
import { Glyph, KindGlyph, keeps, kindClass } from './kind-glyph.js'
import {
  boundsOf,
  isFrame,
  layOut,
  OPEN_PAD,
  sizeOf,
  spread,
  wirePath,
  wordsWidth,
  type Box,
  type DrawnCard,
  type DrawnNote,
  type DrawnWire,
  type Placed,
  type Slots,
} from './map-layout.js'
import { Overview } from './overview.js'
import { ToolRail } from './tool-rail.js'
import { ZoomBar } from './zoom-bar.js'

type View = { x: number; y: number; k: number }
type Arrival = 'in' | 'out' | 'none'
type Spot = { x: number; y: number }

export type Tool = 'pick' | 'pan' | 'area' | 'card' | 'wire' | 'note' | 'mockup'

/** Where every card on a level sits, so a level laid out by the canvas can be
 *  pinned down the moment a person moves or adds anything on it. */
export type Arrangement = { id: string; x: number; y: number }[]

/** What a sketch hands the canvas so a person can draw on it. Left out, the
 *  canvas only shows. */
export type Drawing = {
  selected: string
  mockups: Record<string, string>
  onSelect: (id: string) => void
  onPlace: (at: Spot, arrangement: Arrangement, kind: string) => void
  onNote: (at: Spot, arrangement: Arrangement) => void
  onMove: (id: string, at: Spot, arrangement: Arrangement) => void
  onWire: (from: string, to: string) => void
  onMockup: (id: string) => void
}

const STEP_MS = 320

/** More wires than this into one card and their sentences collapse to the
 *  verb alone: a diagram cannot say eight things at once, so the card lists
 *  them instead. */
const BUSY = 4

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

const CardFace = ({
  placed,
  picture,
  opens,
  selected,
  receded,
  onOpen,
  onPress,
  onRelease,
  onPeek,
}: {
  placed: Placed
  picture: string
  opens: boolean
  selected: boolean
  receded: boolean
  onOpen: () => void
  onPress?: (event: PointerEvent<HTMLDivElement>) => void
  onRelease?: () => void
  onPeek?: (id: string) => void
}) => {
  const { card, box } = placed
  const drawing = Boolean(onPress)
  const classes = ['map-card', `map-card--${card.level}`, kindClass(card.kind)]
  if (keeps(card.kind)) classes.push('map-card--keeps')
  if (!card.setUp || card.kind === 'shallow software system') classes.push('map-card--bare')
  if (isFrame(card)) classes.push('map-frame')
  if (selected) classes.push('map-card--selected')
  if (receded) classes.push('map-card--outside')
  return (
    <div
      className={classes.join(' ')}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      role={opens || drawing ? 'button' : undefined}
      aria-label={drawing ? card.name || 'Unnamed card' : opens ? `Open ${card.name}` : card.name}
      aria-pressed={drawing ? selected : undefined}
      tabIndex={opens || drawing ? 0 : undefined}
      onPointerDown={onPress}
      onPointerUp={onRelease}
      onPointerEnter={() => onPeek?.(card.id)}
      onPointerLeave={() => onPeek?.('')}
      onClick={(event) => {
        event.stopPropagation()
        if (opens && !drawing) onOpen()
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (opens && drawing) onOpen()
      }}
      onKeyDown={(event) => {
        if (opens && event.key === 'Enter') onOpen()
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
            <span className="map-name">{card.name}</span>
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
    </div>
  )
}

/** What a wire is for, as one chip at the middle of its own curve. */
const Sentence = ({
  wire,
  at,
  small,
  selected,
  pickable,
  sketch,
  onPick,
}: {
  wire: DrawnWire
  at: Spot
  small: boolean
  selected: boolean
  pickable: boolean
  /** On a sketch an empty wire is unfinished, not wrong. On the map the code
   *  left no words, and that is a problem to show rather than hide. */
  sketch: boolean
  onPick: () => void
}) => {
  const missing = !sketch && !wire.words && wire.kind !== 'leads to'
  const classes = ['map-sentence']
  if (missing) classes.push('map-sentence--missing')
  if (selected) classes.push('map-sentence--selected')
  if (pickable) classes.push('map-sentence--pickable')
  return (
    <div
      className={classes.join(' ')}
      style={{ left: at.x, top: at.y }}
      role={pickable ? 'button' : undefined}
      aria-label={`Wire ${wire.kind}${wire.words ? `: ${wire.words}` : ''}`}
      onPointerDown={(event) => {
        if (!pickable) return
        event.stopPropagation()
        onPick()
      }}
    >
      <span className="map-wire-kind">{wire.kind || 'wire'}</span>
      {small ? null : wire.words ? (
        <span className="map-wire-words">{wire.words}</span>
      ) : missing ? (
        <span className="map-wire-words">no words yet</span>
      ) : null}
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
  const [kind, setKind] = useState('')
  const [shutOverview, setShutOverview] = useState(true)
  const [peek, setPeek] = useState('')
  const [marquee, setMarquee] = useState<Box | null>(null)
  /** A card or note being dragged, and where it is now, before it lands. */
  const [lifted, setLifted] = useState<{ id: string; at: Spot } | null>(null)
  const [wireFrom, setWireFrom] = useState('')
  const arrival = useRef<Arrival>('none')
  const fitK = useRef(1)
  const busy = useRef(false)
  const space = useRef(false)
  const pan = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)
  const box = useRef<{ from: Spot } | null>(null)
  const carry = useRef<{ id: string; grab: Spot; moved: boolean } | null>(null)
  const dragged = useRef(false)
  const seen = useRef(view)
  seen.current = view

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
      openBox
        ? { x: openBox.x + OPEN_PAD - insideBounds.x, y: openBox.y + OPEN_PAD - insideBounds.y }
        : { x: 0, y: 0 },
    [openBox, insideBounds],
  )

  const laid = useMemo(
    () => inside.map((p) => ({ ...p, box: { ...p.box, x: p.box.x + shift.x, y: p.box.y + shift.y } })),
    [inside, shift],
  )
  const placed = useMemo(
    () =>
      lifted
        ? laid.map((p) =>
            p.card.id === lifted.id
              ? { ...p, box: { ...p.box, x: lifted.at.x + shift.x, y: lifted.at.y + shift.y } }
              : p,
          )
        : laid,
    [laid, lifted, shift],
  )
  const outside = useMemo(() => around.filter((p) => p.card.id !== focus.id), [around, focus])

  const where = useMemo(() => {
    const all = new Map<string, Box>(placed.map((p) => [p.card.id, p.box]))
    for (const p of around) all.set(p.card.id, p.box)
    return all
  }, [placed, around])

  const arrangement = (): Arrangement => inside.map((p) => ({ id: p.card.id, x: p.box.x, y: p.box.y }))

  // Wires into or out of one card share its side, spread out in the order
  // of where their other ends sit, so they do not cross on the way in.
  const slotsFor = (wires: DrawnWire[]) => {
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
    return {
      slots: (from: string, to: string): Slots => ({ from: share(outs, from, to), to: share(ins, to, from) }),
      inbound: (id: string): number => (ins.get(id) ?? []).length,
    }
  }

  /** Every wire on screen, with its curve, where its sentence sits, and
   *  whether the card it reaches is too busy for words. */
  const shapes = useMemo(() => {
    const draw = (wires: DrawnWire[]) => {
      const { slots, inbound } = slotsFor(wires)
      const found = wires.flatMap((wire) => {
        const from = where.get(wire.from)
        const to = where.get(wire.to)
        if (!from || !to) return []
        const shape = wirePath(from, to, slots(wire.from, wire.to))
        return [{ wire, key: wire.id ?? `${wire.from}>${wire.to}>${wire.kind}`, shape, small: inbound(wire.to) > BUSY }]
      })
      const spots = spread(
        found.map((one) => ({
          at: one.shape.at,
          w: one.small ? 56 : wordsWidth(one.wire) - 48,
          tail: one.shape.tail,
          head: one.shape.head,
        })),
        [...where.values()],
      )
      return found.map((one, i) => ({ ...one, at: spots[i]! }))
    }
    return { inner: draw(focus.wires), outer: parent ? draw(parent.wires) : [] }
  }, [focus, parent, where])

  /** Where a wire from outside crosses the border of the card that is open. */
  const ports = useMemo(
    () =>
      openBox
        ? shapes.outer
            .filter((one) => one.wire.to === focus.id || one.wire.from === focus.id)
            .map((one) => {
              const meets = one.wire.to === focus.id ? one.shape.head : one.shape.tail
              return { key: one.key, verb: one.wire.kind, x: meets.x, y: meets.y }
            })
            .filter((port) => port.x >= openBox.x - 2 && port.x <= openBox.x + openBox.w + 2)
        : [],
    [shapes, openBox, focus],
  )

  /** What reaches a busy card, listed beside it, because a wall of chips
   *  says nothing and a list says everything. */
  const pins = useMemo(() => {
    const id = drawing?.selected || peek
    if (!id) return null
    const rows = focus.wires.filter((wire) => wire.to === id)
    if (rows.length <= BUSY) return null
    const at = where.get(id)
    const card = focus.children.find((c) => c.id === id)
    if (!at || !card) return null
    return { at, name: card.name, rows: rows.slice(0, 6), more: rows.length - 6 }
  }, [drawing?.selected, peek, focus, where])

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
      const k = Math.min(el.clientWidth / at.w, el.clientHeight / at.h) * 0.9
      setMoving(true)
      setFaded(true)
      setView({ k, x: el.clientWidth / 2 - (at.x + at.w / 2) * k, y: el.clientHeight / 2 - (at.y + at.h / 2) * k })
      setTimeout(() => {
        arrival.current = 'in'
        drawing?.onSelect('')
        const base = sideways ? trail.slice(0, -1) : trail
        onPath(deeper([...base, card], Boolean(drawing)))
      }, STEP_MS)
    },
    [where, trail, onPath, drawing],
  )

  const tunnelOut = useCallback((): void => {
    if (trail.length < 2 || busy.current) return
    busy.current = true
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
      drawing?.onSelect('')
      onPath(shallower(trail, Boolean(drawing)))
    }, STEP_MS)
  }, [trail, onPath, drawing])

  const zoomBy = useCallback((by: number): void => {
    const el = frame.current
    if (!el) return
    setView((v) => {
      const k = v.k * by
      const cx = el.clientWidth / 2
      const cy = el.clientHeight / 2
      return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k }
    })
  }, [])

  // Zooming far enough into a card tunnels into it; far enough out tunnels out.
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
      // A trackpad scrolls to pan; the wheel, and ctrl or the meta key, zoom.
      if (!event.ctrlKey && !event.metaKey && event.deltaMode === 0 && Math.abs(event.deltaY) < 16 && Math.abs(event.deltaX) > 0) {
        setView({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY })
        return
      }
      const k = v.k * Math.exp(-event.deltaY * 0.0015)
      const worldX = (cx - v.x) / v.k
      const worldY = (cy - v.y) / v.k
      if (k > fitK.current * 3) {
        const under = placed.find(
          (p) => worldX >= p.box.x && worldX <= p.box.x + p.box.w && worldY >= p.box.y && worldY <= p.box.y + p.box.h,
        )
        if (under && canOpen(under.card)) tunnelIn(under.card)
        else setView({ k, x: cx - worldX * k, y: cy - worldY * k })
        return
      }
      if (k < fitK.current * 0.5) {
        if (trail.length > 1) tunnelOut()
        return
      }
      setView({ k, x: cx - worldX * k, y: cy - worldY * k })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [placed, trail, tunnelIn, tunnelOut])

  useEffect(() => {
    const typing = (target: EventTarget | null): boolean =>
      target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
    const down = (event: KeyboardEvent): void => {
      if (event.key === ' ') space.current = true
      if (typing(event.target)) return
      if (event.key === 'Escape' || (event.key === 'Backspace' && !drawing)) tunnelOut()
      if (event.key === '0') fit()
      if (event.key === '+' || event.key === '=') zoomBy(1.25)
      if (event.key === '-') zoomBy(0.8)
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
  }, [tunnelOut, drawing, fit, zoomBy])

  const worldOf = (event: { clientX: number; clientY: number }): Spot => {
    const rect = frame.current!.getBoundingClientRect()
    const v = seen.current
    return { x: (event.clientX - rect.left - v.x) / v.k, y: (event.clientY - rect.top - v.y) / v.k }
  }
  /** The same spot, in the space the cards inside the open card are laid out in. */
  const insideOf = (event: { clientX: number; clientY: number }): Spot => {
    const at = worldOf(event)
    return { x: at.x - shift.x, y: at.y - shift.y }
  }

  /** A card or note pressed with the Pick tool is picked up and carried. */
  const pickUp = (id: string, at: Spot) => (event: PointerEvent<HTMLDivElement>): void => {
    if (!drawing) return
    event.stopPropagation()
    if (tool === 'wire') {
      setWireFrom(id)
      return
    }
    if (tool === 'mockup') {
      drawing.onMockup(id)
      setTool('pick')
      return
    }
    drawing.onSelect(id)
    if (tool !== 'pick') return
    const spot = insideOf(event)
    carry.current = { id, grab: { x: spot.x - at.x, y: spot.y - at.y }, moved: false }
  }

  const dropWire = (id: string) => (): void => {
    if (!drawing || tool !== 'wire' || !wireFrom) return
    if (wireFrom !== id) drawing.onWire(wireFrom, id)
    setWireFrom('')
  }

  const down = (event: PointerEvent<HTMLDivElement>): void => {
    if (tool === 'area' && !space.current) {
      box.current = { from: worldOf(event) }
      return
    }
    pan.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false }
  }
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const drawn = box.current
    if (drawn) {
      const at = worldOf(event)
      setMarquee({
        x: Math.min(drawn.from.x, at.x),
        y: Math.min(drawn.from.y, at.y),
        w: Math.abs(at.x - drawn.from.x),
        h: Math.abs(at.y - drawn.from.y),
      })
      return
    }
    const held = carry.current
    if (held) {
      const spot = insideOf(event)
      held.moved = true
      setLifted({ id: held.id, at: { x: spot.x - held.grab.x, y: spot.y - held.grab.y } })
      return
    }
    const panned = pan.current
    if (!panned) return
    const dx = event.clientX - panned.x
    const dy = event.clientY - panned.y
    if (!panned.moved && Math.hypot(dx, dy) < 4) return
    panned.moved = true
    setView((v) => ({ ...v, x: panned.vx + dx, y: panned.vy + dy }))
  }
  const up = (event: PointerEvent<HTMLDivElement>): void => {
    const drawn = box.current
    box.current = null
    if (drawn && marquee && marquee.w > 20 && marquee.h > 20) {
      const el = frame.current!
      const k = Math.min(el.clientWidth / marquee.w, el.clientHeight / marquee.h, 4)
      setView({
        k,
        x: el.clientWidth / 2 - (marquee.x + marquee.w / 2) * k,
        y: el.clientHeight / 2 - (marquee.y + marquee.h / 2) * k,
      })
      setMarquee(null)
      setTool('pick')
      return
    }
    setMarquee(null)

    const held = carry.current
    carry.current = null
    if (held && held.moved && lifted && drawing) {
      drawing.onMove(held.id, lifted.at, arrangement())
      setLifted(null)
      dragged.current = true
      return
    }
    setLifted(null)
    const panned = pan.current
    pan.current = null
    setWireFrom('')
    dragged.current = panned?.moved ?? false
    // A press on the bare canvas with a drawing tool puts something there.
    if (drawing && panned && !panned.moved && event.target === event.currentTarget) {
      if (tool === 'card') {
        drawing.onPlace(insideOf(event), arrangement(), kind)
        setTool('pick')
      } else if (tool === 'note') {
        drawing.onNote(insideOf(event), arrangement())
        setTool('pick')
      } else drawing.onSelect('')
    }
  }

  const empty = focus.children.length === 0 && notes.length === 0
  const screen: Box = {
    x: (-view.x) / view.k,
    y: (-view.y) / view.k,
    w: (frame.current?.clientWidth ?? 0) / view.k,
    h: (frame.current?.clientHeight ?? 0) / view.k,
  }

  const wireGroup = (
    list: typeof shapes.inner,
    opts: { faint?: boolean } = {},
  ): ReactElement[] =>
    list.map(({ wire, key, shape }) => (
      <g
        key={key}
        className={`map-wire map-wire--${wire.kind.replace(/\s+/g, '-')}${
          drawing && wire.id && drawing.selected === wire.id ? ' map-wire--selected' : ''
        }${opts.faint ? ' map-wire--outside' : ''}`}
      >
        <path d={shape.d} markerEnd="url(#map-head)" />
      </g>
    ))

  return (
    <>
      <ToolRail
        tool={tool}
        sketch={Boolean(drawing)}
        level={focus.level}
        kind={kind}
        onTool={setTool}
        onKind={(one) => {
          setKind(one)
          setTool('card')
        }}
        onStartSketch={() => onStartSketch?.()}
        onFit={fit}
        onOverview={() => setShutOverview(!shutOverview)}
      />
      <div
        ref={frame}
        className={`map-frame-area map-frame-area--${tool}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={() => {
          pan.current = null
          carry.current = null
          box.current = null
          setMarquee(null)
          setLifted(null)
        }}
        onClickCapture={(event) => {
          if (dragged.current) event.stopPropagation()
          dragged.current = false
        }}
      >
        {empty ? (
          <div className="map-empty">
            {drawing
              ? 'Nothing drawn here yet. Pick Card and click to place one.'
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
            </defs>
            {wireGroup(shapes.outer, { faint: true })}
            {wireGroup(shapes.inner)}
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
                  {focus.name}
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

          {placed.map((p) => (
            <CardFace
              key={p.card.id}
              placed={p}
              picture={drawing?.mockups[p.card.id] ?? p.card.shot}
              opens={canOpen(p.card)}
              selected={drawing?.selected === p.card.id || wireFrom === p.card.id}
              receded={false}
              onOpen={() => tunnelIn(p.card)}
              onPress={drawing ? pickUp(p.card.id, { x: p.box.x - shift.x, y: p.box.y - shift.y }) : undefined}
              onRelease={drawing ? dropWire(p.card.id) : undefined}
              onPeek={setPeek}
            />
          ))}

          {notes.map((note) => {
            const at = lifted?.id === note.id ? lifted.at : note
            return (
              <div
                key={note.id}
                className={drawing?.selected === note.id ? 'map-note map-card--selected' : 'map-note'}
                style={{ left: at.x + shift.x, top: at.y + shift.y }}
                role={drawing ? 'button' : undefined}
                aria-label={`Note: ${note.text || 'empty'}`}
                onPointerDown={pickUp(note.id, { x: note.x, y: note.y })}
                onClick={(event) => event.stopPropagation()}
              >
                {note.text || <span className="map-more">Empty note</span>}
              </div>
            )
          })}

          {/* Sentences go over the cards, so a wire that passes behind one
              still says what it is for. */}
          {[...shapes.outer, ...shapes.inner].map(({ wire, key, at, small }) => (
            <Sentence
              key={key}
              wire={wire}
              at={at}
              small={small}
              selected={Boolean(drawing && wire.id && drawing.selected === wire.id)}
              pickable={Boolean(drawing && wire.id)}
              sketch={Boolean(drawing)}
              onPick={() => wire.id && drawing?.onSelect(wire.id)}
            />
          ))}

          {pins ? (
            <div className="map-pins" style={{ left: pins.at.x + pins.at.w + 16, top: pins.at.y }}>
              <div className="map-pins-head">What reaches {pins.name}</div>
              {pins.rows.map((row) => (
                <div key={`${row.from}>${row.kind}`} className="map-pins-row">
                  <b>{focus.children.find((c) => c.id === row.from)?.name ?? row.from}</b>
                  <span className="map-pins-verb">{row.kind}</span>
                  <span>{row.words || '—'}</span>
                </div>
              ))}
              {pins.more > 0 ? <div className="map-pins-row map-more">… {pins.more} more</div> : null}
            </div>
          ) : null}

          {marquee ? (
            <div className="map-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />
          ) : null}
        </div>

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
    </>
  )
}
