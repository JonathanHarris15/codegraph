// codegraph: test ui canvas
import { describe, expect, it } from 'vitest'
import { hotkeyFor, KEY_GROUPS } from '../src/ui/components/hotkeys.js'

const sketch = { drawing: true, annotating: true }
const map = { drawing: false, annotating: true }
const proposal = { drawing: true, annotating: false }
const press = (key: string, shiftKey = false) => ({ key, shiftKey })

describe('the keys that pick a tool', () => {
  it('pick and pan everywhere, whatever case the letter comes in', () => {
    for (const where of [sketch, map, proposal]) {
      expect(hotkeyFor(press('v'), where)).toEqual({ do: 'tool', tool: 'pick' })
      expect(hotkeyFor(press('V'), where)).toEqual({ do: 'tool', tool: 'pick' })
      expect(hotkeyFor(press('h'), where)).toEqual({ do: 'tool', tool: 'pan' })
    }
  })

  it('wires and cards only on a drawing, where they can be drawn', () => {
    expect(hotkeyFor(press('w'), sketch)).toEqual({ do: 'tool', tool: 'wire' })
    expect(hotkeyFor(press('w'), map)).toBeNull()
    expect(hotkeyFor(press('c'), sketch)).toEqual({ do: 'palette' })
    expect(hotkeyFor(press('c'), map)).toBeNull()
  })

  it('zooms to a box only on a map, the only place that tool is', () => {
    expect(hotkeyFor(press('z'), map)).toEqual({ do: 'tool', tool: 'area' })
    expect(hotkeyFor(press('z'), sketch)).toBeNull()
  })
})

describe('the keys that pick a card', () => {
  it('count down the card library, so they follow the level being drawn', () => {
    expect(hotkeyFor(press('1'), sketch)).toEqual({ do: 'card', index: 0 })
    expect(hotkeyFor(press('9'), sketch)).toEqual({ do: 'card', index: 8 })
  })

  it('leave 0 to fit the board, and do nothing on a map', () => {
    expect(hotkeyFor(press('0'), sketch)).toBeNull()
    expect(hotkeyFor(press('1'), map)).toBeNull()
  })
})

describe('the keys that pick an annotation', () => {
  it('get a shape ready wherever annotations can be drawn', () => {
    for (const where of [sketch, map]) {
      expect(hotkeyFor(press('n'), where)).toEqual({ do: 'shape', kind: 'sticky' })
      expect(hotkeyFor(press('t'), where)).toEqual({ do: 'shape', kind: 'text' })
      expect(hotkeyFor(press('a'), where)).toEqual({ do: 'shape', kind: 'arrow' })
      expect(hotkeyFor(press('l'), where)).toEqual({ do: 'shape', kind: 'line' })
      expect(hotkeyFor(press('r'), where)).toEqual({ do: 'shape', kind: 'rect' })
      expect(hotkeyFor(press('o'), where)).toEqual({ do: 'shape', kind: 'circle' })
      expect(hotkeyFor(press('d'), where)).toEqual({ do: 'shape', kind: 'decision' })
    }
  })

  it('with Shift open the panels instead', () => {
    expect(hotkeyFor(press('A', true), map)).toEqual({ do: 'library' })
    expect(hotkeyFor(press('L', true), map)).toEqual({ do: 'layers' })
  })

  it('step through the layers with the brackets', () => {
    expect(hotkeyFor(press(']'), sketch)).toEqual({ do: 'layer', by: 1 })
    expect(hotkeyFor(press('['), sketch)).toEqual({ do: 'layer', by: -1 })
  })

  it('fall back to the note tool on a proposal, which has no annotations', () => {
    expect(hotkeyFor(press('n'), proposal)).toEqual({ do: 'tool', tool: 'note' })
    expect(hotkeyFor(press('t'), proposal)).toBeNull()
    expect(hotkeyFor(press('A', true), proposal)).toBeNull()
  })
})

describe('the list of keys', () => {
  it('opens with the question mark, however it is typed', () => {
    expect(hotkeyFor(press('?', true), map)).toEqual({ do: 'keys' })
  })

  it('never gives one key two jobs', () => {
    const keys = KEY_GROUPS.flatMap((g) => g.rows.map((r) => r.keys))
    expect(new Set(keys).size).toBe(keys.length)
  })
})
