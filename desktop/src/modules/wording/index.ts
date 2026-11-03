// codegraph: module wording
// codegraph: front door sentenceOf, spoken, verbOf, Said, SaidPart

/** One stretch of a sentence, and what it is doing there, so a screen can
 *  set the names apart from the rest. */
export type SaidPart = { text: string; role: 'name' | 'verb' | 'words' | 'plain' }
export type Said = SaidPart[]

/** The verb each kind of wire is read with. Kinds have been renamed as the
 *  wording got sharper; the old names still read the new way. */
const VERBS: Record<string, string> = {
  uses: 'uses',
  asks: 'asks',
  'acts on': 'asks',
  reads: 'reads',
  shows: 'reads',
  starts: 'starts',
  keeps: 'keeps',
  calls: 'calls',
  'leads to': 'leads to',
}

export const verbOf = (kind: string): string => VERBS[kind] ?? kind

/** Verbs whose plain form a rule cannot reach. */
const ODD: Record<string, string> = { has: 'have', is: 'be', does: 'do', goes: 'go' }

/** Words that end in s but are not a verb said of one thing. */
const NOT_VERBS = new Set(['this', 'his', 'its', 'as', 'us', 'yes', 'news', 'thus', 'plus', 'is'])

/** A verb said of one thing, taken back to its plain form, or '' when the
 *  word does not look like one. */
const plainVerb = (word: string): string => {
  const lower = word.toLowerCase()
  if (ODD[lower]) return ODD[lower]!
  if (NOT_VERBS.has(lower) || lower.length < 3 || !lower.endsWith('s') || lower.endsWith('ss')) return ''
  if (lower.endsWith('ies') && lower.length > 4) return lower.slice(0, -3) + 'y'
  if (/(sses|shes|ches|xes|zes|oes)$/.test(lower)) return lower.slice(0, -2)
  return lower.slice(0, -1)
}

/** The words a wire carries in the code ("saves the note") as they read after
 *  "to" ("save the note"), or '' when they do not start with a verb said of
 *  one thing, and so cannot follow "to". */
export const spoken = (words: string): string => {
  const parts = words.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ? plainVerb(parts[0]) : ''
  if (!first) return ''
  parts[0] = first
  // "reads and writes people": the verb straight after the first "and" or
  // "or" is turned too; nothing further along is.
  if ((parts[1] === 'and' || parts[1] === 'or') && parts[2]) parts[2] = plainVerb(parts[2]) || parts[2]
  return parts.join(' ')
}

/** A wire as a sentence: who acts, how, on what, and what for —
 *  "write-note uses notes to save the note". */
export const sentenceOf = (from: string, kind: string, to: string, words: string): Said => {
  const verb = verbOf(kind)
  const name = (text: string): SaidPart => ({ text, role: 'name' })
  const gap: SaidPart = { text: ' ', role: 'plain' }
  const said = words.trim()

  if (verb === 'keeps') {
    const kept = said.replace(/^keeps\s+/i, '')
    const what = said && kept !== said ? kept : 'its data'
    const tail: Said = said && kept === said ? [{ text: ` — ${said}`, role: 'words' }] : []
    return [name(from), gap, { text: 'keeps', role: 'verb' }, { text: ` ${what} in `, role: 'plain' }, name(to), ...tail]
  }

  const head: Said = [name(from), gap, { text: verb, role: 'verb' }, gap, name(to)]
  if (!said) return head
  const following = spoken(said)
  return following
    ? [...head, { text: ` to ${following}`, role: 'words' }]
    : [...head, { text: ` — ${said}`, role: 'words' }]
}
