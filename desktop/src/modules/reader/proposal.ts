// codegraph: module reader
import type { ComponentKind, Shape, Store, SystemMap, WireKind } from './schema.js'
import { outsideId, storeId } from './schema.js'
import { holdsWords } from './shape.js'

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

/** One field a proposed store should have, in the words the map shows it in. */
export type ProposedField = { name: string; holds: string; needed: boolean; pointsAt: string }

/** A store a proposal adds, changes or crosses out, with the whole shape it
 *  should have (ADR 0023). */
export type ProposedStore = Drawn & {
  container: string
  /** `people`, or `people/involvement` for a store inside each person. */
  path: string
  says: string
  /** Every field it should have; null to leave its shape as it is. */
  fields: ProposedField[] | null
  /** What any other field may hold, for an open store; '' for a fixed one. */
  others: string
  /** The script, by its path in the repo, that moves the records already
   *  kept to the new shape; '' for none. A change that touches them needs one. */
  migration: string
}

/** A store's name the way a proposal writes it. */
export const storeName = (s: { container: string; path: string }): string => `${s.container}/store ${s.path}`

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
  stores: ProposedStore[]
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
  stores: [],
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
  for (const s of list(raw['stores'])) {
    if (!words(s['container']) || !words(s['path'])) {
      problems.push(`${PROPOSAL} has a store without a container or a path`)
      continue
    }
    const fields = Array.isArray(s['fields'])
      ? list(s['fields'])
          .filter((f) => words(f['name']))
          .map((f) => ({ name: words(f['name']), holds: words(f['holds']) || 'anything', needed: f['needed'] === true, pointsAt: words(f['pointsAt']) }))
      : null
    proposal.stores.push({
      container: words(s['container']),
      path: words(s['path']),
      says: words(s['says']),
      fields,
      others: words(s['others']),
      migration: words(s['migration']),
      ...gone(s),
    })
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
  /** `web`, `web/page search`, `firestore/store people`, or a wire's sentence
   *  of names. */
  name: string
  what: 'container' | 'component' | 'wire' | 'store'
  /** The map's id for a card: what the canvas draws it as. */
  id: string
  state: ItemState
  /** What is still missing, said plainly, where there is more to say than
   *  its name: a store's fields, its migration. */
  left?: string[]
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
  if (kind === 'store') return storeId(name.slice(0, slash), rest.join(' '))
  return `${name.slice(0, slash)}:${kind}:${rest.join(' ')}`
}

/** Whether what a field holds is what was asked for. A drawing that says only
 *  "a record" leaves what is in it to the code. */
const holdsAsAsked = (asked: string, got: string): boolean =>
  asked === got || (asked === 'a record' && got.startsWith('a record'))

/** How a store's shape falls short of the one a proposal draws, said plainly;
 *  nothing when it is the same. */
export const shapeGaps = (shape: Shape | null, want: Pick<ProposedStore, 'fields' | 'others'>): string[] => {
  if (!want.fields) return []
  if (!shape) return ['its shape is unknown: no schema says it']
  const gaps: string[] = []
  const has = new Map(shape.fields.map((f) => [f.name, f]))
  for (const field of want.fields) {
    const there = has.get(field.name)
    if (!there) {
      gaps.push(`it has no field ${field.name}`)
      continue
    }
    const holds = holdsWords(there.holds)
    if (!holdsAsAsked(field.holds, holds)) gaps.push(`${field.name} holds ${holds}, not ${field.holds}`)
    if (field.needed && !there.needed) gaps.push(`${field.name} is not needed by every record yet`)
    if (!field.needed && there.needed) gaps.push(`${field.name} is needed by every record, and should not be`)
    if (field.pointsAt !== there.pointsAt)
      gaps.push(field.pointsAt ? `${field.name} does not point at ${field.pointsAt}` : `${field.name} points at ${there.pointsAt}, and should not`)
  }
  for (const field of shape.fields)
    if (!want.fields.some((f) => f.name === field.name)) gaps.push(`it still has a field ${field.name}`)
  if (!want.others && !shape.fixed) gaps.push('it is open, and should be fixed')
  if (want.others && shape.fixed) gaps.push(`it is fixed, and should be open to ${want.others}`)
  if (want.others && !shape.fixed && !holdsAsAsked(want.others, holdsWords(shape.others)))
    gaps.push(`any other field holds ${holdsWords(shape.others)}, not ${want.others}`)
  return gaps
}

/** Whether changing a store from how it was to how a proposal draws it
 *  touches the records already kept, so they need moving to the new shape:
 *  a field taken away or holding something else, one every record must now
 *  have, a store closed, or one whose shape nobody knew. Crossing a store out
 *  leaves its records where they are; deleting them is a person's call, never
 *  a proposal's. */
