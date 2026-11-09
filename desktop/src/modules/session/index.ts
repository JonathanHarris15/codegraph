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
 *  when next needed, and this computer follows what it already has. With no
 *  token this computer can read (gone, or locked by another keystore) there is
 *  nothing to try again with, so when the online side will not let them in
 *  they are signed out and asked again, rather than left half in. */
export const signInAgain = async (): Promise<void> => {
  const me = whoIsIn()
  if (!me) return
  const token = savedToken()
  try {
    await theCloud()?.signIn(token, me)
  } catch {
    if (!token) return signOut()
  }
  // Nothing on screen waits for this, so a failure would go unheard; following
  // starts again on the next sign-in.
  await startFollowing(me).catch(() => undefined)
}

/** Forgets who is signed in. What is on this computer stays, for the same member
 *  to come back to; with no one signed in, the app does not show it. */
export const signOut = async (): Promise<void> => {
  stopFollowing()
  forgetToken()
  forgetMember()
  await theCloud()?.signOut()
}
