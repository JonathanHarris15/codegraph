// codegraph: module repo
import { git } from './run.js'

/** How far codegraph is set up in a repo, read at one point in its history.
 *  Whether a repo is set up is a question about the repo, so it is asked of
 *  the main line, not of whichever branch is checked out. */
export type SetupFacts = {
  /** It has a committed codegraph.config.json (ADR 0008). */
  configWritten: boolean
  /** The projects its config says it serves (ADR 0006). */
  projects: string[]
  /** How many source files carry a codegraph tag. */
  taggedFiles: number
  /** How many source files there are to tag. */
  sourceFiles: number
  /** Its committed .claude/settings.json turns codegraph's skills on for
   *  everyone on the repo (ADR 0037). */
  skillsOn: boolean
  /** The setup its config says it got, '' where it names none (ADR 0039). */
  setup: string
  /** What an older codegraph left on its main line that setup now clears out. */
  leftOver: string[]
}

export const CONFIG = 'codegraph.config.json'

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|cs|php|svelte|vue)$/i

export const noSetup: SetupFacts = {
  configWritten: false,
  projects: [],
  taggedFiles: 0,
  sourceFiles: 0,
  skillsOn: false,
  setup: '',
  leftOver: [],
}

const lines = (text: string): string[] => (text ? text.split(/\r?\n/) : [])

/** The projects a config names, or none where it cannot be read. */
export const projectsIn = (config: string): string[] => {
  try {
    const projects = (JSON.parse(config) as { projects?: unknown }).projects
    return Array.isArray(projects) ? projects.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

/** The setup a config says it got. */
const setupIn = (config: string): string => {
  try {
    const setup = (JSON.parse(config) as { setup?: unknown }).setup
    return typeof setup === 'string' ? setup.trim() : ''
  } catch {
    return ''
  }
}

/** codegraph's plugin, as a repo's settings and Claude Code name it. */
export const SKILLS_PLUGIN = 'codegraph-app@codegraph'
/** The legacy codegraph's plugin, which setup turns off in a repo. */
const LEGACY_PLUGIN = 'codegraph@codegraph'

/** What an older codegraph leaves in a repo that setup now clears out: the
 *  glossary and ADRs it moves into codegraph/ (ADR 0035), the legacy plugin
 *  turned on for everyone, and an MCP committed for everyone. */
const leftOverIn = (files: string[], settings: string, mcps: string): string[] => {
  const plugins = (text: string): Record<string, unknown> => {
    try {
      return (JSON.parse(text) as { enabledPlugins?: Record<string, unknown> }).enabledPlugins ?? {}
    } catch {
      return {}
    }
  }
  return [
    files.includes('CONTEXT.md') ? 'CONTEXT.md' : '',
    files.some((f) => f.startsWith('docs/adr/')) ? 'docs/adr/' : '',
    plugins(settings)[LEGACY_PLUGIN] === true ? 'the legacy codegraph plugin, turned on in .claude/settings.json' : '',
    /codegraph[^"]*out[\\/]+main[\\/]+mcp\.js/i.test(mcps) ? 'a codegraph MCP in .mcp.json' : '',
  ].filter(Boolean)
}

/** A repo's Claude Code settings turn codegraph's skills on. */
const turnsSkillsOn = (settings: string): boolean => {
  try {
    return (JSON.parse(settings) as { enabledPlugins?: Record<string, unknown> }).enabledPlugins?.[SKILLS_PLUGIN] === true
  } catch {
    return false
  }
}

/** Reads a repo as it stands at one ref — only what git tracks there, so
 *  node_modules and other untracked clutter never counts. */
export const readSetupAt = async (path: string, ref: string): Promise<SetupFacts> => {
  if (!path || !ref) return noSetup

  const config = await git(path, ['show', `${ref}:${CONFIG}`])
  // Counting tags means reading the whole tree, which is slow on a big repo,
  // and tells nothing about a repo with no config.
  if (!config) return noSetup

  const [tagged, listed, settings, mcps] = await Promise.all([
    git(path, ['grep', '--files-with-matches', '-I', 'codegraph:', ref]),
    git(path, ['ls-tree', '-r', '--name-only', ref]),
    git(path, ['show', `${ref}:.claude/settings.json`]),
    git(path, ['show', `${ref}:.mcp.json`]),
  ])

  return {
    configWritten: true,
    projects: projectsIn(config),
    taggedFiles: lines(tagged)
      .map((line) => line.slice(line.indexOf(':') + 1))
      .filter((file) => SOURCE.test(file)).length,
    sourceFiles: lines(listed).filter((file) => SOURCE.test(file)).length,
    skillsOn: turnsSkillsOn(settings),
    setup: setupIn(config),
    leftOver: leftOverIn(lines(listed), settings, mcps),
  }
}

/** Set up: the repo has its config committed. How well its code fits is the
 *  check's question, not this one. */
export const isSetUp = (facts: SetupFacts): boolean => facts.configWritten
