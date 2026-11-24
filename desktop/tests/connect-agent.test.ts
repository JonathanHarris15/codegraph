// codegraph: test feature connect-agent
import { describe, expect, it } from 'vitest'
import { connectAgent } from '../src/features/connect-agent.js'

describe('connecting the agent a person already uses', () => {
  it("gives the command that installs codegraph's plugin, which brings the skills and connects the MCP (ADR 0037)", async () => {
    const connection = await connectAgent()
    expect(connection.command).toBe('claude plugin marketplace add JonathanHarris15/codegraph && claude plugin install codegraph-app@codegraph')
    expect(connection.ready).toBe(true)
  })
})
