// codegraph: feature show-map in workspace
// codegraph: uses projects, reader, agents, cards, card-types, repo, github, places, sketches, members
import { whereIs } from '../modules/agents/index.js'
import { readCardTypes } from '../modules/card-types/index.js'
import { card, join, systemCard, withLooks, type Card } from '../modules/cards/index.js'
import { savedToken } from '../modules/github/index.js'
import { roleOf, whoIsIn, type Role } from '../modules/members/index.js'
import { mapKey, readingFolder } from '../modules/places/index.js'
import { chooseBranch, findProject, type Project, type ProjectMember, type SoftwareSystem } from '../modules/projects/index.js'
import { idOfName, pointFor, PROPOSAL, proposalProgress, readMap, type DesignSystem, type Point, type Progress, type SystemMap } from '../modules/reader/index.js'
import { fetchMirror, mainLineRef, proposalsOnBranches, type Reach } from '../modules/repo/index.js'
import { listSketches } from '../modules/sketches/index.js'

export type { Card, CardState, CardWire, Level, WireEnds } from '../modules/cards/index.js'
export type { DesignSystem, Token, TokenGroup, TokenPart, TokenTier } from '../modules/reader/index.js'

/** Where an agent says it is working, as the card the canvas follows. */
export type AgentShown = { card: string; name: string; words: string; at: string }

/** How a member can get at a software system's code right now. */
export type SystemReach = Reach | 'not-on-github'

const WORDS: Record<Exclude<SystemReach, 'open'>, string> = {
  'no-access': 'You need adding to this repo on GitHub to open it.',
  offline: 'Reconnect to the internet to open this.',
  'not-on-github': 'This repo is not on GitHub yet, so only the member who has it can open it.',
}

export type SystemShown = {
  id: string
  name: string
  path: string
  point: Point
  /** Which map this is, the same for every member looking at the same one. */
  mapKey: string
  /** Whether this member can open it, and if not, why. */
  reach: SystemReach
  /** Looking at the main line: branches with a proposal being built. */
  proposalsElsewhere: string[]
  /** The sketch the proposal here came from has changed since it was read. */
  sketchMoved: boolean
  setUp: boolean
  problems: string[]
  /** How far the code has got toward the proposal at this point. */
  proposal: Progress | null
  agent: AgentShown | null
  /** Its DESIGN.md at this point, set up or not; null when it has none. */
  design: DesignSystem | null
}

export type MapShown = {
  card: Card
  /** Online for its members, not just on this computer. */
  online: boolean
  /** What the person signed in may do here. */
  role: Role | null
  /** Who else can be here, by id, for telling them apart. */
  members: ProjectMember[]
  me: string
  systems: SystemShown[]
  /** Names the code calls out to that no software system in the project
   *  answers to: shallow software systems, until a person says so. */
  suggestions: string[]
}

const blankMap = (point: Point): SystemMap => ({ point, setUp: false, projects: [], containers: [], components: [], stores: [], wires: [], outside: [], problems: [], proposal: null, design: null, mockups: {} }) as unknown as SystemMap

/** Reads one software system, if this member can reach it. With no working copy
 *  its history is fetched from GitHub with their own access, and GitHub's answer
 *  decides (ADR 0018). Someone on a project with others opens on its GitHub main
 *  line, where everyone can meet, until they choose a branch themselves. */
