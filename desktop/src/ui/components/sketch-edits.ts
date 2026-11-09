// codegraph: component sketch-editor
import type { Level, Note, SketchCard, SketchField, SketchWire } from '../../modules/sketches/index.js'
import type { CardType } from '../../modules/card-types/schema.js'
import { blankCard, isHub, isStore, wireOfHub, hubOf, type CardLook } from '../../modules/sketches/schema.js'
import type { Arrangement } from '../../modules/arrangements/schema.js'
import { BLANK_LOOK, TEMPLATES } from './card-looks.js'
import { sizeOf, wordsWidth } from './map-layout.js'

export type { Arrangement }

/** The level drawn inside a card of each level. */
export const levelInside: Record<Level, Level> = {
  project: 'system',
  system: 'container',
  container: 'component',
  component: 'code',
  code: 'code',
}

/** The kinds a card can be at each level, the usual first. A person is drawn
 *  beside the software systems and never read from code, so it is only ever
 *  on a sketch. Inside a software system these are the blank card, and the
 *  kinds that do more than look a certain way, a database and a page. The rest
 *  are templates (ADR 0013). */
export const kindsAt: Record<Level, string[]> = {
  project: ['project'],
  system: ['software system', 'shallow software system', 'person'],
  container: ['card', 'database'],
  component: ['card', 'page'],
  code: ['file'],
}

/** What is drawn inside a database, or files on disk: its stores. */
const keepsThings = (kind: string): boolean => kind === 'database' || kind === 'files on disk'

/** The level drawn inside a card. A store's inner stores are drawn inside it
 *  at its own level, since they are stores too, not code (ADR 0023). */
export const levelIn = (card: { level: Level; kind: string }): Level =>
  isStore(card.kind) ? card.level : levelInside[card.level]

/** What can be put inside a card: inside a database, stores; inside a store,
 *  the stores that live inside it; anywhere else, what its level offers. */
export const choicesIn = (card: { level: Level; kind: string }, types: CardType[] = []): { name: string; choices: CardChoice[] }[] =>
  keepsThings(card.kind) && card.level === 'container'
    ? [{ name: '', choices: [storeChoice('store')] }]
    : isStore(card.kind)
      ? [{ name: '', choices: [storeChoice('inner store')] }]
      : choicesAt(levelIn(card), types)

const storeChoice = (kind: string): CardChoice => ({ key: kind, kind, hint: kindHints[kind] ?? '' })

/** The kinds code already has words for, each a template. */
const kindsInCode: Partial<Record<Level, string[]>> = {
  container: ['web app', 'browser app', 'server', 'desktop app', 'mobile app', 'database', 'files on disk', 'function', 'command-line tool'],
  component: ['page', 'feature', 'module', 'trigger'],
}

/** Whether a wire's end is a hub on the border of the card it is drawn in. */
export const endsAtHub = (end: string): boolean => isHub(end)
/** The hub a wire makes where it meets the border of an open card. */
export const hubOfWire = (wireId: string): string => hubOf(wireId)

/** The levels where a person makes up their own types of card. */
export const ownTypesAt = (level: Level): boolean => level === 'container' || level === 'component'

/** Something a card can be made as, from the library or the quick menu. */
export type CardChoice = { key: string; kind: string; look?: CardLook; hint: string }

/** What can be put on a level, in groups: what the app knows, then the types
 *  a person has saved. */
