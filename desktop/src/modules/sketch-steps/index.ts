// codegraph: module sketch-steps
// codegraph: front door applyStep, findCard, AGENT_LAYER, Step, StepDone, Cursor, End
import { randomUUID } from 'node:crypto'
import { annotationKind, type Annotation, type AnnotationEnd, type Layer } from '../annotations/index.js'
import { kindsInside } from '../card-types/index.js'
import { readField } from '../flowchart/index.js'
import { blankCard, hubOf, isStore, wireOfHub, type Sketch, type SketchCard, type SketchWire } from '../sketches/index.js'
import { WIRE_KINDS } from '../wording/index.js'

/** One end of a line: a card or an annotation, by id or name, or a spot on the
 *  level. */
export type End = string | { x: number; y: number }

/** One thing an agent does to a sketch, the way a person would with the mouse.
 *  A card is named by its id or its name; `in` is the card whose insides the
 *  step is on, left out for the top level. */
export type Step =
  | { do: 'card'; name: string; kind?: string; in?: string; id?: string; says?: string; at?: string; x?: number; y?: number }
  | { do: 'change'; what: string; name?: string; kind?: string; says?: string; at?: string; text?: string; color?: string; x?: number; y?: number; w?: number; h?: number }
  | { do: 'remove'; what: string }
  | { do: 'wire'; from: string; to: string; kind?: string; words?: string }
  | { do: 'fields'; store: string; fields?: string[]; open?: string; unknown?: boolean }
  | { do: 'note'; text: string; kind?: string; in?: string; near?: string; x?: number; y?: number; w?: number; h?: number; color?: string }
  | { do: 'line'; from: End; to: End; kind?: string; text?: string; in?: string }
  | { do: 'frame'; text: string; around?: string[]; kind?: string; in?: string; color?: string; x?: number; y?: number; w?: number; h?: number }
  | { do: 'point'; at: End; in?: string; words?: string }

/** Where the agent's cursor is: on the insides of a card, at a thing by id or
 *  at a spot there, with a few words on what it is doing. */
export type Cursor = { inside: string; target: string; x?: number; y?: number; words: string }

/** One step done: the sketch after it, what was done in words, and where the
 *  cursor goes before it and after it. Or what is wrong with it. */
export type StepDone = { ok: true; sketch: Sketch; did: string; before: Cursor | null; after: Cursor } | { ok: false; problem: string }

/** The layer an agent's annotations go on, so a person can hide them together. */
export const AGENT_LAYER = 'agent'

/** About how big a card is drawn, for placing things beside it before the
 *  canvas has shown it. The canvas fits frames to the real thing. */
const CARD = { w: 220, h: 120 }
const GAP = 100

type Found = { card: SketchCard; parent: SketchCard | null }

const everyCard = (root: SketchCard): Found[] => {
  const out: Found[] = []
  const walk = (card: SketchCard, parent: SketchCard | null): void => {
    out.push({ card, parent })
    card.children.forEach((child) => walk(child, card))
  }
  walk(root, null)
  return out
}

/** A card by its id, or by its name where only one card has it. The top level
 *  is '' or `top`. */
export const findCard = (root: SketchCard, ref: string): Found | string => {
  const said = ref.trim()
  if (!said || said.toLowerCase() === 'top' || said === root.id) return { card: root, parent: null }
  const all = everyCard(root)
  const byId = all.find((f) => f.card.id === said)
  if (byId) return byId
  const named = all.filter((f) => f.parent && f.card.name.toLowerCase() === said.toLowerCase())
  if (named.length === 1) return named[0]!
  if (named.length > 1) return `more than one card is called "${said}": name it by its id, one of ${named.map((f) => f.card.id).join(', ')}.`
  return `there is no card "${said}" on the sketch.`
}

const annotations = (sketch: Sketch): { a: Annotation; layer: Layer }[] => (sketch.layers ?? []).flatMap((layer) => layer.items.map((a) => ({ a, layer })))
/** An annotation by its id or, where only one has them, by its words. A card
 *  of that id or name comes first. */
const findAnnotation = (sketch: Sketch, ref: string): Annotation | undefined => {
  const said = ref.trim()
  const all = annotations(sketch).map(({ a }) => a)
  const byId = all.find((a) => a.id === said)
  if (byId) return byId
  if (typeof findCard(sketch.root, said) !== 'string') return undefined
  const worded = all.filter((a) => a.text.trim().toLowerCase() === said.toLowerCase())
  return worded.length === 1 ? worded[0] : undefined
}

