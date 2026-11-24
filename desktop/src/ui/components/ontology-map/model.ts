// codegraph: component ontology-map
import type { FileChange, OntologyShown } from '../../../features/show-ontology.js'
import type { Adr, HowMany, Rule, Term } from '../../../modules/reader/index.js'

export type { Adr, HowMany, Rule, Term }
export type { FileChange }

/** A term or ADR as the view holds it: what the reader read, and the repo it
 *  is in, by the address a borrowed copy names it by. */
export type ViewTerm = Term & { repo: string }
export type ViewAdr = Adr & { repo: string }

/** What the check found about one term or ADR. A copy gone stale is waiting
 *  on someone; anything else is a problem. */
export type ViewFinding = { says: string; tone: 'problem' | 'waiting' }

export type ViewRepo = {
  address: string
  name: string
  systemId: string
  here: boolean
  branch: string
  mainLine: string
  changes: FileChange[]
}

/** The ontology map as the view shows it, every repo's terms and ADRs side by
 *  side, with what the check found by the key of what it is about. */
export type Model = { repos: ViewRepo[]; terms: ViewTerm[]; adrs: ViewAdr[]; findings: Record<string, ViewFinding[]> }

export const termKey = (t: { repo: string; name: string }): string => `term:${t.repo}:${t.name}`
export const adrKey = (a: { repo: string; number: number }): string => `adr:${a.repo}:${a.number}`

export const modelOf = (shown: OntologyShown): Model => {
  const findings: Record<string, ViewFinding[]> = {}
  for (const repo of shown.repos)
    for (const f of repo.findings) {
      if (!f.about) continue
      const [kind, what] = [f.about.slice(0, f.about.indexOf(':')), f.about.slice(f.about.indexOf(':') + 1)]
      const key = kind === 'term' ? termKey({ repo: repo.address, name: what }) : adrKey({ repo: repo.address, number: Number(what) })
      const tone = /has changed in|would/.test(f.says) ? 'waiting' : 'problem'
      ;(findings[key] ??= []).push({ says: f.says, tone })
    }
  return {
    repos: shown.repos.map(({ address, name, systemId, here, branch, mainLine, changes }) => ({ address, name, systemId, here, branch, mainLine, changes })),
    terms: shown.repos.flatMap((r) => r.terms.map((t) => ({ ...t, repo: r.address }))),
    adrs: shown.repos.flatMap((r) => r.adrs.map((a) => ({ ...a, repo: r.address }))),
    findings,
  }
}

export const nameOf = (model: Model, repo: string): string => model.repos.find((r) => r.address === repo)?.name ?? repo.split('/').pop() ?? repo
export const repoOf = (model: Model, repo: string): ViewRepo | undefined => model.repos.find((r) => r.address === repo)
export const findingsOf = (model: Model, key: string): ViewFinding[] => model.findings[key] ?? []
export const changeOf = (model: Model, repo: string, file: string): FileChange | undefined =>
  file ? repoOf(model, repo)?.changes.find((c) => c.file === file) : undefined

const slug = (words: string): string =>
  words
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Where a term or ADR not saved yet will be kept, as the reader names it. */
export const termFileOf = (t: ViewTerm): string => t.file || `codegraph/terms/${slug(t.name)}.md`
export const adrFileOf = (a: ViewAdr): string => a.file || `codegraph/adr/${String(a.number).padStart(4, '0')}-${slug(a.title)}.md`

export const blankTerm = (repo: string, name: string): ViewTerm => ({
  repo,
  name,
  file: '',
  says: '',
  store: '',
  pointsAt: [],
  avoid: [],
  settledBy: [],
  sum: '',
  borrowed: null,
})

export const blankAdr = (repo: string, number: number, title: string): ViewAdr => ({
  repo,
  number,
  title,
  file: '',
  status: 'proposed',
  date: '',
  deciders: [],
  consulted: '',
  area: '',
  related: [],
  replaces: [],
  terms: [],
  rules: [],
  context: '',
  decision: '',
  alternatives: [{ option: 'Do nothing', whyNot: '' }],
  evidence: '',
  good: '',
  bad: '',
  followUp: '',
  revisit: '',
})

/** The template's six sections, and how many of them a decision has written. */
export const ADR_SECTIONS: { key: keyof Adr; name: string }[] = [
  { key: 'context', name: 'Context' },
  { key: 'decision', name: 'Decision' },
  { key: 'alternatives', name: 'Alternatives' },
  { key: 'evidence', name: 'Evidence' },
  { key: 'good', name: 'Consequences' },
  { key: 'revisit', name: 'Revisit when' },
]
export const written = (a: Adr): number =>
  ADR_SECTIONS.filter(({ key }) =>
    key === 'alternatives' ? a.alternatives.length > 0 : key === 'good' ? !!(a.good || a.bad || a.followUp) : String(a[key]).trim() !== '',
  ).length

/** What the views can do to the ontology map. Each is written to its file in
 *  the repo's working copy, on a branch off the main line. */
export type Edits = {
  addTerm: (repo: string, name: string) => void
  changeTerm: (repo: string, name: string, change: Partial<Term>) => void
  link: (repo: string, from: string, to: string, howMany: HowMany) => void
  unlink: (repo: string, from: string, to: string) => void
  addAdr: (repo: string, title: string) => number
  changeAdr: (repo: string, number: number, change: Partial<Adr>) => void
}
