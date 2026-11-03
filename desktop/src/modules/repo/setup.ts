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
}

export const CONFIG = 'codegraph.config.json'

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|cs|php|svelte|vue)$/i

export const noSetup: SetupFacts = {
  configWritten: false,
  projects: [],
  taggedFiles: 0,
  sourceFiles: 0,
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

/** Reads a repo as it stands at one ref — only what git tracks there, so
 *  node_modules and other untracked clutter never counts. */
export const readSetupAt = async (path: string, ref: string): Promise<SetupFacts> => {
  if (!path || !ref) return noSetup

  const config = await git(path, ['show', `${ref}:${CONFIG}`])
  // Counting tags means reading the whole tree, which is slow on a big repo,
  // and tells nothing about a repo with no config.
  if (!config) return noSetup

  const [tagged, listed] = await Promise.all([
    git(path, ['grep', '--files-with-matches', '-I', 'codegraph:', ref]),
    git(path, ['ls-tree', '-r', '--name-only', ref]),
  ])

  return {
    configWritten: true,
    projects: projectsIn(config),
    taggedFiles: lines(tagged)
      .map((line) => line.slice(line.indexOf(':') + 1))
      .filter((file) => SOURCE.test(file)).length,
    sourceFiles: lines(listed).filter((file) => SOURCE.test(file)).length,
  }
}

/** Set up: the repo has its config committed. How well its code fits is the
 *  check's question, not this one. */
export const isSetUp = (facts: SetupFacts): boolean => facts.configWritten
