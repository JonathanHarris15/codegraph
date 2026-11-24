// codegraph: module repo
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** One file at the top of a working copy, as it stands on disk; null when
 *  there is none. */
export const readWorkingFile = (path: string, name: string): string | null => {
  const file = join(path, name)
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** Writes one file of a working copy, in a folder of it if the name says
 *  so: to a neighbour first, then moved over, so a crash cannot leave it half
 *  written. */
export const writeWorkingFile = (path: string, name: string, text: string): void => {
  const file = join(path, name)
  mkdirSync(dirname(file), { recursive: true })
  const beside = join(dirname(file), `.${basename(file)}.${Date.now()}`)
  writeFileSync(beside, text, 'utf8')
  renameSync(beside, file)
}

/** Takes one file out of a working copy, if it is there. */
export const removeWorkingFile = (path: string, name: string): void => rmSync(join(path, name), { force: true })
