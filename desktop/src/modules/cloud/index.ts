// codegraph: module cloud
// codegraph: front door useCloud, theCloud, isConnected, openFolderCloud, openFirebaseCloud, FirebaseSettings, CloudOffline, Cloud, Doc, Member, Room, RoomNow, Seen
import type { Cloud } from './schema.js'

export { openFolderCloud } from './folder.js'
export { openFirebaseCloud, type FirebaseSettings } from './firebase.js'
export { CloudOffline } from './schema.js'
export type { Cloud, Doc, Member, Room, RoomNow, Seen } from './schema.js'

let cloud: Cloud | null = null

/** The shell hands in the online side, if there is one set up; tests hand in a
 *  folder. With none, the app runs on this computer alone. */
export const useCloud = (which: Cloud | null): void => {
  cloud = which
}

export const theCloud = (): Cloud | null => cloud

export const isConnected = (): boolean => cloud !== null
