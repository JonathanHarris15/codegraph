// codegraph: feature describe-sketch in agent
// codegraph: uses reader, projects, sketches, wording, annotations
// codegraph: command sketch
import { annotationWords } from '../modules/annotations/index.js'
import { listProjects } from '../modules/projects/index.js'
import { live, readMap } from '../modules/reader/index.js'
import { isStore, listSketches, mockupFile, readSketch, wireOfHub, withNotesAsAnnotations, type SketchCard } from '../modules/sketches/index.js'
import { sentenceOf } from '../modules/wording/index.js'

/** A store drawn on a sketch and its fields, a field to a line (ADR 0023). */
const storeWords = (card: SketchCard, pad: string, name: string): string[] => {
  if (!card.fields) return [`${pad}${name}: shape unknown${card.says ? `. ${card.says}` : ''}`]
  return [
    `${pad}${name}${card.says ? `: ${card.says}` : ''} (${card.others ? `open to ${card.others}` : 'fixed'})`,
    ...card.fields.map(
      (f) => `${pad}  ${f.name}: ${f.holds}${f.needed ? ', needed' : ''}${f.pointsAt ? `, points at ${f.pointsAt}` : ''}`,
    ),
  ]
}

/** One sketch in words an agent reads and works from: every level, each card
 *  with its kind and what it is for, every wire with its words, the notes,
 *  and where each mockup sits so the agent can open it. */
export const describeSketch = async (repo: string, name: string, shortName = ''): Promise<string> => {
  const all = listProjects()
  const served = shortName ? [shortName.toLowerCase()] : repo ? (await readMap(repo, live)).projects : []
  const projects = all.filter((p) => served.includes(p.shortName))

  for (const project of projects) {
    const listed = listSketches(project.id).find((s) => s.id === name || s.name.toLowerCase() === name.toLowerCase())
    const kept = listed ? readSketch(project.id, listed.id) : null
    const sketch = kept ? withNotesAsAnnotations(kept) : null
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
    const walk = (card: SketchCard, depth: number, around?: SketchCard): void => {
      const pad = '  '.repeat(depth)
      const extra = [card.at ? `at ${card.at}` : '', card.start ? 'start page' : ''].filter(Boolean)
      if (isStore(card.kind)) out.push(...storeWords(card, pad, named(card)))
      else out.push(`${pad}${named(card)}${extra.length ? ` (${extra.join('; ')})` : ''}${card.says ? `: ${card.says}` : ''}`)
      if (card.mockup) out.push(`${pad}  mockup: ${mockupFile(project.id, sketch.id, card.mockup)}`)
      for (const child of card.children) walk(child, depth + 1, card)
      const byId = new Map(card.children.map((c) => [c.id, c]))
      // A wire to a hub on this card's border says which part inside the wire
      // to this card really reaches, so it reads as reaching the far end of it.
      const endOf = (id: string): SketchCard | undefined => {
        const hubWire = wireOfHub(id)
        if (!hubWire) return byId.get(id)
        const outer = around?.wires.find((w) => w.id === hubWire)
        return outer && around?.children.find((c) => c.id === (outer.to === card.id ? outer.from : outer.to))
      }
      for (const wire of card.wires) {
        const from = endOf(wire.from)
        const to = endOf(wire.to)
        if (from && to)
          out.push(`${pad}  ${sentenceOf(named(from), wire.kind, named(to), wire.words).map((part) => part.text).join('')}`)
      }
      for (const note of card.notes) out.push(`${pad}  note: ${note.text}`)
    }
    for (const child of sketch.root.children) walk(child, 0, sketch.root)
    const top = new Map(sketch.root.children.map((c) => [c.id, c]))
    for (const wire of sketch.root.wires) {
      const from = top.get(wire.from)
      const to = top.get(wire.to)
      if (from && to) out.push(sentenceOf(named(from), wire.kind, named(to), wire.words).map((part) => part.text).join(''))
    }
    for (const note of sketch.root.notes) out.push(`note: ${note.text}`)

    // Annotations, level by level, each level named by the card it is in.
    const cards = new Map<string, SketchCard>()
    const levels: string[] = []
    const gather = (card: SketchCard): void => {
      cards.set(card.id, card)
      levels.push(card.id)
      card.children.forEach(gather)
    }
    gather(sketch.root)
    const said = annotationWords(sketch.layers ?? [], levels, (id) => {
      const card = cards.get(id)
      return !card ? 'a card since removed' : card.level === 'project' ? `the project ${card.name}` : named(card)
    })
    if (said.length) out.push('', ...said)
    return out.join('\n').trimEnd()
  }
  return `There is no sketch called "${name}" in ${projects.length ? projects.map((p) => p.shortName).join(', ') : 'any project this repo names'}. Call \`sketches\` to see them.`
}