export const choicesAt = (level: Level, types: CardType[] = []): { name: string; choices: CardChoice[] }[] => {
  const fromCode = (kind: string): CardChoice => ({
    key: kind,
    kind,
    ...(TEMPLATES[kind] ? { look: TEMPLATES[kind] } : {}),
    hint: kindHints[kind] ?? '',
  })
  const known = kindGroups(level).map((group) => ({
    name: group.name,
    choices: group.kinds.map((kind): CardChoice => ({
      key: kind,
      kind,
      ...(kind === 'card' ? { look: BLANK_LOOK } : {}),
      hint: kindHints[kind] ?? '',
    })),
  }))
  if (!ownTypesAt(level)) return known
  const templates = kindsInCode[level]!.filter((kind) => TEMPLATES[kind])
  return [
    ...known,
    { name: 'Templates', choices: templates.map(fromCode) },
    ...(types.some((type) => !TEMPLATES[type.name]) && types.length
      ? [
          {
            name: 'Your types',
            // A template's look kept from the code is still that template.
            choices: types.filter((type) => !TEMPLATES[type.name]).map((type): CardChoice => ({
              key: `type:${type.id}`,
              kind: type.name,
              look: { icon: type.icon, shape: type.shape, color: type.color },
              hint: 'Your own type',
            })),
          },
        ]
      : []),
  ]
}

/** One line on what each kind of card is, in the glossary's words, for the
 *  card library to say beside it. */
export const kindHints: Record<string, string> = {
  card: 'Pick its type and look',
  person: 'Someone who uses the software',
  'software system': 'One repo, seen whole',
  'shallow software system': 'Run by someone else; no repo here',
  'web app': 'A site served to a browser',
  'browser app': 'Runs in the browser',
  server: 'Answers requests',
  'desktop app': 'A program on a computer',
  'mobile app': 'An app on a phone',
  database: 'Keeps data',
  'files on disk': 'Keeps files',
  function: 'Runs when called, then stops',
  'command-line tool': 'Run from a terminal',
  page: 'What a person sees and acts through',
  feature: 'One thing someone asks for',
  module: 'Real work behind a small front door',
  trigger: 'Starts a feature on a schedule or event',
  file: 'Code, and the names in it',
  store: 'Keeps one kind of record, field by field',
  'inner store': 'Lives inside each record of its store',
}

/** The kinds for one level, grouped the way the canvas lays them out, for
 *  the card library to offer. A level with one group gives it no heading. */
export const kindGroups = (level: Level): { name: string; kinds: string[] }[] =>
  level === 'system'
    ? [
        { name: 'Software', kinds: ['software system', 'shallow software system'] },
        { name: 'People', kinds: ['person'] },
      ]
    : [{ name: '', kinds: kindsAt[level] }]

export const wireKinds = ['uses', 'asks', 'reads', 'starts', 'keeps', 'leads to', 'calls', 'points at']

/** The kind a wire drawn between two cards most likely is, which the person
 *  can change. */
export const kindBetween = (from: SketchCard | undefined, to: SketchCard | undefined): string =>
  // A person uses the software; they do not call it.
  from?.kind === 'person'
    ? 'uses'
    : isStore(from?.kind ?? '') && isStore(to?.kind ?? '')
    ? 'points at'
    : from?.kind === 'page' && to?.kind === 'page'
    ? 'leads to'
    : from?.kind === 'page' && to?.kind === 'feature'
      ? 'asks'
      : from?.kind === 'page' && to?.kind === 'module'
        ? 'reads'
        : from?.kind === 'trigger'
          ? 'starts'
          : /database|files/.test(to?.kind ?? '')
            ? 'keeps'
            : from?.level === 'system'
              ? 'calls'
              : 'uses'

const newId = (): string => crypto.randomUUID()

/** Changes the card at the end of a path, and nothing else. */
export const changeAt = (root: SketchCard, path: string[], change: (card: SketchCard) => SketchCard): SketchCard => {
  if (path.length <= 1) return change(root)
  const [, next, ...rest] = path
  return {
    ...root,
    children: root.children.map((child) => (child.id === next ? changeAt(child, [next!, ...rest], change) : child)),
  }
}

/** Pins every card on a level where the canvas shows it, so from then on a
 *  card is where a person can see it is, and moving one moves only that one. */
export const pinAll = (focus: SketchCard, arrangement: Arrangement): SketchCard => {
  const at = new Map(arrangement.map((a) => [a.id, a]))
  return {
    ...focus,
    children: focus.children.map((child) => {
      const spot = at.get(child.id)
      return spot && (child.x === undefined || child.y === undefined) ? { ...child, x: spot.x, y: spot.y } : child
    }),
  }
}

