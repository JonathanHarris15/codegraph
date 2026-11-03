// codegraph: component map-canvas
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { boundsOf, isFrame, layOut, wirePath, type DrawnCard, type DrawnNote, type Placed, type Slots } from './map-layout.js'

type View = { x: number; y: number; k: number }
type Arrival = 'in' | 'out' | 'none'
type Spot = { x: number; y: number }

export type Tool = 'select' | 'card' | 'wire' | 'note'

/** Where every card on a level sits, so a level laid out by the canvas can be
 *  pinned down the moment a person moves or adds anything on it. */
export type Arrangement = { id: string; x: number; y: number }[]

/** What a sketch hands the canvas so a person can draw on it. Left out, the
 *  canvas only shows. */
export type Drawing = {
  tool: Tool
  selected: string
  mockups: Record<string, string>
  onSelect: (id: string) => void
  onPlace: (at: Spot, arrangement: Arrangement) => void
  onMove: (id: string, at: Spot, arrangement: Arrangement) => void
  onWire: (from: string, to: string) => void
}

const STEP_MS = 320

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

const kindWords = (card: DrawnCard): string =>
  card.level === 'component' && card.start ? 'start page' : card.kind || card.level

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
  onOpen,
  onPress,
  onRelease,
}: {
  placed: Placed
  picture: string
  opens: boolean
  selected: boolean
  onOpen: () => void
  onPress?: (event: PointerEvent<HTMLDivElement>) => void
  onRelease?: () => void
}) => {
  const { card, box } = placed
  const drawing = Boolean(onPress)
  const classes = ['map-card', `map-card--${card.level}`, `map-kind--${card.kind.replace(/\s+/g, '-')}`]
  if (!card.setUp) classes.push('map-card--bare')
  if (isFrame(card)) classes.push('map-frame')
  if (selected) classes.push('map-card--selected')
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
            <span className="map-frame-at">{card.at || 'no address'}</span>
          </div>
          {picture ? (
            <img className="map-shot map-shot--real" src={picture} alt={`${card.name} as it looks`} draggable={false} />
          ) : (
            <div className="map-shot">{drawing ? 'No mockup yet' : 'No screenshot yet'}</div>
          )}
          <div className="map-frame-name">
            <span className="map-kind">{kindWords(card)}</span>
            <span className="map-name">{card.name}</span>
          </div>
        </>
      ) : (
        <>
          <div className="map-kind">{kindWords(card)}</div>
          <div className="map-name">{card.name || <span className="map-more">Unnamed</span>}</div>
          {card.says ? <div className="map-says">{card.says}</div> : null}
          <Inside card={card} />
        </>
      )}
    </div>
  )
}

