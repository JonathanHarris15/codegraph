// codegraph: component annotation-layer

/** One shape a person can put down as an annotation. Its outline is drawn
 *  in a 100 by 100 box, stretched to whatever size it is given. */
export type AnnotationShape = {
  kind: string
  name: string
  /** The outline, as SVG path data, or none for text and lines. Only the
   *  closed parts of it count as the shape's edge: a wire meets it there and
   *  its words fit inside it. Anything drawn inside belongs in `marks` or
   *  `band`, never here. */
  d: string
  /** Size when put down with a click. */
  w: number
  h: number
  /** Drawn behind the diagram's cards, as a frame round them is. */
  behind?: boolean
  /** Drawn from one end to the other, not as a box. */
  line?: boolean
  /** A line that curves out of what it holds, the way a wire does. */
  bends?: boolean
  /** Its own fill when no colour is picked. */
  color?: string
  /** Words other than the name to find it by. */
  also?: string
  /** Strokes drawn inside the outline wherever the shape is drawn: the cross
   *  in a junction, the lid of a cylinder, a bracket. Never filled, never
   *  part of the edge. */
  marks?: string
  /** Strokes the library's button draws and the board does not: the ruled
   *  lines of a note, the bullets of a list, the rows of a code block. They
   *  say what the shape is for, and on the board the words themselves do
   *  that, so drawing them there would only sit behind the words. */
  hint?: string
  /** A filled strip inside the outline, part of the symbol itself: the sides
   *  of a predefined process, the corner of internal storage. It stretches
   *  with the shape, as the symbol does. A title band, which must stay the
   *  same thickness whatever size the shape is, is `title` instead. */
  band?: string
  /** A strip of the same thickness whatever size the shape is: a code
   *  block's header, a swimlane's side, a column's head. Unlike `band` it
   *  does not stretch, so it still reads at any size. */
  strip?: 'top' | 'left'
  /** Where a frame's name sits: on a tab at its top left, or in its strip.
   *  Frames only. */
  title?: 'tab' | 'strip'
  /** Where its words go, as shares of its box, when its outline alone does
   *  not say: a shape whose marks take up room inside it. */
  text?: { x: number; y: number; w: number; h: number }
}

const box = 'M2 2 H98 V98 H2 Z'
const circle = 'M50 2 A48 48 0 1 1 49.9 2 Z'
/** Two rules, as a sheet that has been written on. */
const written = 'M14 30 H74 M14 50 H62'

/** The groups the library shows. Each is a promise about what its shapes do,
 *  not a family they belong to: a note carries words of its own, a line joins
 *  two things, a frame goes round what it holds, a shape is an outline
 *  you put a label in. A shape belongs to exactly one of them, and appears once. */
