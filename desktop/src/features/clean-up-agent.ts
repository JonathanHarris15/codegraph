// codegraph: feature clean-up-agent in workspace
// codegraph: uses machine, claude-code
import { bringClaudeUpToDate, stepsToBringUpToDate, whatClaudeHas } from '../modules/claude-code/index.js'
import { appVersion } from '../modules/machine/index.js'

export type CleanedUp = {
  /** What was done, in a person's words. */
  done: string[]
  /** What stopped it, '' if nothing did. */
  problem: string
}

/** Brings Claude Code up to what this app expects, with Claude Code's own
 *  command: codegraph's skills in at the app's version, then the legacy plugin
 *  and any MCP added by hand taken out (ADR 0039). */
export const cleanUpAgent = async (): Promise<CleanedUp> => {
  const { done, failed } = await bringClaudeUpToDate(stepsToBringUpToDate(whatClaudeHas(), await appVersion()))
  const lower = (says: string): string => says.charAt(0).toLowerCase() + says.slice(1)
  return {
    done,
    problem: failed ? `Couldn't ${lower(failed.says)}: ${failed.said}` : '',
  }
}
