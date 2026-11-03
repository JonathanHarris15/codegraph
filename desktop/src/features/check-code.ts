// codegraph: feature check-code in agent
// codegraph: uses reader
// codegraph: command check
import { checkRepo, type Mismatch } from '../modules/reader/index.js'

export type Checked = { clean: boolean; mismatches: Mismatch[]; words: string }

/** Holds a repo's live folder to its tags and config, and says what does
 *  not fit, one line each, the way an agent or a person fixes them. */
export const checkCode = async (repo: string): Promise<Checked> => {
  const mismatches = await checkRepo(repo)
  const words =
    mismatches.length === 0
      ? 'Nothing to fix: the code fits its tags and config.'
      : [
          `${mismatches.length} ${mismatches.length === 1 ? 'thing does' : 'things do'} not fit:`,
          ...mismatches.map((m) => `${m.file}${m.line ? `:${m.line}` : ''}  ${m.says}`),
        ].join('\n')
  return { clean: mismatches.length === 0, mismatches, words }
}
