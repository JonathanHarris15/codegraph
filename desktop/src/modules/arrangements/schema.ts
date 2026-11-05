// codegraph: module arrangements

/** Where one thing sits on a level of a map: a card, by its id, a wire's
 *  sentence, by the wire's key, or how much room a card has when open, by
 *  `roomKey`, which also has a size. In the level's own space, the space the
 *  cards inside the card being looked at are laid out in. */
export type Spot = { id: string; x: number; y: number; w?: number; h?: number }

/** What a card's room is known by in an arrangement. */
export const roomKey = (cardId: string): string => `room:${cardId}`

/** Where a person has moved a map's cards and its wires' sentences. The code
 *  says nothing about where anything sits, so this is kept beside the map and
 *  never in any repo. Moving something changes no code. */
export type Arrangement = Spot[]

/** One arrangement with some things moved, each thing in it once, rounded
 *  to whole pixels. */
export const movedTo = (was: Arrangement, moves: Arrangement): Arrangement => {
  const by = new Map(was.map((spot) => [spot.id, spot]))
  for (const spot of moves)
    by.set(spot.id, {
      id: spot.id,
      x: Math.round(spot.x),
      y: Math.round(spot.y),
      ...(spot.w !== undefined && spot.h !== undefined ? { w: Math.round(spot.w), h: Math.round(spot.h) } : {}),
    })
  return [...by.values()]
}

/** The same, with some things forgotten, so the map lays them out again. */
export const forgetting = (was: Arrangement, ids: string[]): Arrangement =>
  was.filter((spot) => !ids.includes(spot.id))
