// codegraph: feature sign-out-github in workspace
// codegraph: uses github
import { forgetToken } from '../modules/github/index.js'

/** Forgets the token. The projects stay; only the cloud half goes quiet. */
export const signOutGithub = async (): Promise<void> => {
  forgetToken()
}
