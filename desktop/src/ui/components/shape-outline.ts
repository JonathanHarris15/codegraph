// codegraph: component shape-outline

/** What can be worked out from a shape's outline alone: where a wire meets
 *  it, and where words fit inside it. An outline is SVG path data in a 100 by
 *  100 box, stretched to whatever size the shape is given, so all of this is
 *  worked out in that box and then stretched the same way. */

export type Spot = { x: number; y: number }
export type Box = { x: number; y: number; w: number; h: number }
/** The four places on a shape a line can be held at. */
export type Seam = 'n' | 'e' | 's' | 'w'

type Polygon = Spot[]

const SQUARE = 'M0 0 H100 V100 H0 Z'

const FULL: Polygon = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
]

const CURVE_STEPS = 16

/** An arc as straight runs, from its two ends to its centre the way the SVG
 *  spec does it. */
const arcPoints = (from: Spot, rx0: number, ry0: number, turn: number, large: number, sweep: number, to: Spot): Spot[] => {
  const phi = (turn * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (from.x - to.x) / 2
  const dy = (from.y - to.y) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  let rx = Math.abs(rx0)
  let ry = Math.abs(ry0)
  const scale = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (scale > 1) {
    rx *= Math.sqrt(scale)
    ry *= Math.sqrt(scale)
  }
  const top = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const bottom = rx * rx * y1 * y1 + ry * ry * x1 * x1
  const root = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, top / bottom))
  const cx1 = (root * rx * y1) / ry
  const cy1 = (-root * ry * x1) / rx
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2
  const start = Math.atan2((y1 - cy1) / ry, (x1 - cx1) / rx)
  let delta = Math.atan2((-y1 - cy1) / ry, (-x1 - cx1) / rx) - start
  if (sweep === 0 && delta > 0) delta -= Math.PI * 2
  if (sweep === 1 && delta < 0) delta += Math.PI * 2
  const out: Spot[] = []
  for (let i = 1; i <= CURVE_STEPS * 2; i += 1) {
    const at = start + (delta * i) / (CURVE_STEPS * 2)
    const ex = rx * Math.cos(at)
    const ey = ry * Math.sin(at)
    out.push({ x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy })
  }
  return out
}

const parsed = new Map<string, Polygon[]>()

/** Every closed part of an outline, as straight runs. Open parts, like the
 *  inner rule of a swimlane, are marks on the shape and not its edge. */
export const polygonsOf = (d: string): Polygon[] => {
  const kept = parsed.get(d)
  if (kept) return kept
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? []
  const closed: Polygon[] = []
  let run: Polygon = []
  let at: Spot = { x: 0, y: 0 }
  let i = 0
  const num = (): number => Number(tokens[i++])
  const line = (to: Spot): void => {
    run.push(to)
    at = to
  }
  while (i < tokens.length) {
    const command = tokens[i++]!
    if (command === 'M') {
      at = { x: num(), y: num() }
      run = [at]
    } else if (command === 'L') line({ x: num(), y: num() })
    else if (command === 'H') line({ x: num(), y: at.y })
    else if (command === 'V') line({ x: at.x, y: num() })
    else if (command === 'Z') {
      if (run.length > 2) closed.push(run)
      run = []
    } else if (command === 'C' || command === 'Q') {
      const a = { x: num(), y: num() }
      const b = command === 'C' ? { x: num(), y: num() } : a
      const to = { x: num(), y: num() }
      const from = at
      for (let step = 1; step <= CURVE_STEPS; step += 1) {
        const t = step / CURVE_STEPS
        const u = 1 - t
        run = run.concat(
          command === 'C'
            ? {
                x: u * u * u * from.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * to.x,
                y: u * u * u * from.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * to.y,
              }
            : {
                x: u * u * from.x + 2 * u * t * a.x + t * t * to.x,
                y: u * u * from.y + 2 * u * t * a.y + t * t * to.y,
              },
        )
      }
      at = to
    } else if (command === 'A') {
      const rx = num()
      const ry = num()
      const turn = num()
      const large = num()
      const sweep = num()
      const to = { x: num(), y: num() }
      run = run.concat(arcPoints(at, rx, ry, turn, large, sweep, to))
      at = to
    }
  }
  const all = closed.length ? closed : [FULL]
  parsed.set(d, all)
  return all
}

const areaOf = (polygon: Polygon): number =>
  Math.abs(
    polygon.reduce((sum, p, i) => {
      const q = polygon[(i + 1) % polygon.length]!
      return sum + p.x * q.y - q.x * p.y
    }, 0),
  ) / 2

