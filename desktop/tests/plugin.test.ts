// codegraph: test feature give-instructions
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sayWhereMcpIs } from '../src/modules/machine/index.js'
import { topics } from '../src/modules/instructions/index.js'
import { closeYard, openYard, type Yard } from './yard.js'

/** Codegraph's skills reach a person's Claude Code as a plugin, which starts
 *  the installed app's own MCP and asks it for what the skills need to know
 *  (ADR 0037). */
const DESKTOP = join(import.meta.dirname, '..')
const PLUGIN = join(DESKTOP, 'plugin')
const MCP = join(DESKTOP, 'out', 'main', 'mcp.js')
const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T
const appVersion = read<{ version: string }>(join(DESKTOP, 'package.json')).version

/** A skill's frontmatter fields and the rest of it. */
const skill = (name: string): { head: Record<string, string>; body: string } => {
  const text = readFileSync(join(PLUGIN, 'skills', name, 'SKILL.md'), 'utf8')
  const [, head = '', body = ''] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? []
  const fields = Object.fromEntries(
    head.split('\n').map((line) => [line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()]),
  )
  return { head: fields, body }
}

let yard: Yard

beforeAll(() => {
  yard = openYard('plugin')
})

afterAll(() => closeYard(yard))

/** An agent's MCP connection made the way Claude Code makes it for the plugin:
 *  `node <plugin>/launch.mjs`, with codegraph's files in the home given. */
const throughThePlugin = async (plugin: string, home: string) => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
  const client = new Client({ name: 'claude-code', version: '0' })
  const env = { ...(process.env as Record<string, string>), CODEGRAPH_HOME: home, CLAUDE_PLUGIN_ROOT: plugin }
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(plugin, 'launch.mjs')], cwd: yard.path, env }))
  const call = async (tool: string, args: Record<string, unknown> = {}): Promise<string> => {
    const answer = (await client.callTool({ name: tool, arguments: args })) as { content: { text: string }[] }
    return answer.content.map((c) => c.text).join('\n')
  }
  return { call, close: () => client.close() }
}

/** A home where the app has said where its MCP is, as it does each time it opens. */
const aHomeWithTheApp = (name: string): string => {
  const home = join(yard.path, name)
  mkdirSync(home, { recursive: true })
  sayWhereMcpIs(home, MCP, appVersion)
  return home
}

describe('the plugin', () => {
  it('is released with the app, under the same version', () => {
    const manifest = read<{ name: string; version: string }>(join(PLUGIN, '.claude-plugin', 'plugin.json'))
    expect(manifest.name).toBe('codegraph-app')
    expect(manifest.version).toBe(appVersion)
  })

  it("starts codegraph's MCP through its launcher", () => {
    const config = read<{ mcpServers: Record<string, { command: string; args: string[] }> }>(join(PLUGIN, '.mcp.json'))
    expect(config.mcpServers['codegraph']).toEqual({ command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/launch.mjs'] })
  })

  it('is listed in the marketplace beside the legacy plugin', () => {
    const market = read<{ plugins: { name: string; source: string }[] }>(join(DESKTOP, '..', '.claude-plugin', 'marketplace.json'))
    expect(market.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'codegraph', source: './legacy' }),
        expect.objectContaining({ name: 'codegraph-app', source: './desktop/plugin' }),
      ]),
    )
  })

  it('has the skills ADR 0037 names, each saying when to use it', () => {
    const skills = readdirSync(join(PLUGIN, 'skills')).sort()
    expect(skills).toEqual(['check', 'decide', 'design', 'grill', 'propose', 'setup', 'terms'])
    for (const name of skills) {
      const { head } = skill(name)
      expect(head['name']).toBe(name)
      expect(head['description']!.length).toBeGreaterThan(80)
    }
  })

  it('asks only for instruction topics there are, so what a skill knows is always the app’s', () => {
    const there = new Set(topics().map((t) => t.topic))
    for (const name of readdirSync(join(PLUGIN, 'skills'))) {
      const asked = [...skill(name).body.matchAll(/topic `([\w-]+)`/g)].map((m) => m[1]!)
      expect(asked.length, `${name} asks for no topic`).toBeGreaterThan(0)
      for (const topic of asked) expect(there, `${name} asks for ${topic}`).toContain(topic)
    }
  })
})

describe('an agent connected through the plugin', () => {
  it("reaches the installed app's own MCP and is told what it asks", async () => {
    const agent = await throughThePlugin(PLUGIN, aHomeWithTheApp('home-now'))
    try {
      expect(await agent.call('instructions', { topic: 'setup' })).toMatch(/^# Setting a repo up for codegraph/)
    } finally {
      await agent.close()
    }
  })

  it('is told when its skills are older than the app, and how to update them', async () => {
    const old = join(yard.path, 'old-plugin')
    cpSync(PLUGIN, old, { recursive: true })
    writeFileSync(join(old, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'codegraph-app', version: '0.0.1' }))
    const agent = await throughThePlugin(old, aHomeWithTheApp('home-old'))
    try {
      const said = await agent.call('instructions', { topic: 'terms' })
      expect(said.split('\n')[0]).toBe(
        `Your codegraph skills are 0.0.1, older than the codegraph app, which is ${appVersion}. Tell the person, and ask them to update it: \`claude plugin update codegraph-app@codegraph\` in a terminal, then a new session.`,
      )
      expect(said).toContain('# Terms')
    } finally {
      await agent.close()
    }
  })

  it('is told nothing extra when its skills are the app’s own version', async () => {
    const agent = await throughThePlugin(PLUGIN, aHomeWithTheApp('home-same'))
    try {
      expect(await agent.call('instructions', { topic: 'terms' })).toMatch(/^# Terms/)
    } finally {
      await agent.close()
    }
  })

  it('says to open the app when the app has never said where its MCP is', () => {
    const home = join(yard.path, 'home-empty')
    mkdirSync(home, { recursive: true })
    const ran = spawnSync(process.execPath, [join(PLUGIN, 'launch.mjs')], {
      env: { ...process.env, CODEGRAPH_HOME: home },
      encoding: 'utf8',
    })
    expect(ran.status).toBe(1)
    expect(ran.stderr).toContain('Open the codegraph app once')
    expect(existsSync(join(home, 'mcp.json'))).toBe(false)
  })
})
