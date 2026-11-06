// codegraph: module sketches
// codegraph: store sketches as Sketch
import type { Layer } from '../annotations/index.js'

export type Level = 'project' | 'system' | 'container' | 'component' | 'code'

/** A line between two cards inside one card, drawn by a person. */
export type SketchWire = {
  id: string
  from: string
  to: string
  kind: string
  words: string
  /** Over the map, drawing a proposal: drawn new, or crossed out. */
  state?: CardState
  /** Where a person put its sentence, by its middle; left out, the canvas
   *  lays it out itself. */
  x?: number
  y?: number
}

/** How a card or wire drawn over the map stands: drawn new and not built
 *  yet, drawn and built, or crossed out to be taken away. */
export type CardState = 'proposed' | 'built' | 'gone'

/** Words a person puts anywhere on a level of a sketch. */
export type Note = { id: string; text: string; x: number; y: number }

/** How a card of a person's own type looks: an icon by name, the shape it is
 *  drawn in, and a colour by name. */
export type CardShape = 'square' | 'pill' | 'circle' | 'diamond' | 'triangle' | 'hexagon' | 'parallelogram' | 'person'
export type CardLook = { icon: string; shape: CardShape; color: string }

/** A hub is where a wire to an open card meets its border. A wire drawn inside
 *  that card names the hub as one of its ends, to say which part inside the
 *  wire really reaches. Its name is the wire's id with a mark in front. */
const HUB = 'hub:'
export const hubOf = (wireId: string): string => `${HUB}${wireId}`
export const isHub = (id: string): boolean => id.startsWith(HUB)
/** The wire a hub belongs to; '' for anything that is not a hub. */
export const wireOfHub = (id: string): string => (isHub(id) ? id.slice(HUB.length) : '')

/** One card in a sketch, with what is drawn inside it. It has the same shape
 *  as a card on the map, so the canvas draws both, and a snapshot of the map
 *  is a sketch as it stands. */
export type SketchCard = {
  id: string
  name: string
  level: Level
  /** Its type: a kind the app knows, or a name a person gave it. */
  kind: string
  /** How a card of a person's own type looks; left out, its kind decides. */
  look?: CardLook
  says: string
  at: string
  start: boolean
  setUp: boolean
  names: string[]
  shot: string
  /** A page's mockup, by file name beside the sketch; '' for none. */
  mockup: string
  /** Over the map, drawing a proposal: drawn new, or crossed out. */
  state?: CardState
  /** Where a person put it; left out, the canvas lays it out itself. */
  x?: number
  y?: number
  /** How much room it has when open, in the space its insides are laid out
   *  in; left out, it gets most of the screen. */
  room?: { x: number; y: number; w: number; h: number }
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
  /** What is drawn over it that is not the diagram; left out, none. */
  layers?: Layer[]
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
