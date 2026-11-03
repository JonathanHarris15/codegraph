// codegraph: module sketches
// codegraph: store sketches as Sketch

export type Level = 'project' | 'system' | 'container' | 'component' | 'code'

/** A line between two cards inside one card, drawn by a person. */
export type SketchWire = { id: string; from: string; to: string; kind: string; words: string }

/** Words a person puts anywhere on a level of a sketch. */
export type Note = { id: string; text: string; x: number; y: number }

/** One card in a sketch, with what is drawn inside it. It has the same shape
 *  as a card on the map, so the canvas draws both, and a snapshot of the map
 *  is a sketch as it stands. */
export type SketchCard = {
  id: string
  name: string
  level: Level
  kind: string
  says: string
  at: string
  start: boolean
  setUp: boolean
  names: string[]
  shot: string
  /** A page's mockup, by file name beside the sketch; '' for none. */
  mockup: string
  /** Where a person put it; left out, the canvas lays it out itself. */
  x?: number
  y?: number
  children: SketchCard[]
  wires: SketchWire[]
  notes: Note[]
}

/** A drawing kept with a project, not read from any repo. */
export type Sketch = {
  id: string
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
  /** Where it started: '' for a blank one, or the map it was a snapshot of. */
  from: string
  root: SketchCard
}

export const blankCard = (id: string, name: string, level: Level, kind = ''): SketchCard => ({
  id,
  name,
  level,
  kind,
  says: '',
  at: '',
  start: false,
  setUp: true,
  names: [],
  shot: '',
  mockup: '',
  children: [],
  wires: [],
  notes: [],
})
