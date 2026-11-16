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
  d: 'diamond',
}

/** Whether this is a Mac, where the key the lists call Ctrl is Command. */
export const onMac = (): boolean => {
  try {
    return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  } catch {
    return false
  }
}

/** Keys written for any computer, said the way this one's keyboard says them:
 *  on a Mac, Ctrl is ⌘ and Alt is ⌥. */
export const keysFor = (keys: string, mac = onMac()): string =>
  mac ? keys.replace(/Ctrl/g, '⌘').replace(/\bAlt\b/g, '⌥') : keys

/** One line of the list: the keys, or what to do with the mouse, written as
 *  caps with ` + ` between keys pressed together and a space between
 *  either-ors; where on the board it works, when that matters; and what it
 *  does. */
export type KeyRow = { keys: string; on?: string; says: string }

/** Every key, and every way to draw, for the list a person opens with `?`. */
export const KEY_GROUPS: { name: string; rows: KeyRow[] }[] = [
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
    name: 'Drawing on a sketch',
    rows: [
      { keys: 'Double-click', on: 'Empty board', says: 'Add a card there' },
      { keys: 'Drag', on: 'A card’s dot', says: 'Wire to another card, or let go on empty board for a new one' },
      { keys: 'Tab', on: 'A wire', says: 'Switch it between curved and right angles, while drawing it or once picked' },
      { keys: 'Type', says: 'Write on what is picked; Enter finishes' },
      { keys: 'Double-click', on: 'A card', says: 'Draw inside it; drag its corners for room, Esc backs out' },
      { keys: 'Drag', on: 'A card, onto another', says: 'Put it inside, a level in; its wires follow it' },
      { keys: 'Shift + Drag', says: 'Pick many with a box; out round an open card, annotations' },
      { keys: 'Shift + Click', says: 'Add to what is picked' },
      { keys: 'Alt + Drag', says: 'Copy what is dragged' },
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
      { keys: 'D', says: 'Diamond' },
      { keys: 'Shift + A', says: 'Every shape' },
    ],
  },
  {
    name: 'Layers',
    rows: [
      { keys: '[ ]', says: 'Draw on the layer below or above' },
      { keys: 'Shift + L', says: 'Show or hide the layers' },
    ],
  },
  {
    name: 'Moving about',
    rows: [
      { keys: 'Drag', on: 'Empty board', says: 'Move it, or two fingers on a trackpad' },
      { keys: 'Wheel', says: 'Zoom; or Ctrl and two fingers on a trackpad' },
      { keys: 'Ctrl + Wheel', says: 'Scroll up and down; Shift and the wheel, across' },
      { keys: 'F', says: 'Fill the screen with the card or shape under the pointer' },
      { keys: '0', says: 'Fit the level to the window' },
      { keys: '+ −', says: 'Zoom in and out' },
    ],
  },
  {
    name: 'What is picked',
    rows: [
      { keys: 'Double-click', on: 'Words', says: 'Change a field on a card, or write on a wire or note' },
      { keys: 'Arrows', says: 'Nudge it; with Shift, further' },
      { keys: 'Delete', says: 'Delete' },
      { keys: 'Ctrl + Z', says: 'Undo' },
      { keys: 'Ctrl + Shift + Z', says: 'Redo' },
      { keys: 'Ctrl + C X V', says: 'Copy, cut, paste' },
      { keys: 'Ctrl + D', says: 'Duplicate' },
      { keys: 'Ctrl + A', says: 'Pick everything' },
    ],
  },
]

/** A row's keys as caps to draw: each key its own cap, and a `+` between
 *  keys pressed together. A `+` with nothing before it is the plus key. */
export const capsOf = (keys: string): { cap: string; joins: boolean }[] =>
  keys.split(' ').map((part, i, all) => ({ cap: part, joins: part === '+' && i > 0 && i < all.length - 1 }))
