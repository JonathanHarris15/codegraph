// codegraph: feature make-proposal in agent
// codegraph: uses reader, projects, sketches, repo, machine, card-types
// codegraph: command propose
import { extname } from 'node:path'
import { rememberLooks } from '../modules/card-types/index.js'
import { sameFolder } from '../modules/machine/index.js'
import { listProjects, type Project, type SoftwareSystem } from '../modules/projects/index.js'
import {
  changesAnything,
  live,
  PROPOSAL,
  proposalFrom,
  readMap,
  type DrawnCard,
  type Proposal,
} from '../modules/reader/index.js'
import { headOf, readSoftwareSystem, writeProposal, type Picture } from '../modules/repo/index.js'
import { looksDrawn, listSketches, mockupFile, readSketch, type Sketch, type SketchCard } from '../modules/sketches/index.js'

/** The system card a sketch draws for one software system: by the id a
 *  snapshot of the map kept, or else by name. */
const drawnFor = (sketch: Sketch, system: SoftwareSystem): SketchCard | undefined => {
  const systems = sketch.root.children.filter((c) => c.level === 'system')
  return (
    systems.find((c) => c.id === system.id) ?? systems.find((c) => c.name.trim().toLowerCase() === system.name.toLowerCase())
  )
}

const counted = (proposal: Proposal): string => {
  const all = [...proposal.containers, ...proposal.components, ...proposal.wires]
  const gone = all.filter((x) => x.gone).length
  const parts = [all.length - gone ? `${all.length - gone} to build` : '', gone ? `${gone} to take away` : ''].filter(Boolean)
  return parts.join(' and ')
}

const listOf = (proposal: Proposal): string[] => [
  ...proposal.containers.map((c) => `- ${c.gone ? 'take away' : 'build'} container ${c.name}${c.kind ? ` (${c.kind})` : ''}${c.says ? `: ${c.says}` : ''}`),
  ...proposal.components.map(
    (c) => `- ${c.gone ? 'take away' : 'build'} ${c.container}/${c.kind} ${c.name}${c.type ? `, tagged as ${c.type}` : ''}${c.at ? ` at ${c.at}` : ''}${c.says ? `: ${c.says}` : ''}${c.mockup ? ` (mockup ${c.mockup})` : ''}`,
  ),
  ...proposal.wires.map((w) => `- ${w.gone ? 'take away' : 'build'} the wire ${w.from} ${w.kind} ${w.to}${w.words ? `: ${w.words}` : ''}`),
]

/** Makes the proposal on the branch an agent works on from a sketch of the
 *  project: what the sketch draws for this repo's software system that its
 *  map does not have, and what it takes away. One repo at a time; it says
 *  which other systems the sketch changes, so each gets its own (ADR 0007). */
export const makeProposal = async (repo: string, name: string, shortName = '', replace = false): Promise<string> => {
  const all = listProjects()
  const served = shortName ? [shortName.toLowerCase()] : (await readMap(repo, live)).projects
  const projects = all.filter((p) => served.includes(p.shortName))

  let project: Project | undefined
  let sketch: Sketch | null = null
  for (const p of projects) {
    const listed = listSketches(p.id).find((s) => s.id === name || s.name.toLowerCase() === name.toLowerCase())
    sketch = listed ? readSketch(p.id, listed.id) : null
    if (sketch) {
      project = p
      break
    }
  }
  if (!project || !sketch)
    return `There is no sketch called "${name}" in ${projects.length ? projects.map((p) => p.shortName).join(', ') : 'any project this repo names'}. Call \`sketches\` to see them.`

  const system = project.systems.find((s) => s.path && sameFolder(s.path, repo))
  if (!system) return `This repo is not one of the software systems of ${project.name} on this computer. Link it in the app first.`
  const drawn = drawnFor(sketch, system)
  if (!drawn)
    return `The sketch "${sketch.name}" draws nothing for ${system.name}. It draws: ${sketch.root.children.filter((c) => c.level === 'system').map((c) => c.name || '(unnamed)').join(', ') || 'no software systems'}.`

  const facts = await readSoftwareSystem(repo)
  if (!facts.branch || facts.branch === 'HEAD' || facts.branch === facts.mainLine || ['main', 'master'].includes(facts.branch))
    return `You are on ${facts.branch || 'no branch'}. A proposal lives on a branch of its own: make one named after the change (\`git switch -c <name>\`), then call \`propose\` again.`

  const map = await readMap(repo, live)
  if (map.proposal && !replace)
    return `There is already a proposal on ${facts.branch}${map.proposal.says ? `: "${map.proposal.says}"` : ''}. A branch has one at most. Build that one, or call \`propose\` again with replace set to replace it.`

  const pictures: Picture[] = []
  const fromSnapshot = sketch.from !== ''
  const make = (card: SketchCard, against: typeof map, keep: Picture[]): Proposal =>
    proposalFrom(card as DrawnCard, against, {
      absentIsGone: fromSnapshot,
      mockupName: (page) => {
        const file = `${page.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}${extname(page.mockup ?? '').toLowerCase() || '.png'}`
        keep.push({ name: file, from: mockupFile(project.id, sketch.id, page.mockup ?? '') })
        return file
      },
    })

  const proposal = { ...make(drawn, map, pictures), says: sketch.name, sketch: sketch.name, base: await headOf(repo) }
  const others: string[] = []
  for (const card of sketch.root.children.filter((c) => c.level === 'system' && c !== drawn)) {
    if (card.kind === 'person' || card.kind === 'shallow software system') continue
    const theirs = project.systems.find((s) => s.id === card.id || s.name.toLowerCase() === card.name.trim().toLowerCase())
    if (!theirs) {
      others.push(`- ${card.name || '(unnamed)'} has no repo yet. Make one, set it up, then propose there.`)
      continue
    }
    if (!theirs.path) {
      others.push(`- ${theirs.name} is not on this computer. Clone it, then propose there.`)
      continue
    }
    const changes = make(card, await readMap(theirs.path, live), [])
    if (changesAnything(changes)) others.push(`- ${theirs.name}, at ${theirs.path}: ${counted(changes)}. Propose there on a branch of its own.`)
  }
  const elsewhere = others.length ? ['', 'The sketch changes other software systems too:', ...others] : []

  if (!changesAnything(proposal))
    return [`The sketch "${sketch.name}" changes nothing in ${system.name}; no proposal was written.`, ...elsewhere].join('\n')

  rememberLooks(looksDrawn(drawn))
  writeProposal(repo, proposal, pictures)
  return [
    `Wrote the proposal to ${PROPOSAL} on ${facts.branch}: ${counted(proposal)}.`,
    ...listOf(proposal),
    '',
    'Call `check` to see what is left; it fails until the proposal is built. Call `working-on` before each card.',
    ...elsewhere,
  ].join('\n')
}
