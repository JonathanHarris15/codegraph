// codegraph: feature connect-agent in workspace
// codegraph: uses machine, claude-code
import { existsSync } from 'node:fs'
import { commandLine, findClaude, stepsToBringUpToDate, whatClaudeHas, type ClaudeHas } from '../modules/claude-code/index.js'
import { appVersion, mcpServerFile, olderVersion } from '../modules/machine/index.js'

export type AgentConnection = {
  /** What to run once, in a terminal, so Claude Code has codegraph's skills
   *  and reaches its MCP in every repo on this computer (ADR 0037). */
  command: string
  /** The MCP has been built and is there to run. */
  ready: boolean
  /** What Claude Code has here that is older than this app, in a person's
   *  words; nothing on a computer without Claude Code (ADR 0039). */
  behind: string[]
  /** The commands that bring it up to date, for doing it by hand. */
  steps: string[]
  /** The app found Claude Code's command, so it can run them itself. */
  canCleanUp: boolean
}

const whatIsBehind = (has: ClaudeHas, app: string): string[] => {
  const skills = has.skills.length === 0 ? "codegraph's skills are not installed" : ''
  const oldest = has.skills.map((s) => s.version).find((v) => olderVersion(v, app))
  return [
    skills,
    oldest ? `codegraph's skills are ${oldest}, older than this app's ${app}` : '',
    has.legacy.on ? 'the legacy codegraph plugin is on' : has.legacy.installed ? 'the legacy codegraph plugin is installed' : '',
    has.handAdded.length === 1 ? 'an MCP for codegraph was added by hand' : has.handAdded.length > 1 ? `${has.handAdded.length} MCPs for codegraph were added by hand` : '',
  ].filter(Boolean)
}

/** How a person connects the agent they already use to codegraph (ADR 0004):
 *  by installing codegraph's plugin, which brings its skills and starts this
 *  app's MCP (ADR 0037), and what an older codegraph left in it (ADR 0039). */
export const connectAgent = async (): Promise<AgentConnection> => {
  const [has, app] = [whatClaudeHas(), await appVersion()]
  const steps = has.present ? stepsToBringUpToDate(has, app) : []
  return {
    command: 'claude plugin marketplace add JonathanHarris15/codegraph && claude plugin install codegraph-app@codegraph',
    ready: existsSync(await mcpServerFile()),
    behind: has.present ? whatIsBehind(has, app) : [],
    steps: steps.map(commandLine),
    canCleanUp: findClaude() !== '',
  }
}