/** A new card centred where the person put it, of the kind they picked. Given
 *  a card to come from, it is wired to that card too, the way dragging a wire
 *  onto empty board and picking a kind does. Coming from a hub, the wire runs
 *  the way the hub's own wire does, and is of the same kind. */
export const placeCard = (
  focus: SketchCard,
  at: { x: number; y: number },
  kind = '',
  from = '',
  hub?: { into: boolean; kind: string },
  look?: CardLook,
): [SketchCard, string] => {
  const level = levelIn(focus)
  const type = kind || choicesIn(focus)[0]?.choices[0]?.kind || kindsAt[level][0] || ''
  // A new store is fixed, with no fields yet: the shape is the person's to say.
  const blank = { ...blankCard(newId(), '', level, type), ...(isStore(type) ? { fields: [], others: '' } : {}) }
  const shown = look ?? (type === 'card' ? BLANK_LOOK : undefined)
  const card: SketchCard = shown ? { ...blank, look: shown } : blank
  const { w, h } = sizeOf(card)
  const placed: SketchCard = { ...card, x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2) }
  const next = { ...focus, children: [...focus.children, placed] }
  if (from && isHub(from) && hub) {
    const [wired] = hub.into ? addWire(next, from, card.id, hub.kind) : addWire(next, card.id, from, hub.kind)
    return [wired, card.id]
  }
  if (!from || !focus.children.some((c) => c.id === from)) return [next, card.id]
  const [wired] = addWire(next, from, card.id)
  return [wired, card.id]
}

export const placeNote = (focus: SketchCard, at: { x: number; y: number }): [SketchCard, string] => {
  const note: Note = { id: newId(), text: '', x: Math.round(at.x - 90), y: Math.round(at.y - 30) }
  return [{ ...focus, notes: [...focus.notes, note] }, note.id]
}

/** Moves cards, notes and wires' sentences to where they were put down. Moving
 *  a card lets go of any sentence moved on a wire it joins, which goes back to
 *  the wire's own line (ADR 0016). */
export const moveThings = (focus: SketchCard, moves: Arrangement): SketchCard => {
  const to = new Map(moves.map((m) => [m.id, m]))
  return {
    ...focus,
    children: focus.children.map((c) => {
      const m = to.get(c.id)
      return m ? { ...c, x: Math.round(m.x), y: Math.round(m.y) } : c
    }),
    notes: focus.notes.map((n) => {
      const m = to.get(n.id)
      return m ? { ...n, x: Math.round(m.x), y: Math.round(m.y) } : n
    }),
    wires: focus.wires.map((w) => {
      const m = to.get(w.id)
      if (m) return { ...w, x: Math.round(m.x), y: Math.round(m.y) }
      if (!to.has(w.from) && !to.has(w.to)) return w
      const { x: _x, y: _y, ...free } = w
      return free
    }),
  }
}

/** Moves the picked cards and notes by an amount, for the arrow keys. */
export const nudge = (focus: SketchCard, ids: string[], dx: number, dy: number): SketchCard =>
  moveThings(
    focus,
    [...focus.children, ...focus.notes]
      .filter((thing) => ids.includes(thing.id) && thing.x !== undefined && thing.y !== undefined)
      .map((thing) => ({ id: thing.id, x: thing.x! + dx, y: thing.y! + dy })),
  )

export const addWire = (focus: SketchCard, from: string, to: string, kind?: string): [SketchCard, string] => {
  // One wire between the same two cards is enough; drawing it again picks it.
  const already = focus.wires.find((w) => w.from === from && w.to === to)
  if (already) return [focus, already.id]
  const wire: SketchWire = {
    id: newId(),
    from,
    to,
    kind: kind ?? kindBetween(focus.children.find((c) => c.id === from), focus.children.find((c) => c.id === to)),
    words: '',
  }
  return [{ ...focus, wires: [...focus.wires, wire] }, wire.id]
}

