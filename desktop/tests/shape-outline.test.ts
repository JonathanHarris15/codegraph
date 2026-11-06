// codegraph: test ui canvas
import { describe, expect, it } from 'vitest'
import { CARD_SHAPES } from '../src/ui/components/card-looks.js'
import { meetOutline, polygonsOf, seamOf, textAreaOf } from '../src/ui/components/shape-outline.js'

const DIAMOND = 'M50 2 L98 50 L50 98 L2 50 Z'
const TRIANGLE = 'M50 2 L98 98 H2 Z'
const BOX = 'M2 2 H98 V98 H2 Z'
const box = { x: 100, y: 100, w: 200, h: 100 }

describe('words stay inside the shape they are written in', () => {
  it('gives a square nearly all of its box', () => {
    const area = textAreaOf(BOX)
    expect(area.w * area.h).toBeGreaterThan(0.8)
  })

  it('keeps a diamond’s words off its corners', () => {
    const area = textAreaOf(DIAMOND)
    // A corner of the rectangle stays inside the diamond's edge.
    const reach = Math.abs(area.x + area.w - 0.5) + Math.abs(area.y - 0.5)
    expect(reach).toBeLessThanOrEqual(0.48 + 0.001)
    expect(area.w * area.h).toBeGreaterThan(0.18)
    expect(area.w * area.h).toBeLessThan(0.3)
  })

  it('sits a triangle’s words down in its wide part', () => {
    const area = textAreaOf(TRIANGLE)
    expect(area.y + area.h / 2).toBeGreaterThan(0.5)
  })

  it('puts a person’s words in the shoulders, not the head', () => {
    const area = textAreaOf(CARD_SHAPES.person.d)
    expect(area.y).toBeGreaterThan(0.3)
  })
})

describe('a line meets a shape at its real edge', () => {
  it('reads closed parts of an outline, curves and arcs too', () => {
    expect(polygonsOf('M50 2 A48 48 0 1 1 49.9 2 Z')).toHaveLength(1)
    expect(polygonsOf('M2 2 H98 V98 H2 Z M14 2 V98 M86 2 V98')).toHaveLength(1)
  })

  it('holds a diamond by its tips', () => {
    const east = seamOf(DIAMOND, box, 'e')
    expect(east.x).toBeCloseTo(100 + 200 * 0.98, 5)
    expect(east.y).toBeCloseTo(150, 5)
    expect(seamOf(DIAMOND, box, 'n')).toEqual({ x: 200, y: 102 })
  })

  it('holds a triangle’s side where the side really is, not at the box', () => {
    const east = seamOf(TRIANGLE, box, 'e')
    expect(east.x).toBeLessThan(100 + 200 * 0.8)
    expect(east.y).toBeCloseTo(150, 5)
  })

  it('stops a wire at a diamond’s slanted edge, short of its box', () => {
    const met = meetOutline(DIAMOND, box, { x: 400, y: 250 })
    // Halfway out along the diagonal: on the edge, well inside the corner.
    expect(met.x).toBeCloseTo(100 + 200 * 0.74, 5)
    expect(met.y).toBeCloseTo(100 + 100 * 0.74, 5)
  })
})
