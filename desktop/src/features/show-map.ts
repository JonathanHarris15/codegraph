// codegraph: feature show-map in workspace
// codegraph: uses projects, reader
import { listProjects } from '../modules/projects/index.js'
import { live, readMap, type Point, type SystemMap } from '../modules/reader/index.js'

export type Level = 'project' | 'system' | 'container' | 'component' | 'code'

/** A wire between two cards that sit side by side inside one card. */
export type CardWire = { from: string; to: string; kind: string; words: string }

/** One thing on the canvas, with what is inside it already laid out as
 *  cards and the wires between them, so the page only has to draw. */
export type Card = {
  id: string
  name: string
  level: Level
  /** browser app, database, page, module… */
  kind: string
  says: string
  /** A page's address. */
  at: string
  start: boolean
  /** A software system that has a codegraph config to read. */
  setUp: boolean
  /** The names declared in a file, at the code level. */
  names: string[]
  children: Card[]
  wires: CardWire[]
}

export type SystemShown = {
  id: string
  name: string
  path: string
  point: Point
  setUp: boolean
  problems: string[]
}

export type MapShown = {
  card: Card
  systems: SystemShown[]
  /** Names the code calls out to that no software system in the project
   *  answers to: shallow software systems, until a person says so. */
  suggestions: string[]
}

const card = (id: string, name: string, level: Level, more: Partial<Card> = {}): Card => ({
  id,
  name,
  level,
  kind: '',
  says: '',
  at: '',
  start: false,
  setUp: true,
  names: [],
  children: [],
  wires: [],
  ...more,
})

/** Adds a wire, or the words of one, to wires already drawn between the
 *  same two cards. */
const join = (wires: CardWire[], wire: CardWire): void => {
  const same = wires.find((w) => w.from === wire.from && w.to === wire.to && w.kind === wire.kind)
  if (!same) wires.push({ ...wire })
  else if (wire.words && !same.words.split('; ').includes(wire.words))
    same.words = same.words ? `${same.words}; ${wire.words}` : wire.words
}

const systemCard = (id: string, name: string, map: SystemMap): Card => {
  const at = (inside: string): string => `${id}/${inside}`
  const containers = map.containers.map((container) =>
    card(at(container.id), container.name, 'container', {
      kind: container.kind,
      says: container.says || (container.stores.length ? `Keeps ${container.stores.join(', ')}` : ''),
      children: map.components
        .filter((component) => component.container === container.name)
        .map((component) =>
          card(at(component.id), component.name, 'component', {
            kind: component.kind,
            says: component.kind === 'trigger' ? `On a ${component.trigger}` : '',
            at: component.at,
            start: component.start,
            children: component.files.map((file) =>
              card(at(`${component.id}/${file.path}`), file.path.split('/').pop() ?? file.path, 'code', {
                kind: 'file',
                says: file.path,
                names: file.names,
              }),
            ),
          }),
        ),
    }),
  )

  const containerOf = new Map<string, string>()
  for (const component of map.components) containerOf.set(component.id, `container:${component.container}`)
  const holder = new Map(containers.map((c) => [c.id, c]))
  const system = card(id, name, 'system', {
    kind: 'software system',
    says: map.setUp ? '' : 'Not set up for codegraph yet',
    setUp: map.setUp,
    children: containers,
  })

  for (const wire of map.wires) {
    const from = containerOf.get(wire.from)
    const to = containerOf.get(wire.to) ?? (wire.to.startsWith('container:') ? wire.to : undefined)
    if (!from || !to) continue
    if (from === to) join(holder.get(at(from))!.wires, { ...wire, from: at(wire.from), to: at(wire.to) })
    else join(system.wires, { ...wire, from: at(from), to: at(to) })
  }
  return system
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
    systems.push({ id: system.id, name: system.name, path: system.path, point, setUp: map.setUp, problems: map.problems })
    answersTo.set(system.name.toLowerCase(), system.id)
    if (system.remote) answersTo.set(system.remote.split('/').pop()!.toLowerCase(), system.id)
  }

  const suggestions = new Set<string>()
  for (const { system, map } of read)
    for (const call of map.outside) {
      const name = call.to.replace(/^outside:/, '')
      const reached = answersTo.get(name.toLowerCase())
      if (reached && reached !== system.id) join(top.wires, { ...call, from: system.id, to: reached })
      else if (!reached) suggestions.add(name)
    }

  return { card: top, systems, suggestions: [...suggestions] }
}
