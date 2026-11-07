// codegraph: feature sign-out-github in workspace
// codegraph: uses github, members, cloud, sync
import { theCloud } from '../modules/cloud/index.js'
import { forgetToken } from '../modules/github/index.js'
import { forgetMember } from '../modules/members/index.js'
import { stopFollowing } from '../modules/sync/index.js'

/** Forgets who is signed in. What is on this computer stays, for the same member
 *  to come back to; with no one signed in, the app does not show it. */
export const signOutGithub = async (): Promise<void> => {
  stopFollowing()
  forgetToken()
  forgetMember()
  await theCloud()?.signOut()
}