/** The same tree with one card changed, wherever it is. */
const changeCard = (root: SketchCard, id: string, change: (card: SketchCard) => SketchCard): SketchCard =>
  root.id === id ? change(root) : { ...root, children: root.children.map((child) => changeCard(child, id, change)) }

const changeItems = (sketch: Sketch, change: (items: Annotation[], layer: Layer) => Annotation[]): Sketch => ({
  ...sketch,
  layers: (sketch.layers ?? []).map((layer) => ({ ...layer, items: change(layer.items, layer) })),
})

const addItem = (sketch: Sketch, item: Annotation): Sketch => {
  const layers = sketch.layers ?? []
  const mine = layers.find((l) => l.id === AGENT_LAYER)
  return {
    ...sketch,
    layers: mine
      ? layers.map((l) => (l.id === AGENT_LAYER ? { ...l, shown: true, items: [...l.items, item] } : l))
      : [...layers, { id: AGENT_LAYER, name: 'Drawn by an agent', shown: true, snaps: true, items: [item] }],
  }
}

const levelName = (card: SketchCard): string => (card.level === 'project' ? 'the top level' : card.name)
const called = (card: SketchCard): string => `${card.kind || card.level} "${card.name}" [${card.id}]`
const asClass = (kind: string): string => kind.trim().toLowerCase().replace(/[\s_-]+/g, ' ')

