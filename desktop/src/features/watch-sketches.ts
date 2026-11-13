// codegraph: feature watch-sketches in workspace
// codegraph: uses agents, sketches, machine
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { agentCursorsFolder } from '../modules/agents/index.js'
import { watchFolders } from '../modules/machine/index.js'
import { sketchesFolder } from '../modules/sketches/index.js'

/** How soon a change is told: a cursor moving is worth showing at once. */
const QUIET_MS = 40

/** Tells the window when a library's sketches change on this computer, as when
 *  an agent draws on one, or an agent moves its cursor. Hands back how to stop. */
export const watchSketches = (library: string, onChange: () => void): (() => void) => {
  const presence = agentCursorsFolder()
  const sketches = dirname(sketchesFolder(library, 'any'))
  mkdirSync(presence, { recursive: true })
  mkdirSync(sketches, { recursive: true })
  return watchFolders([presence, sketches], onChange, QUIET_MS)
}
