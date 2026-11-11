// codegraph: feature show-session in workspace
// codegraph: uses cloud, members, machine, session, sync
import { isConnected, type Member } from '../modules/cloud/index.js'
import { githubClientId } from '../modules/machine/index.js'
import { whoIsIn } from '../modules/members/index.js'
import { whySignedOut } from '../modules/session/index.js'
import { pendingCount } from '../modules/sync/index.js'

export type Session = {
  /** The online side is set up. With none, the app runs on this computer alone. */
  online: boolean
  member: Member | null
  /** Sign-in by typing a code on GitHub is set up; otherwise a token is pasted. */
  canTypeCode: boolean
  /** Changes on this computer waiting to go up. */
  waiting: number
  /** Why the app signed its person out by itself, or '' if it did not. */
  signedOutBecause: string
}

/** Who is signed in, and how things stand with the online side. */
export const showSession = async (): Promise<Session> => ({
  online: isConnected(),
  member: whoIsIn(),
  canTypeCode: githubClientId() !== '',
  waiting: pendingCount(),
  signedOutBecause: whySignedOut(),
})
