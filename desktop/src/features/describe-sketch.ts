// codegraph: feature describe-sketch in agent
// codegraph: uses reader, projects, sketches
// codegraph: command sketch
import { listProjects } from '../modules/projects/index.js'
import { live, readMap } from '../modules/reader/index.js'
import { listSketches, mockupFile, readSketch, type SketchCard } from '../modules/sketches/index.js'

/** One sketch in words an agent reads and works from: every level, each card
 *  with its kind and what it is for, every wire with its words, the notes,
 *  and where each mockup sits so the agent can open it. */
export const describeSketch = async (repo: string, name: string, shortName = ''): Promise<string> => {
  const all = listProjects()
  const served = shortName ? [shortName.toLowerCase()] : repo ? (await readMap(repo, live)).projects : []
  const projects = all.filter((p) => served.includes(p.shortName))

  for (const project of projects) {
    const listed = listSketches(project.id).find((s) => s.id === name || s.name.toLowerCase() === name.toLowerCase())
    const sketch = listed ? readSketch(project.id, listed.id) : null
    if (!sketch) continue

    const out: string[] = [
      `Sketch "${sketch.name}" of project ${project.name} (${project.shortName}). ${sketch.from || 'Drawn from blank'}.`,
      'Each level is indented under the card it is inside.',
      '',
    ]
    const named = (card: SketchCard): string => {
      const name = card.name || '(unnamed)'
      if (card.level === 'container') return `container ${name}${card.kind ? ` (${card.kind})` : ''}`
      if (card.level === 'system') return `${card.kind || 'software system'} ${name}`
      return `${card.kind || card.level} ${name}`
    }
    const walk = (card: SketchCard, depth: number): void => {
      const pad = '  '.repeat(depth)
      const extra = [card.at ? `at ${card.at}` : '', card.start ? 'start page' : ''].filter(Boolean)
      out.push(`${pad}${named(card)}${extra.length ? ` (${extra.join('; ')})` : ''}${card.says ? `: ${card.says}` : ''}`)
      if (card.mockup) out.push(`${pad}  mockup: ${mockupFile(project.id, sketch.id, card.mockup)}`)
      for (const child of card.children) walk(child, depth + 1)
      const byId = new Map(card.children.map((c) => [c.id, c]))
      for (const wire of card.wires) {
        const from = byId.get(wire.from)
        const to = byId.get(wire.to)
        if (from && to) out.push(`${pad}  ${named(from)} -> ${named(to)} (${wire.kind})${wire.words ? `: ${wire.words}` : ''}`)
      }
      for (const note of card.notes) out.push(`${pad}  note: ${note.text}`)
    }
    for (const child of sketch.root.children) walk(child, 0)
    for (const note of sketch.root.notes) out.push(`note: ${note.text}`)
    return out.join('\n').trimEnd()
  }
  return `There is no sketch called "${name}" in ${projects.length ? projects.map((p) => p.shortName).join(', ') : 'any project this repo names'}. Call \`sketches\` to see them.`
}
