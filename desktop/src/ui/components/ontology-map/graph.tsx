// codegraph: component ontology-map
// The ontology map as a living graph: terms and decisions float on the
// drafting paper, each software system in a bubble of its own, pulled together
// by what they point at and pushed apart by everything else. More to look at
// and play with than to work in; the dictionary is where the writing happens
// (ADR 0038).
import { BookOpen, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { adrKey, findingsOf, nameOf, termKey, type Edits, type Model } from './model.js'

type Kind = 'term' | 'word' | 'borrowed' | 'adr'
type GNode = {
  id: string
  kind: Kind
  name: string
  repo: string
  status: string
  says: string
  tone: 'problem' | 'waiting' | ''
  degree: number
  x: number
  y: number
  vx: number
  vy: number
  phase: number
  held: boolean
}
type GLink = { from: string; to: string; kind: 'points' | 'settles' | 'borrowed' | 'replaces'; many: boolean }

/** The graph's nodes and links, from the ontology map. */
const shape = (o: Model): { nodes: Omit<GNode, 'x' | 'y' | 'vx' | 'vy' | 'phase' | 'held' | 'degree'>[]; links: GLink[] } => {
  const nodes = [
    ...o.terms.map((t) => {
      const found = findingsOf(o, termKey(t))[0]
      return {
        id: termKey(t),
        kind: (t.borrowed ? 'borrowed' : t.store ? 'term' : 'word') as Kind,
        name: t.name,
        repo: t.repo,
        status: '',
        says: t.says,
        tone: found?.tone ?? ('' as const),
      }
    }),
    ...o.adrs.map((a) => {
      const found = findingsOf(o, adrKey(a))[0]
      return { id: adrKey(a), kind: 'adr' as Kind, name: `${a.number}. ${a.title}`, repo: a.repo, status: a.status, says: a.decision, tone: found?.tone ?? ('' as const) }
    }),
  ]
  const has = new Set(nodes.map((n) => n.id))
  const links: GLink[] = []
  const add = (l: GLink): void => {
    if (has.has(l.from) && has.has(l.to) && !links.some((k) => k.from === l.from && k.to === l.to)) links.push(l)
  }
  for (const t of o.terms) {
    for (const l of t.pointsAt) add({ from: termKey(t), to: termKey({ repo: t.repo, name: l.term }), kind: 'points', many: l.howMany === 'many' })
    for (const n of t.settledBy) add({ from: adrKey({ repo: t.repo, number: n }), to: termKey(t), kind: 'settles', many: false })
    if (t.borrowed) add({ from: termKey({ repo: t.borrowed.from, name: t.name }), to: termKey(t), kind: 'borrowed', many: false })
  }
  for (const a of o.adrs) {
    for (const name of a.terms) add({ from: adrKey(a), to: termKey({ repo: a.repo, name }), kind: 'settles', many: false })
    for (const n of a.replaces) add({ from: adrKey(a), to: adrKey({ repo: a.repo, number: n }), kind: 'replaces', many: false })
  }
  return { nodes, links }
}

type P = { x: number; y: number }

/** The smallest convex shape round some points, walked in order. */
const convexHull = (points: P[]): P[] => {
  const ps = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (ps.length < 3) return ps
  const cross = (o: P, a: P, b: P): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: P[] = []
  for (const p of ps) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: P[] = []
  for (const p of [...ps].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** A path round a convex shape, held off it by pad, with round corners. */
const bubble = (ctx: CanvasRenderingContext2D, hull: P[], pad: number): void => {
  ctx.beginPath()
  if (hull.length === 1) {
    ctx.arc(hull[0]!.x, hull[0]!.y, pad, 0, Math.PI * 2)
    return
  }
  if (hull.length === 2) {
    const [a, b] = hull as [P, P]
    const t = Math.atan2(b.y - a.y, b.x - a.x)
    ctx.arc(b.x, b.y, pad, t - Math.PI / 2, t + Math.PI / 2)
    ctx.arc(a.x, a.y, pad, t + Math.PI / 2, t + (3 * Math.PI) / 2)
    ctx.closePath()
    return
  }
  // Which way the hull is walked decides which side of each edge is outside.
  let area = 0
  hull.forEach((p, i) => {
    const q = hull[(i + 1) % hull.length]!
    area += p.x * q.y - q.x * p.y
  })
  const out = (a: P, b: P): number => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    return area > 0 ? Math.atan2(-dx, dy) : Math.atan2(dx, -dy)
  }
  hull.forEach((p, i) => {
    const prev = hull[(i - 1 + hull.length) % hull.length]!
    const next = hull[(i + 1) % hull.length]!
    ctx.arc(p.x, p.y, pad, out(prev, p), out(p, next), area < 0)
  })
  ctx.closePath()
}

/** How soon a second click must follow the first to open the node. */
const DOUBLE_CLICK_MS = 500

const radius = (n: GNode): number => (n.kind === 'adr' ? 7 + Math.min(n.degree, 6) : n.kind === 'borrowed' ? 6 : 6 + Math.min(n.degree, 6) * 1.6)

/** The colours of the design system, read from the page so the graph follows
 *  the theme. */
const palette = (el: Element) => {
  const css = getComputedStyle(el)
  const v = (name: string): string => css.getPropertyValue(name).trim()
  return {
    paper: v('--canvas-000'),
    minor: v('--grid-minor'),
    major: v('--grid-major'),
    ink: v('--ink-000'),
    soft: v('--ink-soft'),
    faint: v('--ink-faint'),
    wire: v('--wire-line'),
    strong: v('--wire-strong'),
    term: v('--kind-keep'),
    system: v('--kind-structure'),
    systemWash: v('--kind-structure-wash'),
    termWash: v('--kind-keep-wash'),
    outside: v('--kind-outside'),
    accent: v('--accent'),
    accentWash: v('--accent-wash'),
    problem: v('--state-problem'),
    waiting: v('--state-waiting'),
    surface: v('--surface-000'),
    sans: v('--font-sans'),
    mono: v('--font-mono'),
  }
}

export const GraphView = ({
  ontology,
  edits,
  focus,
  onOpen,
}: {
  ontology: Model
  edits: Edits
  /** A node to fly to when the view opens. */
  focus: string
  onOpen: (key: string) => void
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodes = useRef(new Map<string, GNode>())
  const links = useRef<GLink[]>([])
  const view = useRef({ x: 0, y: 0, k: 1.15, tx: -40, ty: 0, tk: 1.15 })
  const heat = useRef(1)
  const pointer = useRef<{ hover: string; drag: string; linking: string; at: { x: number; y: number } | null }>({ hover: '', drag: '', linking: '', at: null })
  const [picked, setPicked] = useState(focus)
  const pickedRef = useRef(focus)
  const lastClick = useRef({ id: '', at: 0 })
  pickedRef.current = picked
  const [show, setShow] = useState({ terms: true, decisions: true, borrowed: true })
  const showRef = useRef(show)
  showRef.current = show
  const [query, setQuery] = useState('')
  const queryRef = useRef('')
  queryRef.current = query.trim().toLowerCase()
  const [motion, setMotion] = useState(true)
  const motionRef = useRef(true)
  motionRef.current = motion
  const [spread, setSpread] = useState(1)
  const spreadRef = useRef(1)
  spreadRef.current = spread
  const [, rerender] = useState(0)

  const graph = useMemo(() => shape(ontology), [ontology])
  // Each repo gathers round a home of its own, spread across the paper.
  const repos = useRef<{ address: string; name: string }[]>([])
  repos.current = ontology.repos.filter((r) => r.here).map((r) => ({ address: r.address, name: r.name }))
  const homeOf = (repo: string): number => {
    const i = repos.current.findIndex((r) => r.address === repo)
    return (Math.max(0, i) - (repos.current.length - 1) / 2) * 540
  }

  // Keep each node where it is when the ontology changes; a new one starts in
  // the middle of its repo and is pushed out.
  useEffect(() => {
    const now = nodes.current
    const seen = new Set<string>()
    for (const n of graph.nodes) {
      seen.add(n.id)
      const was = now.get(n.id)
      const home = homeOf(n.repo)
      if (was) Object.assign(was, n)
      else now.set(n.id, { ...n, degree: 0, x: home + (Math.random() - 0.5) * 40, y: (Math.random() - 0.5) * 40, vx: 0, vy: 0, phase: Math.random() * Math.PI * 2, held: false })
    }
    for (const id of [...now.keys()]) if (!seen.has(id)) now.delete(id)
    for (const n of now.values()) n.degree = graph.links.filter((l) => l.from === n.id || l.to === n.id).length
    links.current = graph.links
    heat.current = Math.max(heat.current, 0.6)
    // The card reads the picked node from here, so it shows once the nodes are.
    rerender((n) => n + 1)
  }, [graph])

  const visible = (n: GNode): boolean =>
    n.kind === 'adr' ? showRef.current.decisions : n.kind === 'borrowed' ? showRef.current.borrowed : showRef.current.terms

  // Fly to the node the view was opened on.
  useEffect(() => {
    if (!focus) return
    const id = window.setTimeout(() => {
      const n = nodes.current.get(focus)
      if (n) Object.assign(view.current, { tx: -n.x * 1.4, ty: -n.y * 1.4, tk: 1.4 })
    }, 700)
    return () => window.clearTimeout(id)
  }, [focus])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let colours = palette(canvas)
    let frame = 0
    let raf = 0
    const started = performance.now()

    const fit = (): void => {
      const box = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(box.width * dpr)
      canvas.height = Math.round(box.height * dpr)
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(canvas)

    const step = (time: number): void => {
      const t = (time - started) / 1000
      const all = [...nodes.current.values()].filter(visible)
      const byId = nodes.current
      const live = motionRef.current
      // Forces: everything pushes everything, links pull, each repo has a home.
      const alpha = Math.max(heat.current, live ? 0.06 : 0)
      if (alpha > 0) {
        for (let i = 0; i < all.length; i++)
          for (let j = i + 1; j < all.length; j++) {
            const a = all[i]!
            const b = all[j]!
            let dx = b.x - a.x
            let dy = b.y - a.y
            let d2 = dx * dx + dy * dy
            if (d2 < 1) {
              dx = Math.random() - 0.5
              dy = Math.random() - 0.5
              d2 = 1
            }
            const d = Math.sqrt(d2)
            const push = (5200 * spreadRef.current * alpha) / d2
            a.vx -= (dx / d) * push
            a.vy -= (dy / d) * push
            b.vx += (dx / d) * push
            b.vy += (dy / d) * push
          }
        for (const l of links.current) {
          const a = byId.get(l.from)
          const b = byId.get(l.to)
          if (!a || !b || !visible(a) || !visible(b)) continue
          const dx = b.x - a.x
          const dy = b.y - a.y
          const d = Math.max(1, Math.hypot(dx, dy))
          const rest = (l.kind === 'borrowed' ? 230 : l.kind === 'settles' ? 95 : 110) * Math.sqrt(spreadRef.current)
          const pull = ((d - rest) / d) * 0.04 * alpha * (l.kind === 'borrowed' ? 0.3 : 1)
          a.vx += dx * pull
          a.vy += dy * pull
          b.vx -= dx * pull
          b.vy -= dy * pull
        }
        for (const n of all) {
          const home = homeOf(n.repo)
          // A node with nothing to hold it is pulled home harder, so it never drifts off.
          const pull = n.degree === 0 ? 0.03 : 0.009
          n.vx += (home - n.x) * pull * alpha
          n.vy += (0 - n.y) * pull * alpha
          // A slow drift, so the graph breathes when nothing touches it.
          if (live) {
            n.vx += Math.cos(t * 0.55 + n.phase) * 0.035
            n.vy += Math.sin(t * 0.47 + n.phase * 1.3) * 0.035
          }
          if (n.held) {
            n.vx = 0
            n.vy = 0
            continue
          }
          n.vx *= 0.82
          n.vy *= 0.82
          n.x += n.vx
          n.y += n.vy
        }
        heat.current *= 0.985
      }

      // The view eases toward where it was sent.
      const v = view.current
      v.x += (v.tx - v.x) * 0.14
      v.y += (v.ty - v.y) * 0.14
      v.k += (v.tk - v.k) * 0.14

      if (frame++ % 30 === 0) colours = palette(canvas)
      draw(ctx, canvas, colours, t, all)
      raf = requestAnimationFrame(step)
    }

    const draw = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, c: ReturnType<typeof palette>, t: number, all: GNode[]): void => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      const v = view.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = c.paper
      ctx.fillRect(0, 0, w, h)

      // Drafting paper that moves with the view: fine lines, every fifth stronger.
      const pitch = 24 * v.k
      const ox = w / 2 + v.x
      const oy = h / 2 + v.y
      for (const [every, colour] of [
        [1, c.minor],
        [5, c.major],
      ] as const) {
        const gap = pitch * every
        if (gap < 6) continue
        ctx.strokeStyle = colour
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let x = ((ox % gap) + gap) % gap; x < w; x += gap) {
          ctx.moveTo(Math.round(x) + 0.5, 0)
          ctx.lineTo(Math.round(x) + 0.5, h)
        }
        for (let y = ((oy % gap) + gap) % gap; y < h; y += gap) {
          ctx.moveTo(0, Math.round(y) + 0.5)
          ctx.lineTo(w, Math.round(y) + 0.5)
        }
        ctx.stroke()
      }

      ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * (w / 2 + v.x), dpr * (h / 2 + v.y))
      const byId = nodes.current
      const focusId = pointer.current.drag || pointer.current.hover || pickedRef.current
      const near = new Set<string>()
      if (focusId) {
        near.add(focusId)
        for (const l of links.current) {
          if (l.from === focusId) near.add(l.to)
          if (l.to === focusId) near.add(l.from)
        }
      }
      const q = queryRef.current
      const matches = (n: GNode): boolean => !q || n.name.toLowerCase().includes(q)
      const lit = (n: GNode): boolean => (focusId ? near.has(n.id) : true) && matches(n)

      // A light bubble round each software system, following its nodes as they
      // drift, with its name on a tab at the top of its edge, like a frame's.
      for (const { address: repo, name } of repos.current) {
        const mine = all.filter((n) => n.repo === repo)
        if (!mine.length) continue
        const pad = 34 + Math.max(...mine.map(radius))
        const hull = convexHull(mine.map((n) => ({ x: n.x, y: n.y + 6 })))
        bubble(ctx, hull, pad)
        ctx.fillStyle = c.systemWash
        ctx.globalAlpha = 0.55
        ctx.fill()
        ctx.globalAlpha = 0.45
        ctx.strokeStyle = c.system
        ctx.lineWidth = 1.2 / Math.sqrt(v.k)
        ctx.stroke()
        ctx.globalAlpha = 1

        const top = Math.min(...hull.map((p) => p.y)) - pad
        const cx = (Math.min(...hull.map((p) => p.x)) + Math.max(...hull.map((p) => p.x))) / 2
        const words = name.toUpperCase()
        ctx.font = `600 11px ${c.mono}`
        const w = ctx.measureText(words).width + 16
        ctx.fillStyle = c.paper
        ctx.fillRect(cx - w / 2, top - 9, w, 18)
        ctx.strokeStyle = c.system
        ctx.globalAlpha = 0.45
        ctx.strokeRect(cx - w / 2, top - 9, w, 18)
        ctx.globalAlpha = 1
        ctx.fillStyle = c.system
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(words, cx, top)
        ctx.textBaseline = 'alphabetic'
      }

      // Wires, with a dot running along each one that says which way it points.
      for (const l of links.current) {
        const a = byId.get(l.from)
        const b = byId.get(l.to)
        if (!a || !b || !visible(a) || !visible(b)) continue
        const on = !focusId || (near.has(a.id) && near.has(b.id) && (a.id === focusId || b.id === focusId))
        const dim = (!on || !matches(a) || !matches(b)) && (focusId !== '' || q !== '')
        ctx.globalAlpha = dim ? 0.08 : on && focusId ? 0.95 : 0.5
        ctx.strokeStyle = l.kind === 'settles' || l.kind === 'replaces' ? c.accent : l.kind === 'borrowed' ? c.outside : on && focusId ? c.strong : c.wire
        ctx.lineWidth = (l.many ? 2 : 1.2) / Math.sqrt(v.k)
        ctx.setLineDash(l.kind === 'settles' ? [4, 4] : l.kind === 'borrowed' ? [2, 5] : l.kind === 'replaces' ? [8, 4] : [])
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        ctx.setLineDash([])
        if (l.kind === 'points' && !dim && motionRef.current) {
          const count = l.many ? 3 : 1
          for (let i = 0; i < count; i++) {
            const p = (t * 0.35 + i / count + (a.phase % 1)) % 1
            ctx.fillStyle = on && focusId ? c.strong : c.wire
            ctx.beginPath()
            ctx.arc(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p, 1.8, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
      ctx.globalAlpha = 1

      // A wire being drawn from one term to another.
      const linking = pointer.current.linking ? byId.get(pointer.current.linking) : undefined
      if (linking && pointer.current.at) {
        ctx.strokeStyle = c.accent
        ctx.lineWidth = 1.6
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(linking.x, linking.y)
        ctx.lineTo(pointer.current.at.x, pointer.current.at.y)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Nodes: a term is a dot in the store's colour, a word with no store a ring,
      // a borrowed copy a dashed ring, a decision a square.
      for (const n of all) {
        const r = radius(n)
        const on = lit(n)
        ctx.globalAlpha = on ? 1 : 0.14
        const colour = n.kind === 'adr' ? (n.status === 'replaced' ? c.faint : c.accent) : n.kind === 'borrowed' ? c.outside : c.term
        if (n.tone) {
          // Something the check found pulses round it.
          const pulse = (Math.sin(t * 3 + n.phase) + 1) / 2
          ctx.strokeStyle = n.tone === 'problem' ? c.problem : c.waiting
          ctx.globalAlpha = on ? 0.25 + pulse * 0.45 : 0.08
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(n.x, n.y, r + 4 + pulse * 3, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = on ? 1 : 0.14
        }
        ctx.lineWidth = 1.6
        ctx.strokeStyle = colour
        ctx.fillStyle = colour
        if (n.kind === 'adr') {
          const s = r * 1.7
          ctx.setLineDash(n.status === 'proposed' ? [3, 2] : [])
          if (n.status === 'accepted') ctx.fillRect(n.x - s / 2, n.y - s / 2, s, s)
          else {
            ctx.fillStyle = c.surface
            ctx.fillRect(n.x - s / 2, n.y - s / 2, s, s)
            ctx.strokeRect(n.x - s / 2, n.y - s / 2, s, s)
          }
          ctx.setLineDash([])
        } else {
          ctx.beginPath()
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
          if (n.kind === 'term') ctx.fill()
          else {
            ctx.fillStyle = c.surface
            ctx.fill()
            ctx.setLineDash(n.kind === 'borrowed' ? [3, 3] : [])
            ctx.stroke()
            ctx.setLineDash([])
          }
        }
        // The node in hand wears the drawing's corner marks.
        if (n.id === focusId) {
          const m = r + 7
          const len = n.id === pickedRef.current ? 9 : 6
          ctx.strokeStyle = n.id === pickedRef.current ? c.accent : colour
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(n.x - m, n.y - m + len)
          ctx.lineTo(n.x - m, n.y - m)
          ctx.lineTo(n.x - m + len, n.y - m)
          ctx.moveTo(n.x + m, n.y + m - len)
          ctx.lineTo(n.x + m, n.y + m)
          ctx.lineTo(n.x + m - len, n.y + m)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      // Names fade in as the view comes closer; the node in hand and its
      // neighbours always say theirs.
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (const n of all) {
        const r = radius(n)
        const always = focusId ? near.has(n.id) : n.degree >= 3 || (q !== '' && matches(n))
        const fade = always ? 1 : Math.min(1, Math.max(0, (v.k - 0.75) / 0.35))
        if (fade <= 0 || (!lit(n) && focusId)) continue
        ctx.globalAlpha = fade * (lit(n) ? 1 : 0.3)
        ctx.font = `${n.id === focusId ? 600 : 500} ${12 / Math.max(0.8, Math.sqrt(v.k))}px ${c.sans}`
        ctx.fillStyle = n.kind === 'adr' && n.status === 'replaced' ? c.faint : c.ink
        const title = n.name.replace(/^\d+\.\s*/, '')
        const words =
          n.kind !== 'adr' ? n.name : n.id === focusId ? `ADR ${n.name.split('.')[0]} · ${title.length > 30 ? `${title.slice(0, 28)}…` : title}` : `ADR ${n.name.split('.')[0]}`
        ctx.fillText(words, n.x, n.y + r + 6)
      }
      ctx.globalAlpha = 1
      ctx.textBaseline = 'alphabetic'
    }

    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      watch.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Where on the graph a point of the window is. */
  const toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
    const box = canvasRef.current!.getBoundingClientRect()
    const v = view.current
    return { x: (clientX - box.left - box.width / 2 - v.x) / v.k, y: (clientY - box.top - box.height / 2 - v.y) / v.k }
  }
  const nodeAt = (p: { x: number; y: number }): GNode | undefined =>
    [...nodes.current.values()].filter(visible).find((n) => Math.hypot(n.x - p.x, n.y - p.y) < radius(n) + 6 / view.current.k)

  const down = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const at = toWorld(e.clientX, e.clientY)
    const hit = nodeAt(at)
    const start = { x: e.clientX, y: e.clientY, vx: view.current.tx, vy: view.current.ty }
    let moved = false
    if (hit && e.shiftKey && hit.kind === 'term') pointer.current.linking = hit.id
    else if (hit) {
      pointer.current.drag = hit.id
      hit.held = true
    }
    const move = (m: PointerEvent): void => {
      if (Math.hypot(m.clientX - start.x, m.clientY - start.y) > 3) moved = true
      const p = toWorld(m.clientX, m.clientY)
      pointer.current.at = p
      if (pointer.current.linking) return
      if (hit) {
        hit.x = p.x
        hit.y = p.y
        heat.current = Math.max(heat.current, 0.5)
      } else {
        view.current.tx = start.vx + m.clientX - start.x
        view.current.ty = start.vy + m.clientY - start.y
        view.current.x = view.current.tx
        view.current.y = view.current.ty
      }
    }
    const up = (u: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (pointer.current.linking) {
        const from = nodes.current.get(pointer.current.linking)!
        const to = nodeAt(toWorld(u.clientX, u.clientY))
        if (to && to.id !== from.id && to.repo === from.repo && to.kind !== 'adr' && to.kind !== 'borrowed')
          edits.link(from.repo, from.name, to.name, 'one')
        pointer.current.linking = ''
        pointer.current.at = null
        return
      }
      if (hit) {
        hit.held = false
        pointer.current.drag = ''
        if (!moved) {
          // A second click on the same node soon after opens it. Counted here,
          // from the node each press landed on, so a node the forces nudge
          // between the two clicks still opens.
          const last = lastClick.current
          lastClick.current = { id: hit.id, at: u.timeStamp }
          if (last.id === hit.id && u.timeStamp - last.at < DOUBLE_CLICK_MS) {
            lastClick.current = { id: '', at: 0 }
            onOpen(hit.id)
          } else setPicked(hit.id === pickedRef.current ? '' : hit.id)
        }
      } else if (!moved) setPicked('')
      heat.current = Math.max(heat.current, 0.3)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const hover = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const hit = nodeAt(toWorld(e.clientX, e.clientY))
    const id = hit?.id ?? ''
    if (id !== pointer.current.hover) {
      pointer.current.hover = id
      canvasRef.current!.style.cursor = id ? 'pointer' : 'grab'
      rerender((n) => n + 1)
    }
  }

  const wheel = (e: React.WheelEvent<HTMLCanvasElement>): void => {
    const v = view.current
    const box = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - box.left - box.width / 2
    const my = e.clientY - box.top - box.height / 2
    const k = Math.min(3, Math.max(0.35, v.tk * Math.exp(-e.deltaY * 0.0015)))
    v.tx = mx - ((mx - v.tx) / v.tk) * k
    v.ty = my - ((my - v.ty) / v.tk) * k
    v.tk = k
  }

  const findOne = (words: string): void => {
    setQuery(words)
    const hit = [...nodes.current.values()].find((n) => words.trim() && n.name.toLowerCase().includes(words.trim().toLowerCase()))
    if (hit) Object.assign(view.current, { tx: -hit.x * 1.3, ty: -hit.y * 1.3, tk: 1.3 })
  }

  const node = picked ? nodes.current.get(picked) : undefined
  const term = node ? ontology.terms.find((t) => termKey(t) === node.id) : undefined
  const adr = node ? ontology.adrs.find((a) => adrKey(a) === node.id) : undefined

  return (
    <div className="og">
      <canvas
        ref={canvasRef}
        className="og-canvas"
        aria-label="Ontology graph"
        onPointerDown={down}
        onPointerMove={hover}
        onWheel={wheel}
      />

      <div className="og-find">
        <Search size={14} aria-hidden="true" />
        <input aria-label="Find in the graph" placeholder="Find a term or decision" value={query} onChange={(e) => findOne(e.target.value)} />
      </div>

      <div className="og-controls" aria-label="What the graph shows">
        <span className="og-label">Show</span>
        {(
          [
            ['terms', 'Terms'],
            ['decisions', 'Decisions'],
            ['borrowed', 'Borrowed'],
          ] as const
        ).map(([key, words]) => (
          <button key={key} type="button" className="og-toggle" aria-pressed={show[key]} onClick={() => setShow({ ...show, [key]: !show[key] })}>
            <span className={`og-glyph og-glyph--${key}`} aria-hidden="true" /> {words}
          </button>
        ))}
        <span className="og-label">Spread</span>
        <input
          type="range"
          aria-label="Spread"
          min={0.5}
          max={2}
          step={0.05}
          value={spread}
          onChange={(e) => {
            setSpread(Number(e.target.value))
            heat.current = 0.8
          }}
        />
        <button type="button" className="og-toggle" aria-pressed={motion} onClick={() => setMotion(!motion)}>
          Motion
        </button>
        <button type="button" className="og-toggle" onClick={() => Object.assign(view.current, { tx: -40, ty: 0, tk: 1.15 })}>
          Fit
        </button>
      </div>

      <p className="og-hint">Drag to pull · Shift-drag from a term to wire it · Double-click to open</p>

      {node && (term || adr) ? (
        <aside className="og-card ds-card" aria-label={node.name}>
          <span className="og-label">
            {adr ? `ADR ${adr.number} · ${adr.status}` : term?.borrowed ? 'Borrowed term' : 'Term'} · {nameOf(ontology, node.repo)}
          </span>
          <h3>{adr ? adr.title : node.name}</h3>
          <div className="og-card-body">
            <p>{node.says || 'Nothing written yet.'}</p>
            {findingsOf(ontology, node.id).map((f) => (
              <span key={f.says} className={`ds-badge ds-badge--${f.tone}`}>
                {f.says}
              </span>
            ))}
            {term?.borrowed ? <span className="og-label">Copied from {nameOf(ontology, term.borrowed.from)} @ {term.borrowed.commit}</span> : null}
            {term?.store && !term.borrowed ? <span className="og-label">Kept in {term.store}</span> : null}
            {term?.pointsAt.length ? (
              <div className="og-tiles">
                {term.pointsAt.map((l) => (
                  <button key={l.term} type="button" className="og-tile" onClick={() => setPicked(termKey({ repo: term.repo, name: l.term }))}>
                    <span className="og-label">{l.howMany}</span>
                    {l.term}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" className="ds-button" onClick={() => onOpen(node.id)}>
            <BookOpen size={14} aria-hidden="true" /> Open in the dictionary
          </button>
        </aside>
      ) : null}
    </div>
  )
}