const insidePolygon = (at: Spot, polygon: Polygon): boolean => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > at.y !== b.y > at.y && at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Whether a straight run touches a rectangle. */
const runTouches = (a: Spot, b: Spot, r: Box): boolean => {
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  const edges: [number, number][] = [
    [-dx, a.x - r.x],
    [dx, r.x + r.w - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.h - a.y],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return false
  }
  return true
}

const fits = (r: Box, polygon: Polygon): boolean => {
  if (r.x < 0 || r.y < 0 || r.x + r.w > 100 || r.y + r.h > 100) return false
  if (!insidePolygon({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, polygon)) return false
  return polygon.every((p, i) => !runTouches(p, polygon[(i + 1) % polygon.length]!, r))
}

const areas = new Map<string, Box>()

/** The biggest rectangle that fits inside an outline, as shares of its box
 *  from 0 to 1: where words go, so they never run out over the edge. It is
 *  worked out once per outline, since it only depends on the outline. */
export const textAreaOf = (d: string): Box => {
  const kept = areas.get(d)
  if (kept) return kept
  const body = [...polygonsOf(d)].sort((a, b) => areaOf(b) - areaOf(a))[0]!
  let best: Box = { x: 0, y: 0, w: 0, h: 0 }
  const STEP = 4
  for (const across of [0.5, 0.7, 0.85, 1, 1.2, 1.5, 2, 3, 4]) {
    for (let cx = STEP; cx < 100; cx += STEP)
      for (let cy = STEP; cy < 100; cy += STEP) {
        const around = (h: number): Box => ({ x: cx - (h * across) / 2, y: cy - h / 2, w: h * across, h })
        // Only worth a closer look if it can beat what is already found.
        const beat = Math.sqrt((best.w * best.h + 1) / across)
        if (!fits(around(beat), body)) continue
        let low = beat
        let high = 100
        for (let step = 0; step < 8; step += 1) {
          const mid = (low + high) / 2
          if (fits(around(mid), body)) low = mid
          else high = mid
        }
        best = around(low)
      }
  }
  const area = best.w > 0 ? { x: best.x / 100, y: best.y / 100, w: best.w / 100, h: best.h / 100 } : { x: 0, y: 0, w: 1, h: 1 }
  areas.set(d, area)
  return area
}

/** Where a ray out of the middle of the 100 by 100 box last meets the
 *  outline, so a shape with a dent is met at its outermost edge. */
const lastMeet = (d: string, dir: Spot): Spot => {
  const from = { x: 50, y: 50 }
  let far = 0
  for (const polygon of polygonsOf(d))
    polygon.forEach((p, i) => {
      const q = polygon[(i + 1) % polygon.length]!
      const ex = q.x - p.x
      const ey = q.y - p.y
      const across = dir.x * ey - dir.y * ex
      if (Math.abs(across) < 1e-9) return
      const t = ((p.x - from.x) * ey - (p.y - from.y) * ex) / across
      const u = ((p.x - from.x) * dir.y - (p.y - from.y) * dir.x) / across
      if (t > 0 && u >= 0 && u <= 1) far = Math.max(far, t)
    })
  return { x: from.x + dir.x * far, y: from.y + dir.y * far }
}

const onBox = (p: Spot, box: Box): Spot => ({ x: box.x + (p.x / 100) * box.w, y: box.y + (p.y / 100) * box.h })

/** Where a line from the middle of a shape toward a spot leaves the shape. */
export const meetOutline = (d: string, box: Box, toward: Spot): Spot => {
  const dir = {
    x: box.w > 0 ? ((toward.x - box.x) / box.w) * 100 - 50 : 0,
    y: box.h > 0 ? ((toward.y - box.y) / box.h) * 100 - 50 : 0,
  }
  if (dir.x === 0 && dir.y === 0) return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
  return onBox(lastMeet(d || SQUARE, dir), box)
}

const WAYS: Record<Seam, Spot> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } }

/** One of the four places on a shape a line is held at: straight out from
 *  its middle, up, across or down, to its real edge. */
export const seamOf = (d: string, box: Box, seam: Seam): Spot => onBox(lastMeet(d || SQUARE, WAYS[seam]), box)

export const seamsOf = (d: string, box: Box): { seam: Seam; at: Spot }[] =>
  (['n', 'e', 's', 'w'] as const).map((seam) => ({ seam, at: seamOf(d, box, seam) }))

/** The seam that faces a spot. */
export const seamFacing = (box: Box, at: Spot): Seam => {
  const dx = at.x - (box.x + box.w / 2)
  const dy = at.y - (box.y + box.h / 2)
  return Math.abs(dx) / Math.max(box.w, 1) > Math.abs(dy) / Math.max(box.h, 1) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n'
}
