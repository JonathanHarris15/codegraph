// codegraph: module cards
// codegraph: front door card, join, systemCard, withLooks, holdsWords, Card, CardField, CardWire, CardState, Level, WireEnds
import type { CardType } from '../card-types/index.js'
import { holdsWords, idOfName, shapeGaps, storeId, type Shape, type Store, type SystemMap } from '../reader/index.js'

export { holdsWords }

export type Level = 'project' | 'system' | 'container' | 'component' | 'code'

/** How a card or wire stands against the proposal on its branch: drawn and
 *  not built yet, drawn and built, or crossed out and still there. */
export type CardState = 'proposed' | 'built' | 'gone'

/** Where a wire really starts and ends, by the ids of the deepest cards it
 *  joins, when it is drawn a level up between the cards that hold them. */
export type WireEnds = { from: string; to: string }

export type CardWire = {
  from: string
  to: string
  kind: string
  words: string
  /** Every pair of real ends this wire stands for: one for a wire read
   *  straight off the code, several where wires were gathered into one. */
  ends: WireEnds[]
  state?: CardState
}

/** One field of a store, as its card lists it: what it holds, in words. */
export type CardField = { name: string; holds: string; needed: boolean; pointsAt: string }

/** One thing on the canvas, with what is inside it already laid out as
 *  cards and the wires between them, so the page only has to draw. */
export type Card = {
  id: string
  name: string
  level: Level
  /** browser app, database, page, module, or a type the team named… */
  kind: string
  /** A component's kind, when what it is called is another type. */
  role?: string
  /** How a type a person saved is drawn. */
  look?: { icon: string; shape: CardType['shape']; color: string }
  says: string
  /** A page's address. */
  at: string
  start: boolean
  /** A software system that has a codegraph config to read. */
  setUp: boolean
  /** The names declared in a file, at the code level. */
  names: string[]
  /** A page's screenshot, as a data URL, or ''. */
  shot: string
  /** The proposal's mockup of a page, as a data URL, shown beside its
   *  screenshot. */
  mockup?: string
  state?: CardState
  /** A software system this member cannot open right now, and why, in words. */
  outOfReach?: string
  /** A store's fields; null when its shape is unknown. Left out for anything
   *  that is not a store. */
  fields?: CardField[] | null
  /** What any field a store does not list may hold, for an open one; '' for
   *  a fixed one (ADR 0023). */
  others?: string
  children: Card[]
  wires: CardWire[]
}

export const card = (id: string, name: string, level: Level, more: Partial<Card> = {}): Card => ({
  id,
  name,
  level,
  kind: '',
  says: '',
  at: '',
  start: false,
  setUp: true,
  names: [],
  shot: '',
  children: [],
  wires: [],
  ...more,
})

/** Gives every card of a type a person has saved the look of that type, so
 *  what was drawn looks the same once it is read back from the code. */
export const withLooks = (shown: Card, types: CardType[]): Card => {
  if (types.length === 0) return shown
  const type = types.find((one) => one.name === shown.kind)
  return {
    ...shown,
    ...(type && !shown.look ? { look: { icon: type.icon, shape: type.shape, color: type.color } } : {}),
    children: shown.children.map((child) => withLooks(child, types)),
  }
}

/** Adds a wire, or the words of one, to wires already drawn between the
 *  same two cards. */
export const join = (wires: CardWire[], wire: CardWire): void => {
  const same = wires.find((w) => w.from === wire.from && w.to === wire.to && w.kind === wire.kind)
  if (!same) {
    wires.push({ ...wire, ends: [...wire.ends] })
    return
  }
  if (wire.words && !same.words.split('; ').includes(wire.words))
    same.words = same.words ? `${same.words}; ${wire.words}` : wire.words
  for (const end of wire.ends)
    if (!same.ends.some((e) => e.from === end.from && e.to === end.to)) same.ends.push(end)
}

const fieldsOf = (shape: Shape | null): CardField[] | null =>
  shape && shape.fields.map((f) => ({ name: f.name, holds: holdsWords(f.holds), needed: f.needed, pointsAt: f.pointsAt }))

