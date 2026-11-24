// codegraph: module reader
import { createHash } from 'node:crypto'
import { Document, isScalar, isSeq, parse, visit } from 'yaml'

/** Where a set-up repo keeps its part of the ontology map (ADR 0035). */
export const ONTOLOGY = 'codegraph'
const TERMS = `${ONTOLOGY}/terms/`
const ADRS = `${ONTOLOGY}/adr/`

export const isTermFile = (path: string): boolean => path.startsWith(TERMS) && path.endsWith('.md') && !path.slice(TERMS.length).includes('/')
export const isAdrFile = (path: string): boolean => path.startsWith(ADRS) && path.endsWith('.md') && !path.slice(ADRS.length).includes('/')
export const isOntologyFile = (path: string): boolean => isTermFile(path) || isAdrFile(path)

/** How many of another term each of a term's records points at. */
export type HowMany = 'one' | 'none or one' | 'many'
export const HOW_MANY: HowMany[] = ['one', 'none or one', 'many']

export type TermLink = {
  term: string
  howMany: HowMany
  /** The words for the wire; '' for none. */
  says: string
}

/** One word a project uses for one thing (ADR 0035). */
export type Term = {
  name: string
  file: string
  /** What it means, in the prose under its head. */
  says: string
  /** The store whose records are this term; '' for none. */
  store: string
  pointsAt: TermLink[]
  avoid: string[]
  settledBy: number[]
  /** A fingerprint of the term as it is written, leaving out where it was
   *  borrowed from. A copy that matches what it was borrowed as is untouched. */
  sum: string
  /** Where a copy of another repo's term came from (ADR 0036); null for a
   *  term this repo defines. */
  borrowed: { from: string; commit: string; sum: string } | null
}

/** A component as a rule names it: `module wardrobe`, `any queue`, `any page`. */
export type Rule =
  | { kind: 'never reaches'; from: string; to: string }
  | { kind: 'only through'; to: string; by: string }
  | { kind: 'only writer'; store: string; by: string }
export const RULE_KINDS: Rule['kind'][] = ['never reaches', 'only through', 'only writer']

export type AdrStatus = 'proposed' | 'accepted' | 'replaced'
export const STATUSES: AdrStatus[] = ['proposed', 'accepted', 'replaced']

/** Another way that was weighed, and why it lost. */
export type Alternative = { option: string; whyNot: string }

/** One decision, laid out as the team's ADR template has it (ADR 0035): who
 *  decided and when, then six sections, and the rules the code keeps to
 *  because of it. A section it does not have is ''. */
export type Adr = {
  number: number
  title: string
  file: string
  status: AdrStatus
  /** YYYY-MM-DD, or '' when it does not say. */
  date: string
  deciders: string[]
  consulted: string
  area: string
  related: string[]
  replaces: number[]
  terms: string[]
  rules: Rule[]
  context: string
  decision: string
  alternatives: Alternative[]
  evidence: string
  good: string
  bad: string
  followUp: string
  revisit: string
}

/** The template's six sections, by the heading each is written under, in order. */
export const ADR_SECTIONS = ['Context', 'Decision', 'Alternatives', 'Evidence', 'Consequences', 'Revisit when'] as const
export type AdrSection = (typeof ADR_SECTIONS)[number]

/** The sections an ADR leaves out or empty. */
export const unwritten = (adr: Adr): AdrSection[] =>
  ADR_SECTIONS.filter((section) =>
    section === 'Context'
      ? !adr.context
      : section === 'Decision'
        ? !adr.decision
        : section === 'Alternatives'
          ? adr.alternatives.length === 0
          : section === 'Evidence'
            ? !adr.evidence
            : section === 'Consequences'
              ? !adr.good && !adr.bad && !adr.followUp
              : !adr.revisit,
  )

/** One repo's part of a project's ontology map: its terms and its ADRs. */
export type OntologyMap = { terms: Term[]; adrs: Adr[] }

/** What could not be read, by file, for the check to tell. */
export type OntologyProblem = { file: string; says: string }

