// codegraph: feature add-proposal-mockup in workspace
// codegraph: uses projects, machine, repo
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, extname } from 'node:path'
import { askForPicture } from '../modules/machine/index.js'
import { listProjects } from '../modules/projects/index.js'
import { proposalPicture } from '../modules/repo/index.js'

/** The picture kept, by its file name, and as a data URL to show. */
export type ProposalMockupAdded = { ok: boolean; name: string; url: string }

const KINDS: Record<string, string> = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif', '.webp': 'webp' }

/** A person picks a picture of how a proposed page should look, and it is
 *  kept beside the proposal in the repo, named after the page. The drawing
 *  puts its name on the card; saving the proposal keeps it. */
export const addProposalMockup = async (projectId: string, systemId: string, page: string): Promise<ProposalMockupAdded> => {
  const system = listProjects()
    .find((p) => p.id === projectId)
    ?.systems.find((s) => s.id === systemId)
  if (!system?.path) return { ok: false, name: '', url: '' }
  const picture = await askForPicture()
  if (!picture) return { ok: false, name: '', url: '' }
  const name = `${page.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'page'}${extname(picture).toLowerCase() || '.png'}`
  const file = proposalPicture(system.path, name)
  mkdirSync(dirname(file), { recursive: true })
  copyFileSync(picture, file)
  const url = `data:image/${KINDS[extname(name)] ?? 'png'};base64,${readFileSync(file).toString('base64')}`
  return { ok: true, name, url }
}