/** A store's card, with the stores that live inside it drawn inside it. */
const storeCard = (store: Store, stores: Store[], at: (inside: string) => string): Card =>
  card(at(store.id), store.name, 'component', {
    kind: store.inside ? 'inner store' : 'store',
    says: store.shape ? store.says : 'Its shape is unknown: no schema says it.',
    fields: fieldsOf(store.shape),
    others: store.shape && !store.shape.fixed ? holdsWords(store.shape.others) : '',
    children: stores
      .filter((inner) => inner.container === store.container && inner.inside === store.path)
      .map((inner) => storeCard(inner, stores, at)),
  })

export const systemCard = (id: string, name: string, map: SystemMap): Card => {
  const at = (inside: string): string => `${id}/${inside}`
  const stores = map.stores ?? []
  const containers = map.containers.map((container) =>
    card(at(container.id), container.name, 'container', {
      kind: container.kind,
      says: container.says || (container.stores.length ? `Keeps ${container.stores.join(', ')}` : ''),
      children: [
        ...stores
          .filter((store) => store.container === container.name && !store.inside)
          .map((store) => storeCard(store, stores, at)),
        ...map.components
          .filter((component) => component.container === container.name)
          .map((component) =>
            card(at(component.id), component.name, 'component', {
              kind: component.type || component.kind,
              ...(component.type ? { role: component.kind } : {}),
              says: component.kind === 'trigger' ? `On a ${component.trigger}` : '',
              at: component.at,
              start: component.start,
              shot: component.shot,
              children: component.files.map((file) =>
                card(at(`${component.id}/${file.path}`), file.path.split('/').pop() ?? file.path, 'code', {
                  kind: 'file',
                  says: file.path,
                  names: file.names,
                }),
              ),
            }),
          ),
      ],
    }),
  )

  const containerOf = new Map<string, string>()
  for (const component of map.components) containerOf.set(component.id, `container:${component.container}`)
  for (const store of stores) containerOf.set(store.id, `container:${store.container}`)
  /** The card a store is drawn in at its container's level: itself, or the
   *  store at the top it lives inside. */
  const topOf = (storeId: string): string => {
    const store = stores.find((s) => s.id === storeId)
    if (!store?.inside) return storeId
    const top = store.path.split('/')[0]!
    return stores.find((s) => s.container === store.container && s.path === top)?.id ?? storeId
  }
  const holder = new Map(containers.map((c) => [c.id, c]))
  const system = card(id, name, 'system', {
    kind: 'software system',
    says: map.setUp ? '' : 'Not set up for codegraph yet',
    setUp: map.setUp,
    children: containers,
  })

  for (const wire of map.wires) {
    const from = containerOf.get(wire.from)
    const to = containerOf.get(wire.to) ?? (wire.to.startsWith('container:') ? wire.to : undefined)
    if (!from || !to) continue
    const ends = [{ from: at(wire.from), to: at(wire.to) }]
    if (from === to) {
      // Inside one container, a wire joins the cards at that level: a store
      // inside another is drawn by the store at the top. One that points at
      // the store it lives in needs no wire to say so.
      const [high, low] = [topOf(wire.from), topOf(wire.to)]
      if (high !== low) join(holder.get(at(from))!.wires, { ...wire, from: at(high), to: at(low), ends })
    } else join(system.wires, { ...wire, from: at(from), to: at(to), ends })
  }
  if (map.proposal) drawProposal(system, map, holder, at)
  return system
}

/** Whether one end of a wire, by its id on the canvas, is a card a
 *  proposal names: the same card, or inside the container it names. */
const endIs = (name: string, id: string): boolean => {
  const inside = id.slice(id.indexOf('/') + 1)
  const wanted = idOfName(name)
  return inside === wanted || (!name.includes('/') && inside.startsWith(`${name}:`))
}

/** Draws the proposal over a software system's card: what it draws and the
 *  code has not got yet as new cards and wires, what it crosses out marked,
 *  and what is built marked built, each where it would be in the code. */
