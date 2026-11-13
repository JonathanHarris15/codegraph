// codegraph: module agents
// codegraph: front door useFolder, sayWhere, whereIs, agentsFolder, presenceFolder, agentCursorsFolder, sayInSketch, agentsInSketches, sayLooking, lookingNow, Whereabouts, AgentInSketch, Looking, Seen
// codegraph: store whereabouts as Whereabouts
// codegraph: store presence as AgentInSketch
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { realFolder } from '../machine/index.js'
import { keepWhole } from '../machine/index.js'

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
  keepWhole(file, JSON.stringify(said))
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

/** Where an agent drawing on a sketch is at work, for the person watching it to
 *  see as a cursor: the card whose insides it is on, the thing it is at by id,
 *  or a spot on that level, and a few words on what it is doing. */
export type AgentInSketch = {
  library: string
  sketchId: string
  sketchName: string
  /** Who the agent is, as its own program calls it: Claude, or another. */
  who: string
  inside: string
  target: string
  x?: number
  y?: number
  words: string
  at: string
}

/** One thing a person can see on the level they are looking at, where it sits
 *  in that level's space. */
export type Seen = { id: string; what: string; name: string; x: number; y: number; w: number; h: number }

/** What the person has open in the app and where they point, for an agent to
 *  ask: the sketch, the card whose insides they are on, their pointer in that
 *  card's space, what is under it, what they have picked, and what the level
 *  shows. No sketch means they are not in one. */
export type Looking = {
  library: string
  sketchId: string
  sketchName: string
  /** The cards from the top down to the one they are inside, by name. */
  trail: string[]
  inside: string
  x?: number
  y?: number
  over: string
  picked: string[]
  seen: Seen[]
  at: string
}

/** An agent that has said nothing for this long has gone quiet. */
const AGENT_QUIET_MS = 2 * 60 * 1000
/** A window says what it is looking at every minute it is open; one silent
 *  for longer than this is shut. */
const LOOKING_QUIET_MS = 3 * 60 * 1000

/** Kept apart from the agents folder, which the map watches: a cursor moving
 *  must not read a repo again. */
export const presenceFolder = (): string => {
  if (!folder) throw new Error('agents: no folder chosen yet')
  return join(folder, 'presence')
}

/** Where agents' cursors are kept, apart from what the person is looking at,
 *  so a window watching for cursors is not woken by its own pointer. */
export const agentCursorsFolder = (): string => join(presenceFolder(), 'agents')
const agentFile = (sketchId: string): string => join(agentCursorsFolder(), `agent-${sketchId.replace(/[^\w-]/g, '')}.json`)
const lookingFile = (): string => join(presenceFolder(), 'looking.json')

/** An agent says where it is on a sketch; null for the sketch means it has
 *  left it. */
export const sayInSketch = (sketchId: string, said: Omit<AgentInSketch, 'at' | 'sketchId'> | null): void => {
  if (!said) {
    rmSync(agentFile(sketchId), { force: true })
    return
  }
  mkdirSync(agentCursorsFolder(), { recursive: true })
  keepWhole(agentFile(sketchId), JSON.stringify({ ...said, sketchId, at: new Date().toISOString() }))
}

/** Every agent at work on a sketch lately, in one library or in all. */
export const agentsInSketches = (library = '', now = Date.now()): AgentInSketch[] => {
  if (!existsSync(agentCursorsFolder())) return []
  return readdirSync(agentCursorsFolder())
    .filter((name) => name.startsWith('agent-') && name.endsWith('.json'))
    .flatMap((name) => {
      try {
        const said = JSON.parse(readFileSync(join(agentCursorsFolder(), name), 'utf8')) as AgentInSketch
        return now - Date.parse(said.at) < AGENT_QUIET_MS && (!library || said.library === library) ? [said] : []
      } catch {
        return []
      }
    })
}

/** The window says what the person is looking at; null when they are in no
 *  sketch. */
export const sayLooking = (looking: Omit<Looking, 'at'> | null): void => {
  if (!looking) {
    rmSync(lookingFile(), { force: true })
    return
  }
  mkdirSync(presenceFolder(), { recursive: true })
  keepWhole(lookingFile(), JSON.stringify({ ...looking, at: new Date().toISOString() }))
}

/** What the person is looking at, if a window said so lately. */
export const lookingNow = (now = Date.now()): Looking | null => {
  try {
    const said = JSON.parse(readFileSync(lookingFile(), 'utf8')) as Looking
    return now - Date.parse(said.at) < LOOKING_QUIET_MS ? said : null
  } catch {
    return null
  }
}
