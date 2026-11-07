// codegraph: feature join-room in workspace
// codegraph: uses rooms
import { enterRoom, leaveRoom, type RoomNow } from '../modules/rooms/index.js'

export type { RoomNow } from '../modules/rooms/index.js'

/** Goes where others on a project or a sketch can be seen, and hears them. */
export const joinRoom = async (id: string, heard: (now: RoomNow) => void): Promise<boolean> => (id ? enterRoom(id, heard) : (await leaveRoom(), false))
