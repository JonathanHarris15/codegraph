// codegraph: feature check-for-update in workspace
// codegraph: uses updates, machine
import { appVersion, releasesUrl, thisComputer } from '../modules/machine/index.js'
import { newerRelease, type Computer, type Update } from '../modules/updates/index.js'

export type UpdateCheck = {
  /** The version running now. */
  current: string
  /** A newer one that is out, or null if this is the newest. */
  newer: Update | null
}

/** Whether a newer codegraph is out on GitHub than the one running. */
export const checkForUpdate = async (computer: Computer = thisComputer()): Promise<UpdateCheck> => {
  const current = await appVersion()
  return { current, newer: await newerRelease(current, releasesUrl(), computer) }
}
