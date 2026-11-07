// codegraph: module rooms
// codegraph: front door enterRoom, sayInRoom, holdThing, letGoOfThing, leaveRoom, RoomNow
import { theCloud, type Doc, type Room, type RoomNow } from '../cloud/index.js'
import { whoIsIn } from '../members/index.js'

export type { RoomNow } from '../cloud/index.js'

/** The place this person is with others right now: one at a time, so a window
 *  moving from a project to a sketch leaves the first. */
let here: { id: string; room: Room; stop: () => void } | null = null

export const leaveRoom = async (): Promise<void> => {
  const was = here
  here = null
  if (!was) return
  was.stop()
  await was.room.leave()
}

/** Goes into a room and hears who is there and what they hold. False with no
 *  online side or no one signed in: nobody else is there. */
export const enterRoom = async (id: string, heard: (now: RoomNow) => void): Promise<boolean> => {
  await leaveRoom()
  const cloud = theCloud()
  const me = whoIsIn()
  if (!cloud || !me) return false
  const room = cloud.room(id, me)
  here = { id, room, stop: room.watch(heard) }
  return true
}

export const sayInRoom = (state: Doc): void => here?.room.say(state)

/** Takes hold of something, so no one else can touch it until let go. With nobody
 *  else there it is always free. */
export const holdThing = async (item: string): Promise<boolean> => (here ? here.room.hold(item) : true)

export const letGoOfThing = async (item?: string): Promise<void> => {
  await here?.room.letGo(item)
}
