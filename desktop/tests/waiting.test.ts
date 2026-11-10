// codegraph: test ui design system
import { describe, expect, it } from 'vitest'
import { whileWaiting } from '../src/ui/design-system/waiting.js'

describe('what a person is told while something slow is still going', () => {
  it('says only what it is waiting on, before the wait is worth noticing', () => {
    expect(whileWaiting('Reading the code…', 0)).toEqual({ what: 'Reading the code…', count: '', slow: '' })
    expect(whileWaiting('Reading the code…', 2).count).toBe('')
  })

  it('counts the seconds once the wait is long enough to doubt', () => {
    expect(whileWaiting('Reading the code…', 3).count).toBe('3s')
    expect(whileWaiting('Reading the code…', 47).count).toBe('47s')
  })

  it('says it is taking a while, once it really is', () => {
    const words = 'A big repo takes a while the first time.'
    expect(whileWaiting('Reading the code…', 9, words).slow).toBe('')
    expect(whileWaiting('Reading the code…', 10, words).slow).toBe(words)
  })

  it('has nothing extra to say where no slow words were given', () => {
    expect(whileWaiting('Reading the code…', 60).slow).toBe('')
  })
})