const readOne = async (project: Project, system: SoftwareSystem, asked?: Point) => {
  const folder = readingFolder(system)
  let reach: SystemReach = 'open'
  if (!system.path) {
    if (project.online) reach = system.remote ? await fetchMirror(system.remote, savedToken()) : 'not-on-github'
    else if (system.remote && folder) reach = await fetchMirror(system.remote, savedToken())
  }
  if (reach !== 'open') return { system, point: { kind: 'live' } as Point, map: blankMap({ kind: 'live' }), reach, folder: '' }
  let point = asked
  if (!point && !system.path) {
    const main = folder ? await mainLineRef(folder) : ''
    const name = system.branch?.startsWith('origin/') ? system.branch : main
    point = name ? { kind: 'branch', name, where: 'cloud' } : { kind: 'live' }
  }
  if (!point) {
    const together = (project.members?.length ?? 0) > 1 && !system.branch
    const main = together ? await mainLineRef(folder) : ''
    const chosen = await pointFor(system.path, system.branch || (main.startsWith('origin/') ? main : ''))
    if (chosen.moved) chooseBranch(project.id, system.id, chosen.branch)
    point = chosen.point
  }
  return { system, point, map: await readMap(folder, point), reach, folder }
}

/** A project's map, each software system read at the point asked for, or
 *  else on the branch last chosen for it, or the live folder (ADR 0003). A
 *  chosen branch that has gone falls back to the main line, which is then
 *  remembered instead. */
export const showMap = async (projectId: string, points: Record<string, Point> = {}): Promise<MapShown> => {
  const project = findProject(projectId)
  if (!project) throw new Error('no project with that id')

  const read = await Promise.all(project.systems.map((system) => readOne(project, system, points[system.id])))

  const top = card(project.id, project.name, 'project', { kind: 'project' })
  const systems: SystemShown[] = []
  const answersTo = new Map<string, string>()
  for (const { system, point, map, reach, folder } of read) {
    top.children.push(
      reach === 'open' ? systemCard(system.id, system.name, map) : card(system.id, system.name, 'system', { kind: 'software system', says: WORDS[reach], outOfReach: WORDS[reach] }),
    )
    const onMain = reach === 'open' && folder && (await mainLineRef(folder)).replace(/^origin\//, '') === ((point.kind === 'branch' ? point.name : point.kind === 'live' ? (point.branch ?? '') : '').replace(/^origin\//, ''))
    const sketch = map.proposal?.sketch ? listSketches(project.id).find((s) => s.name === map.proposal?.sketch) : undefined
    const said = point.kind === 'live' && system.path ? whereIs(system.path) : null
    systems.push({
      id: system.id,
      name: system.name,
      path: system.path,
      point,
      mapKey: mapKey(point),
      reach,
      proposalsElsewhere: onMain ? await proposalsOnBranches(folder, PROPOSAL) : [],
      sketchMoved: Boolean(sketch && map.proposal?.sketchAt && sketch.updatedAt > map.proposal.sketchAt),
      setUp: map.setUp,
      problems: map.problems,
      proposal: map.proposal && folder ? await proposalProgress(folder, map) : null,
      agent: said ? { card: `${system.id}/${idOfName(said.card)}`, name: said.card, words: said.words, at: said.at } : null,
      design: map.design,
    })
    answersTo.set(system.name.toLowerCase(), system.id)
    if (system.remote) answersTo.set(system.remote.split('/').pop()!.toLowerCase(), system.id)
  }

  for (const shallow of project.shallow) {
    top.children.push(
      card(shallow.id, shallow.name, 'system', {
        kind: 'shallow software system',
        says: 'Run by someone else; no repo here',
      }),
    )
    for (const name of shallow.answersTo) answersTo.set(name.toLowerCase(), shallow.id)
  }

  const suggestions = new Set<string>()
  for (const { system, map } of read)
    for (const call of map.outside) {
      const name = call.to.replace(/^outside:/, '')
      const reached = answersTo.get(name.toLowerCase())
      if (reached && reached !== system.id)
        join(top.wires, { ...call, from: system.id, to: reached, ends: [{ from: `${system.id}/${call.from}`, to: reached }] })
      else if (!reached) suggestions.add(name)
    }

  const me = whoIsIn()?.id ?? ''
  return {
    card: withLooks(top, readCardTypes()),
    online: project.online ?? false,
    role: roleOf(project, me),
    members: project.members ?? [],
    me,
    systems,
    suggestions: [...suggestions],
  }
}
