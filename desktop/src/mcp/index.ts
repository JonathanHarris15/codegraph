// codegraph: shell
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { resolve } from 'node:path'
import { z } from 'zod'
import { checkCode } from '../features/check-code.js'
import { describeMap } from '../features/describe-map.js'
import { describeSketch } from '../features/describe-sketch.js'
import { findSketches } from '../features/find-sketches.js'
import { giveInstructions } from '../features/give-instructions.js'
import { makeProposal } from '../features/make-proposal.js'
import { reportWork } from '../features/report-work.js'
import { useFolder as useAgentsFolder } from '../modules/agents/index.js'
import { useFolder as useAnnotationsFolder } from '../modules/annotations/index.js'
import { useFolder as useCardTypesFolder } from '../modules/card-types/index.js'
import { useFolder as useInstructionsFolder } from '../modules/instructions/index.js'
import { appFolderAnywhere } from '../modules/machine/index.js'
import { useFolder as useProjectsFolder } from '../modules/projects/index.js'
import { useFolder as useSketchesFolder } from '../modules/sketches/index.js'

/** The codegraph MCP: how a person's own agent reaches codegraph (ADR 0004).
 *  Each tool hands straight to one feature. Run with `check [folder]` it is
 *  the check on its own, for a terminal or CI, failing when anything does
 *  not fit; `map [folder]` prints the map in words. */
const here = (repo?: string): string => resolve(repo || process.cwd())

// Projects and their sketches live where the app keeps them.
useProjectsFolder(appFolderAnywhere())
useSketchesFolder(appFolderAnywhere())
useAgentsFolder(appFolderAnywhere())
useAnnotationsFolder(appFolderAnywhere())
useCardTypesFolder(appFolderAnywhere())
useInstructionsFolder(appFolderAnywhere())
const text = (words: string) => ({ content: [{ type: 'text' as const, text: words }] })

const serve = async (): Promise<void> => {
  const server = new McpServer({ name: 'codegraph', version: '0.1.0' })

  server.tool(
    'map',
    "The repo's map, read from its code: containers, components and their files, and every wire with what it is for, and any annotations people drew over it.",
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
    'What codegraph asks of an agent, by topic: setup (how to set a repo up), tags (the rules), proposals (making and building a proposal), working-here (the block for CLAUDE.md or AGENTS.md).',
    { topic: z.string().describe('setup, tags, proposals or working-here') },
    async ({ topic }) => text(giveInstructions(topic)),
  )

  server.tool(
    'sketches',
    "The sketches kept with the project this repo serves, or with the project named. A sketch is a drawing of how the software could be, handed to an agent to make a proposal from.",
    {
      project: z.string().optional().describe("A project's short name; the projects this repo serves if left out."),
      repo: z.string().optional().describe('The repo folder; the folder the agent works in if left out.'),
    },
    async ({ project, repo }) => text(await findSketches(here(repo), project ?? '')),
  )

  server.tool(
    'sketch',
    'One sketch in words: every level, each card with its kind and what it is for, every wire with its words, the notes, and the file of each mockup to open.',
    {
      name: z.string().describe("The sketch's name, as `sketches` lists it."),
      project: z.string().optional().describe("A project's short name; the projects this repo serves if left out."),
      repo: z.string().optional().describe('The repo folder; the folder the agent works in if left out.'),
    },
    async ({ name, project, repo }) => text(await describeSketch(here(repo), name, project ?? '')),
  )

  server.tool(
    'propose',
    "Makes the proposal on this repo's branch from a sketch: what the sketch draws for this software system that the code does not have yet, and what it takes away. The check then fails until it is built. Says which other software systems the sketch changes.",
    {
      sketch: z.string().describe("The sketch's name, as `sketches` lists it."),
      project: z.string().optional().describe("A project's short name; the projects this repo serves if left out."),
      replace: z.boolean().optional().describe('Replace the proposal already on this branch.'),
      repo: z.string().optional().describe('The repo folder; the folder the agent works in if left out.'),
    },
    async ({ sketch, project, replace, repo }) => text(await makeProposal(here(repo), sketch, project ?? '', replace ?? false)),
  )

  server.tool(
    'working-on',
    "Says which card you are building, so the person's canvas follows you there. Call it before each card of a proposal, and with no card when you stop.",
    {
      card: z.string().optional().describe('The card, named as the proposal names it: `web`, or `web/page search`. Leave out when you stop.'),
      words: z.string().optional().describe('A few words on what you are doing there.'),
      repo: z.string().optional().describe('The repo folder; the folder the agent works in if left out.'),
    },
    async ({ card, words, repo }) => text(await reportWork(here(repo), card ?? '', words ?? '')),
  )

  server.prompt('setup', 'Set this repo up for codegraph, in one sweep.', () => ({
    messages: [{ role: 'user', content: { type: 'text', text: giveInstructions('setup') } }],
  }))

  server.prompt('proposal', "Build the proposal on this branch, or make one from a project's sketch.", () => ({
    messages: [{ role: 'user', content: { type: 'text', text: giveInstructions('proposals') } }],
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