/** Takes the wires inside a card that end at the hubs of these wires, and in
 *  turn whatever hung off the wires taken. */
const withoutHubs = (card: SketchCard, gone: Set<string>): SketchCard => {
  if (gone.size === 0) return card
  const lost = new Set(card.wires.filter((w) => gone.has(wireOfHub(w.from)) || gone.has(wireOfHub(w.to))).map((w) => w.id))
  if (lost.size === 0) return card
  return { ...card, wires: card.wires.filter((w) => !lost.has(w.id)), children: card.children.map((c) => withoutHubs(c, lost)) }
}

/** Points one end of a wire at another card. The card it let go of loses the
 *  hub the wire had on its border, and what was wired to it. */
export const rewire = (focus: SketchCard, id: string, end: 'from' | 'to', card: string): SketchCard => {
  const wire = focus.wires.find((w) => w.id === id)
  if (!wire || wire[end] === card || (end === 'from' ? wire.to : wire.from) === card) return focus
  const was = wire[end]
  return {
    ...focus,
    wires: focus.wires.map((w) => (w.id === id ? { ...w, [end]: card } : w)),
    children: focus.children.map((c) => (c.id === was ? withoutHubs(c, new Set([id])) : c)),
  }
}

export type Picked =
  | { kind: 'card'; card: SketchCard }
  | { kind: 'wire'; wire: SketchWire }
  | { kind: 'note'; note: Note }
  | null

export const pick = (focus: SketchCard, id: string): Picked => {
  const card = focus.children.find((c) => c.id === id)
  if (card) return { kind: 'card', card }
  const wire = focus.wires.find((w) => w.id === id)
  if (wire) return { kind: 'wire', wire }
  const note = focus.notes.find((n) => n.id === id)
  return note ? { kind: 'note', note } : null
}

export const changeCard = (focus: SketchCard, id: string, change: Partial<SketchCard>): SketchCard => ({
  ...focus,
  children: focus.children.map((c) => (c.id === id ? { ...c, ...change } : c)),
})

/** Sets a store's fields. A field that points at a store drawn beside it
 *  wires the two, unless they are wired that way already, worded by the field. */
export const setFields = (focus: SketchCard, id: string, fields: SketchField[] | null): SketchCard => {
  let next = changeCard(focus, id, { fields })
  for (const field of fields ?? []) {
    const target = field.pointsAt && focus.children.find((c) => c.id !== id && isStore(c.kind) && c.name === field.pointsAt)
    if (!target || next.wires.some((w) => w.from === id && w.to === target.id && w.kind === 'points at')) continue
    const [wired, wireId] = addWire(next, id, target.id, 'points at')
    next = field.name ? changeWire(wired, wireId, { words: field.name }) : wired
  }
  return next
}

/** Adds a store, by name, inside a card on the level: a store inside a
 *  database, or an inner store inside a store. It is fixed with no fields yet,
 *  and the canvas lays it out. */
export const addStoreInside = (focus: SketchCard, holderId: string, name: string): [SketchCard, string] => {
  const holder = focus.children.find((c) => c.id === holderId)
  if (!holder) return [focus, '']
  const kind = isStore(holder.kind) ? 'inner store' : 'store'
  const store: SketchCard = { ...blankCard(newId(), name, levelIn(holder), kind), fields: [], others: '' }
  return [changeCard(focus, holderId, { children: [...holder.children, store] }), store.id]
}

export const changeWire = (focus: SketchCard, id: string, change: Partial<SketchWire>): SketchCard => ({
  ...focus,
  wires: focus.wires.map((w) => (w.id === id ? { ...w, ...change } : w)),
})

export const changeNote = (focus: SketchCard, id: string, change: Partial<Note>): SketchCard => ({
  ...focus,
  notes: focus.notes.map((n) => (n.id === id ? { ...n, ...change } : n)),
})