const drawProposal = (system: Card, map: SystemMap, holder: Map<string, Card>, at: (inside: string) => string): void => {
  const proposal = map.proposal!
  const containerCard = (name: string, kind = '', says = ''): Card => {
    const id = at(`container:${name}`)
    let found = holder.get(id)
    if (!found) {
      found = card(id, name, 'container', { kind, says, state: 'proposed' })
      holder.set(id, found)
      system.children.push(found)
    }
    return found
  }
  for (const c of proposal.containers) {
    const there = holder.get(at(`container:${c.name}`))
    if (there) there.state = c.gone ? 'gone' : 'built'
    else if (!c.gone) containerCard(c.name, c.kind, c.says)
  }
  for (const c of proposal.components) {
    const id = at(`${c.container}:${c.kind}:${c.name}`)
    const inside = holder.get(at(`container:${c.container}`))
    const there = inside?.children.find((x) => x.id === id)
    const mockup = map.mockups[`${c.container}:${c.kind}:${c.name}`]
    if (there) {
      there.state = c.gone ? 'gone' : 'built'
      if (mockup) there.mockup = mockup
    } else if (!c.gone)
      containerCard(c.container).children.push(
        card(id, c.name, 'component', { kind: c.type || c.kind, ...(c.type ? { role: c.kind } : {}), says: c.says, at: c.at, start: c.start ?? false, state: 'proposed', ...(mockup ? { mockup } : {}) }),
      )
  }
  // Stores: one changed is marked to build until its schema says the same,
  // one crossed out is marked, and one new is drawn faint with its fields,
  // inside its database or the store it lives in (ADR 0023).
  const findIn = (holder: Card, id: string): Card | undefined =>
    holder.children.find((c) => c.id === id) ?? holder.children.map((c) => findIn(c, id)).find(Boolean)
  for (const s of proposal.stores) {
    const id = at(storeId(s.container, s.path))
    const inside = holder.get(at(`container:${s.container}`))
    const there = inside && findIn(inside, id)
    if (there) {
      const store = map.stores.find((x) => x.container === s.container && x.path === s.path)
      there.state = s.gone ? 'gone' : shapeGaps(store?.shape ?? null, s).length ? 'proposed' : 'built'
      continue
    }
    if (s.gone) continue
    const parts = s.path.split('/')
    const parent = parts.length > 1 ? inside && findIn(inside, at(storeId(s.container, parts.slice(0, -1).join('/')))) : containerCard(s.container)
    parent?.children.push(
      card(id, parts[parts.length - 1]!, 'component', {
        kind: parts.length > 1 ? 'inner store' : 'store',
        says: s.says,
        fields: s.fields,
        others: s.others,
        state: 'proposed',
      }),
    )
  }
  const holderOf = (name: string): string => name.split('/')[0]!
  for (const w of proposal.wires) {
    const inOne = w.from.includes('/') && w.to.includes('/') && holderOf(w.from) === holderOf(w.to)
    const level = inOne ? holder.get(at(`container:${holderOf(w.from)}`)) : system
    if (!level) continue
    const matching = level.wires.filter(
      (cw) => cw.kind === w.kind && cw.ends.some((e) => endIs(w.from, e.from) && endIs(w.to, e.to)),
    )
    if (matching.length) {
      for (const cw of matching) cw.state = w.gone ? 'gone' : 'built'
      continue
    }
    if (w.gone || (w.kind === 'calls' && !proposal.containers.some((c) => c.name === w.to) && !holder.has(at(`container:${w.to}`))))
      continue
    const [from, to] = inOne ? [w.from, w.to] : [holderOf(w.from), w.to.includes('/') ? holderOf(w.to) : w.to]
    if (!inOne) {
      containerCard(from)
      containerCard(to)
    }
    level.wires.push({
      from: at(idOfName(from)),
      to: at(idOfName(to)),
      kind: w.kind,
      words: w.words,
      ends: [{ from: at(idOfName(w.from)), to: at(idOfName(w.to)) }],
      state: 'proposed',
    })
  }
}
