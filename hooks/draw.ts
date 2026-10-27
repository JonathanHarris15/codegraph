// codegraph: page pane
// The map as one SVG picture for the pane: cards in their columns, wires as
// curves, red where a rule is broken, the picked card lit and the rest dimmed.
// The map itself comes in tiers and boxes: what modules reach above them,
// the design system and components below the pages, a box round each block.
// Panning and zooming move the viewBox, so neither needs the map read again.
import type { View, ViewNode } from '../types'

const W = 164
const H = 42
const GX = 70
const GY = 14
const PAD = 24
const TOP = 26 // room for the column labels
const GT = 66 // between the map's tiers: room for a box's foot, the next one's labels
const BP = 10 // a box's room round its cards
const SG = 30 // between two systems in a column: room for the second one's box and name
const ASPECT = 1 // the frame keeps one shape, so the pane does not jump; the pane is about square
const LIMIT = 120000 // an Svg takes at most 131072 characters

const HUES: Record<string, number> = {
  module: 212, feature: 150, page: 280, component: 305, design: 32, store: 176,
  trigger: 45, file: 212,
}
const WIRE_HUES: Record<string, number> = {
  uses: 150, informed: 200, acts: 285, contains: 305, starts: 45, writes: 176, reads: 176,
  leads: 330, http: 265, serves: 205, database: 170, market: 35, feed: 320, queue: 55,
  cloud: 240, process: 15, env: 95,
}
const RED = '#e5484d'
const GREY = '#8b8d98'

export type Spot = { x: number; y: number; w: number; h: number }

export type Placed = { at: Map<string, Spot>; width: number; height: number }

export type Frame = { x: number; y: number; w: number; h: number; cx: number; cy: number }

export type Look = {
  selected: string | null
  zoom: number
  cx: number | null
  cy: number | null
  flagged: Set<string>
}

// A card as big as the code it holds: wider, and a little taller.
const wOf = (n: ViewNode) => Math.round(W * (n.size ?? 1))
const hOf = (n: ViewNode) => Math.round(H * (1 + ((n.size ?? 1) - 1) * 0.5))

// The room between two cards in a column: more between two systems, for the
// second one's box and name.
function gapOf(view: View, a: ViewNode, b: ViewNode): number {
  return view.blocks?.length && a.block === 'features' && a.system !== b.system ? GY + SG : GY
}

// Each column, as wide as its biggest card, stacks in its tier from the top;
// above the middle tier from the bottom, so those cards sit on the block below
// them, and below it just under the block they hang from. A view with no tiers
// is one, its columns centred. Then the middle tier's cards slide level with
// what they are wired to, keeping each column's order.
export function place(view: View): Placed {
  const cols = new Map<string, ViewNode[]>()
  const colW: number[] = []
  for (const n of view.nodes) {
    const k = `${n.tier ?? 1}|${n.col}`
    cols.set(k, [...(cols.get(k) ?? []), n])
    colW[n.col] = Math.max(colW[n.col] ?? 0, wOf(n))
  }
  const colX: number[] = []
  for (let c = 0, x = PAD; c < colW.length; c++) {
    colX[c] = x
    x += (colW[c] ?? W) + GX
  }
  const stack = (ns: ViewNode[]) => ns.reduce((s, n, i) => s + hOf(n) + (i ? gapOf(view, ns[i - 1], n) : 0), 0)
  const tall = new Map<number, number>()
  for (const [k, ns] of cols) {
    const t = Number(k.split('|')[0])
    ns.sort((a, b) => a.row - b.row)
    tall.set(t, Math.max(tall.get(t) ?? 0, stack(ns)))
  }
  const boxed = !!view.blocks?.length
  const top = new Map<number, number>()
  let y = PAD + TOP
  for (const t of [...tall.keys()].sort((a, b) => a - b)) {
    top.set(t, y)
    y += tall.get(t)! + (boxed ? GT : GY)
  }
  const at = new Map<string, Spot>()
  const put = (k: string, y0: number) => {
    const c = Number(k.split('|')[1])
    cols.get(k)!.forEach((n, i, ns) => {
      if (i) y0 += gapOf(view, ns[i - 1], n)
      at.set(n.id, { x: colX[c] + ((colW[c] ?? W) - wOf(n)) / 2, y: y0, w: wOf(n), h: hOf(n) })
      y0 += hOf(n)
    })
  }
  for (const [k, ns] of cols) {
    const t = Number(k.split('|')[0])
    const spare = tall.get(t)! - stack(ns)
    if (t <= 1) put(k, !boxed ? top.get(t)! + spare / 2 : t < 1 ? top.get(t)! + spare : top.get(t)!)
  }
  const mid = [...cols.keys()].filter(k => k.startsWith('1|'))
  if (mid.length) relax(view, cols, mid, at, top.get(1)!, top.get(1)! + tall.get(1)!)
  for (const k of cols.keys()) {
    if (Number(k.split('|')[0]) <= 1) continue
    const foot = Math.max(0, ...(cols.get(`1|${k.split('|')[1]}`) ?? []).map(n => at.get(n.id)!.y + hOf(n)))
    put(k, foot ? foot + GT : top.get(Number(k.split('|')[0]))!)
  }
  const spots = [...at.values()]
  return {
    at,
    width: Math.max(...spots.map(s => s.x + s.w), PAD) + PAD,
    height: Math.max(...spots.map(s => s.y + s.h), PAD + TOP) + PAD,
  }
}

