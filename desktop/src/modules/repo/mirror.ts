// codegraph: module repo
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const started = promisify(execFile)

/** How GitHub answered when asked for a repo's code. */
export type Reach = 'open' | 'no-access' | 'offline'

let folder = ''
let host = 'https://github.com'
const lastAsked = new Map<string, { at: number; reach: Reach }>()
const STILL_FRESH_MS = 60_000

/** The shell says where this computer keeps codegraph's files. A test also says
 *  where "GitHub" is, since a folder of repos will do for one. */
export const useMirrors = (where: string, github = 'https://github.com'): void => {
  folder = where
  host = github
  lastAsked.clear()
}

/** A folder holding only the history of a repo a member has no working copy of,
 *  so its GitHub maps can be read (ADR 0018). It has no files checked out. */
export const mirrorFolder = (remote: string): string => {
  if (!folder) return ''
  return join(folder, 'mirrors', encodeURIComponent(remote))
}

/** The token goes in through the surroundings, never the command line, where
 *  anything else on the computer could read it. */
const withToken = (token: string): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  ...(token
    ? {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: `http.${host}/.extraheader`,
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
      }
    : {}),
})

const reachOf = (problem: unknown): Reach => {
  const said = String((problem as { stderr?: unknown })?.stderr ?? problem)
  return /could not resolve|failed to connect|network is unreachable|timed out|couldn't connect|connection refused/i.test(said) ? 'offline' : 'no-access'
}

/** Brings a repo's mirror up to date, making it the first time. GitHub is what
 *  decides: if it will not hand the repo over, the member cannot open its map,
 *  even if an older copy is still on this computer. */
export const fetchMirror = async (remote: string, token: string, force = false): Promise<Reach> => {
  if (!folder) return 'offline'
  const asked = lastAsked.get(remote)
  if (!force && asked && Date.now() - asked.at < STILL_FRESH_MS) return asked.reach
  const target = mirrorFolder(remote)
  const env = withToken(token)
  const run = (cwd: string, args: string[]) => started('git', args, { cwd, env, windowsHide: true, timeout: 180_000, maxBuffer: 16 * 1024 * 1024 })
  let reach: Reach = 'open'
  try {
    if (existsSync(join(target, '.git'))) await run(target, ['fetch', '--quiet', '--prune', 'origin'])
    else {
      mkdirSync(join(folder, 'mirrors'), { recursive: true })
      rmSync(target, { recursive: true, force: true })
      await run(join(folder, 'mirrors'), ['clone', '--quiet', '--no-checkout', '--filter=blob:limit=1m', `${host}/${remote}.git`, target])
    }
  } catch (problem) {
    reach = reachOf(problem)
  }
  lastAsked.set(remote, { at: Date.now(), reach })
  return reach
}
