// codegraph: feature describe-map in agent
// codegraph: uses reader
// codegraph: command map
import { live, readMap, type Point, type SystemMap } from '../modules/reader/index.js'

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
  ])
  const out: string[] = [
    `Serves ${map.projects.join(', ') || 'no project yet'}. Read at ${pointWords(point)}.`,
    '',
  ]
  for (const container of map.containers) {
    out.push(`Container ${container.name} (${container.kind})${container.says ? `: ${container.says}` : ''}`)
    if (container.stores.length) out.push(`  keeps ${container.stores.join(', ')}`)
    for (const c of map.components.filter((c) => c.container === container.name)) {
      const extra = [
        c.at ? `at ${c.at}` : '',
        c.start ? 'start page' : '',
        c.trigger ? `on a ${c.trigger}` : '',
        c.frontDoor.length ? `front door ${c.frontDoor.join(', ')}` : '',
      ].filter(Boolean)
      out.push(`  ${c.kind} ${c.name}${extra.length ? ` (${extra.join('; ')})` : ''}`)
      for (const file of c.files) out.push(`    ${file.path}`)
    }
    out.push('')
  }
  if (map.wires.length) {
    out.push('Wires:')
    for (const w of map.wires)
      out.push(`  ${nameOf.get(w.from) ?? w.from} -> ${nameOf.get(w.to) ?? w.to} (${w.kind})${w.words ? `: ${w.words}` : ': NO WORDS'}`)
    out.push('')
  }
  if (map.outside.length) {
    out.push('Calls out of the repo:')
    for (const w of map.outside) out.push(`  ${nameOf.get(w.from) ?? w.from} -> ${w.to.replace(/^outside:/, '')}: ${w.words}`)
    out.push('')
  }
  if (map.problems.length) {
    out.push('Could not place:')
    for (const p of map.problems) out.push(`  ${p}`)
  }
  return out.join('\n').trimEnd()
}
