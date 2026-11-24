// codegraph: test module claude-code
// codegraph: fakes the claude command because the real one changes the person's own Claude Code and fetches from GitHub
import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bringClaudeUpToDate, installedSkills, stepsToBringUpToDate, useClaude, whatClaudeHas } from '../src/modules/claude-code/index.js'
import { closeYard, openYard, type Yard } from './yard.js'

/** What Claude Code has on a computer, read from its own files, and how the
 *  app brings it up to date with Claude Code's own command (ADR 0039). */
let yard: Yard
let config = ''
const told = process.env['CLAUDE_CONFIG_DIR']

beforeEach(() => {
  yard = openYard('claude-code')
  config = join(yard.path, 'claude')
  mkdirSync(join(config, 'plugins'), { recursive: true })
  process.env['CLAUDE_CONFIG_DIR'] = config
})

afterEach(() => {
  if (told === undefined) delete process.env['CLAUDE_CONFIG_DIR']
  else process.env['CLAUDE_CONFIG_DIR'] = told
  useClaude(null)
  closeYard(yard)
})

const write = (file: string, json: unknown): void => writeFileSync(join(config, file), JSON.stringify(json))
const installs = (plugins: Record<string, unknown[]>): void => write('plugins/installed_plugins.json', { version: 2, plugins })
const knowsTheMarketplace = (): void =>
  write('plugins/known_marketplaces.json', {
    codegraph: {
      source: { source: 'github', repo: 'JonathanHarris15/codegraph' },
    },
  })
const OLD_MCP = {
  type: 'stdio',
  command: 'node',
  args: ['/Applications/Codegraph.app/Contents/Resources/app/out/main/mcp.js'],
  env: {},
}

describe('what Claude Code has on this computer', () => {
  it('has nothing of codegraph where Claude Code has never run', () => {
    expect(whatClaudeHas()).toEqual({
      present: true,
      skills: [],
      legacy: { installed: false, on: false },
      handAdded: [],
      marketplace: false,
    })
  })

  it('finds an MCP added by hand, for the person and for one folder, and leaves anyone else’s alone', () => {
    const folder = join(yard.path, 'notes')
    mkdirSync(folder)
    write('.claude.json', {
      mcpServers: {
        codegraph: OLD_MCP,
        'other-codegraph': {
          type: 'stdio',
          command: 'npx',
          args: ['some-other-codegraph'],
        },
      },
      projects: {
        [folder]: { mcpServers: { cg: OLD_MCP } },
        [join(yard.path, 'gone')]: { mcpServers: { cg: OLD_MCP } },
      },
    })
    expect(whatClaudeHas().handAdded).toEqual([
      { name: 'codegraph', folder: '' },
      { name: 'cg', folder },
    ])
  })

  it('finds the legacy plugin, installed or only turned on for the person', () => {
    write('settings.json', { enabledPlugins: { 'codegraph@codegraph': true } })
    expect(whatClaudeHas().legacy).toEqual({ installed: false, on: true })
    installs({ 'codegraph@codegraph': [{ scope: 'user', version: '0.6.0' }] })
    expect(whatClaudeHas().legacy).toEqual({ installed: true, on: true })
  })

  it("reads each install of codegraph's skills, and the version a repo gets", () => {
    const repo = join(yard.path, 'notes')
    mkdirSync(repo)
    installs({
      'codegraph-app@codegraph': [
        { scope: 'user', version: '0.6.0' },
        { scope: 'project', projectPath: repo, version: '0.5.9' },
      ],
    })
    expect(whatClaudeHas().skills).toEqual([
      { scope: 'user', version: '0.6.0', folder: '' },
      { scope: 'project', version: '0.5.9', folder: repo },
    ])
    expect(installedSkills(repo)).toBe('0.5.9')
    expect(installedSkills(join(yard.path, 'other'))).toBe('0.6.0')
  })
})

