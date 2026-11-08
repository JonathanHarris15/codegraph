// codegraph: feature start-sign-in in workspace
// codegraph: uses github, machine
import { problemWithGithub, startDeviceSignIn, type DeviceSignIn } from '../modules/github/index.js'
import { githubClientId } from '../modules/machine/index.js'

export type SignInStarted = { ok: true; started: DeviceSignIn } | { ok: false; problem: string }

/** Starts signing in with GitHub: says what code to type, and where. Nothing
 *  secret goes in the app, which is why it is done this way (ADR 0017). */
export const startSignIn = async (): Promise<SignInStarted> => {
  const clientId = githubClientId()
  if (!clientId) return { ok: false, problem: 'Sign-in is not set up yet.' }
  try {
    return { ok: true, started: await startDeviceSignIn(clientId) }
  } catch (refusal) {
    return { ok: false, problem: problemWithGithub(refusal) }
  }
}