// Slide each card in a column level with the cards it is wired to, between
// lo and hi, keeping the column's order and gaps; a few sweeps settle it.
function relax(view: View, cols: Map<string, ViewNode[]>, keys: string[], at: Map<string, Spot>, lo: number, hi: number) {
  const near = new Map<string, string[]>()
  for (const e of view.edges) {
    near.set(e.from, [...(near.get(e.from) ?? []), e.to])
    near.set(e.to, [...(near.get(e.to) ?? []), e.from])
  }
  for (let sweep = 0; sweep < 6; sweep++) {
    for (const k of sweep % 2 ? [...keys].reverse() : keys) {
      const ns = cols.get(k)!
      const ys = ns.map(n => {
        const me = at.get(n.id)!
        const others = (near.get(n.id) ?? []).map(o => at.get(o)).filter((o): o is Spot => !!o && o.x !== me.x)
        return others.length ? others.reduce((s, o) => s + o.y + o.h / 2, 0) / others.length - me.h / 2 : me.y
      })
      for (let i = ns.length - 1; i >= 0; i--) {
        const floor = i === ns.length - 1 ? hi : ys[i + 1] - gapOf(view, ns[i], ns[i + 1])
        ys[i] = Math.min(ys[i], floor - hOf(ns[i]))
      }
      ns.forEach((n, i) => {
        ys[i] = Math.max(ys[i], i ? ys[i - 1] + hOf(ns[i - 1]) + gapOf(view, ns[i - 1], n) : lo)
        at.get(n.id)!.y = ys[i]
      })
    }
  }
}

// The part of the picture in view: the whole of it at zoom 1, centred on
// (cx, cy) and kept inside the picture as the zoom grows.
export function frame(p: Placed, zoom: number, cx: number | null, cy: number | null): Frame {
  const fit = p.width / p.height > ASPECT ? { w: p.width, h: p.width / ASPECT } : { w: p.height * ASPECT, h: p.height }
  const w = fit.w / zoom
  const h = fit.h / zoom
  const clamp = (v: number, size: number, room: number) =>
    room >= size ? size / 2 : Math.min(Math.max(v, room / 2), size - room / 2)
  const x0 = clamp(cx ?? p.width / 2, p.width, w)
  const y0 = clamp(cy ?? p.height / 2, p.height, h)
  return { x: x0 - w / 2, y: y0 - h / 2, w, h, cx: x0, cy: y0 }
}

