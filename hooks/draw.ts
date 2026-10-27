// codegraph: page pane
// The map as one SVG picture for the pane: cards in their columns, wires as
// curves, red where a rule is broken, the picked card lit and the rest dimmed.
// Panning and zooming move the viewBox, so neither needs the map read again.
import type { View, ViewNode } from '../types'

const W = 164
const H = 42
const GX = 70
const GY = 14
const PAD = 24
const TOP = 26 // room for the column labels
const ASPECT = 1.6 // the frame keeps one shape, so the pane does not jump
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

export type Placed = { at: Map<string, { x: number; y: number }>; width: number; height: number }

export type Frame = { x: number; y: number; w: number; h: number; cx: number; cy: number }

export type Look = {
  selected: string | null
  zoom: number
  cx: number | null
  cy: number | null
  flagged: Set<string>
}

export function place(view: View): Placed {
  const cols = new Map<number, ViewNode[]>()
  for (const n of view.nodes) cols.set(n.col, [...(cols.get(n.col) ?? []), n])
  const tallest = Math.max(1, ...[...cols.values()].map(c => c.length))
  const at = new Map<string, { x: number; y: number }>()
  for (const [c, ns] of cols) {
    ns.sort((a, b) => a.row - b.row)
    const top = ((tallest - ns.length) * (H + GY)) / 2
    ns.forEach((n, i) => at.set(n.id, { x: PAD + c * (W + GX), y: PAD + TOP + top + i * (H + GY) }))
  }
  const last = Math.max(0, ...cols.keys())
  return { at, width: PAD * 2 + (last + 1) * (W + GX) - GX, height: PAD * 2 + TOP + tallest * (H + GY) - GY }
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
    // information arrives where the head is: draw from what is used into what uses it
    const [s, t] = a.x > b.x ? [a, b] : [b, a]
    const [sx, sy, tx, ty] = s.x === t.x
      ? [s.x + W, s.y + H / 2, t.x + W, t.y + H / 2]
      : [s.x, s.y + H / 2, t.x + W, t.y + H / 2]
    const bend = Math.max(36, Math.abs(sx - tx) * 0.45)
    const back = s.x === t.x ? bend : -bend
    const on = look.selected ? e.from === look.selected || e.to === look.selected : true
    wires.push(
      `<path d="M${tx.toFixed(0)} ${ty.toFixed(0)} C${(tx + bend).toFixed(0)} ${ty.toFixed(0)} ` +
        `${(sx + back).toFixed(0)} ${sy.toFixed(0)} ${sx.toFixed(0)} ${sy.toFixed(0)}" fill="none" stroke="${colour}" ` +
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
        `<rect x="${at.x}" y="${at.y}" width="${W}" height="${H}" rx="${n.kind === 'feature' ? 14 : 7}" ` +
        `fill="${fill}" fill-opacity="${picked ? 0.32 : 0.13}" stroke="${flagged ? RED : stroke}" ` +
        `stroke-width="${picked ? 2.6 : 1.2}"${n.own === false ? ' stroke-dasharray="3 3"' : ''}/>` +
        `<text x="${at.x + 10}" y="${at.y + 17}" fill="${grey ? GREY : `hsl(${hue},65%,58%)`}" font-weight="600" ` +
        `font-size="12">${esc(cut(n.label, 22))}${n.start ? ' ★' : ''}</text>` +
        `<text x="${at.x + 10}" y="${at.y + 32}" fill="${GREY}" font-size="9.5">${esc(cut(sub, 30))}</text>` +
        (flagged ? `<circle cx="${at.x + W - 9}" cy="${at.y + 9}" r="5" fill="${RED}"/>` : '') +
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
