// codegraph: feature open-proposal in workspace
// codegraph: uses projects, reader, repo, sketches, cards
import { systemCard, type Card } from '../modules/cards/index.js'
import { listProjects } from '../modules/projects/index.js'
import { componentName, idOfName, live, readMap } from '../modules/reader/index.js'
import { makeBranch, readSoftwareSystem } from '../modules/repo/index.js'
import type { CardState, SketchCard } from '../modules/sketches/index.js'

export type ProposalOpened =
  | { ok: false; why: 'no system' | 'not set up' | 'main line' | 'no branch'; branch: string }
  | {
      ok: true
      branch: string
      says: string
      /** The software system as it stands with its proposal, to draw on. */
      draft: SketchCard
      /** The ids of what is in the code, which can be crossed out but not
       *  renamed; anything else on the drawing is drawn new. */
      known: string[]
      mockups: Record<string, string>
    }

/** A card of the map as a card to draw on, down to the components: what is
 *  inside them is the agent's to decide. */
const toDraw = (card: Card, at: Record<string, [number, number]>, name: string): SketchCard => {
  const place = at[name]
  return {
    id: card.id,
    name: card.name,
    level: card.level,
    kind: card.kind,
    says: card.says,
    at: card.at,
    start: card.start,
    setUp: card.setUp,
    names: [],
    shot: '',
    mockup: '',
    ...(card.state ? { state: card.state as CardState } : {}),
    ...(place ? { x: place[0], y: place[1] } : {}),
    children:
      card.level === 'component'
        ? []
        : card.children.map((c) =>
            toDraw(c, at, card.level === 'system' ? c.name : componentName({ container: card.name, kind: c.kind, name: c.name })),
          ),
    wires: card.wires.map((w) => ({
      id: `${w.from}>${w.kind}>${w.to}`,
      from: w.from,
      to: w.to,
      kind: w.kind,
      words: w.words,
      ...(w.state ? { state: w.state as CardState } : {}),
    })),
    notes: [],
  }
}

const find = (card: SketchCard, id: string): SketchCard | undefined =>
  card.id === id ? card : card.children.map((c) => find(c, id)).find(Boolean)

/** Opens the proposal on a software system's branch to draw on: the map as
 *  the code has it, with the proposal over it. A proposal lives on a branch
 *  of its own, so on the main line it asks for one, and makes it if named. */
export const openProposal = async (projectId: string, systemId: string, branch = ''): Promise<ProposalOpened> => {
  const system = listProjects()
    .find((p) => p.id === projectId)
    ?.systems.find((s) => s.id === systemId)
  if (!system?.path) return { ok: false, why: 'no system', branch: '' }
  if (branch.trim() && !(await makeBranch(system.path, branch.trim())))
    return { ok: false, why: 'no branch', branch: branch.trim() }

  const facts = await readSoftwareSystem(system.path)
  if (!facts.setUpHere) return { ok: false, why: 'not set up', branch: facts.branch }
  if (!facts.branch || facts.branch === 'HEAD' || facts.branch === facts.mainLine || ['main', 'master'].includes(facts.branch))
    return { ok: false, why: 'main line', branch: facts.branch }

  const map = await readMap(system.path, live)
  const card = systemCard(system.id, system.name, map)
  const draft = toDraw(card, map.proposal?.layout ?? {}, card.name)

  const known: string[] = []
  const walk = (c: SketchCard): void => {
    if (c.state !== 'proposed') known.push(c.id)
    for (const w of c.wires) if (w.state !== 'proposed') known.push(w.id)
    c.children.forEach(walk)
  }
  walk(draft)

  // A mockup on the drawing goes by the file it is in, beside the proposal.
  const mockups: Record<string, string> = {}
  for (const c of map.proposal?.components ?? []) {
    if (!c.mockup || c.gone) continue
    const id = `${systemId}/${idOfName(componentName(c))}`
    const found = find(draft, id)
    const url = map.mockups[`${c.container}:${c.kind}:${c.name}`]
    if (found) found.mockup = c.mockup
    if (url) mockups[id] = url
  }
  return { ok: true, branch: facts.branch, says: map.proposal?.says ?? '', draft, known, mockups }
}
