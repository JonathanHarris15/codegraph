// codegraph: module repo
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** How far codegraph is turned on in one working copy. */
export type SetupFacts = {
  /** The repo's own .claude/settings.json names codegraph, so it loads for everyone. */
  toolsOn: boolean
  /** Its CLAUDE.md carries the codegraph rules. */
  rulesWritten: boolean
  /** How many source files carry a codegraph tag. */
  taggedFiles: number
  /** How many source files were looked at. */
  sourceFiles: number
}

const SKIP = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  '.venv',
  'venv',
  '__pycache__',
  '.next',
  '.codegraph',
])
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|cs|php|svelte|vue)$/i
const LOOK_AT = 600

const text = (path: string): string => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

const sourceFilesUnder = (root: string): string[] => {
  const found: string[] = []
  const walk = (dir: string): void => {
    if (found.length >= LOOK_AT) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= LOOK_AT) return
      if (SKIP.has(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') && entry.name !== '.claude') continue
        walk(path)
      } else if (SOURCE.test(entry.name)) found.push(path)
    }
  }
  walk(root)
  return found
}

const carriesTag = (path: string): boolean =>
  text(path)
    .split(/\r?\n/, 30)
    .some((line) => /codegraph:/.test(line))

export const readSetup = (path: string): SetupFacts => {
  if (!path) return { toolsOn: false, rulesWritten: false, taggedFiles: 0, sourceFiles: 0 }
  const settings = text(join(path, '.claude', 'settings.json'))
  const rules = text(join(path, 'CLAUDE.md'))
  const files = sourceFilesUnder(path)
  return {
    toolsOn: /codegraph/i.test(settings),
    rulesWritten: /codegraph/i.test(rules),
    taggedFiles: files.filter(carriesTag).length,
    sourceFiles: files.length,
  }
}
