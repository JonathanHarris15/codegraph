// codegraph: module annotations

/** One kind of annotation, as an agent asks for it: what it is called, which
 *  group it is in, and the size it is put down at. The canvas's library draws
 *  each one; a test holds the two lists to each other. */
export type AnnotationKind = {
  kind: string
  name: string
  /** A note carries words, a line joins two things, a frame goes round what it
   *  holds, and a shape is an outline with a label in it. */
  group: 'note' | 'line' | 'frame' | 'shape'
  w: number
  h: number
}

const note = (kind: string, name: string, w: number, h: number): AnnotationKind => ({ kind, name, group: 'note', w, h })
const line = (kind: string, name: string, w: number): AnnotationKind => ({ kind, name, group: 'line', w, h: 0 })
const frame = (kind: string, name: string, w: number, h: number): AnnotationKind => ({ kind, name, group: 'frame', w, h })
const shape = (kind: string, name: string, w: number, h: number): AnnotationKind => ({ kind, name, group: 'shape', w, h })

/** Every kind the library offers, in its order. */
export const annotationKinds: AnnotationKind[] = [
  note('text', 'Text', 160, 40),
  note('sticky', 'Sticky note', 180, 110),
  note('callout', 'Callout', 170, 100),
  note('list', 'List', 180, 140),
  note('code', 'Code block', 220, 110),
  line('arrow', 'Arrow', 160),
  line('line', 'Line', 160),
  line('dashed', 'Dashed line', 160),
  line('curve', 'Bending line', 160),
  line('wire', 'Wire with words', 220),
  frame('frame', 'Frame', 320, 220),
  frame('rounded', 'Rounded frame', 320, 220),
  frame('oval', 'Oval frame', 320, 220),
  frame('lane', 'Swimlane', 520, 160),
  frame('column', 'Column', 220, 420),
  frame('bracket', 'Bracket', 300, 160),
  frame('braces', 'Braces', 300, 160),
  shape('rect', 'Rectangle', 140, 80),
  shape('diamond', 'Diamond', 140, 100),
  shape('terminator', 'Start or end', 140, 60),
  shape('circle', 'Circle', 90, 90),
  shape('hexagon', 'Hexagon', 150, 86),
  shape('data', 'Data', 150, 80),
  shape('database', 'Database', 110, 120),
  shape('document', 'Document', 140, 90),
  shape('documents', 'Many documents', 150, 100),
  shape('predefined', 'Predefined process', 150, 80),
  shape('input', 'Manual input', 140, 80),
  shape('stored', 'Stored data', 140, 80),
  shape('internal', 'Internal storage', 120, 100),
  shape('delay', 'Delay', 130, 80),
  shape('display', 'Display', 150, 80),
  shape('manual', 'Manual operation', 140, 80),
  shape('offpage', 'Off-page link', 90, 90),
  shape('merge', 'Merge', 90, 80),
  shape('junction', 'Summing junction', 60, 60),
  shape('or', 'Or', 60, 60),
  shape('braceleft', 'Note brace', 40, 120),
  shape('braceright', 'Note brace, right', 40, 120),
  shape('triangle', 'Triangle', 100, 90),
  shape('pentagon', 'Pentagon', 100, 100),
  shape('octagon', 'Octagon', 100, 100),
  shape('star', 'Star', 100, 100),
  shape('cross', 'Cross', 90, 90),
  shape('cloud', 'Cloud', 140, 100),
  shape('tag', 'Tag', 120, 60),
  shape('chevron', 'Chevron', 120, 60),
  shape('right', 'Arrow right', 120, 70),
  shape('left', 'Arrow left', 120, 70),
  shape('up', 'Arrow up', 70, 120),
  shape('down', 'Arrow down', 70, 120),
  shape('across', 'Arrow both ways', 140, 70),
  shape('updown', 'Arrow up and down', 70, 140),
]

const byKind = new Map(annotationKinds.map((k) => [k.kind, k]))

/** One kind by its name, or by what it is called, any case. */
export const annotationKind = (asked: string): AnnotationKind | undefined => {
  const said = asked.trim().toLowerCase()
  return byKind.get(said) ?? annotationKinds.find((k) => k.name.toLowerCase() === said)
}
