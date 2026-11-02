// codegraph: module repo
import { git } from './run.js'

/** How far codegraph is turned on in a repo, read at one point in its
 *  history. Whether a repo is set up is a question about the repo, so it is
 *  asked of the main line, not of whichever branch is checked out. */
export type SetupFacts = {
  /** The repo's committed .claude/settings.json names codegraph, so it loads
   *  for everyone who opens the repo. */
  toolsOn: boolean
  /** Its CLAUDE.md carries the codegraph rules. */
  rulesWritten: boolean
  /** How many source files carry a codegraph tag. */
  taggedFiles: number
  /** How many source files there are to tag. */
  sourceFiles: number
}

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|cs|php|svelte|vue)$/i

export const noSetup: SetupFacts = {
  toolsOn: false,
  rulesWritten: false,
  taggedFiles: 0,
  sourceFiles: 0,
}

const lines = (text: string): string[] => (text ? text.split(/\r?\n/) : [])

/** Reads a repo as it stands at one ref — only what git tracks there, so
 *  node_modules and other untracked clutter never counts. */
export const readSetupAt = async (path: string, ref: string): Promise<SetupFacts> => {
  if (!path || !ref) return noSetup

  const [settings, rules] = await Promise.all([
    git(path, ['show', `${ref}:.claude/settings.json`]),
    git(path, ['show', `${ref}:CLAUDE.md`]),
  ])
  const toolsOn = /codegraph/i.test(settings)
  const rulesWritten = /codegraph/i.test(rules)

  // Counting tags means reading the whole tree, which is slow on a big repo.
  // A repo missing the plugin or the rules is not set up whatever the tags
  // say, so there is nothing to learn by counting them.
  if (!toolsOn || !rulesWritten) return { ...noSetup, toolsOn, rulesWritten }

  const [tagged, listed] = await Promise.all([
    git(path, ['grep', '--files-with-matches', '-I', 'codegraph:', ref]),
    git(path, ['ls-tree', '-r', '--name-only', ref]),
  ])

  return {
    toolsOn,
    rulesWritten,
    taggedFiles: lines(tagged)
      .map((line) => line.slice(line.indexOf(':') + 1))
      .filter((file) => SOURCE.test(file)).length,
    sourceFiles: lines(listed).filter((file) => SOURCE.test(file)).length,
  }
}

/** Codegraph is turned on here: the plugin, the rules, and tags on the code. */
export const isSetUp = (facts: SetupFacts): boolean =>
  facts.toolsOn && facts.rulesWritten && facts.taggedFiles > 0
