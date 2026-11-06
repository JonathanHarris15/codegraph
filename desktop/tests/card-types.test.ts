// codegraph: test feature show-card-types
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { saveCardTypes } from '../src/features/save-card-types.js'
import { showCardTypes } from '../src/features/show-card-types.js'
import { useFolder } from '../src/modules/card-types/index.js'
import { closeYard, openYard, type Yard } from './yard.js'

let yard: Yard

beforeAll(() => {
  yard = openYard('card-types')
  useFolder(yard.home)
})

afterAll(() => closeYard(yard))

describe('the card types a person saves', () => {
  it('has none until one is saved', async () => {
    expect(await showCardTypes()).toEqual([])
  })

  it('keeps them to use again', async () => {
    const queue = { id: 'q', name: 'queue', icon: 'mail', shape: 'hexagon' as const, color: 'teal' }
    await saveCardTypes([queue])
    expect(await showCardTypes()).toEqual([queue])
  })

  it('forgets one when it is left out', async () => {
    await saveCardTypes([])
    expect(await showCardTypes()).toEqual([])
  })
})
