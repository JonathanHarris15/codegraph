// codegraph: feature hold-thing in workspace
// codegraph: uses rooms
import { holdAll, letGoOf } from '../modules/rooms/index.js'

/** Takes hold of things before dragging or typing on them. All or nothing: if
 *  anyone else has one, none are taken, and it says which they have. */
export const holdThings = async (items: string[]): Promise<{ ok: boolean; taken: string[] }> => {
  const taken = await holdAll(items)
  return taken === null ? { ok: true, taken: [] } : { ok: false, taken: [taken] }
}

/** Lets go of these things, or of everything this member holds. */
export const letGoOfThings = async (items?: string[]): Promise<void> => letGoOf(items)
