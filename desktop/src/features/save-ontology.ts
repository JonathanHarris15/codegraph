// codegraph: feature save-ontology in workspace
// codegraph: uses projects, reader, repo
import { findProject } from '../modules/projects/index.js'
import { adrFileFor, live, readMap, termFileFor, writeAdr, writeTerm, type Adr, type Term } from '../modules/reader/index.js'
import { leaveMainLine, removeWorkingFile, writeWorkingFile } from '../modules/repo/index.js'

/** A term as a person writes it; its file, sum and where it was borrowed
 *  from are codegraph's to say. */
export type TermDraft = Omit<Term, 'file' | 'sum' | 'borrowed'>
export type AdrDraft = Omit<Adr, 'file'>

export type Saved = { ok: boolean; branch: string; file: string; problem: string }

const refused = (problem: string): Saved => ({ ok: false, branch: '', file: '', problem })

/** The working copy to write in, moved off its main line first, so what the
 *  ontology map says can be looked at before it is merged. */
const writableCopy = async (projectId: string, systemId: string): Promise<{ path: string; branch: string } | string> => {
  const system = findProject(projectId)?.systems.find((s) => s.id === systemId)
  if (!system?.path) return 'That repo is not on this computer, so its terms and decisions can only be looked at here.'
  const branch = await leaveMainLine(system.path, 'ontology')
  return branch ? { path: system.path, branch } : 'Git would not start the branch ontology, so nothing was changed.'
}

/** Writes a term to its file in a repo's codegraph/terms/, moving the file when
 *  it is renamed. A borrowed copy is never written here (ADR 0036). */
export const saveTerm = async (projectId: string, systemId: string, term: TermDraft, was = ''): Promise<Saved> => {
  const system = findProject(projectId)?.systems.find((s) => s.id === systemId)
  if (system?.path) {
    const terms = (await readMap(system.path, live)).ontology.terms
    const borrowed = terms.find((t) => t.borrowed && [term.name, was].some((n) => n && t.name.toLowerCase() === n.toLowerCase()))
    if (borrowed) return refused(`${borrowed.name} is borrowed from ${borrowed.borrowed!.from}. Change it there, then borrow it again.`)
  }
  const copy = await writableCopy(projectId, systemId)
  if (typeof copy === 'string') return refused(copy)
  const file = termFileFor(term.name)
  writeWorkingFile(copy.path, file, writeTerm(term))
  if (was && termFileFor(was) !== file) removeWorkingFile(copy.path, termFileFor(was))
  return { ok: true, branch: copy.branch, file, problem: '' }
}

/** Writes an ADR to its file in a repo's codegraph/adr/, on the template,
 *  moving the file when its title changes (ADR 0035). */
export const saveAdr = async (projectId: string, systemId: string, adr: AdrDraft): Promise<Saved> => {
  const copy = await writableCopy(projectId, systemId)
  if (typeof copy === 'string') return refused(copy)
  const file = adrFileFor(adr.number, adr.title)
  const before = (await readMap(copy.path, live)).ontology.adrs.find((a) => a.number === adr.number)
  writeWorkingFile(copy.path, file, writeAdr(adr))
  if (before && before.file !== file) removeWorkingFile(copy.path, before.file)
  return { ok: true, branch: copy.branch, file, problem: '' }
}