const HEAD = /^---\n([\s\S]*?)\n---[ \t]*(\n|$)/
const BORROWED_LINE = /^(borrowed from|sum):.*\n?/gm

const plain = (text: string): string => text.replace(/^﻿/, '').replace(/\r\n/g, '\n')

const split = (text: string): { head: Record<string, unknown> | null; raw: string; body: string } => {
  const whole = plain(text)
  const top = whole.match(HEAD)
  if (!top) return { head: {}, raw: '', body: whole.trim() }
  let head: Record<string, unknown> | null = null
  try {
    const read: unknown = parse(top[1]!)
    head = read && typeof read === 'object' && !Array.isArray(read) ? (read as Record<string, unknown>) : read == null ? {} : null
  } catch {
    head = null
  }
  return { head, raw: top[1]!, body: whole.slice(top[0].length).trim() }
}

const words = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '')
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : value == null || value === '' ? [] : [value])
const wordsList = (value: unknown): string[] => listOf(value).map(words).filter(Boolean)
const numbers = (value: unknown): number[] =>
  listOf(value)
    .map((v) => (typeof v === 'number' ? v : Number.parseInt(words(v), 10)))
    .filter((n) => Number.isInteger(n))

/** A term's head without the two lines that say where a copy came from,
 *  and what follows the head, as written. */
const parts = (text: string): { head: string; rest: string } => {
  const whole = plain(text)
  const top = whole.match(HEAD)
  return {
    head: top ? top[1]!.replace(BORROWED_LINE, '').replace(/\n+$/, '') : '',
    rest: top ? whole.slice(top[0].length) : whole,
  }
}

/** The term as written, leaving out where a copy came from, so a copy and the
 *  term it was taken from have the same sum. */
const fingerprint = (text: string): string => {
  const { head, rest } = parts(text)
  return createHash('sha256').update(`${head}\n---\n${rest}`).digest('hex').slice(0, 6)
}

export const readTerm = (path: string, text: string, problems: OntologyProblem[]): Term => {
  const { head, body } = split(text)
  const fromFile = path.split('/').pop()!.replace(/\.md$/i, '')
  if (!head) problems.push({ file: path, says: `${path} has a head that is not YAML codegraph can read.` })
  const h = head ?? {}
  const name = words(h.term) || fromFile
  const pointsAt: TermLink[] = []
  for (const link of listOf(h['points at'])) {
    const l = link && typeof link === 'object' ? (link as Record<string, unknown>) : { term: link }
    const term = words(l.term)
    if (!term) continue
    const howMany = words(l['how many']) as HowMany
    if (!HOW_MANY.includes(howMany))
      problems.push({ file: path, says: `${name} points at ${term} without saying how many: one, none or one, or many.` })
    pointsAt.push({ term, howMany: HOW_MANY.includes(howMany) ? howMany : 'one', says: words(l.says) })
  }
  const from = words(h['borrowed from'])
  const at = from.match(/^(.+?)\s*@\s*(\S+)$/)
  return {
    name,
    file: path,
    says: body,
    store: words(h.store),
    pointsAt,
    avoid: wordsList(h.avoid),
    settledBy: numbers(h['settled by']),
    sum: fingerprint(text),
    borrowed: from ? { from: at ? at[1]! : from, commit: at ? at[2]! : '', sum: words(h.sum) } : null,
  }
}

const readRule = (raw: unknown, adr: string, path: string, problems: OntologyProblem[]): Rule | null => {
  const entry = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.entries(raw as Record<string, unknown>) : []
  const [kind, said] = entry.length === 1 ? entry[0]! : [words(raw), {}]
  const s = said && typeof said === 'object' ? (said as Record<string, unknown>) : {}
  const known = RULE_KINDS.includes(kind as Rule['kind'])
  const rule: Rule | null =
    kind === 'never reaches'
      ? { kind, from: words(s.from), to: words(s.to) }
      : kind === 'only through'
        ? { kind, to: words(s.to), by: words(s.by) }
        : kind === 'only writer'
          ? { kind, store: words(s.store), by: words(s.by) }
          : null
  if (!known || !rule) {
    problems.push({ file: path, says: `${adr} has a rule codegraph cannot read: ${kind || 'one with no kind'}. A rule is never reaches, only through or only writer.` })
    return null
  }
  const empty = Object.entries(rule).filter(([key, value]) => key !== 'kind' && !value)
  if (empty.length) {
    problems.push({ file: path, says: `${adr}'s ${kind} rule does not say ${empty.map(([key]) => key).join(' or ')}.` })
    return null
  }
  return rule
}