/** The words of whatever an id is: a card's name, a wire's words, a note. */
export const retext = (focus: SketchCard, id: string, text: string): SketchCard => {
  const picked = pick(focus, id)
  if (picked?.kind === 'card') return changeCard(focus, id, { name: text })
  if (picked?.kind === 'wire') return changeWire(focus, id, { words: text })
  if (picked?.kind === 'note') return changeNote(focus, id, { text })
  return focus
}

/** Moves cards apart where a wire's words would not fit between them: the
 *  card a wire points to steps aside, the way it already faces. */
export const makeRoom = (focus: SketchCard): SketchCard => {
  const at = new Map(focus.children.map((c) => [c.id, { ...c }]))
  for (const wire of focus.wires) {
    const from = at.get(wire.from)
    const to = at.get(wire.to)
    if (!from || !to || from.x === undefined || from.y === undefined || to.x === undefined || to.y === undefined) continue
    const a = { ...sizeOf(from), x: from.x, y: from.y }
    const b = { ...sizeOf(to), x: to.x, y: to.y }
    // Only cards side by side carry their words between them.
    const sideBySide = Math.abs(b.x + b.w / 2 - (a.x + a.w / 2)) > Math.max(a.w, b.w) / 2
    // Only cards roughly level with each other: one well above the other
    // sends its wire round the side, with room enough.
    const level = Math.abs(b.y + b.h / 2 - (a.y + a.h / 2)) < Math.max(a.h, b.h)
    if (!sideBySide || !level) continue
    const need = wordsWidth(wire)
    if (b.x > a.x) {
      const gap = b.x - (a.x + a.w)
      if (gap < need) to.x = a.x + a.w + need
    } else {
      const gap = a.x - (b.x + b.w)
      if (gap < need) to.x = a.x - need - b.w
    }
  }
  return { ...focus, children: focus.children.map((c) => at.get(c.id) ?? c) }
}

/** Takes cards, wires and notes off a level, and any wire left with a loose end. */
export const remove = (focus: SketchCard, ids: string[]): SketchCard => {
  const gone = new Set(ids)
  const wires = focus.wires.filter((w) => !gone.has(w.id) && !gone.has(w.from) && !gone.has(w.to))
  const lost = new Set(focus.wires.filter((w) => !wires.includes(w)).map((w) => w.id))
  return {
    ...focus,
    children: focus.children.filter((c) => !gone.has(c.id)).map((c) => withoutHubs(c, lost)),
    wires,
    notes: focus.notes.filter((n) => !gone.has(n.id)),
  }
}

/** What Copy holds: cards with everything drawn inside them, the wires
 *  between them, and notes. */
export type Clip = { cards: SketchCard[]; wires: SketchWire[]; notes: Note[] }

export const copyOf = (focus: SketchCard, ids: string[]): Clip => {
  const picked = new Set(ids)
  const cards = focus.children.filter((c) => picked.has(c.id))
  const held = new Set(cards.map((c) => c.id))
  return {
    cards,
    wires: focus.wires.filter((w) => held.has(w.from) && held.has(w.to)),
    notes: focus.notes.filter((n) => picked.has(n.id)),
  }
}

/** Makes the hubs named by the wires inside a card follow the wires they
 *  belong to, which have new ids. */
const renameHubs = (card: SketchCard, wires: Map<string, string>): SketchCard => {
  const name = (end: string): string => {
    const to = wires.get(wireOfHub(end))
    return to ? hubOf(to) : end
  }
  return { ...card, wires: card.wires.map((w) => ({ ...w, from: name(w.from), to: name(w.to) })) }
}

/** A card again, with fresh ids all the way down, so a copy never shares a
 *  wire or a mockup's place with the card it came from. */
