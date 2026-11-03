// codegraph: module reader
import {
  blankProposal,
  componentName,
  hasWire,
  type Proposal,
  type ProposedComponent,
  type ProposedContainer,
  type ProposedWire,
} from './proposal.js'
import type { ComponentKind, SystemMap, WireKind } from './schema.js'

/** A card as a person drew it, on a sketch or over the map: the same shape
 *  either way. Crossed out, it is to be taken away. */
export type DrawnCard = {
  id: string
  name: string
  level: string
  kind: string
  says: string
  at: string
  start: boolean
  mockup?: string
  state?: string
  x?: number
  y?: number
  children: DrawnCard[]
  wires: { from: string; to: string; kind: string; words: string; state?: string }[]
}

export type FromDrawing = {
  /** A card that is not drawn is to be taken away, as when the drawing
   *  started from a snapshot of the map; otherwise it is simply not shown. */
  absentIsGone: boolean
  /** The proposal there was before, whose parts already built stay in it. */
  earlier?: Proposal | null
  /** The name a page's mockup goes by in the proposal; '' to leave it out. */
  mockupName?: (card: DrawnCard, component: string) => string
}

const KINDS = new Set(['module', 'feature', 'page', 'trigger'])
const WIRES = new Set(['uses', 'asks', 'reads', 'starts', 'keeps', 'leads to', 'calls'])

/** The proposal a drawing of one software system makes against its map:
 *  only what changes, by name. */
export const proposalFrom = (system: DrawnCard, map: SystemMap, how: FromDrawing): Proposal => {
  const proposal = blankProposal()
  const earlier = how.earlier ?? null
  const listedBefore = (name: string): boolean =>
    !!earlier &&
    (earlier.containers.some((c) => !c.gone && c.name === name) ||
      earlier.components.some((c) => !c.gone && componentName(c) === name))

  const containers = system.children.filter((c) => c.level === 'container' && c.name.trim())
  const nameOf = new Map<string, string>()
  const goneNames = new Set<string>()
  const layout = (card: DrawnCard, name: string): void => {
    if (card.x !== undefined && card.y !== undefined) proposal.layout[name] = [Math.round(card.x), Math.round(card.y)]
  }

  for (const card of containers) {
    const name = card.name.trim()
    nameOf.set(card.id, name)
    layout(card, name)
    const there = map.containers.some((c) => c.name === name)
    const entry: ProposedContainer = { name, kind: card.kind, says: card.says }
    if (card.state === 'gone') {
      goneNames.add(name)
      if (there) proposal.containers.push({ ...entry, gone: true })
      continue
    }
    if (!there || listedBefore(name)) proposal.containers.push(entry)

    const drawn = new Set<string>()
    for (const inner of card.children) {
      if (!KINDS.has(inner.kind) || !inner.name.trim()) continue
      const component = { container: name, kind: inner.kind as ComponentKind, name: inner.name.trim() }
      const full = componentName(component)
      nameOf.set(inner.id, full)
      layout(inner, full)
      drawn.add(full)
      const is = map.components.some((c) => componentName(c) === full)
      const entry: ProposedComponent = {
        ...component,
        says: inner.says,
        at: inner.at,
        ...(inner.start ? { start: true } : {}),
        mockup: inner.mockup && how.mockupName ? how.mockupName(inner, full) : '',
      }
      if (inner.state === 'gone') {
        goneNames.add(full)
        if (is) proposal.components.push({ ...entry, mockup: '', gone: true })
      } else if (!is || listedBefore(full)) proposal.components.push(entry)
    }
    if (how.absentIsGone)
      for (const c of map.components)
        if (c.container === name && !drawn.has(componentName(c))) {
          goneNames.add(componentName(c))
          proposal.components.push({ ...c, says: '', at: '', mockup: '', gone: true, start: undefined })
        }
  }
  if (how.absentIsGone)
    for (const c of map.containers)
      if (!containers.some((d) => d.name.trim() === c.name)) {
        goneNames.add(c.name)
        proposal.containers.push({ name: c.name, kind: c.kind, says: '', gone: true })
      }
  for (const c of proposal.components) if (c.start === undefined) delete c.start

  // What was crossed out before and is already gone from the code stays
  // crossed out: it is part of the change, built.
  for (const c of earlier?.containers ?? [])
    if (c.gone && !map.containers.some((m) => m.name === c.name) && !proposal.containers.some((p) => p.name === c.name)) {
      proposal.containers.push(c)
      goneNames.add(c.name)
    }
  for (const c of earlier?.components ?? [])
    if (c.gone && !map.components.some((m) => componentName(m) === componentName(c)) && !proposal.components.some((p) => componentName(p) === componentName(c))) {
      proposal.components.push(c)
      goneNames.add(componentName(c))
    }

  // Wires, at the system level between containers, and inside each
  // container between its components.
  const drawnWires: ProposedWire[] = []
  for (const holder of [system, ...containers.filter((c) => c.state !== 'gone')])
    for (const w of holder.wires) {
      const from = nameOf.get(w.from)
      const to = nameOf.get(w.to)
      if (!from || !to || !WIRES.has(w.kind)) continue
      drawnWires.push({ from, to, kind: w.kind as WireKind, words: w.words, ...(w.state === 'gone' ? { gone: true } : {}) })
    }
  const listedWire = (w: ProposedWire): boolean =>
    !!earlier?.wires.some((e) => !e.gone && e.from === w.from && e.to === w.to && e.kind === w.kind)
  for (const w of drawnWires) {
    if (goneNames.has(w.from) || goneNames.has(w.to)) continue
    const there = hasWire(map, proposal, w)
    if (w.gone ? there : !there || listedWire(w)) proposal.wires.push(w)
  }
  for (const w of earlier?.wires ?? [])
    if (
      w.gone &&
      !goneNames.has(w.from) &&
      !goneNames.has(w.to) &&
      !hasWire(map, proposal, w) &&
      !proposal.wires.some((p) => p.from === w.from && p.to === w.to && p.kind === w.kind)
    )
      proposal.wires.push(w)

  if (how.absentIsGone) {
    // A wire in the map between two cards still drawn, that the drawing
    // does not have, is crossed out.
    const at = (id: string): string => {
      const c = map.components.find((x) => x.id === id)
      return c ? componentName(c) : id.replace(/^container:/, '')
    }
    const holderOf = (name: string): string => name.split('/')[0]!
    for (const m of map.wires) {
      const from = at(m.from)
      const to = at(m.to)
      const sameHolder = from.includes('/') && to.includes('/') && holderOf(from) === holderOf(to)
      const [a, b] = sameHolder ? [from, to] : [holderOf(from), to.includes('/') ? holderOf(to) : to]
      if (goneNames.has(from) || goneNames.has(to) || goneNames.has(a) || goneNames.has(b)) continue
      if (![...nameOf.values()].includes(a) || ![...nameOf.values()].includes(b)) continue
      if (drawnWires.some((d) => d.kind === m.kind && d.from === a && d.to === b)) continue
      if (!proposal.wires.some((p) => p.gone && p.from === a && p.to === b && p.kind === m.kind))
        proposal.wires.push({ from: a, to: b, kind: m.kind, words: '', gone: true })
    }
  }
  return proposal
}

/** Whether a proposal changes anything at all. */
export const changesAnything = (proposal: Proposal): boolean =>
  proposal.containers.length + proposal.components.length + proposal.wires.length > 0
