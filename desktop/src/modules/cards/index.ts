// codegraph: module cards
// codegraph: front door card, join, systemCard, Card, CardWire, CardState, Level, WireEnds
import { idOfName, type SystemMap } from '../reader/index.js'

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

/** One thing on the canvas, with what is inside it already laid out as
 *  cards and the wires between them, so the page only has to draw. */
export type Card = {
  id: string
  name: string
  level: Level
  /** browser app, database, page, module… */
  kind: string
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

export const systemCard = (id: string, name: string, map: SystemMap): Card => {
  const at = (inside: string): string => `${id}/${inside}`
  const containers = map.containers.map((container) =>
    card(at(container.id), container.name, 'container', {
      kind: container.kind,
      says: container.says || (container.stores.length ? `Keeps ${container.stores.join(', ')}` : ''),
      children: map.components
        .filter((component) => component.container === container.name)
        .map((component) =>
          card(at(component.id), component.name, 'component', {
            kind: component.kind,
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
    }),
  )

  const containerOf = new Map<string, string>()
  for (const component of map.components) containerOf.set(component.id, `container:${component.container}`)
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
    if (from === to) join(holder.get(at(from))!.wires, { ...wire, from: at(wire.from), to: at(wire.to), ends })
    else join(system.wires, { ...wire, from: at(from), to: at(to), ends })
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
        card(id, c.name, 'component', { kind: c.kind, says: c.says, at: c.at, start: c.start ?? false, state: 'proposed', ...(mockup ? { mockup } : {}) }),
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
