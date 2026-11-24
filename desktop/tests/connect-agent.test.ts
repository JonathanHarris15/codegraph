// codegraph: test feature connect-agent
// codegraph: fakes the claude command because the real one changes the person's own Claude Code and fetches from GitHub
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanUpAgent } from '../src/features/clean-up-agent.js'
import { connectAgent } from '../src/features/connect-agent.js'
import { useClaude } from '../src/modules/claude-code/index.js'
import { appVersion } from '../src/modules/machine/index.js'
import { closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let config = ''
const told = process.env['CLAUDE_CONFIG_DIR']

beforeEach(() => {
  yard = openYard('connect-agent')
  config = join(yard.path, 'claude')
  process.env['CLAUDE_CONFIG_DIR'] = config
  useClaude('')
})

afterEach(() => {
  if (told === undefined) delete process.env['CLAUDE_CONFIG_DIR']
  else process.env['CLAUDE_CONFIG_DIR'] = told
  useClaude(null)
  closeYard(yard)
})

/** Claude Code's own files on this computer, as it writes them. */
const claudeHas = (files: Record<string, unknown>): void => {
  for (const [file, json] of Object.entries(files)) {
    mkdirSync(join(config, file, '..'), { recursive: true })
    writeFileSync(join(config, file), JSON.stringify(json))
  }
}
const OLD_MCP = { type: 'stdio', command: 'node', args: ['/Applications/Codegraph.app/Contents/Resources/app/out/main/mcp.js'] }
const AN_OLD_CODEGRAPH = {
  '.claude.json': { mcpServers: { codegraph: OLD_MCP } },
  'settings.json': { enabledPlugins: { 'codegraph@codegraph': true } },
}

/** A stand-in for the claude command that writes down what it was asked. */
const aClaude = (fail = ''): (() => string[]) => {
  const log = join(yard.path, 'asked.log')
  const script = join(yard.path, 'claude-command')
  writeFileSync(
    script,
    `#!${process.execPath}\nconst a = process.argv.slice(2).join(' ')\nrequire('node:fs').appendFileSync(${JSON.stringify(log)}, a + '\\n')\nif (${JSON.stringify(fail)} && a.includes(${JSON.stringify(fail)})) { console.error('Could not reach GitHub'); process.exit(1) }\n`,
  )
  chmodSync(script, 0o755)
  useClaude(script)
  return () => readFileSync(log, 'utf8').trim().split('\n')
}

describe('connecting the agent a person already uses', () => {
  it("gives the command that installs codegraph's plugin, which brings the skills and connects the MCP (ADR 0037)", async () => {
    const connection = await connectAgent()
    expect(connection.command).toBe('claude plugin marketplace add JonathanHarris15/codegraph && claude plugin install codegraph-app@codegraph')
    expect(connection.ready).toBe(true)
  })

  it('asks nothing of a computer without Claude Code', async () => {
    expect((await connectAgent()).behind).toEqual([])
  })
})

describe('what an older codegraph left in Claude Code (ADR 0039)', () => {
  it('lists it in plain words, with the commands that clear it out', async () => {
    claudeHas(AN_OLD_CODEGRAPH)
    const connection = await connectAgent()
    expect(connection.behind).toEqual(["codegraph's skills are not installed", 'the legacy codegraph plugin is on', 'an MCP for codegraph was added by hand'])
    expect(connection.steps).toEqual([
      'claude plugin marketplace add JonathanHarris15/codegraph',
      'claude plugin install codegraph-app@codegraph --scope user',
      'claude plugin disable codegraph@codegraph --scope user',
      'claude mcp remove --scope user codegraph',
    ])
    expect(connection.canCleanUp).toBe(false)
  })

  it('says how old the skills are when they are older than the app', async () => {
    claudeHas({
      'plugins/known_marketplaces.json': { codegraph: {} },
      'plugins/installed_plugins.json': { version: 2, plugins: { 'codegraph-app@codegraph': [{ scope: 'user', version: '0.0.1' }] } },
    })
    expect((await connectAgent()).behind).toEqual([`codegraph's skills are 0.0.1, older than this app's ${await appVersion()}`])
  })

  it("is nothing once the skills are the app's and nothing older is there", async () => {
    claudeHas({
      'plugins/known_marketplaces.json': { codegraph: {} },
      'plugins/installed_plugins.json': { version: 2, plugins: { 'codegraph-app@codegraph': [{ scope: 'user', version: await appVersion() }] } },
    })
    expect((await connectAgent()).behind).toEqual([])
  })
})

describe('cleaning it up', () => {
  it("runs Claude Code's own command for each step, and says what it did", async () => {
    claudeHas(AN_OLD_CODEGRAPH)
    const asked = aClaude()
    const cleaned = await cleanUpAgent()
    expect(cleaned.problem).toBe('')
    expect(cleaned.done).toEqual([
      'Add the codegraph marketplace',
      "Install codegraph's skills",
      'Turn the legacy codegraph plugin off',
      'Remove the codegraph MCP added by hand',
    ])
    expect(asked()).toHaveLength(4)
  })

  it('says which step failed and what Claude Code said, and goes no further', async () => {
    claudeHas(AN_OLD_CODEGRAPH)
    const asked = aClaude('plugin install')
    const cleaned = await cleanUpAgent()
    expect(cleaned.problem).toBe("Couldn't install codegraph's skills: Could not reach GitHub")
    expect(asked()).toHaveLength(2)
  })
})
