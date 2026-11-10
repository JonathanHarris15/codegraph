// codegraph: design system

/** What a person is told while something slow is still going: the words for
 *  what it is waiting on, the seconds so far once they are worth showing, and
 *  a line saying it is taking a while once it really is. */
export type Waited = { what: string; count: string; slow: string }

/** A wait shorter than this is just the screen drawing, so the seconds stay
 *  off. Past the second one, a person has started to wonder. */
const COUNT_AFTER = 3
const SLOW_AFTER = 10

export const whileWaiting = (what: string, seconds: number, slow = ''): Waited => ({
  what,
  count: seconds >= COUNT_AFTER ? `${seconds}s` : '',
  slow: slow && seconds >= SLOW_AFTER ? slow : '',
})
