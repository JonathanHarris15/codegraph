// codegraph: feature say-where in workspace
// codegraph: uses rooms
import { sayInRoom } from '../modules/rooms/index.js'

/** What a member shows others about where they are and what they are doing: their
 *  cursor, what they have open, and what they are dragging. Kept nowhere. */
export type Whereabouts = {
  /** The maps they are looking at, by software system. */
  maps?: Record<string, string>
  /** The card they are inside, and where their cursor is in that card's space. */
  inside?: string
  x?: number
  y?: number
  /** Where things they are dragging have got to. */
  dragging?: { id: string; x: number; y: number }[]
}

export const sayWhere = async (where: Whereabouts): Promise<void> => sayInRoom(where)
