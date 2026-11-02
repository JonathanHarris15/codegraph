// codegraph: module github
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** How the token is locked away. The shell hands in this computer's own
 *  keystore; without one we fall back to plain text and say so. */
export type Keystore = {
  lock: (plain: string) => string
  unlock: (locked: string) => string
  safe: boolean
}

const plainKeystore: Keystore = {
  lock: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  unlock: (locked) => Buffer.from(locked, 'base64').toString('utf8'),
  safe: false,
}

let folder = ''
let keystore: Keystore = plainKeystore

export const useFolder = (where: string): void => {
  folder = where
}

export const useKeystore = (which: Keystore): void => {
  keystore = which
}

export const tokenIsSafe = (): boolean => keystore.safe

const file = (): string => {
  if (!folder) throw new Error('github: no folder chosen yet')
  return join(folder, 'github.token')
}

export const saveToken = (token: string): void => {
  const path = file()
  mkdirSync(folder, { recursive: true })
  writeFileSync(path, keystore.lock(token.trim()), 'utf8')
}

export const savedToken = (): string => {
  try {
    const path = file()
    if (!existsSync(path)) return ''
    return keystore.unlock(readFileSync(path, 'utf8')).trim()
  } catch {
    return ''
  }
}

export const forgetToken = (): void => {
  try {
    rmSync(file(), { force: true })
  } catch {
    /* nothing saved */
  }
}
