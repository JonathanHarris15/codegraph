// codegraph: test ui canvas
import { describe, expect, it } from 'vitest'
import { SHAPE_GROUPS, SHAPES, WAS, shapeOf } from '../src/ui/components/annotation-shapes.js'

const all = SHAPE_GROUPS.flatMap((g) => g.shapes)

/** Everything about a shape a person can see. Two shapes with the same look
 *  are the same shape listed twice, whatever they are called. */
const look = (s: (typeof all)[number]): string =>
  [s.d, s.marks ?? '', s.band ?? '', s.strip ?? '', s.hint ?? '', s.title ?? '', s.behind ? 'behind' : '', s.line ? 'line' : '', s.bends ? 'bends' : ''].join('|')

describe('the library of shapes', () => {
  it('names every shape once', () => {
    const kinds = all.map((s) => s.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
    const names = all.map((s) => s.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it('draws no two shapes the same, so a person can tell them apart', () => {
    const seen = new Map<string, string>()
    const same: string[] = []
    for (const s of all) {
      if (s.line) continue
      const was = seen.get(look(s))
      if (was) same.push(`${was} and ${s.kind}`)
      else seen.set(look(s), s.kind)
    }
    expect(same).toEqual([])
  })

  it('keeps a shape that carries words apart from a box with words in it', () => {
    // A note, a frame and a plain shape share the box outline on purpose.
    // What tells them apart is what they do, and each says so on its face:
    // a note shows what goes in it, a frame is dashed and named on a tab
    // or a strip, a plain shape is neither.
    expect(shapeOf('list').hint).toBeTruthy()
    expect(shapeOf('frame').behind).toBe(true)
    expect(shapeOf('frame').title).toBe('tab')
    expect(shapeOf('rect').behind).toBeUndefined()
    expect(shapeOf('rect').hint).toBeUndefined()
  })

  it('gives every frame a name people can read and take hold of', () => {
    for (const s of SHAPE_GROUPS.find((g) => g.name === 'Frames')!.shapes) {
      expect(s.behind).toBe(true)
      expect(s.title).toBeTruthy()
      if (s.title === 'strip') expect(s.strip).toBeTruthy()
    }
  })

  it('says what each group is for', () => {
    for (const g of SHAPE_GROUPS) expect(g.says.length).toBeGreaterThan(10)
  })

  it('keeps a shape out of the edge when it is only a mark inside it', () => {
    // `d` is the edge alone: a wire meets it there and words fit inside it.
    for (const s of all) expect(s.d).not.toMatch(/Z\s*M/)
  })

  it('still draws an annotation put down under a name the library has dropped', () => {
    for (const [gone, now] of Object.entries(WAS)) {
      expect(SHAPES.has(gone)).toBe(false)
      expect(shapeOf(gone)).toBe(shapeOf(now))
    }
    expect(shapeOf('box').kind).toBe('frame')
    expect(shapeOf('process').kind).toBe('rect')
    expect(shapeOf('decision').kind).toBe('diamond')
  })

  it('falls back to a plain box for a shape it has never heard of', () => {
    expect(shapeOf('zzz').kind).toBe('rect')
  })
})