/** An id made from a name, not yet used anywhere on the sketch. */
const freshId = (sketch: Sketch, name: string): string => {
  const used = new Set([...everyCard(sketch.root).map((f) => f.card.id), ...annotations(sketch).map(({ a }) => a.id)])
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'card'
  let id = base
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`
  return id
}

/** Somewhere clear on a level for a new card: beside the cards a person has
 *  already placed, or left for the canvas to lay out when none are. */
const clearSpot = (level: SketchCard): { x: number; y: number } | null => {
  const placed = level.children.filter((c) => c.x !== undefined && c.y !== undefined)
  if (!placed.length) return null
  return { x: Math.max(...placed.map((c) => c.x!)) + CARD.w + GAP, y: Math.min(...placed.map((c) => c.y!)) }
}

/** An open card's room grows to hold a card put past its edge. */
const roomFor = (level: SketchCard, spot: { x: number; y: number }): SketchCard['room'] => {
  const room = level.room
  if (!room) return room
  const x = Math.min(room.x, spot.x - 40)
  const y = Math.min(room.y, spot.y - 40)
  return { x, y, w: Math.max(room.x + room.w, spot.x + CARD.w + 40) - x, h: Math.max(room.y + room.h, spot.y + CARD.h + 40) - y }
}

/** Where free annotations go on a level when no spot is given: in a row above
 *  its cards, one after another. */
const freeSpot = (sketch: Sketch, level: SketchCard, w: number, h: number): { x: number; y: number } => {
  const mine = annotations(sketch).filter(({ a, layer }) => layer.id === AGENT_LAYER && a.at === level.id && !a.near && !a.from && !a.around)
  const placed = level.children.filter((c) => c.x !== undefined && c.y !== undefined)
  const left = placed.length ? Math.min(...placed.map((c) => c.x!)) : -300
  const top = placed.length ? Math.min(...placed.map((c) => c.y!)) : -200
  const after = mine.length ? Math.max(...mine.map(({ a }) => a.x + a.w)) + 24 : left
  return { x: Math.round(after), y: Math.round(top - h - 60) }
}

const cursorAt = (found: Found, words: string): Cursor => ({ inside: found.parent?.id ?? found.card.id, target: found.card.id, words })
const cursorOn = (a: Annotation, words: string): Cursor => ({ inside: a.at, target: a.id, words })

const ok = (sketch: Sketch, did: string, before: Cursor | null, after: Cursor): StepDone => ({ ok: true, sketch, did, before, after })
const no = (problem: string): StepDone => ({ ok: false, problem })

/** Reads a wire's kind: one of the eight, any case. */
const wireKind = (kind: string | undefined): string | null => {
  const said = (kind ?? 'uses').trim().toLowerCase()
  return WIRE_KINDS.includes(said) ? said : null
}

/** Does one step to a sketch, as the agent asked, and says where the cursor
 *  goes. Nothing is kept here; the caller keeps the sketch. */
export const applyStep = (sketch: Sketch, step: Step, savedTypes: string[] = []): StepDone => {
  const root = sketch.root
  const levelOf = (ref: string | undefined): SketchCard | string => {
    const found = findCard(root, ref ?? '')
    return typeof found === 'string' ? found : found.card
  }

  switch (step.do) {
    case 'card': {
      const level = levelOf(step.in)
      if (typeof level === 'string') return no(`The card's \`in\`: ${level}`)
      const name = step.name?.trim()
      if (!name) return no('A card needs a name.')
      const { level: at, kinds } = kindsInside(level, savedTypes)
      if (!kinds.length) return no(`A ${level.kind || level.level} has nothing inside, so nothing can be drawn in ${level.name}.`)
      const kind = step.kind ? kinds.find((k) => asClass(k) === asClass(step.kind!)) : kinds[0]
      if (!kind) return no(`"${step.kind}" is not a kind of card that goes inside ${levelName(level)}. There it can be: ${kinds.join(', ')}.`)
      if (step.id && everyCard(root).some((f) => f.card.id === step.id!.trim()))
        return no(`There is already a card with the id ${step.id}. Change it with \`change\`.`)
      const id = step.id?.trim() || freshId(sketch, name)
      const spot = step.x !== undefined && step.y !== undefined ? { x: Math.round(step.x), y: Math.round(step.y) } : clearSpot(level)
      const card: SketchCard = {
        ...blankCard(id, name, at, kind),
        says: step.says ?? '',
        at: step.at ?? '',
        ...(spot ? spot : {}),
        ...(isStore(kind) ? { fields: [], others: '' } : {}),
      }
      const next = changeCard(root, level.id, (l) => ({ ...l, children: [...l.children, card], ...(spot && l.room ? { room: roomFor(l, spot) } : {}) }))
      const words = `Adding ${kind} ${name}`
      return ok({ ...sketch, root: next }, `Added ${called(card)} inside ${levelName(level)}.`, { inside: level.id, target: '', words, ...(spot ?? {}) }, cursorAt({ card, parent: level }, words))
    }

    case 'change': {
      const anno = findAnnotation(sketch, step.what)
      if (anno) {
        const change: Partial<Annotation> = {}
        if (step.text !== undefined) change.text = step.text
        if (step.color !== undefined) change.color = step.color
        if (step.kind !== undefined) {
          const kind = annotationKind(step.kind)
          if (!kind) return no(`"${step.kind}" is not a kind of annotation.`)
          change.kind = kind.kind
        }
        for (const key of ['x', 'y', 'w', 'h'] as const) if (step[key] !== undefined) change[key] = Math.round(step[key]!)
        const moved = step.x !== undefined || step.y !== undefined
        const next = changeItems(sketch, (items) =>
          items.map((a) => {
            if (a.id !== anno.id) return a
            const changed = { ...a, ...change }
            if (moved) {
              delete changed.near
              delete changed.around
            }
            return changed
          }),
        )
        return ok(next, `Changed the annotation [${anno.id}].`, cursorOn(anno, 'Changing a note'), cursorOn(anno, 'Changed a note'))
      }
      const found = findCard(root, step.what)
      if (typeof found === 'string') return no(`Nothing to change: ${found} An annotation is named by its id.`)
      if (!found.parent) return no('The top level is not a card that can be changed.')
      let kind = found.card.kind
      if (step.kind !== undefined) {
        const { kinds } = kindsInside(found.parent, savedTypes)
        const picked = kinds.find((k) => asClass(k) === asClass(step.kind!))
        if (!picked) return no(`"${step.kind}" is not a kind of card that goes inside ${levelName(found.parent)}. There it can be: ${kinds.join(', ')}.`)
        if (found.card.children.length && kindsInside({ ...found.card, kind: picked }).kinds.length === 0)
          return no(`${found.card.name} has cards inside, and a ${picked} holds nothing. Take them out first.`)
        kind = picked
      }
      const next = changeCard(root, found.card.id, (card) => ({
        ...card,
        kind,
        ...(step.name !== undefined ? { name: step.name.trim() || card.name } : {}),
        ...(step.says !== undefined ? { says: step.says } : {}),
        ...(step.at !== undefined ? { at: step.at } : {}),
        ...(step.x !== undefined ? { x: Math.round(step.x) } : {}),
        ...(step.y !== undefined ? { y: Math.round(step.y) } : {}),
        ...(isStore(kind) && card.fields === undefined ? { fields: [], others: '' } : {}),
      }))
      return ok({ ...sketch, root: next }, `Changed ${called(found.card)}.`, cursorAt(found, `Changing ${found.card.name}`), cursorAt(found, `Changed ${found.card.name}`))
    }

    case 'remove': {
      const anno = findAnnotation(sketch, step.what)
      if (anno) {
        // A line that held it lets go, where it was.
        const spot = { x: anno.x + anno.w / 2, y: anno.y + anno.h / 2 }
        const loose = (end: AnnotationEnd | undefined): AnnotationEnd | undefined => (end && 'annotation' in end && end.annotation === anno.id ? spot : end)
        const next = changeItems(sketch, (items) =>
          items.filter((a) => a.id !== anno.id).map((a) => (a.from || a.to ? { ...a, ...(a.from ? { from: loose(a.from) } : {}), ...(a.to ? { to: loose(a.to) } : {}) } : a)),
        )
        return ok(next, `Took away the annotation [${anno.id}].`, cursorOn(anno, 'Taking a note away'), { inside: anno.at, target: '', x: spot.x, y: spot.y, words: 'Took a note away' })
      }
      const wire = findWire(root, step.what)
      if (wire) {
        const next = withoutWires(root, new Set([wire.wire.id]))
        return ok({ ...sketch, root: next }, `Took away the wire [${wire.wire.id}].`, { inside: wire.level.id, target: wire.wire.from, words: 'Taking a wire away' }, { inside: wire.level.id, target: wire.wire.to, words: 'Took a wire away' })
      }
      const found = findCard(root, step.what)
      if (typeof found === 'string') return no(`Nothing to take away: ${found} A wire is named by its id or as \`from -> to\`; an annotation by its id.`)
      if (!found.parent) return no('The top level cannot be taken away.')
      const gone = new Set(everyCard(found.card).map((f) => f.card.id))
      const wires = new Set(found.parent.wires.filter((w) => w.from === found.card.id || w.to === found.card.id).map((w) => w.id))
      const next = withoutWires(changeCard(root, found.parent.id, (l) => ({ ...l, children: l.children.filter((c) => c.id !== found.card.id) })), wires)
      const held = (end: AnnotationEnd | undefined): boolean => Boolean(end && 'card' in end && gone.has(end.card))
      const tidy = changeItems({ ...sketch, root: next }, (items) =>
        items
          .filter((a) => !gone.has(a.at) && !(a.near && gone.has(a.near.card)) && !held(a.from) && !held(a.to))
          .map((a) => (a.around ? { ...a, around: a.around.filter((id) => !gone.has(id)) } : a))
          .filter((a) => !a.around || a.around.length),
      )
      return ok(tidy, `Took away ${called(found.card)}, with its wires and what was inside it.`, cursorAt(found, `Taking ${found.card.name} away`), {
        inside: found.parent.id,
        target: '',
        ...(found.card.x !== undefined && found.card.y !== undefined ? { x: found.card.x, y: found.card.y } : {}),
        words: `Took ${found.card.name} away`,
      })
    }

    case 'wire': {
      const kind = wireKind(step.kind)
      if (!kind) return no(`"${step.kind}" is not a kind of wire. It is one of ${WIRE_KINDS.join(', ')}.`)
      const from = findCard(root, step.from)
      const to = findCard(root, step.to)
      if (typeof from === 'string') return no(`The wire's \`from\`: ${from}`)
      if (typeof to === 'string') return no(`The wire's \`to\`: ${to}`)
      const joined = joinCards(root, from.card.id, to.card.id, { kind, words: step.words?.trim() ?? '' })
      if (typeof joined === 'string') return no(joined)
      return ok(
        { ...sketch, root: joined.root },
        `Wired ${called(from.card)} to ${called(to.card)}: ${kind}${step.words ? ` ${step.words}` : ''}.`,
        cursorAt(from, `Wiring ${from.card.name} to ${to.card.name}`),
        cursorAt(to, `Wired ${from.card.name} to ${to.card.name}`),
      )
    }

    case 'fields': {
      const found = findCard(root, step.store)
      if (typeof found === 'string') return no(`The store: ${found}`)
      if (!isStore(found.card.kind)) return no(`${found.card.name} is a ${found.card.kind}; only a store or an inner store has fields.`)
      let fields: SketchCard['fields'] = null
      if (!step.unknown) {
        fields = []
        for (const said of step.fields ?? []) {
          const field = readField(said)
          if (typeof field === 'string') return no(`In the fields of ${found.card.name}: ${field}`)
          fields.push(field)
        }
      }
      const next = changeCard(root, found.card.id, (card) => ({ ...card, fields, others: step.open ?? '' }))
      return ok(
        { ...sketch, root: next },
        fields ? `Gave ${called(found.card)} ${fields.length} fields${step.open ? `, open to ${step.open}` : ', fixed'}.` : `Said the shape of ${called(found.card)} is unknown.`,
        cursorAt(found, `Writing the fields of ${found.card.name}`),
        cursorAt(found, `Wrote the fields of ${found.card.name}`),
      )
    }

    case 'note': {
      const kind = annotationKind(step.kind ?? 'sticky')
      if (!kind) return no(`"${step.kind}" is not a kind of annotation. Notes are text, sticky, callout, list and code; shapes are rect, diamond, circle, cloud and the rest the instructions list.`)
      if (kind.group === 'line') return no(`A ${kind.name.toLowerCase()} joins two things: draw it with \`line\`.`)
      if (kind.group === 'frame') return no(`A ${kind.name.toLowerCase()} goes round what it holds: draw it with \`frame\`.`)
      const w = Math.round(step.w ?? kind.w)
      const h = Math.round(step.h ?? kind.h)
      const id = freshId(sketch, `note-${kind.kind}`)
      let item: Annotation
      if (step.near) {
        const near = findCard(root, step.near)
        if (typeof near === 'string') return no(`The note's \`near\`: ${near}`)
        if (!near.parent) return no('A note keeps beside a card, not the top level. Leave `near` out to put it on the level.')
        const dx = 0
        const dy = -(h + 24)
        item = { id, at: near.parent.id, kind: kind.kind, x: (near.card.x ?? 0) + dx, y: (near.card.y ?? 0) + dy, w, h, text: step.text, color: step.color ?? (kind.kind === 'sticky' ? 'yellow' : ''), near: { card: near.card.id, dx, dy } }
      } else {
        const level = levelOf(step.in)
        if (typeof level === 'string') return no(`The note's \`in\`: ${level}`)
        const spot = step.x !== undefined && step.y !== undefined ? { x: Math.round(step.x), y: Math.round(step.y) } : freeSpot(sketch, level, w, h)
        item = { id, at: level.id, kind: kind.kind, ...spot, w, h, text: step.text, color: step.color ?? (kind.kind === 'sticky' ? 'yellow' : '') }
      }
      const where = findCard(root, item.at)
      const words = `Writing a ${kind.name.toLowerCase()}`
      return ok(
        addItem(sketch, item),
        `Put a ${kind.name.toLowerCase()} [${id}] on ${typeof where === 'string' ? 'the sketch' : levelName(where.card)}.`,
        item.near ? { inside: item.at, target: item.near.card, words } : { inside: item.at, target: '', x: item.x + w / 2, y: item.y + h / 2, words },
        cursorOn(item, `Wrote a ${kind.name.toLowerCase()}`),
      )
    }

    case 'line': {
      const kind = annotationKind(step.kind ?? 'arrow')
      if (!kind || kind.group !== 'line') return no(`"${step.kind}" is not a kind of line. It is one of arrow, line, dashed, curve or wire.`)
      const ends: { end: AnnotationEnd; level: string | null }[] = []
      for (const [which, said] of [['from', step.from], ['to', step.to]] as const) {
        if (typeof said !== 'string') {
          ends.push({ end: { x: Math.round(said.x), y: Math.round(said.y) }, level: null })
          continue
        }
        const anno = findAnnotation(sketch, said)
        if (anno) {
          ends.push({ end: { annotation: anno.id }, level: anno.at })
          continue
        }
        const card = findCard(root, said)
        if (typeof card === 'string') return no(`The line's \`${which}\`: ${card}`)
        if (!card.parent) return no(`The line's \`${which}\` is the top level; name a card or an annotation on it, or give a spot.`)
        ends.push({ end: { card: card.card.id }, level: card.parent.id })
      }
      const levels = [...new Set(ends.map((e) => e.level).filter((l): l is string => l !== null))]
      if (levels.length > 1) return no('A line joins two things on the same level; these two are inside different cards.')
      let at = levels[0]
      if (!at) {
        const level = levelOf(step.in)
        if (typeof level === 'string') return no(`The line's \`in\`: ${level}`)
        at = level.id
      }
      const id = freshId(sketch, `line-${kind.kind}`)
      const item: Annotation = { id, at, kind: kind.kind, x: 0, y: 0, w: kind.w, h: 0, text: step.text ?? '', color: '', from: ends[0]!.end, to: ends[1]!.end }
      const aim = (end: AnnotationEnd, words: string): Cursor =>
        'x' in end ? { inside: at!, target: '', x: end.x, y: end.y, words } : { inside: at!, target: 'card' in end ? end.card : end.annotation, words }
      return ok(addItem(sketch, item), `Drew a ${kind.name.toLowerCase()} [${id}].`, aim(item.from!, `Drawing a ${kind.name.toLowerCase()}`), aim(item.to!, `Drew a ${kind.name.toLowerCase()}`))
    }

    case 'frame': {
      const kind = annotationKind(step.kind ?? 'frame')
      if (!kind || kind.group !== 'frame') return no(`"${step.kind}" is not a kind of frame. It is one of frame, rounded, oval, lane, column, bracket or braces.`)
      const held: Found[] = []
      for (const ref of step.around ?? []) {
        const found = findCard(root, ref)
        if (typeof found === 'string') return no(`The frame's \`around\`: ${found}`)
        if (!found.parent) return no('A frame goes round cards on a level, not the top level itself.')
        held.push(found)
      }
      const levels = [...new Set(held.map((f) => f.parent!.id))]
      if (levels.length > 1) return no('A frame goes round cards on one level; these are inside different cards.')
      const level = levels[0] ? levelOf(levels[0]) : levelOf(step.in)
      if (typeof level === 'string') return no(`The frame's \`in\`: ${level}`)
      if (!held.length && (step.x === undefined || step.y === undefined))
        return no('A frame needs the cards it goes `around`, or a spot to sit at with `x` and `y`.')
      const placed = held.filter((f) => f.card.x !== undefined && f.card.y !== undefined)
      const pad = 40
      const box =
        step.x !== undefined && step.y !== undefined
          ? { x: Math.round(step.x), y: Math.round(step.y), w: Math.round(step.w ?? kind.w), h: Math.round(step.h ?? kind.h) }
          : placed.length === held.length
            ? (() => {
                const x = Math.min(...placed.map((f) => f.card.x!)) - pad
                const y = Math.min(...placed.map((f) => f.card.y!)) - pad - 24
                return { x, y, w: Math.max(...placed.map((f) => f.card.x! + CARD.w)) + pad - x, h: Math.max(...placed.map((f) => f.card.y! + CARD.h)) + pad - y }
              })()
            : { x: 0, y: 0, w: kind.w, h: kind.h }
      const id = freshId(sketch, `frame-${kind.kind}`)
      const item: Annotation = {
        id,
        at: level.id,
        kind: kind.kind,
        ...box,
        text: step.text,
        color: step.color ?? '',
        ...(held.length && step.x === undefined ? { around: held.map((f) => f.card.id) } : {}),
      }
      const words = `Drawing a ${kind.name.toLowerCase()} round ${held.map((f) => f.card.name).join(', ') || 'a spot'}`
      return ok(
        addItem(sketch, item),
        `Drew a ${kind.name.toLowerCase()} [${id}] "${step.text}"${held.length ? ` round ${held.map((f) => called(f.card)).join(', ')}` : ''}.`,
        held[0] ? cursorAt(held[0], words) : { inside: level.id, target: '', x: box.x, y: box.y, words },
        cursorOn(item, `Drew a ${kind.name.toLowerCase()}`),
      )
    }

    case 'point': {
      const words = step.words?.trim() ?? ''
      if (typeof step.at !== 'string') {
        const level = levelOf(step.in)
        if (typeof level === 'string') return no(`The point's \`in\`: ${level}`)
        const cursor = { inside: level.id, target: '', x: Math.round(step.at.x), y: Math.round(step.at.y), words }
        return ok(sketch, `Pointed at a spot on ${levelName(level)}.`, null, cursor)
      }
      const anno = findAnnotation(sketch, step.at)
      if (anno) return ok(sketch, `Pointed at the annotation [${anno.id}].`, null, cursorOn(anno, words))
      const found = findCard(root, step.at)
      if (typeof found === 'string') return no(`Nothing to point at: ${found}`)
      return ok(sketch, `Pointed at ${found.parent ? called(found.card) : 'the top level'}.`, null, cursorAt(found, words))
    }
  }
  return no(`"${(step as { do: string }).do}" is not a step. A step is card, change, remove, wire, fields, note, line, frame or point.`)
}