export const SHAPE_GROUPS: { name: string; says: string; shapes: AnnotationShape[] }[] = [
  {
    name: 'Notes',
    says: 'Carry words of their own.',
    shapes: [
      { kind: 'text', name: 'Text', d: '', w: 160, h: 40, also: 'words label caption' },
      { kind: 'sticky', name: 'Sticky note', d: 'M0 0 H100 V82 L82 100 H0 Z', w: 180, h: 110, color: 'yellow', hint: written, also: 'note postit' },
      { kind: 'callout', name: 'Callout', d: 'M2 2 H98 V72 H40 L22 98 L26 72 H2 Z', w: 170, h: 100, hint: 'M14 24 H74 M14 44 H62', also: 'speech bubble comment' },
      { kind: 'list', name: 'List', d: box, w: 180, h: 140, hint: 'M12 26 H18 M30 26 H88 M12 50 H18 M30 50 H88 M12 74 H18 M30 74 H70', also: 'bullets checklist todo' },
      {
        kind: 'code',
        name: 'Code block',
        d: box,
        w: 220,
        h: 110,
        strip: 'top',
        hint: 'M12 40 H58 M22 58 H82 M12 76 H44',
        also: 'snippet mono terminal',
      },
    ],
  },
  {
    name: 'Lines',
    says: 'Join two things, and hold on at both ends.',
    shapes: [
      { kind: 'arrow', name: 'Arrow', d: '', w: 160, h: 0, line: true, also: 'connector line' },
      { kind: 'line', name: 'Line', d: '', w: 160, h: 0, line: true, also: 'connector' },
      { kind: 'dashed', name: 'Dashed line', d: '', w: 160, h: 0, line: true, also: 'connector' },
      { kind: 'curve', name: 'Bending line', d: '', w: 160, h: 0, line: true, bends: true, also: 'curve connector arrow wire' },
      { kind: 'wire', name: 'Wire with words', d: '', w: 220, h: 0, line: true, bends: true, also: 'sentence connector arrow label' },
    ],
  },
  {
    name: 'Frames',
    says: 'Drawn round what they hold. They sit behind the cards and grow as the cards do.',
    shapes: [
      { kind: 'frame', name: 'Frame', d: box, w: 320, h: 220, behind: true, title: 'tab', also: 'group box rectangle section area' },
      { kind: 'rounded', name: 'Rounded frame', d: 'M12 2 H88 Q98 2 98 12 V88 Q98 98 88 98 H12 Q2 98 2 88 V12 Q2 2 12 2 Z', w: 320, h: 220, behind: true, title: 'tab', also: 'group box area' },
      { kind: 'oval', name: 'Oval frame', d: circle, w: 320, h: 220, behind: true, title: 'tab', also: 'ellipse circle group cloud area' },
      { kind: 'lane', name: 'Swimlane', d: box, w: 520, h: 160, behind: true, strip: 'left', title: 'strip', also: 'pool row band team who' },
      { kind: 'column', name: 'Column', d: box, w: 220, h: 420, behind: true, strip: 'top', title: 'strip', also: 'lane stage step kanban phase' },
      { kind: 'bracket', name: 'Bracket', d: '', w: 300, h: 160, behind: true, title: 'tab', marks: 'M30 2 H6 V98 H30 M70 2 H94 V98 H70', also: 'brackets span range' },
      {
        kind: 'braces',
        name: 'Braces',
        d: '',
        w: 300,
        h: 160,
        behind: true,
        title: 'tab',
        marks:
          'M20 2 C8 2 8 10 8 30 C8 45 4 50 2 50 C4 50 8 55 8 70 C8 90 8 98 20 98 M80 2 C92 2 92 10 92 30 C92 45 96 50 98 50 C96 50 92 55 92 70 C92 90 92 98 80 98',
        also: 'curly brackets span',
      },
    ],
  },
  {
    name: 'Shapes',
    says: 'An outline you put a label in. Search “flowchart” for the flowchart set.',
    shapes: [
      { kind: 'rect', name: 'Rectangle', d: box, w: 140, h: 80, also: 'process step box square flowchart' },
      { kind: 'diamond', name: 'Diamond', d: 'M50 2 L98 50 L50 98 L2 50 Z', w: 140, h: 100, also: 'decision choice if flowchart' },
      { kind: 'terminator', name: 'Start or end', d: 'M25 2 H75 A23 48 0 0 1 75 98 H25 A23 48 0 0 1 25 2 Z', w: 140, h: 60, also: 'terminator pill stadium begin flowchart' },
      { kind: 'circle', name: 'Circle', d: circle, w: 90, h: 90, also: 'connector ellipse round flowchart' },
      { kind: 'hexagon', name: 'Hexagon', d: 'M25 2 H75 L98 50 L75 98 H25 L2 50 Z', w: 150, h: 86, also: 'preparation six flowchart' },
      { kind: 'data', name: 'Data', d: 'M22 2 H98 L78 98 H2 Z', w: 150, h: 80, also: 'parallelogram input output flowchart' },
      {
        kind: 'database',
        name: 'Database',
        d: 'M2 14 A48 12 0 0 1 98 14 V86 A48 12 0 0 1 2 86 Z',
        w: 110,
        h: 120,
        marks: 'M2 14 A48 12 0 0 0 98 14',
        also: 'cylinder store disk flowchart',
        text: { x: 0.04, y: 0.3, w: 0.92, h: 0.58 },
      },
      { kind: 'document', name: 'Document', d: 'M2 2 H98 V82 C75 70 60 100 40 92 C25 86 12 84 2 88 Z', w: 140, h: 90, also: 'page report flowchart' },
      {
        kind: 'documents',
        name: 'Many documents',
        d: 'M2 14 H86 V84 C66 76 52 100 34 92 C20 87 10 86 2 90 Z',
        w: 150,
        h: 100,
        marks: 'M12 2 H98 V72 H90 M6 8 H92 V78 H84',
        also: 'pages reports flowchart',
      },
      {
        kind: 'predefined',
        name: 'Predefined process',
        d: box,
        w: 150,
        h: 80,
        band: 'M2 2 H14 V98 H2 Z M86 2 H98 V98 H86 Z',
        also: 'subroutine call flowchart',
        text: { x: 0.15, y: 0.04, w: 0.7, h: 0.92 },
      },
      { kind: 'input', name: 'Manual input', d: 'M2 30 L98 2 V98 H2 Z', w: 140, h: 80, also: 'keyboard flowchart' },
      { kind: 'stored', name: 'Stored data', d: 'M18 2 H98 A16 48 0 0 0 98 98 H18 A16 48 0 0 1 18 2 Z', w: 140, h: 80, also: 'flowchart' },
      { kind: 'internal', name: 'Internal storage', d: box, w: 120, h: 100, band: 'M2 2 H98 V16 H2 Z M2 2 H16 V98 H2 Z', also: 'memory flowchart', text: { x: 0.18, y: 0.19, w: 0.78, h: 0.77 } },
      { kind: 'delay', name: 'Delay', d: 'M2 2 H60 A38 48 0 0 1 60 98 H2 Z', w: 130, h: 80, also: 'wait flowchart' },
      { kind: 'display', name: 'Display', d: 'M2 50 L22 2 H76 A22 48 0 0 1 76 98 H22 Z', w: 150, h: 80, also: 'screen flowchart' },
      { kind: 'manual', name: 'Manual operation', d: 'M2 2 H98 L80 98 H20 Z', w: 140, h: 80, also: 'trapezoid by hand flowchart' },
      { kind: 'offpage', name: 'Off-page link', d: 'M2 2 H98 V64 L50 98 L2 64 Z', w: 90, h: 90, also: 'elsewhere flowchart' },
      { kind: 'merge', name: 'Merge', d: 'M2 2 H98 L50 98 Z', w: 90, h: 80, also: 'triangle down join flowchart' },
      { kind: 'junction', name: 'Summing junction', d: circle, w: 60, h: 60, marks: 'M16 16 L84 84 M84 16 L16 84', also: 'cross flowchart', text: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 } },
      { kind: 'or', name: 'Or', d: circle, w: 60, h: 60, marks: 'M50 2 V98 M2 50 H98', also: 'flowchart', text: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 } },
      { kind: 'braceleft', name: 'Note brace', d: '', w: 40, h: 120, marks: 'M60 2 C40 2 40 10 40 30 C40 45 30 50 20 50 C30 50 40 55 40 70 C40 90 40 98 60 98', also: 'curly bracket' },
      { kind: 'braceright', name: 'Note brace, right', d: '', w: 40, h: 120, marks: 'M40 2 C60 2 60 10 60 30 C60 45 70 50 80 50 C70 50 60 55 60 70 C60 90 60 98 40 98', also: 'curly bracket' },
      { kind: 'triangle', name: 'Triangle', d: 'M50 2 L98 98 H2 Z', w: 100, h: 90 },
      { kind: 'pentagon', name: 'Pentagon', d: 'M50 2 L98 38 L80 98 H20 L2 38 Z', w: 100, h: 100 },
      { kind: 'octagon', name: 'Octagon', d: 'M30 2 H70 L98 30 V70 L70 98 H30 L2 70 V30 Z', w: 100, h: 100, also: 'stop' },
      { kind: 'star', name: 'Star', d: 'M50 2 L62 38 H98 L69 60 L80 96 L50 74 L20 96 L31 60 L2 38 H38 Z', w: 100, h: 100 },
      { kind: 'cross', name: 'Cross', d: 'M35 2 H65 V35 H98 V65 H65 V98 H35 V65 H2 V35 H35 Z', w: 90, h: 90, also: 'plus' },
      { kind: 'cloud', name: 'Cloud', d: 'M26 82 C8 82 2 66 12 56 C4 40 18 26 32 32 C36 14 60 10 68 26 C82 20 96 32 90 48 C100 56 96 82 76 82 Z', w: 140, h: 100 },
      { kind: 'tag', name: 'Tag', d: 'M2 2 H76 L98 50 L76 98 H2 Z', w: 120, h: 60, also: 'label' },
      { kind: 'chevron', name: 'Chevron', d: 'M2 2 H76 L98 50 L76 98 H2 L24 50 Z', w: 120, h: 60, also: 'step' },
      { kind: 'right', name: 'Arrow right', d: 'M2 32 H62 V8 L98 50 L62 92 V68 H2 Z', w: 120, h: 70, also: 'block arrow' },
      { kind: 'left', name: 'Arrow left', d: 'M98 32 H38 V8 L2 50 L38 92 V68 H98 Z', w: 120, h: 70, also: 'block arrow' },
      { kind: 'up', name: 'Arrow up', d: 'M32 98 V38 H8 L50 2 L92 38 H68 V98 Z', w: 70, h: 120, also: 'block arrow' },
      { kind: 'down', name: 'Arrow down', d: 'M32 2 V62 H8 L50 98 L92 62 H68 V2 Z', w: 70, h: 120, also: 'block arrow' },
      { kind: 'across', name: 'Arrow both ways', d: 'M2 50 L28 12 V34 H72 V12 L98 50 L72 88 V66 H28 V88 Z', w: 140, h: 70, also: 'block arrow' },
      { kind: 'updown', name: 'Arrow up and down', d: 'M50 2 L88 28 H66 V72 H88 L50 98 L12 72 H34 V28 H12 Z', w: 70, h: 140, also: 'block arrow' },
    ],
  },
]

export const SHAPES = new Map(SHAPE_GROUPS.flatMap((g) => g.shapes).map((s) => [s.kind, s]))

/** Shapes the library once listed twice under two names. Each was the same
 *  outline as the one it points at, so it was dropped and its old name kept
 *  working: an annotation drawn before still shows what it always showed. */
export const WAS: Record<string, string> = {
  box: 'frame',
  process: 'rect',
  decision: 'diamond',
  connector: 'circle',
  preparation: 'hexagon',
}

export const shapeOf = (kind: string): AnnotationShape => SHAPES.get(kind) ?? SHAPES.get(WAS[kind] ?? '') ?? SHAPES.get('rect')!

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
