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

/** A wire inside a card can end at a hub on that card's border, which stands
 *  for the card at the far end of the wire the hub belongs to. */
const HUB = 'hub:'

/** A card as a person drew it, on a sketch or over the map: the same shape
 *  either way. Crossed out, it is to be taken away. */
export type DrawnCard = {
  id: string
  name: string
  level: string
  kind: string
  /** A component's kind, when what it is drawn as is another type. */
  role?: string
  says: string
  at: string
  start: boolean
  mockup?: string
  state?: string
  x?: number
  y?: number
  children: DrawnCard[]
  wires: { id?: string; from: string; to: string; kind: string; words: string; state?: string; x?: number; y?: number }[]
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
      if (!inner.name.trim()) continue
      // A store is read from its schema, not drawn as a component. Proposing
      // stores comes with CG-8.4; until then a drawing's stores change nothing.
      if (inner.kind === 'store' || inner.kind === 'inner store') continue
      // A type a person made up goes into the tag as it is. What rules it keeps
      // to is not something a drawing says, so it starts as a module, which
      // promises least, for the agent building it to settle (ADR 0013).
      const type = !KINDS.has(inner.kind) && inner.kind !== 'card' ? inner.kind.trim() : ''
      const kind = (KINDS.has(inner.role ?? inner.kind) ? (inner.role ?? inner.kind) : 'module') as ComponentKind
      const component = { container: name, kind, name: inner.name.trim() }
      const full = componentName(component)
      nameOf.set(inner.id, full)
      layout(inner, full)
      drawn.add(full)
      const found = map.components.find((c) => componentName(c) === full)
      // In the code as another type, it has changing to do.
      const is = Boolean(found) && (!type || found!.type === type)
      const entry: ProposedComponent = {
        ...component,
        ...(type ? { type } : {}),
        says: inner.says,
        at: inner.at,
        ...(inner.start ? { start: true } : {}),
        mockup: inner.mockup && how.mockupName ? how.mockupName(inner, full) : '',
      }
      if (inner.state === 'gone') {
        goneNames.add(full)
        if (found) proposal.components.push({ ...entry, mockup: '', gone: true })
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
      // A hub on this card's border is the card at the far end of its wire.
      const endOf = (id: string): string | undefined => {
        if (!id.startsWith(HUB)) return nameOf.get(id)
        const outer = system.wires.find((one) => one.id === id.slice(HUB.length))
        return outer && nameOf.get(outer.to === holder.id ? outer.from : outer.to)
      }
      const from = endOf(w.from)
      const to = endOf(w.to)
      if (!from || !to || !WIRES.has(w.kind)) continue
      // Where a person dragged the wire's sentence, kept the way a card's
      // spot is: by the names it reads as, so it survives being read again.
      if (w.x !== undefined && w.y !== undefined)
        proposal.layout[`${from}>${w.kind}>${to}`] = [Math.round(w.x), Math.round(w.y)]
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