describe('what bringing it up to date takes', () => {
  it('is nothing when the skills are the app’s and nothing older is there', () => {
    knowsTheMarketplace()
    installs({
      'codegraph-app@codegraph': [{ scope: 'user', version: '0.6.0' }],
    })
    expect(stepsToBringUpToDate(whatClaudeHas(), '0.6.0')).toEqual([])
  })

  it('installs the skills first, then turns the legacy plugin off, then removes the MCP added by hand', () => {
    write('.claude.json', { mcpServers: { codegraph: OLD_MCP } })
    write('settings.json', { enabledPlugins: { 'codegraph@codegraph': true } })
    installs({ 'codegraph@codegraph': [{ scope: 'user', version: '0.6.0' }] })
    expect(stepsToBringUpToDate(whatClaudeHas(), '0.6.0').map((s) => [s.says, s.args.join(' ')])).toEqual([
      ['Add the codegraph marketplace', 'plugin marketplace add JonathanHarris15/codegraph'],
      ["Install codegraph's skills", 'plugin install codegraph-app@codegraph --scope user'],
      ['Turn the legacy codegraph plugin off', 'plugin disable codegraph@codegraph --scope user'],
      ['Uninstall the legacy codegraph plugin', 'plugin uninstall codegraph@codegraph --scope user'],
      ['Remove the codegraph MCP added by hand', 'mcp remove --scope user codegraph'],
    ])
  })

  it('updates each install older than the app, in its own folder', () => {
    const repo = join(yard.path, 'notes')
    mkdirSync(repo)
    knowsTheMarketplace()
    installs({
      'codegraph-app@codegraph': [
        { scope: 'user', version: '0.6.0' },
        { scope: 'project', projectPath: repo, version: '0.5.9' },
      ],
    })
    expect(stepsToBringUpToDate(whatClaudeHas(), '0.6.0').map((s) => [s.args.join(' '), s.folder])).toEqual([
      ['plugin marketplace update codegraph', ''],
      ['plugin update codegraph-app@codegraph --scope project', repo],
    ])
  })
})

describe('bringing it up to date', () => {
  /** A stand-in for the claude command: it writes down what it was asked,
   *  and where, and fails when asked to do what FAIL says. */
  const aClaude = (): { asked: () => string[] } => {
    const log = join(yard.path, 'asked.log')
    const script = join(yard.path, 'claude-command')
    writeFileSync(
      script,
      `#!${process.execPath}\nconst a = process.argv.slice(2).join(' ')\nrequire('node:fs').appendFileSync(${JSON.stringify(log)}, a + ' @ ' + process.cwd() + '\\n')\nif (process.env.FAIL && a.includes(process.env.FAIL)) { console.error('No network'); process.exit(1) }\n`,
    )
    chmodSync(script, 0o755)
    useClaude(script)
    return { asked: () => readFileSync(log, 'utf8').trim().split('\n') }
  }

  it("runs each step with Claude Code's own command, in its folder", async () => {
    const claude = aClaude()
    const folder = join(yard.path, 'notes')
    mkdirSync(folder)
    knowsTheMarketplace()
    installs({
      'codegraph-app@codegraph': [{ scope: 'user', version: '0.6.0' }],
    })
    write('.claude.json', {
      projects: { [folder]: { mcpServers: { cg: OLD_MCP } } },
    })
    const done = await bringClaudeUpToDate(stepsToBringUpToDate(whatClaudeHas(), '0.6.0'))
    expect(done).toEqual({
      done: ['Remove the codegraph MCP added by hand'],
      failed: null,
    })
    expect(claude.asked()).toEqual([`mcp remove --scope local cg @ ${realpathSync(folder)}`])
  })

  it('stops at the first step that fails, so an old MCP is never removed before the skills are in', async () => {
    const claude = aClaude()
    write('.claude.json', { mcpServers: { codegraph: OLD_MCP } })
    process.env['FAIL'] = 'plugin install'
    try {
      const done = await bringClaudeUpToDate(stepsToBringUpToDate(whatClaudeHas(), '0.6.0'))
      expect(done).toEqual({
        done: ['Add the codegraph marketplace'],
        failed: { says: "Install codegraph's skills", said: 'No network' },
      })
      expect(claude.asked().map((a) => a.split(' @ ')[0])).toEqual([
        'plugin marketplace add JonathanHarris15/codegraph',
        'plugin install codegraph-app@codegraph --scope user',
      ])
    } finally {
      delete process.env['FAIL']
    }
  })

  it('says so when there is no claude command to run', async () => {
    useClaude('')
    const done = await bringClaudeUpToDate(stepsToBringUpToDate(whatClaudeHas(), '0.6.0'))
    expect(done.failed).toEqual({
      says: 'Add the codegraph marketplace',
      said: 'The claude command is not on this computer.',
    })
  })
})
