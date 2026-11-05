// codegraph: component tool-rail

/** What pressing a key on the canvas does. */
export type Hotkey =
  | { do: 'tool'; tool: 'pick' | 'pan' | 'area' | 'wire' | 'note' }
  | { do: 'card'; index: number }
  | { do: 'shape'; kind: string }
  | { do: 'palette' | 'library' | 'layers' | 'keys' }
  | { do: 'layer'; by: 1 | -1 }

/** What can be drawn where the key was pressed: a sketch or a proposal is a
 *  drawing, and a proposal has no annotations. */
type Where = { drawing: boolean; annotating: boolean }

/** The keys, the way an art program lays them out: one letter for each thing
 *  you reach for, and it works whatever is picked. Only typing into a field
 *  stops them. Shape letters follow the diagram tools: A for arrow, L for
 *  line, R for rectangle, O for oval, T for text. */
export const hotkeyFor = (event: { key: string; shiftKey: boolean }, where: Where): Hotkey | null => {
  const { drawing, annotating } = where
  if (event.key === '?') return { do: 'keys' }
  const key = event.key.toLowerCase()
  if (event.shiftKey) {
    if (key === 'a' && annotating) return { do: 'library' }
    if (key === 'l' && annotating) return { do: 'layers' }
    return null
  }
  if (key === 'v') return { do: 'tool', tool: 'pick' }
  if (key === 'h') return { do: 'tool', tool: 'pan' }
  if (key === 'z' && !drawing) return { do: 'tool', tool: 'area' }
  if (key === 'w' && drawing) return { do: 'tool', tool: 'wire' }
  if (key === 'c' && drawing) return { do: 'palette' }
  if (drawing && /^[1-9]$/.test(key)) return { do: 'card', index: Number(key) - 1 }
  if (annotating) {
    const kind = SHAPE_KEYS[key]
    if (kind) return { do: 'shape', kind }
    if (key === '[') return { do: 'layer', by: -1 }
    if (key === ']') return { do: 'layer', by: 1 }
  } else if (key === 'n' && drawing) return { do: 'tool', tool: 'note' }
  return null
}

const SHAPE_KEYS: Record<string, string> = {
  n: 'sticky',
  t: 'text',
  a: 'arrow',
  l: 'line',
  r: 'rect',
  o: 'circle',
  d: 'decision',
}

/** Every key, for the list a person opens with `?`. */
export const KEY_GROUPS: { name: string; rows: { keys: string; says: string }[] }[] = [
  {
    name: 'Tools',
    rows: [
      { keys: 'V', says: 'Pick' },
      { keys: 'H', says: 'Pan' },
      { keys: 'Space', says: 'Hold to pan' },
      { keys: 'Z', says: 'Zoom to a box, on a map' },
      { keys: 'W', says: 'Wire, on a sketch' },
      { keys: 'Esc', says: 'Put the tool down, back to Pick' },
    ],
  },
  {
    name: 'Cards, on a sketch',
    rows: [
      { keys: '1–9', says: 'The cards of this level, in the library’s order' },
      { keys: 'C', says: 'Show or hide the cards' },
    ],
  },
  {
    name: 'Annotations',
    rows: [
      { keys: 'N', says: 'Sticky note' },
      { keys: 'T', says: 'Text' },
      { keys: 'A', says: 'Arrow' },
      { keys: 'L', says: 'Line' },
      { keys: 'R', says: 'Rectangle' },
      { keys: 'O', says: 'Circle' },
      { keys: 'D', says: 'Decision' },
      { keys: 'Shift+A', says: 'Every shape' },
    ],
  },
  {
    name: 'Layers',
    rows: [
      { keys: '[  ]', says: 'Draw on the layer below or above' },
      { keys: 'Shift+L', says: 'Show or hide the layers' },
    ],
  },
  {
    name: 'Moving about',
    rows: [
      { keys: 'F', says: 'Fill the screen with the card under the pointer' },
      { keys: '0', says: 'Fit the level to the window' },
      { keys: '+  −', says: 'Zoom in and out' },
    ],
  },
  {
    name: 'What is picked',
    rows: [
      { keys: 'Double-click', says: 'Change a field on a card, or write on a wire or note' },
      { keys: 'Delete', says: 'Take it away' },
      { keys: 'Ctrl+Z', says: 'Undo' },
    ],
  },
]
