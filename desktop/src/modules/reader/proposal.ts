// codegraph: module reader
import type { ComponentKind, SystemMap, WireKind } from './schema.js'
import { outsideId } from './schema.js'

/** Where a repo keeps the one proposal on its branch, with its mockups
 *  beside it. Deleting the folder ends the proposal (ADR 0007). */
export const PROPOSAL_FOLDER = 'codegraph-proposal'
export const PROPOSAL = `${PROPOSAL_FOLDER}/proposal.json`

/** A card or wire a proposal draws. Crossed out, it is to be taken away. */
type Drawn = { gone?: boolean }

export type ProposedContainer = Drawn & { name: string; kind: string; says: string }

export type ProposedComponent = Drawn & {
  container: string
  /** What rules it keeps to. For a card a person gave their own type this is
   *  a first guess, for the agent building it to settle. */
  kind: ComponentKind
  /** The type a person drew it as, to tag it with; left out, none. */
  type?: string
  name: string
  says: string
  /** A page's address. */
  at: string
  start?: boolean
  /** A page's mockup, by file name in the proposal's folder; '' for none. */
  mockup: string
}

/** A wire between two cards, each named the way a person reads it: a
 *  container by its name, `web`, or a component inside one, `web/page search`.
 *  A wire between containers stands for any wire between what they hold. */
export type ProposedWire = Drawn & { from: string; to: string; kind: WireKind; words: string }

/** A change drawn over one software system's map, kept in the repo on the
 *  branch where it is built. It lists only what changes: what is to be
 *  built, and what is crossed out. */
export type Proposal = {
  /** What the change is for, in a line. */
  says: string
  /** The sketch it was made from, if any, and when that sketch had last changed
   *  when the agent read it. */
  sketch: string
  sketchAt?: string
  /** The commit it was drawn on: what "nothing else changed" is held to. */
  base: string
  containers: ProposedContainer[]
  components: ProposedComponent[]
  wires: ProposedWire[]
  /** Where a person put each card while drawing it, by name; the map and
   *  agents can ignore it. */
  layout: Record<string, [number, number]>
}

export const blankProposal = (): Proposal => ({
  says: '',
  sketch: '',
  base: '',
  containers: [],
  components: [],
  wires: [],
  layout: {},
})

const KINDS = new Set(['module', 'feature', 'page', 'trigger'])
const WIRES = new Set(['uses', 'asks', 'reads', 'starts', 'keeps', 'leads to', 'calls'])

/** The proposal in a repo's file, or null with the reason why not. */
export const readProposal = (text: string | undefined, problems: string[]): Proposal | null => {
  if (text === undefined) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch {
    problems.push(`${PROPOSAL} is not JSON the reader can read`)
    return null
  }
  const words = (value: unknown): string => (typeof value === 'string' ? value : '')
  const list = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : []
  const gone = (v: Record<string, unknown>): Drawn => (v['gone'] === true ? { gone: true } : {})

  const proposal = blankProposal()
  proposal.says = words(raw['says'])
  proposal.sketch = words(raw['sketch'])
  if (words(raw['sketchAt'])) proposal.sketchAt = words(raw['sketchAt'])
  proposal.base = words(raw['base'])
  proposal.containers = list(raw['containers'])
    .filter((c) => words(c['name']))
    .map((c) => ({ name: words(c['name']), kind: words(c['kind']), says: words(c['says']), ...gone(c) }))
  for (const c of list(raw['components'])) {
    const kind = words(c['kind'])
    if (!KINDS.has(kind) || !words(c['name']) || !words(c['container'])) {
      problems.push(`${PROPOSAL} has a component without a container, a name, or a kind of module, feature, page or trigger`)
      continue
    }
    proposal.components.push({
      container: words(c['container']),
      kind: kind as ComponentKind,
      ...(words(c['type']) ? { type: words(c['type']) } : {}),
      name: words(c['name']),
      says: words(c['says']),
      at: words(c['at']),
      ...(c['start'] === true ? { start: true } : {}),
      mockup: words(c['mockup']),
      ...gone(c),
    })
  }
  for (const w of list(raw['wires'])) {
    const kind = words(w['kind'])
    if (!WIRES.has(kind) || !words(w['from']) || !words(w['to'])) {
      problems.push(`${PROPOSAL} has a wire without both ends, or of a kind the map does not know`)
      continue
    }
    proposal.wires.push({ from: words(w['from']), to: words(w['to']), kind: kind as WireKind, words: words(w['words']), ...gone(w) })
  }
  const layout = raw['layout']
  if (layout && typeof layout === 'object')
    for (const [name, at] of Object.entries(layout as Record<string, unknown>))
      if (Array.isArray(at) && typeof at[0] === 'number' && typeof at[1] === 'number') proposal.layout[name] = [at[0], at[1]]
  return proposal
}

/** How a proposal's card or wire stands against the code. */
export type ItemState = 'to build' | 'built' | 'to remove' | 'removed'

export type ProposalItem = {
  /** `web`, `web/page search`, or a wire's sentence of names. */
  name: string
  what: 'container' | 'component' | 'wire'
  /** The map's id for a card: what the canvas draws it as. */
  id: string
  state: ItemState
}

export type Progress = {
  says: string
  sketch: string
  items: ProposalItem[]
  /** Changes in the code since the proposal was drawn that it does not
   *  draw, said plainly. */
  unasked: string[]
  /** Whether there was a commit to hold "nothing else changed" to. */
  baseRead: boolean
  /** Everything drawn is there, everything crossed out is gone, and
   *  nothing else changed. The tests and the check still have their say. */
  built: boolean
}