/** A wire by its id, or as `from -> to` by the cards' ids or names. */
const findWire = (root: SketchCard, ref: string): { wire: SketchWire; level: SketchCard } | null => {
  const all = everyCard(root).flatMap(({ card }) => card.wires.map((wire) => ({ wire, level: card })))
  const byId = all.find((w) => w.wire.id === ref.trim())
  if (byId) return byId
  const ends = /^(.+?)\s*-+>\s*(.+)$/.exec(ref.trim())
  if (!ends) return null
  const from = findCard(root, ends[1]!)
  const to = findCard(root, ends[2]!)
  if (typeof from === 'string' || typeof to === 'string') return null
  // A wire reaching into a card runs on from a hub to the part inside, so it is
  // found by either: the card, or the part it really reaches.
  const reaches = (wire: SketchWire, level: SketchCard, end: 'from' | 'to'): string[] => {
    const card = level.children.find((c) => c.id === wire[end])
    const inner = (card?.wires ?? []).filter((w) => (end === 'from' ? w.to : w.from) === hubOf(wire.id)).map((w) => (end === 'from' ? w.from : w.to))
    return [wire[end], ...inner]
  }
  return all.find((w) => reaches(w.wire, w.level, 'from').includes(from.card.id) && reaches(w.wire, w.level, 'to').includes(to.card.id)) ?? null
}

