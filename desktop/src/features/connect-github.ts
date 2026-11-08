// codegraph: feature connect-github in workspace
// codegraph: uses session
import { signIn, type SignedIn } from '../modules/session/index.js'

/** Signs a person in with a token: the only way in until a GitHub app is set up
 *  for the code-typing way (`start-sign-in`). */
export const connectGithub = async (token: string): Promise<SignedIn> => signIn(token)
