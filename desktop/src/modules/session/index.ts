// codegraph: module session
// codegraph: front door signIn, signInAgain, signOut, SignedIn

/** Who is signed in on this computer, from the moment GitHub says who they are
 *  until they sign out: the token kept, the member remembered, the online side
 *  told, and this computer following what changes online. Signing in by token
 *  and by typing a code both end here. */
import { theCloud } from '../cloud/index.js'
import { forgetToken, problemWithGithub, savedToken, saveToken, whoFully } from '../github/index.js'
import { forgetMember, rememberMember, whoIsIn } from '../members/index.js'
import { startFollowing, stopFollowing } from '../sync/index.js'

export type SignedIn = { ok: boolean; account?: string; problem?: string }

/** Signs a person in with a GitHub token, and from then on that is who they
 *  are here. A token GitHub will not take is thrown away rather than kept. */
export const signIn = async (token: string): Promise<SignedIn> => {
  if (!token.trim()) return { ok: false, problem: 'Paste a token first.' }
  saveToken(token)
  try {
    const found = await whoFully(token)
    const member = (await theCloud()?.signIn(token, found)) ?? found
    rememberMember(member)
    await startFollowing(member)
    return { ok: true, account: found.login }
  } catch (refusal) {
    forgetToken()
    return { ok: false, problem: problemWithGithub(refusal) }
  }
}

/** Firebase forgets a sign-in when the app closes; the token GitHub gave is
 *  kept, so whoever was signed in is signed in again. Offline, it tries again
 *  when next needed, and this computer follows what it already has. */
export const signInAgain = async (): Promise<void> => {
  const me = whoIsIn()
  if (!me) return
  await (theCloud()?.signIn(savedToken(), me) ?? Promise.resolve()).catch(() => undefined)
  await startFollowing(me)
}

/** Forgets who is signed in. What is on this computer stays, for the same member
 *  to come back to; with no one signed in, the app does not show it. */
export const signOut = async (): Promise<void> => {
  stopFollowing()
  forgetToken()
  forgetMember()
  await theCloud()?.signOut()
}
