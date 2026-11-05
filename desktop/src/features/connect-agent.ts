// codegraph: feature connect-agent in workspace
// codegraph: uses machine
import { existsSync } from 'node:fs'
import { mcpServerFile } from '../modules/machine/index.js'

export type AgentConnection = {
  /** What to run once, in a terminal, so Claude Code reaches codegraph in
   *  every repo on this computer. */
  command: string
  /** The MCP has been built and is there to run. */
  ready: boolean
}

/** How a person connects the agent they already use to codegraph (ADR 0004). */
export const connectAgent = async (): Promise<AgentConnection> => {
  const file = (await mcpServerFile()).replace(/\\/g, '/')
  return {
    command: `claude mcp add --scope user codegraph -- node "${file}"`,
    ready: existsSync(file),
  }
}
