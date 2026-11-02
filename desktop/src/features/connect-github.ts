// codegraph: feature connect-github in workspace
// codegraph: uses github
import { GithubRefused, forgetToken, saveToken, whoAmI } from '../modules/github/index.js'

export type Connected = { ok: boolean; account?: string; problem?: string }

/** Keeps the person's token and checks it by asking GitHub who they are. A
 *  token GitHub will not take is thrown away rather than kept. */
export const connectGithub = async (token: string): Promise<Connected> => {
  if (!token.trim()) return { ok: false, problem: 'Paste a token first.' }
  saveToken(token)
  try {
    const account = await whoAmI(token)
    return { ok: true, account }
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
