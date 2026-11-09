// codegraph: module repo
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** One file at the top of a working copy, as it stands on disk; null when
 *  there is none. */
export const readWorkingFile = (path: string, name: string): string | null => {
  const file = join(path, name)
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** Writes one file at the top of a working copy: to a neighbour first, then
 *  moved over, so a crash cannot leave it half written. */
export const writeWorkingFile = (path: string, name: string, text: string): void => {
  const beside = join(path, `.${name}.${Date.now()}`)
  writeFileSync(beside, text, 'utf8')
  renameSync(beside, join(path, name))
}