/** A component's name the way a proposal writes it. */
export const componentName = (c: { container: string; kind: string; name: string }): string =>
  `${c.container}/${c.kind} ${c.name}`

/** The map's id for a card named the way a proposal names it. */
export const idOfName = (name: string): string => {
  const slash = name.indexOf('/')
  if (slash < 0) return `container:${name}`
  const [kind = '', ...rest] = name.slice(slash + 1).split(' ')
  return `${name.slice(0, slash)}:${kind}:${rest.join(' ')}`
}

const wireName = (w: { from: string; kind: string; to: string }): string => `${w.from} ${w.kind} ${w.to}`

/** Whether one end of a wire in the map is what a proposal names: the same
 *  card, or something inside the container it names, a store included. */
const endIs = (map: SystemMap, name: string, end: string): boolean => {
  const id = idOfName(name)
  if (end === id) return true
  if (name.includes('/')) return false
  return end.startsWith(`store:${name}:`) || map.components.some((c) => c.id === end && c.container === name)
}

const isContainer = (map: SystemMap, proposal: Proposal, name: string): boolean =>
  !name.includes('/') &&
  (map.containers.some((c) => c.name === name) || proposal.containers.some((c) => c.name === name))

/** Whether the map has a wire the proposal draws. A call to a name that is
 *  no container is a call out of the repo. */
export const hasWire = (map: SystemMap, proposal: Proposal, wire: ProposedWire): boolean => {
  if (wire.kind === 'calls' && !isContainer(map, proposal, wire.to))
    return map.outside.some((o) => endIs(map, wire.from, o.from) && o.to === outsideId(wire.to))
  return map.wires.some((m) => m.kind === wire.kind && endIs(map, wire.from, m.from) && endIs(map, wire.to, m.to))
}

/** How far the code has got toward a proposal: each thing it draws, and,
 *  given the map at the commit it was drawn on, whatever changed that it
 *  does not draw. */
export const measure = (map: SystemMap, proposal: Proposal, base: SystemMap | null): Progress => {
  const items: ProposalItem[] = []
  const state = (there: boolean, gone = false): ItemState =>
    gone ? (there ? 'to remove' : 'removed') : there ? 'built' : 'to build'

  for (const c of proposal.containers)
    items.push({
      name: c.name,
      what: 'container',
      id: idOfName(c.name),
      state: state(map.containers.some((m) => m.name === c.name), c.gone),
    })
  for (const c of proposal.components) {
    const name = componentName(c)
    // Tagged as anything but the type drawn, it is not built yet. An agent who
    // thinks another type is better changes the proposal, and says why.
    const there = map.components.some((m) => m.id === idOfName(name) && (c.gone || !c.type || m.type === c.type))
    items.push({ name, what: 'component', id: idOfName(name), state: state(there, c.gone) })
  }
  for (const w of proposal.wires)
    items.push({ name: wireName(w), what: 'wire', id: '', state: state(hasWire(map, proposal, w), w.gone) })

  const unasked: string[] = []
  if (base) {
    const drawn = new Set([...proposal.containers.map((c) => c.name), ...proposal.components.map(componentName)])
    const baseContainers = new Set(base.containers.map((c) => c.name))
    const nowContainers = new Set(map.containers.map((c) => c.name))
    for (const name of nowContainers)
      if (!baseContainers.has(name) && !drawn.has(name))
        unasked.push(`The container ${name} is new, but the proposal does not draw it.`)
    for (const name of baseContainers)
      if (!nowContainers.has(name) && !drawn.has(name))
        unasked.push(`The container ${name} is gone, but the proposal does not cross it out.`)

    const baseComponents = new Set(base.components.map(componentName))
    const nowComponents = new Set(map.components.map(componentName))
    for (const name of nowComponents)
      if (!baseComponents.has(name) && !drawn.has(name)) unasked.push(`${name} is new, but the proposal does not draw it.`)
    for (const name of baseComponents)
      if (!nowComponents.has(name) && !drawn.has(name))
        unasked.push(`${name} is gone, but the proposal does not cross it out.`)

    const nameOf = (m: SystemMap, id: string): string => {
      const c = m.components.find((x) => x.id === id)
      return c ? componentName(c) : id.replace(/^container:/, '')
    }
    const key = (m: SystemMap, w: { from: string; kind: string; to: string }): string =>
      `${nameOf(m, w.from)} ${w.kind} ${nameOf(m, w.to)}`
    const baseWires = new Set(base.wires.map((w) => key(base, w)))
    const nowWires = new Set(map.wires.map((w) => key(map, w)))
    // A card crossed out takes its wires with it.
    const crossed = [...proposal.containers.filter((c) => c.gone).map((c) => c.name), ...proposal.components.filter((c) => c.gone).map(componentName)]
    const covered = (m: SystemMap, w: { from: string; kind: string; to: string }): boolean =>
      proposal.wires.some((p) => p.kind === w.kind && endIs(m, p.from, w.from) && endIs(m, p.to, w.to)) ||
      crossed.some((name) => endIs(m, name, w.from) || endIs(m, name, w.to))
    for (const w of map.wires)
      if (!baseWires.has(key(map, w)) && !covered(map, w))
        unasked.push(`${key(map, w)}, but the proposal does not draw that wire.`)
    for (const w of base.wires)
      if (!nowWires.has(key(base, w)) && !covered(base, w))
        unasked.push(`${key(base, w)} no more, but the proposal does not cross that wire out.`)
  }

  return {
    says: proposal.says,
    sketch: proposal.sketch,
    items,
    unasked: [...new Set(unasked)],
    baseRead: base !== null,
    built: items.every((i) => i.state === 'built' || i.state === 'removed') && unasked.length === 0,
  }
}
