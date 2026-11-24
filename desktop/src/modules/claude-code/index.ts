// codegraph: module claude-code
// codegraph: front door whatClaudeHas, installedSkills, stepsToBringUpToDate, bringClaudeUpToDate, commandLine, findClaude, useClaude, ClaudeHas, Step, BroughtUpToDate

/** Claude Code on this computer: what it has of codegraph, read from its own
 *  files, and the steps that bring it up to date, run with its own `claude`
 *  command (ADRs 0037, 0039). Its files are only ever read here; Claude Code
 *  rewrites them while it runs, so every change goes through its command. */
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { olderVersion, sameFolder } from '../machine/index.js'

export const SKILLS = 'codegraph-app@codegraph'
export const LEGACY = 'codegraph@codegraph'
const MARKETPLACE = 'codegraph'
const ON_GITHUB = 'JonathanHarris15/codegraph'

type Scope = 'user' | 'project' | 'local'

export type ClaudeHas = {
  /** Claude Code has run on this computer: its folder or its file is here. */
  present: boolean
  /** Each install of codegraph's skills: for the person (`user`), or for one
   *  repo's folder. */
  skills: { scope: Scope; version: string; folder: string }[]
  /** The legacy plugin, installed for the person, or turned on for them. */
  legacy: { installed: boolean; on: boolean }
  /** MCPs that run the app's MCP, added by hand with `claude mcp add`: for the
   *  person (folder '') or for one folder. */
  handAdded: { name: string; folder: string }[]
  /** Claude Code knows codegraph's marketplace. */
  marketplace: boolean
}

const configFolder = (): string => process.env['CLAUDE_CONFIG_DIR'] || join(homedir(), '.claude')
/** Claude Code keeps MCPs in a file beside its folder, or inside the one
 *  CLAUDE_CONFIG_DIR names. */
const mcpFile = (): string =>
  process.env['CLAUDE_CONFIG_DIR'] ? join(process.env['CLAUDE_CONFIG_DIR'], '.claude.json') : join(homedir(), '.claude.json')

