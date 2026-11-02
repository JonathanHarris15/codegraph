// codegraph: module github
// codegraph: front door useFolder, useKeystore, tokenIsSafe, saveToken, savedToken, forgetToken, whoAmI, listRepos, codegraphRepos, GithubRepo, GithubRefused, Keystore
import { GithubRefused, isCodegraph, listRepos, whoAmI, type GithubRepo } from './api.js'
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
}
export { GithubRefused }
export type { GithubRepo } from './api.js'
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

/** Of the repos the person can reach, the ones set up for codegraph. */
export const codegraphRepos = async (token: string): Promise<GithubRepo[]> => {
  const repos = await listRepos(token)
  const verdicts = await atATime(repos, 8, (repo) => isCodegraph(token, repo))
  return repos.filter((_, i) => verdicts[i])
}
