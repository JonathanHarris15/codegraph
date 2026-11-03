// codegraph: feature check-code in agent
// codegraph: uses reader
// codegraph: command check
import { checkRepo, proposalProgress, PROPOSAL_FOLDER, type Mismatch, type Progress } from '../modules/reader/index.js'

export type Checked = { clean: boolean; mismatches: Mismatch[]; proposal: Progress | null; words: string }

const TODO: Record<string, string> = { 'to build': 'build', 'to remove': 'take away' }

/** What is left of a proposal, the way an agent works through it. Like a
 *  failing test, it fails the check until it is built, and then until it is
 *  deleted, so it never reaches the main line (ADR 0007). */
const proposalWords = (progress: Progress): string[] => {
  const about = progress.says ? `: "${progress.says}"` : ''
  if (progress.built)
    return [
      `The proposal on this branch is built${about}. Everything it draws is in the code and nothing else changed.`,
      `Run the tests. When they pass, delete ${PROPOSAL_FOLDER}/ in this same change, so it never reaches the main line.`,
    ]
  const left = progress.items.filter((i) => i.state in TODO)
  return [
    `The proposal on this branch is not built yet${about}.`,
    ...(left.length
      ? [`Still to do (${left.length} of ${progress.items.length}):`, ...left.map((i) => `- ${TODO[i.state]} ${i.what === 'wire' ? 'the wire ' : ''}${i.name}`)]
      : []),
    ...(progress.unasked.length
      ? ['Changed, but the proposal does not draw it. Undo it, or add it to the proposal and say so:', ...progress.unasked.map((u) => `- ${u}`)]
      : []),
    ...(progress.baseRead ? [] : ['The commit it was drawn on could not be found, so changes it does not draw are not checked.']),
  ]
}

/** Holds a repo's live folder to its tags and config, and to the proposal on
 *  its branch if there is one, and says what does not fit, one line each,
 *  the way an agent or a person fixes them. */
export const checkCode = async (repo: string): Promise<Checked> => {
  const [mismatches, proposal] = await Promise.all([checkRepo(repo), proposalProgress(repo)])
  const tags =
    mismatches.length === 0
      ? ['Nothing to fix: the code fits its tags and config.']
      : [
          `${mismatches.length} ${mismatches.length === 1 ? 'thing does' : 'things do'} not fit:`,
          ...mismatches.map((m) => `${m.file}${m.line ? `:${m.line}` : ''}  ${m.says}`),
        ]
  const words = [...tags, ...(proposal ? ['', ...proposalWords(proposal)] : [])].join('\n')
  return { clean: mismatches.length === 0 && proposal === null, mismatches, proposal, words }
}
