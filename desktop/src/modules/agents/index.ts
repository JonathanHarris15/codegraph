// codegraph: module agents
// codegraph: front door useFolder, sayWhere, whereIs, agentsFolder, Whereabouts
// codegraph: store whereabouts as Whereabouts
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { realFolder } from '../machine/index.js'

/** Where an agent says it is working in one repo, so the canvas can follow
 *  it: the card, by the name a proposal gives it, and a few words. */
export type Whereabouts = { repo: string; card: string; words: string; at: string }

/** Words older than this are an agent that has stopped, not one at work. */
const STALE_MS = 15 * 60 * 1000

let folder = ''

/** The shell, or the MCP, says where this computer keeps codegraph's files;
 *  tests say a temp folder. */
export const useFolder = (where: string): void => {
  folder = where
}

export const agentsFolder = (): string => {
  if (!folder) throw new Error('agents: no folder chosen yet')
  return join(folder, 'agents')
}

const fileOf = (repo: string): string => {
  const key = realFolder(repo)
  const id = createHash('sha1').update(process.platform === 'win32' ? key.toLowerCase() : key).digest('hex').slice(0, 16)
  return join(agentsFolder(), `${id}.json`)
}

/** An agent says which card it is on; no card means it has stopped. */
export const sayWhere = (repo: string, card: string, words: string): void => {
  const file = fileOf(repo)
  if (!card) {
    rmSync(file, { force: true })
    return
  }
  mkdirSync(agentsFolder(), { recursive: true })
  const said: Whereabouts = { repo: resolve(repo), card, words, at: new Date().toISOString() }
  const beside = `${file}.${process.pid}`
  writeFileSync(beside, JSON.stringify(said), 'utf8')
  renameSync(beside, file)
}

/** Where the agent in a repo last said it was, if it said so lately. */
export const whereIs = (repo: string, now = Date.now()): Whereabouts | null => {
  try {
    const said = JSON.parse(readFileSync(fileOf(repo), 'utf8')) as Whereabouts
    return now - Date.parse(said.at) < STALE_MS ? said : null
  } catch {
    return null
  }
}
