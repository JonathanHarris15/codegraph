// codegraph: feature finish-sign-in in workspace
// codegraph: uses github, machine, session
import { GithubRefused, askDeviceSignIn, type DeviceSignIn } from '../modules/github/index.js'
import { githubClientId } from '../modules/machine/index.js'
import { signIn, type SignedIn } from '../modules/session/index.js'

const wait = (ms: number): Promise<void> => new Promise((go) => setTimeout(go, ms))

/** Waits for the person to type the code on GitHub, then signs them in. */
export const finishSignIn = async (started: DeviceSignIn): Promise<SignedIn> => {
  const clientId = githubClientId()
  const until = Date.now() + started.expiresInMs
  let every = started.everyMs
  while (Date.now() < until) {
    await wait(every)
    try {
      const said = await askDeviceSignIn(clientId, started.deviceCode)
      if (said === 'slow') every += 5000
      else if (said) return signIn(said)
    } catch (refusal) {
      if (refusal instanceof GithubRefused) return { ok: false, problem: refusal.message }
      // The connection dropped for a moment: keep asking until the code runs out.
    }
  }
  return { ok: false, problem: 'That code ran out. Start again.' }
}
