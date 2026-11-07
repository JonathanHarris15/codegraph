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

/** Everything GitHub says about an account that a member is known by. The id
 *  stays the same when the username changes (ADR 0017). */
export type GithubAccount = { id: string; login: string; name: string; avatar: string }

type RawAccount = { id?: number; login?: string; name?: string | null; avatar_url?: string }

const accountOf = (raw: RawAccount): GithubAccount => ({
  id: String(raw.id ?? ''),
  login: raw.login ?? '',
  name: raw.name || raw.login || '',
  avatar: raw.avatar_url ?? '',
})

export const whoFully = async (token: string): Promise<GithubAccount> => accountOf((await json(token, '/user')) as RawAccount)

/** Finds an account by username, whether or not they have ever opened the app;
 *  null if GitHub knows no one by it. */
export const findAccount = async (token: string, login: string): Promise<GithubAccount | null> => {
  const answer = await ask(token, `/users/${encodeURIComponent(login.trim().replace(/^@/, ''))}`)
  if (answer.status === 404) return null
  if (!answer.ok) throw new GithubRefused(`GitHub answered ${answer.status}.`)
  return accountOf((await answer.json()) as RawAccount)
}

/** What a person is asked to do to sign in: go to a page and type a code. */
export type DeviceSignIn = { code: string; url: string; deviceCode: string; everyMs: number; expiresInMs: number }

const askLogin = async (path: string, body: Record<string, string>): Promise<Record<string, unknown>> => {
  const answer = await fetch(`https://github.com/login/${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'codegraph-desktop' },
    body: JSON.stringify(body),
  })
  if (!answer.ok) throw new GithubRefused(`GitHub answered ${answer.status}.`)
  return (await answer.json()) as Record<string, unknown>
}

/** The scope is `repo`: GitHub has no read-only one for private repos. */
export const startDeviceSignIn = async (clientId: string): Promise<DeviceSignIn> => {
  const said = await askLogin('device/code', { client_id: clientId, scope: 'repo read:user' })
  if (typeof said['device_code'] !== 'string') throw new GithubRefused(String(said['error_description'] ?? 'GitHub would not start a sign-in.'))
  return {
    code: String(said['user_code']),
    url: String(said['verification_uri']),
    deviceCode: said['device_code'],
    everyMs: Number(said['interval'] ?? 5) * 1000,
    expiresInMs: Number(said['expires_in'] ?? 900) * 1000,
  }
}

/** Asks once whether the person has typed the code yet. The token when they have,
 *  '' while still waiting, and 'slow' if GitHub wants asking less often. */
export const askDeviceSignIn = async (clientId: string, deviceCode: string): Promise<string> => {
  const said = await askLogin('oauth/access_token', {
    client_id: clientId,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  })
  if (typeof said['access_token'] === 'string') return said['access_token']
  if (said['error'] === 'authorization_pending') return ''
  if (said['error'] === 'slow_down') return 'slow'
  throw new GithubRefused(said['error'] === 'access_denied' ? 'The sign-in was turned down on GitHub.' : said['error'] === 'expired_token' ? 'That code ran out. Start again.' : 'GitHub would not finish the sign-in.')
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
const seen = new Map<string, string[] | null>()

/** The projects a repo serves, when it is set up for codegraph: its config
 *  names them (ADR 0006). Null where it has no config. */
export const projectsServed = async (token: string, repo: GithubRepo): Promise<string[] | null> => {
  const key = `${repo.fullName}@${repo.pushedAt}`
  const remembered = seen.get(key)
  if (remembered !== undefined) return remembered
  const answer = await ask(token, `/repos/${repo.fullName}/contents/codegraph.config.json`)
  let projects: string[] | null = null
  if (answer.ok) {
    const body = (await answer.json()) as { content?: string; encoding?: string }
    const text = body.content ? Buffer.from(body.content, 'base64').toString('utf8') : ''
    try {
      const named = (JSON.parse(text) as { projects?: unknown }).projects
      projects = Array.isArray(named) ? named.filter((p): p is string => typeof p === 'string') : []
    } catch {
      projects = []
    }
  }
  seen.set(key, projects)
  return projects
}
