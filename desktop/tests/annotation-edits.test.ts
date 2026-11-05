// codegraph: test ui canvas
import { describe, expect, it } from 'vitest'
import type { Layer } from '../src/modules/annotations/index.js'
import {
  addLayer,
  duplicateAnnotations,
  nearestCard,
  placeAnnotation,
  placeAt,
  removeAnnotations,
  snapBox,
} from '../src/ui/components/annotation-edits.js'
import { drawnOn } from '../src/ui/components/annotation-layer.js'

const card = { id: 'web', box: { x: 100, y: 100, w: 240, h: 120 } }

describe('putting annotations down', () => {
  it('puts a shape at its usual size, centred where it was put, and shows its layer', () => {
    const [layers, layer] = addLayer([], 'Review')
    const hidden = layers.map((l) => ({ ...l, shown: false }))
    const [next, id] = placeAnnotation(hidden, layer, 'level', 'sticky', { x: 200, y: 200 })
    expect(next[0]?.shown).toBe(true)
    expect(next[0]?.items[0]).toMatchObject({ id, kind: 'sticky', x: 110, y: 145, w: 180, h: 110, color: 'yellow' })
  })

  it('runs a line between the ends it is given', () => {
    const [layers, layer] = addLayer([], 'Review')
    const [next] = placeAnnotation(layers, layer, 'level', 'arrow', { x: 0, y: 0 }, { from: { x: 0, y: 0 }, to: { card: 'web' } })
    expect(next[0]?.items[0]).toMatchObject({ kind: 'arrow', from: { x: 0, y: 0 }, to: { card: 'web' } })
  })
})

describe('annotations beside the diagram', () => {
  it('keep beside a card they are put on or near, and to none far away', () => {
    expect(nearestCard({ x: 360, y: 110, w: 100, h: 60 }, [card])?.id).toBe('web')
    expect(nearestCard({ x: 600, y: 110, w: 100, h: 60 }, [card])).toBeNull()
  })

  it('keep to no card when drawn round it, as a frame is', () => {
    expect(nearestCard({ x: 80, y: 80, w: 300, h: 180 }, [card])).toBeNull()
  })

  it('move with the card they keep beside, and stay put when it is gone', () => {
    const layers: Layer[] = [
      {
        id: 'l',
        name: 'Review',
        shown: true,
        snaps: true,
        items: [{ id: 's', at: 'level', kind: 'sticky', x: 5, y: 5, w: 100, h: 60, near: { card: 'web', dx: 260, dy: 0 }, text: '', color: '' }],
      },
    ]
    expect(drawnOn(layers, 'level', { x: 0, y: 0 }, [card])[0]?.box).toEqual({ x: 360, y: 100, w: 100, h: 60 })
    const moved = { ...card, box: { ...card.box, x: 500 } }
    expect(drawnOn(layers, 'level', { x: 0, y: 0 }, [moved])[0]?.box.x).toBe(760)
    expect(drawnOn(layers, 'level', { x: 10, y: 10 }, [])[0]?.box).toEqual({ x: 15, y: 15, w: 100, h: 60 })
  })

  it('are not drawn when their layer is hidden, or on another level', () => {
    const layers: Layer[] = [
      { id: 'a', name: 'A', shown: false, snaps: true, items: [{ id: '1', at: 'level', kind: 'text', x: 0, y: 0, w: 10, h: 10, text: '', color: '' }] },
      { id: 'b', name: 'B', shown: true, snaps: true, items: [{ id: '2', at: 'other', kind: 'text', x: 0, y: 0, w: 10, h: 10, text: '', color: '' }] },
    ]
    expect(drawnOn(layers, 'level', { x: 0, y: 0 }, [])).toEqual([])
  })

  it('line up with what is near, within a few pixels, and not beyond', () => {
    expect(snapBox({ x: 103, y: 300, w: 50, h: 50 }, [card.box], 6)).toMatchObject({ dx: -3, guides: { x: [100] } })
    expect(snapBox({ x: 120, y: 400, w: 50, h: 50 }, [card.box], 6)).toMatchObject({ dx: 0, dy: 0, guides: { x: [], y: [] } })
  })
})

describe('changing annotations', () => {
  const two = (): Layer[] => [
    {
      id: 'l',
      name: 'Review',
      shown: true,
      snaps: true,
      items: [
        { id: 's', at: 'level', kind: 'sticky', x: 0, y: 0, w: 100, h: 60, text: 'hi', color: '' },
        { id: 'a', at: 'level', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, text: '', color: '', from: { annotation: 's' }, to: { card: 'web' } },
      ],
    },
  ]

  it('lets go of a line end when what it held is taken away', () => {
    const next = removeAnnotations(two(), ['s'])
    expect(next[0]?.items.map((a) => a.id)).toEqual(['a'])
    expect(next[0]?.items[0]?.from).toEqual({ x: 0, y: 0 })
    expect(next[0]?.items[0]?.to).toEqual({ card: 'web' })
  })

  it('moves and keeps beside the card it was dropped by', () => {
    const next = placeAt(two(), new Map([['s', { box: { x: 20, y: 30, w: 100, h: 60 }, near: { card: 'web', dx: 1, dy: 2 } }]]))
    expect(next[0]?.items[0]).toMatchObject({ x: 20, y: 30, near: { card: 'web', dx: 1, dy: 2 } })
    const away = placeAt(next, new Map([['s', { box: { x: 900, y: 30, w: 100, h: 60 } }]]))
    expect(away[0]?.items[0]?.near).toBeUndefined()
  })

  it('duplicates a little down and across, in the same layer', () => {
    const [next, made] = duplicateAnnotations(two(), ['s'])
    expect(made).toHaveLength(1)
    expect(next[0]?.items.find((a) => a.id === made[0])).toMatchObject({ x: 24, y: 24, text: 'hi' })
  })
})
