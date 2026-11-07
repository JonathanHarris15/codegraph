// codegraph: feature hold-thing in workspace
// codegraph: uses rooms
import { holdThing as hold, letGoOfThing } from '../modules/rooms/index.js'

/** Takes hold of things before dragging or typing on them. All or nothing: if
 *  anyone else has one, none are taken, and it says which they have. */
export const holdThings = async (items: string[]): Promise<{ ok: boolean; taken: string[] }> => {
  const got: string[] = []
  for (const item of items) {
    if (await hold(item)) got.push(item)
    else {
      for (const one of got) await letGoOfThing(one)
      return { ok: false, taken: [item] }
    }
  }
  return { ok: true, taken: [] }
}

/** Lets go of everything this member holds. */
export const letGoOfThings = async (): Promise<void> => letGoOfThing()
