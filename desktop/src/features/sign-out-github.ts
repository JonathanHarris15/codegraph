// codegraph: feature sign-out-github in workspace
// codegraph: uses session
import { signOut } from '../modules/session/index.js'

/** Forgets who is signed in. What is on this computer stays, for the same member
 *  to come back to; with no one signed in, the app does not show it. */
export const signOutGithub = async (): Promise<void> => signOut()
