// codegraph: test feature connect-agent
import { describe, expect, it } from 'vitest'
import { connectAgent } from '../src/features/connect-agent.js'

describe('connecting the agent a person already uses', () => {
  it('gives the one command that adds codegraph to Claude Code, pointing at the built MCP', async () => {
    const connection = await connectAgent()
    expect(connection.command).toMatch(/^claude mcp add --scope user codegraph -- node ".+\/out\/main\/mcp\.js"$/)
    expect(connection.ready).toBe(true)
  })
})