const fresh = (card: SketchCard, renamed: Map<string, string>): SketchCard => {
  const id = newId()
  renamed.set(card.id, id)
  const children = card.children.map((child) => fresh(child, renamed))
  const wireNames = new Map<string, string>()
  const end = (at: string): string | undefined => (isHub(at) ? at : renamed.get(at))
  const wires = card.wires.flatMap((w) => {
    const from = end(w.from)
    const to = end(w.to)
    if (!from || !to) return []
    const copy = newId()
    wireNames.set(w.id, copy)
    return [{ ...w, id: copy, from, to }]
  })
  return {
    ...card,
    id,
    mockup: '',
    children: children.map((child) => renameHubs(child, wireNames)),
    wires,
    notes: card.notes.map((n) => ({ ...n, id: newId() })),
  }
}

/** Puts what Copy holds onto a level, moved along so it does not sit on top
 *  of what it was copied from, and hands back the new ids to pick. */
export const paste = (focus: SketchCard, clip: Clip, by = 32): [SketchCard, string[]] => {
  const renamed = new Map<string, string>()
  const cards = clip.cards.map((card) => {
    const copy = fresh(card, renamed)
    return { ...copy, x: (card.x ?? 0) + by, y: (card.y ?? 0) + by }
  })
  const wireNames = new Map<string, string>()
  const wires = clip.wires.flatMap((w) => {
    const from = renamed.get(w.from)
    const to = renamed.get(w.to)
    if (!from || !to) return []
    const copy = newId()
    wireNames.set(w.id, copy)
    return [{ ...w, id: copy, from, to }]
  })
  // A wire that was not copied has no hub on the copy, so nothing can end there.
  const left = new Set(cards.flatMap((c) => c.wires.flatMap((w) => [w.from, w.to])).map(wireOfHub).filter((wire) => wire && !wireNames.has(wire)))
  const copies = cards.map((c) => withoutHubs(renameHubs(c, wireNames), left))
  const notes = clip.notes.map((n) => ({ ...n, id: newId(), x: n.x + by, y: n.y + by }))
  return [
    { ...focus, children: [...focus.children, ...copies], wires: [...focus.wires, ...wires], notes: [...focus.notes, ...notes] },
    [...cards.map((c) => c.id), ...notes.map((n) => n.id)],
  ]
}

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'across' | 'down'

/** Lines the picked cards up along one edge or centre, or spaces them evenly
 *  across or down, the way a diagram tool does. */
export const align = (focus: SketchCard, ids: string[], how: Alignment): SketchCard => {
  const boxes = focus.children
    .filter((c) => ids.includes(c.id) && c.x !== undefined && c.y !== undefined)
    .map((c) => ({ id: c.id, x: c.x!, y: c.y!, ...sizeOf(c) }))
  if (boxes.length < 2) return focus
  const left = Math.min(...boxes.map((b) => b.x))
  const right = Math.max(...boxes.map((b) => b.x + b.w))
  const top = Math.min(...boxes.map((b) => b.y))
  const bottom = Math.max(...boxes.map((b) => b.y + b.h))
  const moves: Arrangement = []
  if (how === 'across' || how === 'down') {
    const along = how === 'across' ? 'x' : 'y'
    const size = how === 'across' ? 'w' : 'h'
    const sorted = [...boxes].sort((a, b) => a[along] - b[along])
    const total = sorted.reduce((sum, b) => sum + b[size], 0)
    const span = (how === 'across' ? right - left : bottom - top) - total
    const gap = span / (sorted.length - 1)
    let at = how === 'across' ? left : top
    for (const b of sorted) {
      moves.push({ id: b.id, x: how === 'across' ? at : b.x, y: how === 'down' ? at : b.y })
      at += b[size] + gap
    }
  } else
    for (const b of boxes)
      moves.push({
        id: b.id,
        x: how === 'left' ? left : how === 'right' ? right - b.w : how === 'center' ? (left + right) / 2 - b.w / 2 : b.x,
        y: how === 'top' ? top : how === 'bottom' ? bottom - b.h : how === 'middle' ? (top + bottom) / 2 - b.h / 2 : b.y,
      })
  return moveThings(focus, moves)
}
