// codegraph: feature describe-map in agent
// codegraph: uses reader, wording, projects, annotations, machine
// codegraph: command map
import { annotationWords, readAnnotations } from '../modules/annotations/index.js'
import { sameFolder } from '../modules/machine/index.js'
import { listProjects } from '../modules/projects/index.js'
import { holdsWords, live, readMap, type Point, type Store, type SystemMap } from '../modules/reader/index.js'
import { sentenceOf } from '../modules/wording/index.js'

const pointWords = (point: Point): string =>
  point.kind === 'live' ? 'the live folder' : point.kind === 'branch' ? `branch ${point.name}` : `commit ${point.sha.slice(0, 7)}`

/** A repo's map in words an agent reads: containers, components and their
 *  files, and every wire with what it is for. */
export const describeMap = async (repo: string, point: Point = live): Promise<string> => {
  const map: SystemMap = await readMap(repo, point)
  if (!map.setUp)
    return `This repo has no codegraph.config.json, so it is not set up for codegraph yet. Read at ${pointWords(point)}.`

  const nameOf = new Map<string, string>([
    ...map.components.map((c) => [c.id, `${c.kind} ${c.name}`] as const),
    ...map.containers.map((c) => [c.id, `container ${c.name}`] as const),
    ...(map.stores ?? []).map((s) => [s.id, `store ${s.path}`] as const),
  ])
  const out: string[] = [
    `Serves ${map.projects.join(', ') || 'no project yet'}. Read at ${pointWords(point)}.`,
    '',
  ]
  for (const container of map.containers) {
    out.push(`Container ${container.name} (${container.kind})${container.says ? `: ${container.says}` : ''}`)
    for (const store of (map.stores ?? []).filter((s) => s.container === container.name)) out.push(...storeWords(store))
    for (const c of map.components.filter((c) => c.container === container.name)) {
      const extra = [
        c.at ? `at ${c.at}` : '',
        c.start ? 'start page' : '',
        c.trigger ? `on a ${c.trigger}` : '',
        c.frontDoor.length ? `front door ${c.frontDoor.join(', ')}` : '',
      ].filter(Boolean)
      out.push(`  ${c.kind} ${c.name}${c.type ? ` as ${c.type}` : ''}${extra.length ? ` (${extra.join('; ')})` : ''}`)
      for (const file of c.files) out.push(`    ${file.path}`)
    }
    out.push('')
  }
  if (map.wires.length) {
    out.push('Wires:')
    for (const w of map.wires)
      out.push(
        w.kind === 'keeps' && w.to.startsWith('store:')
          ? `  ${nameOf.get(w.from) ?? w.from} keeps ${nameOf.get(w.to) ?? w.to} in ${w.to.split(':')[1]}`
          : `  ${sentenceOf(nameOf.get(w.from) ?? w.from, w.kind, nameOf.get(w.to) ?? w.to, w.words)
          .map((part) => part.text)
          .join('')}${w.words || w.kind === 'leads to' || w.kind === 'keeps' ? '' : ' (NO WORDS yet)'}`,
      )
    out.push('')
  }
  if (map.outside.length) {
    out.push('Calls out of the repo:')
    for (const w of map.outside)
      out.push(
        `  ${sentenceOf(nameOf.get(w.from) ?? w.from, 'calls', w.to.replace(/^outside:/, ''), w.words)
          .map((part) => part.text)
          .join('')}`,
      )
    out.push('')
  }
  if (map.problems.length) {
    out.push('Could not place:')
    for (const p of map.problems) out.push(`  ${p}`)
    out.push('')
  }
  out.push(...annotationsOver(repo, map))
  return out.join('\n').trimEnd()
}

/** A store and its shape, a field to a line (ADR 0023). */
const storeWords = (store: Store): string[] => {
  const inside = store.inside ? `, inside ${store.inside}` : ''
  if (!store.shape) return [`  store ${store.path}${inside}: shape unknown, no schema says it`]
  const how = store.shape.fixed ? 'fixed' : `open to ${holdsWords(store.shape.others)}`
  return [
    `  store ${store.path}${store.says ? `: ${store.says}` : ''}${inside} (${how})`,
    ...store.shape.fields.map(
      (f) =>
        `    ${f.name}: ${holdsWords(f.holds)}${f.needed ? ', needed' : ''}${f.pointsAt ? `, points at ${f.pointsAt}` : ''}${f.says ? ` — ${f.says}` : ''}`,
    ),
  ]
}

/** What people drew over this repo's part of the map of each project it
 *  serves, for the agent to read; never the architecture. */
const annotationsOver = (repo: string, map: SystemMap): string[] => {
  const out: string[] = []
  for (const project of listProjects().filter((p) => map.projects.includes(p.shortName))) {
    const system = project.systems.find((s) => s.path && sameFolder(s.path, repo))
    if (!system) continue
    const nameOf = (id: string): string => {
      if (id === project.id) return `the project ${project.name}`
      if (id === system.id) return `software system ${system.name}`
      const rest = id.slice(system.id.length + 1)
      const container = rest.match(/^container:(.+)$/)
      if (container) return `container ${container[1]}`
      const component = rest.match(/^([^:]+):([^:]+):(.+)$/)
      return component ? `${component[2]} ${component[3]}` : rest
    }
    const levels = [
      project.id,
      system.id,
      ...map.containers.map((c) => `${system.id}/${c.id}`),
      ...map.components.map((c) => `${system.id}/${c.id}`),
    ]
    // Notes belong to their branch (ADR 0019): the project's top level, and this
    // working copy's own map, or what it was pushed as.
    const branch = map.point.kind === 'live' ? map.point.branch : ''
    const here = readAnnotations(project.id, `${system.id}@local:${branch}`)
    const there = here.length ? here : readAnnotations(project.id, `${system.id}@github:${branch}`)
    const said = annotationWords([...readAnnotations(project.id), ...there], levels, nameOf)
    if (said.length) out.push(`From project ${project.name}:`, ...said)
  }
  return out
}
