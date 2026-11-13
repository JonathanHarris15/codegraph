// codegraph: shell
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { resolve } from 'node:path'
import { z } from 'zod'
import { checkCode } from '../features/check-code.js'
import { describeMap } from '../features/describe-map.js'
import { describeSketch } from '../features/describe-sketch.js'
import { drawSketch } from '../features/draw-sketch.js'
import { editSketch, type Step } from '../features/edit-sketch.js'
import { findSketches } from '../features/find-sketches.js'
import { giveInstructions } from '../features/give-instructions.js'
import { makeProposal } from '../features/make-proposal.js'
import { reportWork } from '../features/report-work.js'
import { showLooking } from '../features/show-looking.js'
import { useFolder as useAgentsFolder } from '../modules/agents/index.js'
import { useFolder as useAnnotationsFolder } from '../modules/annotations/index.js'
import { useFolder as useCardTypesFolder } from '../modules/card-types/index.js'
import { useFolder as useInstructionsFolder } from '../modules/instructions/index.js'
import { appFolderAnywhere } from '../modules/machine/index.js'
import { useFolder as useMembersFolder } from '../modules/members/index.js'
import { useFolder as useProjectsFolder } from '../modules/projects/index.js'
import { useFolder as useSketchesFolder } from '../modules/sketches/index.js'
import { useFolder as useSyncFolder } from '../modules/sync/index.js'

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
// Who is signed in decides who may draw; a sketch drawn is owed to the online
// copy, which the app sends when it is next open.
useMembersFolder(appFolderAnywhere())
useSyncFolder(appFolderAnywhere())
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
    'What codegraph asks of an agent, by topic: setup (how to set a repo up), tags (the rules), design-system, proposals (making and building a proposal), sketches (drawing one with `draw`), working-here (the block for CLAUDE.md or AGENTS.md).',
    { topic: z.string().describe('setup, tags, design-system, proposals, sketches or working-here') },
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
    'draw',
    "Makes a sketch in the project, or replaces the one of that name, from a Mermaid flowchart: a node is a card and its class its kind (`api[\"Wardrobe API\"]:::server`), a subgraph is the inside of the card of that id, and a wire's words start with its kind (`app -->|calls: to fetch suggestions| api`). Read the `sketches` instructions first. Says every line that is wrong.",
    {
      name: z.string().describe("The sketch's name. One already of that name is replaced."),
      flowchart: z.string().describe('The Mermaid flowchart, with codegraph tags.'),
      project: z.string().optional().describe("A project's short name; the project this repo serves if left out."),
      repo: z.string().optional().describe('The repo folder; the folder the agent works in if left out.'),
    },
    async ({ name, flowchart, project, repo }) => text(await drawSketch(here(repo), name, flowchart, project ?? '')),
  )

  // Who the agent is, as its own program says: the name its cursor carries.
  const who = (): string => {
    const name = server.server.getClientVersion()?.name ?? ''
    return /claude/i.test(name) ? 'Claude' : name ? name.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Agent'
  }
  const spot = z.object({ x: z.number(), y: z.number() })
  const end = z.union([z.string(), spot])
  const where = {
    in: z.string().optional().describe("The card whose insides this goes on, by id or name; the top level if left out."),
  }
  const step = z.discriminatedUnion('do', [
    z.object({
      do: z.literal('card'),
      name: z.string(),
      kind: z.string().optional().describe('Its kind, as the `sketches` instructions list by level: server, database, store, page, person...'),
      ...where,
      id: z.string().optional().describe('An id to name it by later; made from its name if left out.'),
      says: z.string().optional().describe('What it is for.'),
      at: z.string().optional().describe("A page's address."),
      x: z.number().optional(),
      y: z.number().optional(),
    }),
    z.object({
      do: z.literal('change'),
      what: z.string().describe('A card by id or name, or an annotation by id.'),
      name: z.string().optional(),
      kind: z.string().optional(),
      says: z.string().optional(),
      at: z.string().optional(),
      text: z.string().optional(),
      color: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      w: z.number().optional(),
      h: z.number().optional(),
    }),
    z.object({ do: z.literal('remove'), what: z.string().describe('A card by id or name, an annotation by id, or a wire by id or as `from -> to`.') }),
    z.object({
      do: z.literal('wire'),
      from: z.string(),
      to: z.string(),
      kind: z.string().optional().describe('uses, asks, reads, starts, keeps, leads to, calls or points at.'),
      words: z.string().optional().describe('What it is for: "to fetch suggestions".'),
    }),
    z.object({
      do: z.literal('fields'),
      store: z.string(),
      fields: z.array(z.string()).optional().describe('Each like `owner: text, needed, points at people`.'),
      open: z.string().optional().describe('For an open store: what any field it does not list may hold.'),
      unknown: z.boolean().optional().describe('Its shape is not known.'),
    }),
    z.object({
      do: z.literal('note'),
      text: z.string(),
      kind: z.string().optional().describe('sticky (the default), text, callout, list, code, or a shape: rect, diamond, circle, cloud, database...'),
      ...where,
      near: z.string().optional().describe('A card it keeps beside, by id or name.'),
      x: z.number().optional(),
      y: z.number().optional(),
      w: z.number().optional(),
      h: z.number().optional(),
      color: z.string().optional().describe('yellow, orange, pink, purple, blue, green or gray.'),
    }),
    z.object({
      do: z.literal('line'),
      from: end.describe('A card or annotation, or a spot {x, y}.'),
      to: end,
      kind: z.string().optional().describe('arrow (the default), line, dashed, curve or wire.'),
      text: z.string().optional(),
      ...where,
    }),
    z.object({
      do: z.literal('frame'),
      text: z.string().describe('Its name.'),
      around: z.array(z.string()).optional().describe('The cards it goes round, all on one level.'),
      kind: z.string().optional().describe('frame (the default), rounded, oval, lane, column, bracket or braces.'),
      ...where,
      color: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      w: z.number().optional(),
      h: z.number().optional(),
    }),
    z.object({ do: z.literal('point'), at: end.describe('A card or annotation, or a spot {x, y} on the level `in` names.'), ...where, words: z.string().optional() }),
  ])

  server.tool(
    'edit',
    "Draws on a sketch one step at a time, the way a person would, while they watch your cursor do it: cards (any kind, stores and inner stores too), wires, a store's fields, notes, lines, frames and shapes; changing, moving and taking things away; and pointing at things. Leave `sketch` out to draw on the one the person has open; a name no sketch has makes a new one. Read the `sketches` instructions first. If any step is wrong, nothing is drawn.",
    {
      sketch: z.string().optional().describe("The sketch's name; the one open in the app if left out. A new name makes a new sketch."),
      steps: z.array(step).describe('What to do, in order.'),
      project: z.string().optional().describe("A project's short name; the project this repo serves if left out."),
      repo: z.string().optional().describe('The repo folder; the folder the agent works in if left out.'),
    },
    async ({ sketch, steps, project, repo }) => text(await editSketch(here(repo), sketch ?? '', steps as Step[], project ?? '', who())),
  )

  server.tool(
    'looking',
    "What the person has open in the app right now: the sketch and the level of it they are on, what their pointer is on, what they have picked, and where everything on that level sits. Ask it when they say \"this\" or \"here\", and before drawing beside something.",
    {},
    async () => text(showLooking()),
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
    "Says which card you are building, so the person's canvas follows you there. Call it before each card of a proposal, before you work on a UI block, and with no card when you stop.",
    {
      card: z
        .string()
        .optional()
        .describe(
          'The card, named as the proposal names it: `web`, or `web/page search`. Or a UI block, so the live view shows it as you change it: `ui block settings/SettingsRow`. Leave out when you stop.',
        ),
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
