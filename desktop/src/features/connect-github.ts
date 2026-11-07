// codegraph: feature connect-github in workspace
// codegraph: uses github, members, cloud, sync
import { theCloud } from '../modules/cloud/index.js'
import { GithubRefused, forgetToken, saveToken, whoFully } from '../modules/github/index.js'
import { rememberMember } from '../modules/members/index.js'
import { startFollowing } from '../modules/sync/index.js'

export type Connected = { ok: boolean; account?: string; problem?: string }

/** Signs a person in with a token: the only way in until a GitHub app is set up
 *  for the code-typing way (`start-sign-in`). It keeps the token and checks it by
 *  asking GitHub who they are, and from then on that is who they are here. A
 *  token GitHub will not take is thrown away rather than kept. */
export const connectGithub = async (token: string): Promise<Connected> => {
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
    return {
      ok: false,
      problem:
        refusal instanceof GithubRefused
          ? refusal.message
          : 'Could not reach GitHub. Check the connection and try again.',
    }
  }
}
