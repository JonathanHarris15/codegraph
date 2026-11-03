// codegraph: component sketch-editor
import type { Level, Note, SketchCard, SketchWire } from '../../modules/sketches/index.js'
import type { Arrangement } from './map-canvas.js'
import { blankCard } from '../../modules/sketches/schema.js'
import { sizeOf } from './map-layout.js'

/** The level drawn inside a card of each level. */
export const levelInside: Record<Level, Level> = {
  project: 'system',
  system: 'container',
  container: 'component',
  component: 'code',
  code: 'code',
}

/** The kinds a card can be at each level, the usual first. */
export const kindsAt: Record<Level, string[]> = {
  project: ['project'],
  system: ['software system', 'shallow software system'],
  container: ['web app', 'browser app', 'server', 'desktop app', 'mobile app', 'database', 'files on disk', 'function', 'command-line tool'],
  component: ['page', 'feature', 'module', 'trigger'],
  code: ['file'],
}

export const wireKinds = ['uses', 'acts on', 'shows', 'starts', 'keeps', 'leads to', 'calls']

/** The kind a wire drawn between two cards most likely is, which the person
 *  can change. */
const kindBetween = (from: SketchCard | undefined, to: SketchCard | undefined): string =>
  from?.kind === 'page' && to?.kind === 'page'
    ? 'leads to'
    : from?.kind === 'page' && to?.kind === 'feature'
      ? 'acts on'
      : from?.kind === 'page' && to?.kind === 'module'
        ? 'shows'
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

/** Pins every card on a level where the canvas shows it. */
const pinned = (card: SketchCard, arrangement: Arrangement): SketchCard => {
  const at = new Map(arrangement.map((a) => [a.id, a]))
  return {
    ...card,
    children: card.children.map((child) => {
      const spot = at.get(child.id)
      return spot ? { ...child, x: spot.x, y: spot.y } : child
    }),
  }
}

/** A new card where the person clicked, centred on the click. */
export const placeCard = (focus: SketchCard, at: { x: number; y: number }, arrangement: Arrangement): [SketchCard, string] => {
  const level = levelInside[focus.level]
  const card = blankCard(newId(), '', level, kindsAt[level][0] ?? '')
  const { w, h } = sizeOf(card)
  return [{ ...pinned(focus, arrangement), children: [...focus.children, { ...card, x: at.x - w / 2, y: at.y - h / 2 }] }, card.id]
}

export const placeNote = (focus: SketchCard, at: { x: number; y: number }, arrangement: Arrangement): [SketchCard, string] => {
  const note: Note = { id: newId(), text: '', x: at.x - 90, y: at.y - 30 }
  return [{ ...pinned(focus, arrangement), notes: [...focus.notes, note] }, note.id]
}

export const moveThing = (focus: SketchCard, id: string, at: { x: number; y: number }, arrangement: Arrangement): SketchCard => {
  const level = pinned(focus, arrangement)
  return {
    ...level,
    children: level.children.map((c) => (c.id === id ? { ...c, x: at.x, y: at.y } : c)),
    notes: level.notes.map((n) => (n.id === id ? { ...n, x: at.x, y: at.y } : n)),
  }
}

export const addWire = (focus: SketchCard, from: string, to: string): [SketchCard, string] => {
  const wire: SketchWire = {
    id: newId(),
    from,
    to,
    kind: kindBetween(focus.children.find((c) => c.id === from), focus.children.find((c) => c.id === to)),
    words: '',
  }
  return [{ ...focus, wires: [...focus.wires, wire] }, wire.id]
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

export const changeWire = (focus: SketchCard, id: string, change: Partial<SketchWire>): SketchCard => ({
  ...focus,
  wires: focus.wires.map((w) => (w.id === id ? { ...w, ...change } : w)),
})

export const changeNote = (focus: SketchCard, id: string, change: Partial<Note>): SketchCard => ({
  ...focus,
  notes: focus.notes.map((n) => (n.id === id ? { ...n, ...change } : n)),
})

/** Takes a card, wire or note off a level, and any wire left with a loose end. */
export const remove = (focus: SketchCard, id: string): SketchCard => ({
  ...focus,
  children: focus.children.filter((c) => c.id !== id),
  wires: focus.wires.filter((w) => w.id !== id && w.from !== id && w.to !== id),
  notes: focus.notes.filter((n) => n.id !== id),
})