const read = (file: string): Record<string, unknown> => {
  try {
    const json = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return json && typeof json === 'object' ? (json as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {})

type Install = { scope?: unknown; projectPath?: unknown; version?: unknown }
const installsOf = (plugin: string): Install[] => {
  const entry = record(read(join(configFolder(), 'plugins', 'installed_plugins.json'))['plugins'])[plugin]
  return (Array.isArray(entry) ? entry : entry ? [entry] : []) as Install[]
}

/** An MCP that starts the app's own MCP: node running codegraph's
 *  `out/main/mcp.js`. Another program called codegraph is not one. */
const runsTheAppsMcp = (server: unknown): boolean => {
  const args = record(server)['args']
  return Array.isArray(args) && args.some((a) => typeof a === 'string' && /codegraph/i.test(a) && /out[\\/]main[\\/]mcp\.js$/.test(a))
}
const handAddedIn = (servers: unknown, folder: string): ClaudeHas['handAdded'] =>
  Object.entries(record(servers))
    .filter(([, server]) => runsTheAppsMcp(server))
    .map(([name]) => ({ name, folder }))

const skillsInstalled = (): ClaudeHas['skills'] =>
  installsOf(SKILLS).flatMap((i) => {
    const scope = i.scope === 'project' || i.scope === 'local' ? i.scope : 'user'
    const folder = scope === 'user' ? '' : typeof i.projectPath === 'string' ? i.projectPath : ''
    if (typeof i.version !== 'string' || (scope !== 'user' && !existsSync(folder))) return []
    return [{ scope, version: i.version, folder }]
  })

export const whatClaudeHas = (): ClaudeHas => {
  const mcps = read(mcpFile())
  const forFolders = Object.entries(record(mcps['projects']))
    .filter(([folder]) => existsSync(folder))
    .flatMap(([folder, settings]) => handAddedIn(record(settings)['mcpServers'], folder))
  return {
    present: existsSync(configFolder()) || existsSync(mcpFile()),
    skills: skillsInstalled(),
    legacy: {
      installed: installsOf(LEGACY).some((i) => i.scope === 'user' || i.scope === undefined),
      on: record(read(join(configFolder(), 'settings.json'))['enabledPlugins'])[LEGACY] === true,
    },
    handAdded: [...handAddedIn(mcps['mcpServers'], ''), ...forFolders],
    marketplace: MARKETPLACE in read(join(configFolder(), 'plugins', 'known_marketplaces.json')),
  }
}

/** The version of codegraph's skills Claude Code has installed for a repo:
 *  for that repo alone, or else for the person. '' for none (ADR 0037). */
export const installedSkills = (repo: string): string => {
  const skills = skillsInstalled()
  return (
    (skills.find((s) => s.scope !== 'user' && !!repo && sameFolder(s.folder, repo)) ?? skills.find((s) => s.scope === 'user'))?.version ??
    ''
  )
}

/** One thing to ask Claude Code to do: its arguments, the folder to ask in
 *  ('' for anywhere), and what it does, in a person's words. */
export type Step = { args: string[]; folder: string; says: string }

/** Everything that brings Claude Code up to what this app expects, in the
 *  order that never leaves an agent with no codegraph: the skills first, then
 *  the old ones out (ADR 0039). */
export const stepsToBringUpToDate = (has: ClaudeHas, app: string): Step[] => {
  const steps: Step[] = []
  const anywhere = (says: string, ...args: string[]): void => void steps.push({ args, folder: '', says })
  if (has.skills.length === 0) {
    if (!has.marketplace) anywhere('Add the codegraph marketplace', 'plugin', 'marketplace', 'add', ON_GITHUB)
    anywhere("Install codegraph's skills", 'plugin', 'install', SKILLS, '--scope', 'user')
  } else {
    const behind = has.skills.filter((s) => olderVersion(s.version, app))
    if (behind.length > 0) anywhere('Fetch the newest codegraph skills', 'plugin', 'marketplace', 'update', MARKETPLACE)
    for (const s of behind)
      steps.push({
        args: ['plugin', 'update', SKILLS, '--scope', s.scope],
        folder: s.folder,
        says: s.folder ? `Update codegraph's skills in ${s.folder}` : "Update codegraph's skills",
      })
  }
  if (has.legacy.on) anywhere('Turn the legacy codegraph plugin off', 'plugin', 'disable', LEGACY, '--scope', 'user')
  if (has.legacy.installed) anywhere('Uninstall the legacy codegraph plugin', 'plugin', 'uninstall', LEGACY, '--scope', 'user')
  for (const m of has.handAdded)
    steps.push({
      args: ['mcp', 'remove', '--scope', m.folder ? 'local' : 'user', m.name],
      folder: m.folder,
      says: 'Remove the codegraph MCP added by hand',
    })
  return steps
}

/** A step as a person would type it in a terminal. */
export const commandLine = (step: Step): string => {
  const line = ['claude', ...step.args].join(' ')
  return step.folder ? `cd "${step.folder}" && ${line}` : line
}

let handed: string | null = null

/** The shell, or a test, says where the claude command is: '' for nowhere,
 *  null to go back to looking for it. */
export const useClaude = (where: string | null): void => {
  handed = where
}

/** Where Claude Code puts its command: on the PATH, in its own installers'
 *  folders, or inside the Claude desktop app. A window opened from the Dock
 *  has a short PATH, so the usual folders are looked in too. */
export const findClaude = (): string => {
  if (handed !== null) return handed
  // A test of the whole app, or a person with Claude Code somewhere unusual, says where.
  if (process.env['CODEGRAPH_CLAUDE']) return process.env['CODEGRAPH_CLAUDE']
  const home = homedir()
  const windows = process.platform === 'win32'
  const names = windows ? ['claude.exe', 'claude.cmd'] : ['claude']
  const folders = [
    ...(process.env['PATH'] ?? '').split(delimiter),
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(home, '.npm-global', 'bin'),
    ...(windows && process.env['APPDATA'] ? [join(process.env['APPDATA'], 'npm')] : []),
  ].filter(Boolean)
  for (const folder of folders) for (const name of names) if (existsSync(join(folder, name))) return join(folder, name)
  return inTheDesktopApp(home)
}

/** The newest copy of Claude Code the Claude desktop app keeps for itself. */
const inTheDesktopApp = (home: string): string => {
  const root = process.platform === 'darwin' ? join(home, 'Library', 'Application Support', 'Claude', 'claude-code') : ''
  if (!root || !existsSync(root)) return ''
  const versions = readdirSync(root)
    .filter((v) => /^\d/.test(v))
    .sort((a, b) => (olderVersion(a, b) ? 1 : olderVersion(b, a) ? -1 : 0))
  for (const version of versions)
    for (const build of readdirSync(join(root, version))) {
      const command = join(root, version, build, 'claude.app', 'Contents', 'MacOS', 'claude')
      if (existsSync(command)) return command
    }
  return ''
}

export type BroughtUpToDate = {
  /** What was done, in a person's words. */
  done: string[]
  /** The step that failed, and what Claude Code said; null if none did. */
  failed: { says: string; said: string } | null
}

const run = (command: string, step: Step): Promise<string | null> =>
  new Promise((done) => {
    const path = [
      dirname(command),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      join(homedir(), '.local', 'bin'),
      process.env['PATH'] ?? '',
    ].join(delimiter)
    execFile(
      command,
      step.args,
      {
        cwd: step.folder || homedir(),
        env: { ...process.env, PATH: path },
        timeout: 120_000,
        windowsHide: true,
        shell: command.endsWith('.cmd'),
      },
      (error, stdout, stderr) => done(error ? (stderr || stdout || error.message).trim() : null),
    )
  })

/** Runs each step with Claude Code's own command, and stops at the first that
 *  fails, so nothing old is taken away before what replaces it is in. */
export const bringClaudeUpToDate = async (steps: Step[]): Promise<BroughtUpToDate> => {
  const command = findClaude()
  const done: string[] = []
  for (const step of steps) {
    const said = command ? await run(command, step) : 'The claude command is not on this computer.'
    if (said !== null) return { done, failed: { says: step.says, said } }
    done.push(step.says)
  }
  return { done, failed: null }
}
