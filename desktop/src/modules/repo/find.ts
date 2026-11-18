// codegraph: module repo
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isRepo, remoteName } from './git.js'
import { git } from './run.js'

/** owner/name on GitHub for a working copy, or '' where it has none. */
export const remoteOf = async (path: string): Promise<string> =>
  remoteName(await git(path, ['remote', 'get-url', 'origin']))

/** A GitHub repo's names are the same whatever their case. */
export const sameRemote = (a: string, b: string): boolean => a.length > 0 && a.toLowerCase() === b.toLowerCase()

/** A working copy of a GitHub repo already on this computer, looked for in the
 *  folders beside the given ones: where a person keeps a project's repos side by
 *  side. Folders in `skip` are already spoken for. '' when there is none. */
export const findWorkingCopy = async (remote: string, beside: string[], skip: string[] = []): Promise<string> => {
  if (!remote) return ''
  const taken = new Set([...beside, ...skip].map((p) => p.toLowerCase()))
  for (const parent of new Set(beside.filter(Boolean).map((p) => dirname(p)))) {
    let names: string[] = []
    try {
      names = readdirSync(parent, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    } catch {
      continue
    }
    for (const name of names) {
      const path = join(parent, name)
      if (taken.has(path.toLowerCase()) || !isRepo(path)) continue
      if (sameRemote(await remoteOf(path), remote)) return path
    }
  }
  return ''
}
