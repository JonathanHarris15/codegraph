// codegraph: feature connect-agent in workspace
// codegraph: uses machine
import { existsSync } from 'node:fs'
import { mcpServerFile } from '../modules/machine/index.js'

export type AgentConnection = {
  /** What to run once, in a terminal, so Claude Code has codegraph's skills
   *  and reaches its MCP in every repo on this computer (ADR 0037). */
  command: string
  /** The MCP has been built and is there to run. */
  ready: boolean
}

/** How a person connects the agent they already use to codegraph (ADR 0004):
 *  by installing codegraph's plugin, which brings its skills and starts this
 *  app's MCP (ADR 0037). */
export const connectAgent = async (): Promise<AgentConnection> => ({
  command: 'claude plugin marketplace add JonathanHarris15/codegraph && claude plugin install codegraph-app@codegraph',
  ready: existsSync(await mcpServerFile()),
})