export const MapCanvas = ({
  root,
  path,
  onPath,
  drawing,
}: {
  root: DrawnCard
  path: string[]
  onPath: (path: string[]) => void
  drawing?: Drawing
}) => {
  const frame = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const [moving, setMoving] = useState(false)
  const [faded, setFaded] = useState(false)
  /** A card or note being dragged, and where it is now, before it lands. */
  const [lifted, setLifted] = useState<{ id: string; at: Spot } | null>(null)
  const [wireFrom, setWireFrom] = useState('')
  const arrival = useRef<Arrival>('none')
  const fitK = useRef(1)
  const busy = useRef(false)
  const pan = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)
  const carry = useRef<{ id: string; grab: Spot; moved: boolean } | null>(null)
  const dragged = useRef(false)
  const seen = useRef(view)
  seen.current = view

  const trail = useMemo(() => walk(root, path), [root, path])
  const focus = trail[trail.length - 1]!
  const notes: DrawnNote[] = focus.notes ?? []
  const laid = useMemo(() => layOut(focus.children), [focus])
  const placed = useMemo(
    () =>
      lifted ? laid.map((p) => (p.card.id === lifted.id ? { ...p, box: { ...p.box, x: lifted.at.x, y: lifted.at.y } } : p)) : laid,
    [laid, lifted],
  )
  const where = useMemo(() => new Map(placed.map((p) => [p.card.id, p.box])), [placed])

  const arrangement = (): Arrangement => laid.map((p) => ({ id: p.card.id, x: p.box.x, y: p.box.y }))

  // Wires into or out of one card share its side, spread out in the order
  // of where their other ends sit, so they do not cross on the way in.
  const slots = useMemo(() => {
    const share = (ends: Map<string, string[]>, id: string, other: string): number => {
      const list = ends.get(id) ?? []
      return (list.indexOf(other) + 1) / (list.length + 1)
    }
    const outs = new Map<string, string[]>()
    const ins = new Map<string, string[]>()
    const height = (id: string): number => where.get(id)?.y ?? 0
    for (const wire of focus.wires) {
      outs.set(wire.from, [...(outs.get(wire.from) ?? []), wire.to])
      ins.set(wire.to, [...(ins.get(wire.to) ?? []), wire.from])
    }
    for (const list of [...outs.values(), ...ins.values()]) list.sort((a, b) => height(a) - height(b))
    return (from: string, to: string): Slots => ({ from: share(outs, from, to), to: share(ins, to, from) })
  }, [focus, where])

  const shapes = useMemo(
    () =>
      focus.wires.flatMap((wire) => {
        const from = where.get(wire.from)
        const to = where.get(wire.to)
        return from && to ? [{ wire, key: wire.id ?? `${wire.from}>${wire.to}>${wire.kind}`, shape: wirePath(from, to, slots(wire.from, wire.to)) }] : []
      }),
    [focus, where, slots],
  )

  const fitted = useCallback((): View => {
    const el = frame.current
    const boxes = [...laid.map((p) => p.box), ...notes.map((n) => ({ x: n.x, y: n.y, w: 200, h: 90 }))]
    const bounds = boundsOf(boxes)
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
  }, [laid, notes])
  const fittedNow = useRef(fitted)
  fittedNow.current = fitted

  // Each new level arrives from the direction it was reached. Drawing on a
  // level leaves the view where the person has it.
  useLayoutEffect(() => {
    const fit = fittedNow.current()
    const came = arrival.current
    arrival.current = 'none'
    if (came === 'none') {
      setMoving(false)
      setFaded(false)
      setView(fit)
      busy.current = false
      return
    }
    const scale = came === 'in' ? 0.55 : 1.8
    const el = frame.current!
    setMoving(false)
    setFaded(true)
    setView({
      k: fit.k * scale,
      x: el.clientWidth / 2 - (el.clientWidth / 2 - fit.x) * scale,
      y: el.clientHeight / 2 - (el.clientHeight / 2 - fit.y) * scale,
    })
    const settle = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setMoving(true)
        setFaded(false)
        setView(fit)
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

  const tunnelIn = useCallback(
    (card: DrawnCard): void => {
      const box = where.get(card.id)
      const el = frame.current
      if (!box || !el || busy.current || !canOpen(card)) return
      busy.current = true
      const k = Math.min(el.clientWidth / box.w, el.clientHeight / box.h) * 0.9
      setMoving(true)
      setFaded(true)
      setView({
        k,
        x: el.clientWidth / 2 - (box.x + box.w / 2) * k,
        y: el.clientHeight / 2 - (box.y + box.h / 2) * k,
      })
      setTimeout(() => {
        arrival.current = 'in'
        drawing?.onSelect('')
        onPath(deeper([...trail, card], Boolean(drawing)))
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
    const key = (event: KeyboardEvent): void => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return
      if (event.key === 'Escape') tunnelOut()
      if (event.key === 'Backspace' && !drawing) tunnelOut()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [tunnelOut, drawing])

  const worldOf = (event: { clientX: number; clientY: number }): Spot => {
    const rect = frame.current!.getBoundingClientRect()
    const v = seen.current
    return { x: (event.clientX - rect.left - v.x) / v.k, y: (event.clientY - rect.top - v.y) / v.k }
  }

  /** A card or note pressed with the select tool is picked up and carried. */
  const pickUp = (id: string, at: Spot) => (event: PointerEvent<HTMLDivElement>): void => {
    if (!drawing) return
    event.stopPropagation()
    if (drawing.tool === 'wire') {
      setWireFrom(id)
      return
    }
    drawing.onSelect(id)
    if (drawing.tool !== 'select') return
    const spot = worldOf(event)
    carry.current = { id, grab: { x: spot.x - at.x, y: spot.y - at.y }, moved: false }
  }

  const dropWire = (id: string) => (): void => {
    if (!drawing || drawing.tool !== 'wire' || !wireFrom) return
    if (wireFrom !== id) drawing.onWire(wireFrom, id)
    setWireFrom('')
  }

  const down = (event: PointerEvent<HTMLDivElement>): void => {
    pan.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false }
  }
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const held = carry.current
    if (held) {
      const spot = worldOf(event)
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
      if (drawing.tool === 'card' || drawing.tool === 'note') drawing.onPlace(worldOf(event), arrangement())
      else drawing.onSelect('')
    }
  }

  const empty = focus.children.length === 0 && notes.length === 0
  return (
    <div
      ref={frame}
      className={drawing ? `map-frame-area map-frame-area--${drawing.tool}` : 'map-frame-area'}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={() => {
        pan.current = null
        carry.current = null
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
          {shapes.map(({ wire, key, shape }) => (
            <g
              key={key}
              className={`map-wire map-wire--${wire.kind.replace(/\s+/g, '-')}${drawing?.selected === wire.id ? ' map-wire--selected' : ''}`}
            >
              <path d={shape.d} markerEnd="url(#map-head)" />
            </g>
          ))}
        </svg>
        {placed.map((p) => (
          <CardFace
            key={p.card.id}
            placed={p}
            picture={drawing?.mockups[p.card.id] ?? p.card.shot}
            opens={canOpen(p.card)}
            selected={drawing?.selected === p.card.id || wireFrom === p.card.id}
            onOpen={() => tunnelIn(p.card)}
            onPress={drawing ? pickUp(p.card.id, { x: p.box.x, y: p.box.y }) : undefined}
            onRelease={drawing ? dropWire(p.card.id) : undefined}
          />
        ))}
        {notes.map((note) => {
          const at = lifted?.id === note.id ? lifted.at : note
          return (
            <div
              key={note.id}
              className={drawing?.selected === note.id ? 'map-note map-card--selected' : 'map-note'}
              style={{ left: at.x, top: at.y }}
              role={drawing ? 'button' : undefined}
              aria-label={`Note: ${note.text || 'empty'}`}
              onPointerDown={pickUp(note.id, { x: note.x, y: note.y })}
              onClick={(event) => event.stopPropagation()}
            >
              {note.text || <span className="map-more">Empty note</span>}
            </div>
          )
        })}
        {/* Words go over the cards, so a wire that passes behind one still
            says what it is for. On a sketch, pressing them picks the wire. */}
        <svg className="map-wires" width="1" height="1">
          {shapes.map(({ wire, key, shape }) => (
            <g
              key={key}
              className={drawing ? 'map-wire map-wire--pickable' : 'map-wire'}
              style={{ textAnchor: shape.label.anchor }}
              role={drawing ? 'button' : undefined}
              aria-label={drawing ? `Wire ${wire.kind}${wire.words ? `: ${wire.words}` : ''}` : undefined}
              onPointerDown={(event) => {
                if (!drawing || !wire.id) return
                event.stopPropagation()
                drawing.onSelect(wire.id)
              }}
            >
              <text x={shape.label.x} y={shape.label.y - (wire.words ? 18 : 6)} className="map-wire-kind">
                {wire.kind || 'wire'}
              </text>
              {wire.words ? (
                <text x={shape.label.x} y={shape.label.y - 5} className="map-wire-words">
                  {wire.words}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
