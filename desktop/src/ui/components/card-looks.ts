// codegraph: component card-looks
import type { CardLook, CardShape } from '../../modules/sketches/schema.js'

export type { CardLook, CardShape }

/** The shapes a card of a person's own type can take. Each outline is in a
 *  100 by 100 box and stretched to the size it is drawn at, which is roomier
 *  than a plain card where the shape leaves less space for words. */
export const CARD_SHAPES: Record<CardShape, { name: string; d: string; w: number; h: number }> = {
  square: { name: 'Square', d: 'M0 0 H100 V100 H0 Z', w: 240, h: 104 },
  pill: { name: 'Pill', d: 'M25 2 H75 A23 48 0 0 1 75 98 H25 A23 48 0 0 1 25 2 Z', w: 300, h: 120 },
  circle: { name: 'Circle', d: 'M50 2 A48 48 0 1 1 49.9 2 Z', w: 210, h: 210 },
  diamond: { name: 'Diamond', d: 'M50 2 L98 50 L50 98 L2 50 Z', w: 330, h: 210 },
  triangle: { name: 'Triangle', d: 'M50 2 L98 98 H2 Z', w: 340, h: 230 },
  hexagon: { name: 'Hexagon', d: 'M25 2 H75 L98 50 L75 98 H25 L2 50 Z', w: 300, h: 160 },
  parallelogram: { name: 'Slant', d: 'M22 2 H98 L78 98 H2 Z', w: 320, h: 130 },
  person: {
    name: 'Person',
    // A head, and shoulders the words sit in, like the little person icon.
    d: 'M50 2 A15 17 0 1 1 49.9 2 Z M6 98 V66 C6 46 26 39 50 39 C74 39 94 46 94 66 V98 Z',
    w: 210,
    h: 190,
  },
}

export const SHAPE_NAMES = Object.keys(CARD_SHAPES) as CardShape[]

/** The colours a person's own type of card can be, by the name its class has. */
export const LOOK_COLORS = ['gray', 'blue', 'teal', 'green', 'yellow', 'orange', 'red', 'pink', 'purple'] as const

export const BLANK_LOOK: CardLook = { icon: 'package', shape: 'square', color: 'gray' }

/** The kinds the code can name, each only a card with a ready-made look. A
 *  database and a page are not here: they do more than look a certain way. */
export const TEMPLATES: Record<string, CardLook> = {
  'web app': { icon: 'globe', shape: 'square', color: 'blue' },
  'browser app': { icon: 'window', shape: 'square', color: 'blue' },
  server: { icon: 'server', shape: 'square', color: 'blue' },
  'desktop app': { icon: 'monitor', shape: 'square', color: 'blue' },
  'mobile app': { icon: 'phone', shape: 'square', color: 'blue' },
  'files on disk': { icon: 'disk', shape: 'square', color: 'yellow' },
  function: { icon: 'function', shape: 'square', color: 'teal' },
  'command-line tool': { icon: 'terminal', shape: 'square', color: 'teal' },
  feature: { icon: 'play', shape: 'square', color: 'green' },
  module: { icon: 'package', shape: 'square', color: 'purple' },
  trigger: { icon: 'clock', shape: 'square', color: 'orange' },
}

/** How a card looks: its own look, or else its template's, so a card made
 *  before templates, or read from code, is drawn the same way. */
export const lookOf = (card: { kind: string; look?: CardLook }): CardLook | undefined => card.look ?? TEMPLATES[card.kind]

/** The shape a card is drawn in, if it is anything but a plain card. A person
 *  on the context level always has the person shape. */
export const drawnShape = (card: { kind: string; look?: CardLook }): CardShape | null => {
  if (card.kind === 'person') return 'person'
  const shape = card.look?.shape
  return shape && shape !== 'square' ? shape : null
}
