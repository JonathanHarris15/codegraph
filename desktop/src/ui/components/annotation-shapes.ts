// codegraph: component annotation-layer

/** One shape a person can put down as an annotation. Its outline is drawn
 *  in a 100 by 100 box, stretched to whatever size it is given. */
export type AnnotationShape = {
  kind: string
  name: string
  /** The outline, as SVG path data, or none for text and lines. */
  d: string
  /** Size when put down with a click. */
  w: number
  h: number
  /** Drawn behind the diagram's cards, as a frame round them is. */
  behind?: boolean
  /** Drawn from one end to the other, not as a box. */
  line?: boolean
  /** Its own fill when no colour is picked. */
  color?: string
  /** Words other than the name to find it by. */
  also?: string
}

const box = 'M2 2 H98 V98 H2 Z'

export const SHAPE_GROUPS: { name: string; shapes: AnnotationShape[] }[] = [
  {
    name: 'Standard',
    shapes: [
      { kind: 'text', name: 'Text', d: '', w: 160, h: 40, also: 'words label' },
      { kind: 'sticky', name: 'Sticky note', d: 'M0 0 H100 V82 L82 100 H0 Z', w: 180, h: 110, color: 'yellow', also: 'note' },
      { kind: 'callout', name: 'Callout', d: 'M2 2 H98 V72 H40 L22 98 L26 72 H2 Z', w: 170, h: 100, also: 'speech bubble comment' },
      { kind: 'arrow', name: 'Arrow', d: '', w: 160, h: 0, line: true, also: 'connector line' },
      { kind: 'line', name: 'Line', d: '', w: 160, h: 0, line: true, also: 'connector' },
      { kind: 'dashed', name: 'Dashed line', d: '', w: 160, h: 0, line: true, also: 'connector' },
      { kind: 'frame', name: 'Frame', d: box, w: 360, h: 240, behind: true, also: 'group container section' },
      { kind: 'list', name: 'List', d: box, w: 180, h: 140, also: 'bullets checklist' },
      { kind: 'code', name: 'Code block', d: box, w: 220, h: 110, also: 'snippet' },
    ],
  },
  {
    name: 'Flowchart',
    shapes: [
      { kind: 'process', name: 'Process', d: box, w: 140, h: 80 },
      { kind: 'decision', name: 'Decision', d: 'M50 2 L98 50 L50 98 L2 50 Z', w: 140, h: 100, also: 'diamond' },
      { kind: 'terminator', name: 'Start or end', d: 'M25 2 H75 A23 48 0 0 1 75 98 H25 A23 48 0 0 1 25 2 Z', w: 140, h: 60, also: 'terminator pill' },
      { kind: 'predefined', name: 'Predefined process', d: 'M2 2 H98 V98 H2 Z M14 2 V98 M86 2 V98', w: 150, h: 80, also: 'subroutine' },
      { kind: 'document', name: 'Document', d: 'M2 2 H98 V82 C75 70 60 100 40 92 C25 86 12 84 2 88 Z', w: 140, h: 90 },
      { kind: 'documents', name: 'Many documents', d: 'M12 2 H98 V72 H90 M6 8 H92 V78 H84 M2 14 H86 V84 C66 76 52 100 34 92 C20 87 10 86 2 90 Z', w: 150, h: 100 },
      { kind: 'input', name: 'Manual input', d: 'M2 30 L98 2 V98 H2 Z', w: 140, h: 80 },
      { kind: 'preparation', name: 'Preparation', d: 'M20 2 H80 L98 50 L80 98 H20 L2 50 Z', w: 150, h: 80, also: 'hexagon' },
      { kind: 'data', name: 'Data', d: 'M22 2 H98 L78 98 H2 Z', w: 150, h: 80, also: 'parallelogram input output' },
      { kind: 'database', name: 'Database', d: 'M2 14 A48 12 0 0 1 98 14 V86 A48 12 0 0 1 2 86 Z M2 14 A48 12 0 0 0 98 14', w: 110, h: 120, also: 'cylinder store' },
      { kind: 'stored', name: 'Stored data', d: 'M18 2 H98 A16 48 0 0 0 98 98 H18 A16 48 0 0 1 18 2 Z', w: 140, h: 80 },
      { kind: 'internal', name: 'Internal storage', d: 'M2 2 H98 V98 H2 Z M16 2 V98 M2 16 H98', w: 120, h: 100 },
      { kind: 'delay', name: 'Delay', d: 'M2 2 H60 A38 48 0 0 1 60 98 H2 Z', w: 130, h: 80 },
      { kind: 'display', name: 'Display', d: 'M2 50 L22 2 H76 A22 48 0 0 1 76 98 H22 Z', w: 150, h: 80 },
      { kind: 'manual', name: 'Manual operation', d: 'M2 2 H98 L80 98 H20 Z', w: 140, h: 80, also: 'trapezoid' },
      { kind: 'offpage', name: 'Off-page link', d: 'M2 2 H98 V64 L50 98 L2 64 Z', w: 90, h: 90 },
      { kind: 'merge', name: 'Merge', d: 'M2 2 H98 L50 98 Z', w: 90, h: 80, also: 'triangle' },
      { kind: 'connector', name: 'Connector', d: 'M50 2 A48 48 0 1 1 49.9 2 Z', w: 60, h: 60, also: 'circle' },
      { kind: 'junction', name: 'Summing junction', d: 'M50 2 A48 48 0 1 1 49.9 2 Z M16 16 L84 84 M84 16 L16 84', w: 60, h: 60 },
      { kind: 'or', name: 'Or', d: 'M50 2 A48 48 0 1 1 49.9 2 Z M50 2 V98 M2 50 H98', w: 60, h: 60 },
      { kind: 'braceleft', name: 'Note brace', d: 'M60 2 C40 2 40 10 40 30 C40 45 30 50 20 50 C30 50 40 55 40 70 C40 90 40 98 60 98', w: 40, h: 120, also: 'curly bracket' },
      { kind: 'braceright', name: 'Note brace, right', d: 'M40 2 C60 2 60 10 60 30 C60 45 70 50 80 50 C70 50 60 55 60 70 C60 90 60 98 40 98', w: 40, h: 120, also: 'curly bracket' },
    ],
  },
  {
    name: 'Containers',
    shapes: [
      { kind: 'box', name: 'Box', d: box, w: 320, h: 220, behind: true, also: 'rectangle group' },
      { kind: 'rounded', name: 'Rounded box', d: 'M12 2 H88 Q98 2 98 12 V88 Q98 98 88 98 H12 Q2 98 2 88 V12 Q2 2 12 2 Z', w: 320, h: 220, behind: true },
      { kind: 'oval', name: 'Oval', d: 'M50 2 A48 48 0 1 1 49.9 2 Z', w: 320, h: 220, behind: true, also: 'ellipse circle' },
      { kind: 'lane', name: 'Swimlane', d: 'M2 2 H98 V98 H2 Z M2 2 V98 M10 2 V98', w: 520, h: 160, behind: true, also: 'pool row' },
      { kind: 'column', name: 'Column', d: 'M2 2 H98 V98 H2 Z M2 10 H98', w: 200, h: 420, behind: true, also: 'lane' },
      { kind: 'bracket', name: 'Bracket', d: 'M30 2 H6 V98 H30 M70 2 H94 V98 H70', w: 300, h: 160, behind: true, also: 'brackets' },
      { kind: 'braces', name: 'Braces', d: 'M20 2 C8 2 8 10 8 30 C8 45 4 50 2 50 C4 50 8 55 8 70 C8 90 8 98 20 98 M80 2 C92 2 92 10 92 30 C92 45 96 50 98 50 C96 50 92 55 92 70 C92 90 92 98 80 98', w: 300, h: 160, behind: true },
    ],
  },
  {
    name: 'Shapes',
    shapes: [
      { kind: 'rect', name: 'Rectangle', d: box, w: 120, h: 80 },
      { kind: 'triangle', name: 'Triangle', d: 'M50 2 L98 98 H2 Z', w: 100, h: 90 },
      { kind: 'pentagon', name: 'Pentagon', d: 'M50 2 L98 38 L80 98 H20 L2 38 Z', w: 100, h: 100 },
      { kind: 'hexagon', name: 'Hexagon', d: 'M25 2 H75 L98 50 L75 98 H25 L2 50 Z', w: 110, h: 96 },
      { kind: 'octagon', name: 'Octagon', d: 'M30 2 H70 L98 30 V70 L70 98 H30 L2 70 V30 Z', w: 100, h: 100, also: 'stop' },
      { kind: 'cross', name: 'Cross', d: 'M35 2 H65 V35 H98 V65 H65 V98 H35 V65 H2 V35 H35 Z', w: 90, h: 90, also: 'plus' },
      { kind: 'cloud', name: 'Cloud', d: 'M26 82 C8 82 2 66 12 56 C4 40 18 26 32 32 C36 14 60 10 68 26 C82 20 96 32 90 48 C100 56 96 82 76 82 Z', w: 140, h: 100 },
      { kind: 'circle', name: 'Circle', d: 'M50 2 A48 48 0 1 1 49.9 2 Z', w: 90, h: 90, also: 'ellipse' },
      { kind: 'star', name: 'Star', d: 'M50 2 L62 38 H98 L69 60 L80 96 L50 74 L20 96 L31 60 L2 38 H38 Z', w: 100, h: 100 },
      { kind: 'diamond', name: 'Diamond', d: 'M50 2 L98 50 L50 98 L2 50 Z', w: 100, h: 100 },
      { kind: 'right', name: 'Arrow right', d: 'M2 32 H62 V8 L98 50 L62 92 V68 H2 Z', w: 120, h: 70, also: 'block arrow' },
      { kind: 'left', name: 'Arrow left', d: 'M98 32 H38 V8 L2 50 L38 92 V68 H98 Z', w: 120, h: 70, also: 'block arrow' },
      { kind: 'up', name: 'Arrow up', d: 'M32 98 V38 H8 L50 2 L92 38 H68 V98 Z', w: 70, h: 120, also: 'block arrow' },
      { kind: 'down', name: 'Arrow down', d: 'M32 2 V62 H8 L50 98 L92 62 H68 V2 Z', w: 70, h: 120, also: 'block arrow' },
      { kind: 'across', name: 'Arrow both ways', d: 'M2 50 L28 12 V34 H72 V12 L98 50 L72 88 V66 H28 V88 Z', w: 140, h: 70, also: 'block arrow' },
      { kind: 'updown', name: 'Arrow up and down', d: 'M50 2 L88 28 H66 V72 H88 L50 98 L12 72 H34 V28 H12 Z', w: 70, h: 140, also: 'block arrow' },
      { kind: 'tag', name: 'Tag', d: 'M2 2 H76 L98 50 L76 98 H2 Z', w: 120, h: 60, also: 'label' },
      { kind: 'chevron', name: 'Chevron', d: 'M2 2 H76 L98 50 L76 98 H2 L24 50 Z', w: 120, h: 60, also: 'step' },
    ],
  },
]

export const SHAPES = new Map(SHAPE_GROUPS.flatMap((g) => g.shapes).map((s) => [s.kind, s]))

export const shapeOf = (kind: string): AnnotationShape => SHAPES.get(kind) ?? SHAPES.get('rect')!

/** The few colours an annotation can be filled with, by name. */
export const COLORS = ['', 'yellow', 'orange', 'pink', 'purple', 'blue', 'green', 'gray'] as const

/** What a colour is called, for a person. */
export const COLOR_NAMES: Record<string, string> = {
  '': 'No fill',
  yellow: 'Yellow',
  orange: 'Orange',
  pink: 'Pink',
  purple: 'Purple',
  blue: 'Blue',
  green: 'Green',
  gray: 'Grey',
}
