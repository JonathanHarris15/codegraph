// codegraph: test ui sketch
import { describe, expect, it } from 'vitest'
import { blankCard, hubOf, type SketchCard, type SketchWire } from '../src/modules/sketches/index.js'
import { canGoInside, moveInside } from '../src/ui/components/sketch-edits.js'

/** A project drawn at its outermost level: a phone app drawn as a software
 *  system of its own, Billing beside it, a person who uses the phone app, and
 *  Stripe that Billing calls. */
const wire = (id: string, from: string, to: string, kind = 'uses', words = ''): SketchWire => ({ id, from, to, kind, words })
const card = (id: string, level: SketchCard['level'], kind: string, inside: SketchCard[] = [], wires: SketchWire[] = []): SketchCard => ({
  ...blankCard(id, id, level, kind),
  children: inside,
  wires,
})

const drawn = (): SketchCard => {
  const phone = card('phone', 'system', 'software system', [card('screens', 'container', 'mobile app'), card('cache', 'container', 'database')], [
    wire('in-1', 'screens', hubOf('w-pays'), 'calls'),
    wire('in-2', 'screens', hubOf('w-person'), 'uses'),
  ])
  const billing = card('billing', 'system', 'software system', [card('api', 'container', 'server')], [wire('b-in', hubOf('w-pays'), 'api', 'calls')])
  return {
    ...card('project', 'project', 'project', [phone, billing, card('ana', 'system', 'person'), card('stripe', 'system', 'shallow software system')]),
    wires: [
      { ...wire('w-pays', 'phone', 'billing', 'calls', 'pays for things'), sides: { from: 'e' }, x: 40, y: 40 },
      wire('w-person', 'ana', 'phone', 'uses', 'buys from'),
      wire('w-stripe', 'billing', 'stripe', 'calls', 'takes the payment'),
    ],
  }
}

const child = (of: SketchCard | undefined, id: string) => of?.children.find((c) => c.id === id)

describe('putting a card inside another on a sketch', () => {
  it('moves the card a level in, and everything drawn inside it with it', () => {
    const after = moveInside(drawn(), 'phone', 'billing')
    expect(after.children.map((c) => c.id)).toEqual(['billing', 'ana', 'stripe'])
    const phone = child(child(after, 'billing'), 'phone')
    expect(phone).toMatchObject({ level: 'container', kind: 'card' })
    expect(phone?.children.map((c) => [c.id, c.level, c.kind])).toEqual([
      ['screens', 'component', 'card'],
      ['cache', 'component', 'card'],
    ])
  })

  it('points its wires to other cards at the card it went into, and runs them on to it inside', () => {
    const after = moveInside(drawn(), 'phone', 'billing')
    expect(after.wires.map((w) => [w.from, w.to, w.words])).toEqual([
      ['billing', 'stripe', 'takes the payment'],
      ['ana', 'billing', 'buys from'],
    ])
    const billing = child(after, 'billing')
    const outside = after.wires.find((w) => w.from === 'ana')!
    expect(billing?.wires).toContainEqual(expect.objectContaining({ from: hubOf(outside.id), to: 'phone', kind: 'uses' }))
    // Inside the phone app, what the person reached still is.
    const runOn = billing!.wires.find((w) => w.to === 'phone')!
    expect(child(billing, 'phone')?.wires).toContainEqual(expect.objectContaining({ from: 'screens', to: hubOf(runOn.id) }))
  })

  it('draws a wire to the card it went into inside, to whatever that wire reached there', () => {
    const billing = child(moveInside(drawn(), 'phone', 'billing'), 'billing')
    const direct = billing?.wires.find((w) => w.from === 'phone' && w.to === 'api')
    expect(direct).toMatchObject({ kind: 'calls', words: 'pays for things' })
    expect(billing?.wires.some((w) => w.from === hubOf('w-pays') || w.to === hubOf('w-pays'))).toBe(false)
    expect(child(billing, 'phone')?.wires).toContainEqual(expect.objectContaining({ from: 'screens', to: hubOf(direct!.id), kind: 'calls' }))
  })

  it('joins a wire it had with one the card it went into already has to the same card', () => {
    const start = drawn()
    start.wires.push(wire('w-phone-stripe', 'phone', 'stripe', 'calls', 'checks a card'))
    const after = moveInside(start, 'phone', 'billing')
    expect(after.wires.filter((w) => w.to === 'stripe')).toEqual([expect.objectContaining({ id: 'w-stripe', words: 'takes the payment; checks a card' })])
    expect(start.wires.find((w) => w.id === 'w-stripe')?.words).toBe('takes the payment')
    expect(child(after, 'billing')?.wires).toContainEqual(expect.objectContaining({ from: 'phone', to: hubOf('w-stripe') }))
  })

  it('only goes into a card that can hold it, a level in, and never so far that its insides would be code', () => {
    const at = drawn()
    const [phone, billing, ana, stripe] = at.children
    expect(canGoInside(phone, billing)).toBe(true)
    expect(canGoInside(phone, ana)).toBe(false)
    expect(canGoInside(phone, stripe)).toBe(false)
    expect(canGoInside(ana, billing)).toBe(false)
    expect(canGoInside(phone, phone)).toBe(false)
    const deep = card('deep', 'container', 'server', [card('page', 'component', 'page', [card('f', 'code', 'file')])])
    expect(canGoInside(deep, card('web', 'container', 'browser app'))).toBe(false)
    expect(canGoInside(card('loose', 'container', 'card'), card('db', 'container', 'database'))).toBe(false)
    expect(canGoInside(card('loose', 'container', 'card'), card('web', 'container', 'browser app'))).toBe(true)
  })
})
