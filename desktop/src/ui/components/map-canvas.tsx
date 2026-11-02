// codegraph: component map-canvas
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { Card } from '../../features/show-map.js'
import { boundsOf, isFrame, layOut, wirePath, type Placed, type Slots } from './map-layout.js'

type View = { x: number; y: number; k: number }
type Arrival = 'in' | 'out' | 'none'

const STEP_MS = 320

/** The card a path of ids leads to, and every card on the way. */
export const walk = (root: Card, path: string[]): Card[] => {
  const trail = [root]
  for (const id of path.slice(1)) {
    const next = trail[trail.length - 1]!.children.find((c) => c.id === id)
    if (!next) break
    trail.push(next)
  }
  return trail
}

/** Tunnelling into a card carries on through any level with only one card
 *  in it, since there is nothing to choose there (ADR 0002). */
const deeper = (trail: Card[]): string[] => {
  const path = trail.map((c) => c.id)
  let last = trail[trail.length - 1]!
  while (last.children.length === 1 && last.children[0]!.children.length > 0) {
    last = last.children[0]!
    path.push(last.id)
  }
  return path
}

/** Tunnelling out skips back over those same levels. */
const shallower = (trail: Card[]): string[] => {
  const path = trail.map((c) => c.id)
  path.pop()
  while (path.length > 1 && walk(trail[0]!, path).at(-1)!.children.length === 1) path.pop()
  return path
}

const kindWords = (card: Card): string =>
  card.level === 'component' && card.start ? 'start page' : card.kind || card.level

const Inside = ({ card }: { card: Card }) => {
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

const CardFace = ({ placed, onOpen }: { placed: Placed; onOpen: (card: Card) => void }) => {
  const { card, box } = placed
  const opens = card.children.length > 0
  const classes = ['map-card', `map-card--${card.level}`, `map-kind--${card.kind.replace(/\s+/g, '-')}`]
  if (!card.setUp) classes.push('map-card--bare')
  if (isFrame(card)) classes.push('map-frame')
  return (
    <div
      className={classes.join(' ')}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      role={opens ? 'button' : undefined}
      aria-label={opens ? `Open ${card.name}` : card.name}
      tabIndex={opens ? 0 : undefined}
      onClick={(event) => {
        event.stopPropagation()
        if (opens) onOpen(card)
      }}
      onKeyDown={(event) => {
        if (opens && event.key === 'Enter') onOpen(card)
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
          <div className="map-shot">No screenshot yet</div>
          <div className="map-frame-name">
            <span className="map-kind">{kindWords(card)}</span>
            <span className="map-name">{card.name}</span>
          </div>
        </>
      ) : (
        <>
          <div className="map-kind">{kindWords(card)}</div>
          <div className="map-name">{card.name}</div>
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
}: {
  root: Card
  path: string[]
  onPath: (path: string[]) => void
}) => {
  const frame = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const [moving, setMoving] = useState(false)
  const [faded, setFaded] = useState(false)
  const arrival = useRef<Arrival>('none')
  const fitK = useRef(1)
  const busy = useRef(false)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)
  const dragged = useRef(false)
  const seen = useRef(view)
  seen.current = view

  const trail = useMemo(() => walk(root, path), [root, path])
  const focus = trail[trail.length - 1]!
  const placed = useMemo(() => layOut(focus.children), [focus])
  const where = useMemo(() => new Map(placed.map((p) => [p.card.id, p.box])), [placed])

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
        return from && to ? [{ wire, shape: wirePath(from, to, slots(wire.from, wire.to)) }] : []
      }),
    [focus, where, slots],
  )

  const fitted = useCallback((): View => {
    const el = frame.current
    const bounds = boundsOf(placed.map((p) => p.box))
    if (!el || bounds.w === 0) return { x: (el?.clientWidth ?? 0) / 2, y: (el?.clientHeight ?? 0) / 2, k: 1 }
    const pad = 120
    const k = Math.min((el.clientWidth - pad) / bounds.w, (el.clientHeight - pad) / bounds.h, 1.3)
    fitK.current = k
    return {
      x: el.clientWidth / 2 - (bounds.x + bounds.w / 2) * k,
      y: el.clientHeight / 2 - (bounds.y + bounds.h / 2) * k,
      k,
    }
  }, [placed])

  // Each new level arrives from the direction it was reached.
  useLayoutEffect(() => {
    const fit = fitted()
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
  }, [fitted])

  useEffect(() => {
    const refit = (): void => setView(fitted())
    window.addEventListener('resize', refit)
    return () => window.removeEventListener('resize', refit)
  }, [fitted])

  const tunnelIn = useCallback(
    (card: Card): void => {
      const box = where.get(card.id)
      const el = frame.current
      if (!box || !el || busy.current || card.children.length === 0) return
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
        onPath(deeper([...trail, card]))
      }, STEP_MS)
    },
    [where, trail, onPath],
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
      onPath(shallower(trail))
    }, STEP_MS)
  }, [trail, onPath])

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
        if (under && under.card.children.length > 0) tunnelIn(under.card)
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
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.key === 'Escape' || event.key === 'Backspace') tunnelOut()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [tunnelOut])

  const down = (event: PointerEvent<HTMLDivElement>): void => {
    drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false }
  }
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const held = drag.current
    if (!held) return
    const dx = event.clientX - held.x
    const dy = event.clientY - held.y
    if (!held.moved && Math.hypot(dx, dy) < 4) return
    held.moved = true
    setView((v) => ({ ...v, x: held.vx + dx, y: held.vy + dy }))
  }
  const up = (): void => {
    dragged.current = drag.current?.moved ?? false
    drag.current = null
  }

  return (
    <div
      ref={frame}
      className="map-frame-area"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={up}
      onClickCapture={(event) => {
        if (dragged.current) event.stopPropagation()
        dragged.current = false
      }}
    >
      {focus.children.length === 0 ? (
        <div className="map-empty">
          {focus.level === 'project'
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
          {shapes.map(({ wire, shape }) => (
            <g key={`${wire.from}>${wire.to}>${wire.kind}`} className={`map-wire map-wire--${wire.kind.replace(/\s+/g, '-')}`}>
              <path d={shape.d} markerEnd="url(#map-head)" />
            </g>
          ))}
        </svg>
        {placed.map((p) => (
          <CardFace key={p.card.id} placed={p} onOpen={tunnelIn} />
        ))}
        {/* Words go over the cards, so a wire that passes behind one still
            says what it is for. */}
        <svg className="map-wires" width="1" height="1">
          {shapes.map(({ wire, shape }) => (
            <g key={`${wire.from}>${wire.to}>${wire.kind}`} className="map-wire" style={{ textAnchor: shape.label.anchor }}>
              <text x={shape.label.x} y={shape.label.y - (wire.words ? 18 : 6)} className="map-wire-kind">
                {wire.kind}
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
