// codegraph: module github
// codegraph: front door useFolder, useKeystore, tokenIsSafe, saveToken, savedToken, forgetToken, whoAmI, whoFully, findAccount, startDeviceSignIn, askDeviceSignIn, listRepos, codegraphRepos, GithubRepo, GithubAccount, DeviceSignIn, GithubRefused, problemWithGithub, Keystore
import { GithubRefused, askDeviceSignIn, findAccount, listRepos, projectsServed, startDeviceSignIn, whoAmI, whoFully, type GithubRepo } from './api.js'
import {
  forgetToken,
  saveToken,
  savedToken,
  tokenIsSafe,
  useFolder,
  useKeystore,
} from './token.js'

export {
  forgetToken,
  listRepos,
  saveToken,
  savedToken,
  tokenIsSafe,
  useFolder,
  useKeystore,
  whoAmI,
  whoFully,
  findAccount,
  startDeviceSignIn,
  askDeviceSignIn,
}
export { GithubRefused }
export type { DeviceSignIn, GithubAccount, GithubRepo } from './api.js'
export type { Keystore } from './token.js'

/** A few questions at a time, so a hundred repos do not open a hundred calls. */
const atATime = async <In, Out>(
  items: In[],
  many: number,
  each: (item: In) => Promise<Out>,
): Promise<Out[]> => {
  const out: Out[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const mine = next++
      const item = items[mine]
      if (item === undefined) return
      out[mine] = await each(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(many, items.length) }, worker))
  return out
}

/** Of the repos the person can reach, the ones set up for codegraph, with
 *  the projects each one says it serves. */
export const codegraphRepos = async (token: string): Promise<(GithubRepo & { projects: string[] })[]> => {
  const repos = await listRepos(token)
  const served = await atATime(repos, 8, (repo) => projectsServed(token, repo))
  return repos.flatMap((repo, i) => {
    const projects = served[i]
    return projects ? [{ ...repo, projects }] : []
  })
}

/** What to tell a person when asking GitHub went wrong: what GitHub said, if it
 *  said no, or that it could not be reached. */
export const problemWithGithub = (refusal: unknown): string =>
  refusal instanceof GithubRefused ? refusal.message : 'Could not reach GitHub. Check the connection and try again.'
