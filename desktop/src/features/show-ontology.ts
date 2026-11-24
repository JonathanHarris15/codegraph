// codegraph: feature show-ontology in workspace
// codegraph: uses projects, reader, repo
import { existsSync } from 'node:fs'
import { findProject } from '../modules/projects/index.js'
import { checkAcrossRepos, checkOntologyOf, live, readMap, type Adr, type Mismatch, type Term } from '../modules/reader/index.js'
import { changesIn, readSoftwareSystem, type FileChange } from '../modules/repo/index.js'

export type { FileChange }

/** What the check found, beside the term or decision it is about:
 *  `term:<name>`, `adr:<number>`, or '' when it is about neither. */
export type Finding = { about: string; file: string; line: number; says: string }

/** One repo's part of the ontology map, as this computer has it. */
export type OntologyRepo = {
  systemId: string
  name: string
  /** Its GitHub address, or its name where it has none: what a borrowed copy
   *  names it by (ADR 0036). */
  address: string
  path: string
  /** Its working copy is on this computer, so it can be read and written. */
  here: boolean
  branch: string
  mainLine: string
  terms: Term[]
  adrs: Adr[]
  findings: Finding[]
  /** What in its codegraph/ folder is not committed yet. */
  changes: FileChange[]
}

export type OntologyShown = { project: string; repos: OntologyRepo[] }

/** Which term or ADR a mismatch is about, by its file, or by what it says. */
const aboutOf = (m: Mismatch, terms: Term[], adrs: Adr[]): string => {
  const term = terms.find((t) => t.file === m.file)
  if (term) return `term:${term.name}`
  const adr = adrs.find((a) => a.file === m.file)
  if (adr) return `adr:${adr.number}`
  const named = m.says.match(/the term is ([^.]+)\.$/)?.[1]
  if (named) return `term:${named}`
  const ruled = m.says.match(/ADR (\d+) says/)?.[1]
  return ruled ? `adr:${ruled}` : ''
}

/** A project's ontology map: each of its repos' terms and decisions, read
 *  from their working copies on this computer, with what the check finds in
 *  them and across them, and what is not committed yet (ADRs 0035, 0036). */
export const showOntology = async (projectId: string): Promise<OntologyShown> => {
  const project = findProject(projectId)
  if (!project) return { project: '', repos: [] }
  const systems = project.systems.map((s) => ({ ...s, address: s.remote || s.name, here: Boolean(s.path && existsSync(s.path)) }))
  const across = await checkAcrossRepos(systems.filter((s) => s.here).map((s) => ({ address: s.address, path: s.path })))
  const repos = await Promise.all(
    systems.map(async (s): Promise<OntologyRepo> => {
      const blank = { systemId: s.id, name: s.name, address: s.address, path: s.path, here: s.here, branch: '', mainLine: '' }
      if (!s.here) return { ...blank, terms: [], adrs: [], findings: [], changes: [] }
      const [map, own, changes, facts] = await Promise.all([readMap(s.path, live), checkOntologyOf(s.path), changesIn(s.path, 'codegraph'), readSoftwareSystem(s.path)])
      const { terms, adrs } = map.ontology
      const mismatches = [...own, ...across.filter((a) => a.address === s.address).map((a) => a.mismatch)]
      return {
        ...blank,
        branch: facts.branch,
        mainLine: facts.mainLine,
        terms,
        adrs,
        findings: mismatches.map((m) => ({ about: aboutOf(m, terms, adrs), file: m.file, line: m.line, says: m.says })),
        changes,
      }
    }),
  )
  return { project: project.name, repos }
}
