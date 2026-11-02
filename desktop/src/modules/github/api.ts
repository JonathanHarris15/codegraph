// codegraph: module github
const ROOT = 'https://api.github.com'

/** One repo the signed-in person can reach. */
export type GithubRepo = {
  /** owner/name */
  fullName: string
  name: string
  owner: string
  defaultBranch: string
  pushedAt: string
  private: boolean
  url: string
  cloneUrl: string
}

export class GithubRefused extends Error {}

const ask = async (token: string, path: string): Promise<Response> =>
  fetch(ROOT + path, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'codegraph-desktop',
    },
  })

const json = async (token: string, path: string): Promise<unknown> => {
  const answer = await ask(token, path)
  if (answer.status === 401) throw new GithubRefused('GitHub did not accept that token.')
  if (answer.status === 403) throw new GithubRefused('GitHub refused: the token is missing the repo scope, or you have hit its rate limit.')
  if (!answer.ok) throw new GithubRefused(`GitHub answered ${answer.status}.`)
  return answer.json()
}

export const whoAmI = async (token: string): Promise<string> => {
  const me = (await json(token, '/user')) as { login?: string }
  return me.login ?? ''
}

type RawRepo = {
  full_name: string
  name: string
  owner: { login: string }
  default_branch: string
  pushed_at: string
  private: boolean
  html_url: string
  clone_url: string
}

/** Every repo the person owns, collaborates on, or reaches through an org. */
export const listRepos = async (token: string, pages = 3): Promise<GithubRepo[]> => {
  const all: GithubRepo[] = []
  for (let page = 1; page <= pages; page++) {
    const raw = (await json(
      token,
      `/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member&page=${page}`,
    )) as RawRepo[]
    for (const r of raw) {
      all.push({
        fullName: r.full_name,
        name: r.name,
        owner: r.owner.login,
        defaultBranch: r.default_branch,
        pushedAt: r.pushed_at,
        private: r.private,
        url: r.html_url,
        cloneUrl: r.clone_url,
      })
    }
    if (raw.length < 100) break
  }
  return all
}

/** Asked once per repo per run; a repo's answer only changes when it is pushed to. */
const seen = new Map<string, boolean>()

/** A repo is a codegraph codebase when its committed Claude settings name
 *  codegraph, which is what setting a repo up writes. */
export const isCodegraph = async (token: string, repo: GithubRepo): Promise<boolean> => {
  const key = `${repo.fullName}@${repo.pushedAt}`
  const remembered = seen.get(key)
  if (remembered !== undefined) return remembered
  const answer = await ask(token, `/repos/${repo.fullName}/contents/.claude/settings.json`)
  let yes = false
  if (answer.ok) {
    const body = (await answer.json()) as { content?: string; encoding?: string }
    const text = body.content ? Buffer.from(body.content, 'base64').toString('utf8') : ''
    yes = /codegraph/i.test(text)
  }
  seen.set(key, yes)
  return yes
}
