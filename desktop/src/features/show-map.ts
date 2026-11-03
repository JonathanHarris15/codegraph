// codegraph: feature show-map in workspace
// codegraph: uses projects, reader, agents, cards
import { whereIs } from '../modules/agents/index.js'
import { card, join, systemCard, type Card } from '../modules/cards/index.js'
import { listProjects } from '../modules/projects/index.js'
import { idOfName, live, proposalProgress, readMap, type Point, type Progress } from '../modules/reader/index.js'

export type { Card, CardState, CardWire, Level, WireEnds } from '../modules/cards/index.js'

/** Where an agent says it is working, as the card the canvas follows. */
export type AgentShown = { card: string; name: string; words: string; at: string }

export type SystemShown = {
  id: string
  name: string
  path: string
  point: Point
  setUp: boolean
  problems: string[]
  /** How far the code has got toward the proposal at this point. */
  proposal: Progress | null
  agent: AgentShown | null
}

export type MapShown = {
  card: Card
  systems: SystemShown[]
  /** Names the code calls out to that no software system in the project
   *  answers to: shallow software systems, until a person says so. */
  suggestions: string[]
}

/** A project's map, each software system read at the point asked for, or
 *  its live folder (ADR 0003). */
export const showMap = async (projectId: string, points: Record<string, Point> = {}): Promise<MapShown> => {
  const project = listProjects().find((p) => p.id === projectId)
  if (!project) throw new Error('no project with that id')

  const read = await Promise.all(
    project.systems.map(async (system) => {
      const point = points[system.id] ?? live
      return { system, point, map: await readMap(system.path, point) }
    }),
  )

  const top = card(project.id, project.name, 'project', { kind: 'project' })
  const systems: SystemShown[] = []
  const answersTo = new Map<string, string>()
  for (const { system, point, map } of read) {
    top.children.push(systemCard(system.id, system.name, map))
    const said = point.kind === 'live' && system.path ? whereIs(system.path) : null
    systems.push({
      id: system.id,
      name: system.name,
      path: system.path,
      point,
      setUp: map.setUp,
      problems: map.problems,
      proposal: map.proposal ? await proposalProgress(system.path, map) : null,
      agent: said ? { card: `${system.id}/${idOfName(said.card)}`, name: said.card, words: said.words, at: said.at } : null,
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

  return { card: top, systems, suggestions: [...suggestions] }
}
