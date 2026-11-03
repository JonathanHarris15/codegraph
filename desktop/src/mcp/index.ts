// codegraph: shell
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { resolve } from 'node:path'
import { z } from 'zod'
import { checkCode } from '../features/check-code.js'
import { describeMap } from '../features/describe-map.js'
import { giveInstructions } from '../features/give-instructions.js'

/** The codegraph MCP: how a person's own agent reaches codegraph (ADR 0004).
 *  Each tool hands straight to one feature. Run with `check [folder]` it is
 *  the check on its own, for a terminal or CI, failing when anything does
 *  not fit; `map [folder]` prints the map in words. */
const here = (repo?: string): string => resolve(repo || process.cwd())
const text = (words: string) => ({ content: [{ type: 'text' as const, text: words }] })

const serve = async (): Promise<void> => {
  const server = new McpServer({ name: 'codegraph', version: '0.1.0' })

  server.tool(
    'map',
    "The repo's map, read from its code: containers, components and their files, and every wire with what it is for.",
    { repo: z.string().optional().describe('The repo folder; the folder the agent works in if left out.') },
    async ({ repo }) => text(await describeMap(here(repo))),
  )

  server.tool(
    'check',
    "Holds the repo's code to its codegraph tags and config, and lists everything that does not fit. Call it before finishing any change.",
    { repo: z.string().optional().describe('The repo folder; the folder the agent works in if left out.') },
    async ({ repo }) => text((await checkCode(here(repo))).words),
  )

  server.tool(
    'instructions',
    'What codegraph asks of an agent, by topic: setup (how to set a repo up), tags (the rules), working-here (the block for CLAUDE.md or AGENTS.md).',
    { topic: z.string().describe('setup, tags or working-here') },
    async ({ topic }) => text(giveInstructions(topic)),
  )

  server.prompt('setup', 'Set this repo up for codegraph, in one sweep.', () => ({
    messages: [{ role: 'user', content: { type: 'text', text: giveInstructions('setup') } }],
  }))

  await server.connect(new StdioServerTransport())
}

const [, , command, folder] = process.argv
if (command === 'map') {
  process.stdout.write((await describeMap(here(folder))) + '\n')
} else if (command === 'check') {
  const checked = await checkCode(here(folder))
  process.stdout.write(checked.words + '\n')
  process.exit(checked.clean ? 0 : 1)
} else {
  await serve()
}