export const readAdr = (path: string, text: string, problems: OntologyProblem[]): Adr => {
  const { head, body } = split(text)
  if (!head) problems.push({ file: path, says: `${path} has a head that is not YAML codegraph can read.` })
  const h = head ?? {}
  const heading = body.match(/^#\s+(?:(\d+)\.\s*)?(.*)$/m)
  const fromFile = Number.parseInt(path.slice(ADRS.length), 10)
  const number = numbers(h.adr)[0] ?? (heading?.[1] ? Number(heading[1]) : Number.isInteger(fromFile) ? fromFile : 0)
  const named = `ADR ${number}`
  const said = words(h.status).toLowerCase()
  if (!STATUSES.includes(said as AdrStatus))
    problems.push({
      file: path,
      says: said ? `${named} says its status is ${said}; it is proposed, accepted or replaced.` : `${named} does not say its status: proposed, accepted or replaced.`,
    })
  const rules = listOf(h.rules)
    .map((raw) => readRule(raw, named, path, problems))
    .filter((r): r is Rule => r !== null)
  return {
    number,
    title: heading?.[2]?.trim() ?? '',
    file: path,
    // A status it does not know holds the code to nothing, like a proposal.
    status: STATUSES.includes(said as AdrStatus) ? (said as AdrStatus) : 'proposed',
    date: words(h.date instanceof Date ? h.date.toISOString().slice(0, 10) : h.date),
    deciders: wordsList(h.deciders),
    consulted: words(h.consulted),
    area: words(h.area),
    related: wordsList(h.related),
    replaces: numbers(h.replaces),
    terms: wordsList(h.terms),
    rules,
    ...readSections(heading ? body.slice(body.indexOf(heading[0]) + heading[0].length) : body),
  }
}

/** The words under each `## ` heading, by the heading, lower case. */
const sectionsOf = (text: string): Map<string, string> => {
  const found = new Map<string, string>()
  for (const chunk of text.split(/^##[ \t]+/m).slice(1)) {
    const [heading = '', ...rest] = chunk.split('\n')
    found.set(heading.trim().toLowerCase(), rest.join('\n').trim())
  }
  return found
}

/** `- **Name:** words`, one to a line, with any lines after it that are not a
 *  new item joined on. */
const boldList = (text: string): { name: string; words: string }[] => {
  const items: { name: string; words: string }[] = []
  for (const line of text.split('\n')) {
    const item = line.match(/^\s*[-*]\s+\*\*(.+?):?\*\*:?\s*(.*)$/)
    if (item) items.push({ name: item[1]!.replace(/:$/, '').trim(), words: item[2]!.trim() })
    else if (items.length && line.trim()) items[items.length - 1]!.words = `${items[items.length - 1]!.words} ${line.trim()}`.trim()
  }
  return items
}

const readSections = (text: string): Pick<Adr, 'context' | 'decision' | 'alternatives' | 'evidence' | 'good' | 'bad' | 'followUp' | 'revisit'> => {
  const sections = sectionsOf(text)
  const part = (name: string): string => sections.get(name.toLowerCase()) ?? ''
  const consequence = (name: string): string =>
    boldList(part('Consequences')).find((c) => c.name.toLowerCase() === name.toLowerCase())?.words ?? ''
  return {
    context: part('Context'),
    decision: part('Decision'),
    alternatives: boldList(part('Alternatives')).map(({ name, words }) => ({ option: name, whyNot: words })),
    evidence: part('Evidence'),
    good: consequence('Good'),
    bad: consequence('Bad'),
    followUp: consequence('Follow-up work'),
    revisit: part('Revisit when'),
  }
}

/** A repo's part of the ontology map, from the files in its codegraph folder. */
export const readOntology = (files: Map<string, string>, problems: OntologyProblem[]): OntologyMap => {
  const paths = [...files.keys()].sort()
  return {
    terms: paths.filter(isTermFile).map((path) => readTerm(path, files.get(path)!, problems)),
    adrs: paths.filter(isAdrFile).map((path) => readAdr(path, files.get(path)!, problems)),
  }
}

/** A copy of another repo's term, to keep in this one (ADR 0036): the term
 *  word for word, with where it came from and its sum written into its head. */
export const borrowTerm = (text: string, from: string, commit: string): string => {
  const { head, rest } = parts(text)
  const lines = head ? head.split('\n') : []
  const at = lines.findIndex((line) => /^term:/.test(line)) + 1
  lines.splice(at, 0, `borrowed from: ${from} @ ${commit}`, `sum: ${fingerprint(text)}`)
  return `---\n${lines.join('\n')}\n---\n${rest}`
}

const slug = (words: string): string =>
  words
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Where a term of this name is kept: codegraph/terms/garment-care.md. */
export const termFileFor = (name: string): string => `${TERMS}${slug(name) || 'term'}.md`

/** Where an ADR is kept: codegraph/adr/0004-a-garment-belongs-to-one-wardrobe.md. */
export const adrFileFor = (number: number, title: string): string => `${ADRS}${String(number).padStart(4, '0')}-${slug(title) || 'decision'}.md`

/** A YAML head in the order a person reads it, leaving out what is empty. */
const head = (fields: [string, unknown][]): string => {
  const doc = new Document(Object.fromEntries(fields.filter(([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))))
  visit(doc, {
    Seq(_, seq) {
      if (isSeq(seq) && seq.items.every((item) => isScalar(item))) seq.flow = true
    },
  })
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd()
}

/** A term this repo defines, as its file (ADR 0035). A borrowed copy is
 *  written by borrowTerm, never here. */
export const writeTerm = (term: Omit<Term, 'file' | 'sum' | 'borrowed'>): string =>
  `---\n${head([
    ['term', term.name],
    ['store', term.store],
    ['points at', term.pointsAt.map((l) => ({ term: l.term, 'how many': l.howMany, ...(l.says ? { says: l.says } : {}) }))],
    ['avoid', term.avoid],
    ['settled by', term.settledBy],
  ])}\n---\n${term.says.trim()}\n`

const ruleHead = (rule: Rule): Record<string, Record<string, string>> => {
  const { kind, ...rest } = rule
  return { [kind]: rest as Record<string, string> }
}

/** An ADR as its file, on the team's template: its head, then the six
 *  sections in order, every one written even when empty (ADR 0035). */
export const writeAdr = (adr: Omit<Adr, 'file'>): string => {
  const section = (name: AdrSection, words: string): string => `## ${name}\n\n${words.trim()}${words.trim() ? '\n' : ''}`
  return [
    `---\n${head([
      ['adr', adr.number],
      ['status', adr.status],
      ['date', adr.date],
      ['deciders', adr.deciders],
      ['consulted', adr.consulted],
      ['area', adr.area],
      ['related', adr.related],
      ['replaces', adr.replaces],
      ['terms', adr.terms],
      ['rules', adr.rules.map(ruleHead)],
    ])}\n---`,
    `# ${adr.number}. ${adr.title}\n`,
    section('Context', adr.context),
    section('Decision', adr.decision),
    section('Alternatives', adr.alternatives.map((a) => `- **${a.option}:** ${a.whyNot}`.trimEnd()).join('\n')),
    section('Evidence', adr.evidence),
    section(
      'Consequences',
      [
        ['Good', adr.good],
        ['Bad', adr.bad],
        ['Follow-up work', adr.followUp],
      ]
        .filter(([, w]) => w)
        .map(([n, w]) => `- **${n}:** ${w}`)
        .join('\n'),
    ),
    section('Revisit when', adr.revisit),
  ].join('\n')
}
