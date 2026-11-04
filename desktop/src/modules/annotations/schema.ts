// codegraph: module annotations
// codegraph: store annotations as Layer

/** Where one end of a line sits: a spot on the level, a card of the
 *  diagram, or another annotation. */
export type AnnotationEnd = { x: number; y: number } | { card: string } | { annotation: string }

/** Something drawn over a map or a sketch for people and agents to read:
 *  text, a sticky note, a shape, a line. It is not part of the diagram and
 *  never drives the code. */
export type Annotation = {
  id: string
  /** The card whose insides it is drawn on: the level it belongs to. */
  at: string
  /** Which shape from the library: `text`, `sticky`, `diamond`, `arrow`… */
  kind: string
  /** Where it sits on its level, and how big. */
  x: number
  y: number
  w: number
  h: number
  /** A card of the diagram it keeps beside, by how far from the card's
   *  corner, so it moves when the card does. */
  near?: { card: string; dx: number; dy: number }
  text: string
  /** A colour by name, from the library's few; '' for the shape's own. */
  color: string
  /** The two ends of a line or an arrow. */
  from?: AnnotationEnd
  to?: AnnotationEnd
}

/** A set of annotations shown or hidden together. Whether its annotations
 *  line up with the diagram's cards, and keep beside them, is its own call;
 *  the diagram never lines up with them. */
export type Layer = {
  id: string
  name: string
  shown: boolean
  snaps: boolean
  items: Annotation[]
}

export const firstLayer = (id: string): Layer => ({ id, name: 'Annotations', shown: true, snaps: true, items: [] })