function esc(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cut(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

function about(n: ViewNode): string {
  const bits = [`${n.kind} ${n.label}`, n.dir ?? '']
  if (n.door?.length) bits.push('front door: ' + n.door.join(', '))
  if (n.uses?.length) bits.push('uses: ' + n.uses.join(', '))
  if (n.route) bits.push('at ' + n.route)
  if (n.fields?.length) bits.push(n.fields.join('\n'))
  return bits.filter(Boolean).join('\n')
}

export function drawView(view: View, look: Look, withTitles = true): string {
  const p = place(view)
  const f = frame(p, look.zoom, look.cx, look.cy)
  const near = new Set<string>()
  if (look.selected) {
    near.add(look.selected)
    for (const e of view.edges) {
      if (e.from === look.selected) near.add(e.to)
      if (e.to === look.selected) near.add(e.from)
    }
  }
  const lit = (id: string) => !look.selected || near.has(id)

  const colours = new Set<string>()
  const wires: string[] = []
  for (const e of view.edges) {
    const a = p.at.get(e.from)
    const b = p.at.get(e.to)
    if (!a || !b) continue
    const bad = (e.bad?.length ?? 0) > 0
    const hue = WIRE_HUES[e.kind]
    const colour = bad ? RED : hue === undefined ? GREY : `hsl(${hue},55%,55%)`
    colours.add(colour)
    // information arrives where the head is: draw from what is used into what
    // uses it, rightward, or down when one card sits straight above the other
    const mid = (o: Spot) => o.x + o.w / 2
    const [s, t] = mid(a) > mid(b) || (mid(a) === mid(b) && a.y > b.y) ? [a, b] : [b, a]
    const above = mid(s) === mid(t)
    const between = above && [...p.at.values()].some(o => mid(o) === mid(s) && o.y > t.y && o.y < s.y)
    const down = above && !between
    const [sx, sy, tx, ty] = down
      ? [mid(s), s.y, mid(t), t.y + t.h]
      : above
        ? [s.x + s.w, s.y + s.h / 2, t.x + t.w, t.y + t.h / 2]
        : [s.x, s.y + s.h / 2, t.x + t.w, t.y + t.h / 2]
    const bend = down ? Math.max(12, (sy - ty) * 0.45) : Math.max(36, Math.abs(sx - tx) * 0.45)
    const back = above ? bend : -bend
    const [c1, c2] = down
      ? [`${tx.toFixed(0)} ${(ty + bend).toFixed(0)}`, `${sx.toFixed(0)} ${(sy - bend).toFixed(0)}`]
      : [`${(tx + bend).toFixed(0)} ${ty.toFixed(0)}`, `${(sx + back).toFixed(0)} ${sy.toFixed(0)}`]
    const on = look.selected ? e.from === look.selected || e.to === look.selected : true
    wires.push(
      `<path d="M${tx.toFixed(0)} ${ty.toFixed(0)} C${c1} ` +
        `${c2} ${sx.toFixed(0)} ${sy.toFixed(0)}" fill="none" stroke="${colour}" ` +
        `stroke-width="${bad ? 2.4 : 1.4}" opacity="${on ? 0.9 : 0.12}"` +
        `${e.kind === 'reads' || e.kind === 'lazy' ? ' stroke-dasharray="4 3"' : ''} marker-end="url(#h${[...colours].indexOf(colour)})">` +
        (withTitles && bad ? `<title>${esc(e.bad!.join('\n'))}</title>` : '') +
        '</path>',
    )
  }

  const labels = view.columns
    .map((label, c) => label && `<text x="${PAD + c * (W + GX)}" y="${PAD + 10}" fill="${GREY}" font-size="10" ` +
      `letter-spacing="1">${esc(label.toUpperCase())}</text>`)
    .filter(Boolean)
  // on the map, a box round each block, its name in the corner; inside
  // features one round each system, so the features box stands further out
  for (const b of view.blocks ?? []) {
    const own = view.nodes
      .filter(n => (b.within ? 'system:' + n.system === b.id && n.block === b.within : n.block === b.id))
      .map(n => p.at.get(n.id)!)
    if (!own.length) continue
    const out = view.blocks!.some(o => o.within === b.id) ? BP + 8 : BP
    const x0 = Math.min(...own.map(o => o.x)) - out
    const y0 = Math.min(...own.map(o => o.y)) - out - (out > BP ? 32 : 16)
    const x1 = Math.max(...own.map(o => o.x + o.w)) + out
    const y1 = Math.max(...own.map(o => o.y + o.h)) + out
    labels.push(
      `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="10" fill="none" stroke="${GREY}" ` +
        `stroke-opacity="0.5"/><text x="${x0 + 8}" y="${y0 + 13}" fill="${GREY}" font-size="10" ` +
        `letter-spacing="1">${esc(b.label.toUpperCase())}</text>`,
    )
  }

  const cards: string[] = []
  for (const n of view.nodes) {
    const at = p.at.get(n.id)!
    const hue = HUES[n.kind]
    const grey = hue === undefined
    const stroke = grey ? GREY : `hsl(${hue},55%,52%)`
    const fill = grey ? GREY : `hsl(${hue},60%,55%)`
    const picked = n.id === look.selected
    const flagged = look.flagged.has(n.id)
    const sub = n.kind === 'store' && n.fields?.length ? n.fields.length + ' fields' : n.dir ?? n.kind
    cards.push(
      `<g opacity="${lit(n.id) ? 1 : 0.28}">` +
        (withTitles ? `<title>${esc(about(n))}</title>` : '') +
        `<rect x="${at.x}" y="${at.y}" width="${at.w}" height="${at.h}" rx="${n.kind === 'feature' ? 14 : 7}" ` +
        `fill="${fill}" fill-opacity="${picked ? 0.32 : 0.13}" stroke="${flagged ? RED : stroke}" ` +
        `stroke-width="${picked ? 2.6 : 1.2}"${n.own === false ? ' stroke-dasharray="3 3"' : ''}/>` +
        `<text x="${at.x + 10}" y="${at.y + 17}" fill="${grey ? GREY : `hsl(${hue},65%,58%)`}" font-weight="600" ` +
        `font-size="${(9 + 3 * (n.size ?? 1)).toFixed(1)}">${esc(cut(n.label, Math.round(22 * (n.size ?? 1))))}` +
        `${n.start ? ' ★' : ''}</text>` +
        `<text x="${at.x + 10}" y="${at.y + 32}" fill="${GREY}" font-size="9.5">${esc(cut(sub, Math.round(30 * (n.size ?? 1))))}</text>` +
        (flagged ? `<circle cx="${at.x + at.w - 9}" cy="${at.y + 9}" r="5" fill="${RED}"/>` : '') +
        '</g>',
    )
  }

  const heads = [...colours]
    .map((c, i) => `<marker id="h${i}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" ` +
      `orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="${c}"/></marker>`)
    .join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f.w.toFixed(0)}" height="${f.h.toFixed(0)}" ` +
    `viewBox="${f.x.toFixed(0)} ${f.y.toFixed(0)} ${f.w.toFixed(0)} ${f.h.toFixed(0)}" ` +
    `font-family="system-ui,-apple-system,Segoe UI,sans-serif"><defs>${heads}</defs>` +
    labels.join('') + wires.join('') + cards.join('') + '</svg>'
  if (svg.length <= LIMIT) return svg
  return withTitles ? drawView(view, look, false) : ''
}
