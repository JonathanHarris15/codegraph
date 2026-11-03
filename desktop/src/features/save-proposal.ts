// codegraph: feature save-proposal in workspace
// codegraph: uses projects, reader, repo
import { listProjects } from '../modules/projects/index.js'
import { changesAnything, live, proposalFrom, readMap, type DrawnCard } from '../modules/reader/index.js'
import { headOf, proposalPicture, removeProposal, writeProposal, type Picture } from '../modules/repo/index.js'

export type ProposalSaved = { ok: boolean; kept: boolean }

/** Keeps what a person drew over a software system's map as the proposal
 *  on its branch: only what changes. A drawing that changes nothing leaves
 *  no proposal behind. */
export const saveProposal = async (projectId: string, systemId: string, draft: DrawnCard, says: string): Promise<ProposalSaved> => {
  const system = listProjects()
    .find((p) => p.id === projectId)
    ?.systems.find((s) => s.id === systemId)
  if (!system?.path) return { ok: false, kept: false }
  const map = await readMap(system.path, live)
  const pictures: Picture[] = []
  const drawn = proposalFrom(draft, map, {
    absentIsGone: true,
    earlier: map.proposal,
    mockupName: (card) => {
      const name = card.mockup ?? ''
      pictures.push({ name, from: proposalPicture(system.path, name) })
      return name
    },
  })
  if (!changesAnything(drawn)) {
    removeProposal(system.path)
    return { ok: true, kept: false }
  }
  writeProposal(
    system.path,
    { ...drawn, says: says.trim(), sketch: map.proposal?.sketch ?? '', base: map.proposal?.base || (await headOf(system.path)) },
    pictures,
  )
  return { ok: true, kept: true }
}