/** The tree without some wires, and without the wires inside cards that ran on
 *  from them through a hub. */
const withoutWires = (root: SketchCard, ids: Set<string>): SketchCard => {
  const strip = (card: SketchCard): SketchCard => ({
    ...card,
    wires: card.wires.filter((w) => !ids.has(w.id) && !ids.has(wireOfHub(w.from)) && !ids.has(wireOfHub(w.to))),
    children: card.children.map(strip),
  })
  return strip(root)
}

/** Joins two cards as a flowchart does: on the level both are on, or reaching
 *  one level into a card from beside it, through a hub on its border. */
const joinCards = (root: SketchCard, fromId: string, toId: string, said: { kind: string; words: string }): { root: SketchCard } | string => {
  if (fromId === toId) return 'A wire cannot run from a card to itself.'
  const parent = new Map<string, string>()
  const cards = new Map<string, SketchCard>()
  for (const { card, parent: p } of everyCard(root)) {
    cards.set(card.id, card)
    if (p) parent.set(card.id, p.id)
  }
  const pathOf = (id: string): string[] => {
    const path: string[] = []
    for (let at: string | undefined = id; at; at = parent.get(at)) path.unshift(at)
    return path
  }
  const a = pathOf(fromId)
  const b = pathOf(toId)
  let k = 0
  while (k < a.length && k < b.length && a[k] === b[k]) k += 1
  const nameOf = (id: string): string => cards.get(id)?.name ?? id
  if (k === a.length || k === b.length) {
    const [outer, inner] = k === a.length ? [fromId, toId] : [toId, fromId]
    return `${nameOf(inner)} is inside ${nameOf(outer)}, so no wire can join them.`
  }
  const deep = [a, b].find((path) => path.length - k > 2)
  if (deep) return `A wire can reach only one level into a card, and ${nameOf(deep[deep.length - 1]!)} is deeper inside ${nameOf(deep[k]!)}. Wire it to the card it is in instead.`
  const from = a[k]!
  const to = b[k]!
  const level = a[k - 1]!
  const outerWire: SketchWire = { id: randomUUID(), from, to, ...said }
  let next = changeCard(root, level, (l) => ({ ...l, wires: [...l.wires, outerWire] }))
  if (a.length - k === 2) next = changeCard(next, from, (c) => ({ ...c, wires: [...c.wires, { id: randomUUID(), from: fromId, to: hubOf(outerWire.id), ...said }] }))
  if (b.length - k === 2) next = changeCard(next, to, (c) => ({ ...c, wires: [...c.wires, { id: randomUUID(), from: hubOf(outerWire.id), to: toId, ...said }] }))
  return { root: next }
}