export const needsMigration = (was: Store | undefined, want: ProposedStore): boolean => {
  if (!was || want.gone || !want.fields) return false
  if (!was.shape) return true
  const asked = want.fields
  const before = new Map(was.shape.fields.map((f) => [f.name, f]))
  if (was.shape.fields.some((f) => !asked.some((w) => w.name === f.name))) return true
  for (const field of asked) {
    const old = before.get(field.name)
    if (!old) {
      if (field.needed) return true
      continue
    }
    if (!holdsAsAsked(field.holds, holdsWords(old.holds))) return true
    if (field.needed && !old.needed) return true
  }
  if (!was.shape.fixed && (!want.others || !holdsAsAsked(want.others, holdsWords(was.shape.others)))) return true
  return false
}

const MIGRATION_NEEDED =
  'it changes records already kept, so it needs a migration: a script that moves them to the new shape, named in the proposal as its migration'

/** A store's shape in one line, to tell whether it changed. */
const shapeKey = (store: Store): string =>
  store.shape
    ? JSON.stringify([
        store.shape.fixed,
        store.shape.fixed ? '' : holdsWords(store.shape.others),
        store.shape.fields.map((f) => [f.name, holdsWords(f.holds), f.needed, f.pointsAt]),
      ])
    : 'unknown'

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
export const measure = (
  map: SystemMap,
  proposal: Proposal,
  base: SystemMap | null,
  /** Whether a file is in the repo, by its path; for a store's migration. */
  exists: (path: string) => boolean = () => true,
): Progress => {
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
  const storeAt = (m: SystemMap | null, s: { container: string; path: string }): Store | undefined =>
    (m?.stores ?? []).find((x) => x.container === s.container && x.path === s.path)
  for (const s of proposal.stores) {
    const name = storeName(s)
    const there = storeAt(map, s)
    const left = there || s.gone ? shapeGaps(there?.shape ?? null, s) : []
    // Only with the commit it was drawn on can a change to the records already
    // kept be told; without it, the migration is the agent's to judge.
    if (base && needsMigration(storeAt(base, s), s)) {
      if (!s.migration) left.push(MIGRATION_NEEDED)
      else if (!exists(s.migration)) left.push(`its migration, ${s.migration}, is not there yet`)
    }
    const done = s.gone ? !there : Boolean(there)
    items.push({
      name,
      what: 'store',
      id: idOfName(name),
      state: s.gone ? (done && !left.length ? 'removed' : 'to remove') : done && !left.length ? 'built' : 'to build',
      ...(left.length ? { left } : {}),
    })
  }

  const unasked: string[] = []
  if (base) {
    const drawn = new Set([...proposal.containers.map((c) => c.name), ...proposal.components.map(componentName)])
    // A store needs a module to keep it, so a new module that keeps only
    // stores the proposal draws is part of building them.
    const drawnStores = new Set(proposal.stores.map((s) => idOfName(storeName(s))))
    const keepsDrawn = (m: SystemMap, id: string): boolean => {
      const kept = m.wires.filter((w) => w.kind === 'keeps' && w.from === id)
      return kept.length > 0 && kept.every((w) => drawnStores.has(w.to))
    }
    for (const c of map.components) if (keepsDrawn(map, c.id)) drawn.add(componentName(c))
    for (const c of base.components) if (keepsDrawn(base, c.id)) drawn.add(componentName(c))

    const baseStores = new Map(base.stores.map((s) => [s.id, s]))
    const nowStores = new Map(map.stores.map((s) => [s.id, s]))
    const saidStores = new Set<string>()
    const tell = (id: string, words: string): void => {
      saidStores.add(id)
      unasked.push(words)
    }
    for (const [id, store] of nowStores) {
      if (drawnStores.has(id)) continue
      const was = baseStores.get(id)
      if (!was) tell(id, `The store ${storeName(store)} is new, but the proposal does not draw it.`)
      else if (shapeKey(was) !== shapeKey(store)) tell(id, `The shape of ${storeName(store)} changed, but the proposal does not draw it.`)
    }
    for (const [id, store] of baseStores)
      if (!nowStores.has(id) && !drawnStores.has(id))
        tell(id, `The store ${storeName(store)} is gone, but the proposal does not cross it out.`)
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
      const s = m.stores.find((x) => x.id === id)
      return c ? componentName(c) : s ? storeName(s) : id.replace(/^container:/, '')
    }
    const key = (m: SystemMap, w: { from: string; kind: string; to: string }): string =>
      `${nameOf(m, w.from)} ${w.kind} ${nameOf(m, w.to)}`
    const baseWires = new Set(base.wires.map((w) => key(base, w)))
    const nowWires = new Set(map.wires.map((w) => key(map, w)))
    // A card crossed out takes its wires with it.
    const crossed = [...proposal.containers.filter((c) => c.gone).map((c) => c.name), ...proposal.components.filter((c) => c.gone).map(componentName)]
    // What a store keeps and points at follows from the store itself, which is
    // drawn, or else said above.
    const told = new Set([...drawnStores, ...saidStores])
    const covered = (m: SystemMap, w: { from: string; kind: string; to: string }): boolean =>
      told.has(w.from) ||
      told.has(w.to) ||
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
