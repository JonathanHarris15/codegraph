// codegraph: feature draw-sketch in agent
// codegraph: uses reader, projects, sketches, card-types, flowchart, members, sync
// codegraph: command draw
import { readCardTypes } from '../modules/card-types/index.js'
import { readFlowchart, type FlowchartNote } from '../modules/flowchart/index.js'
import { iMay } from '../modules/members/index.js'
import { listProjects } from '../modules/projects/index.js'
import { live, readMap } from '../modules/reader/index.js'
import { blankCard, listSketches, newSketch, readSketch, writeSketch, type Sketch, type SketchCard } from '../modules/sketches/index.js'
import { oweSketch } from '../modules/sync/index.js'

/** The layer an agent's notes go on, so drawing again replaces them. */
const NOTES_LAYER = 'flowchart-notes'

/** Where a person moved a card, the room they gave it and a page's mockup stay
 *  when an agent draws the sketch again, for every card still there. */
const keepPlaces = (was: SketchCard, now: SketchCard): SketchCard => {
  const old = new Map<string, SketchCard>()
  const gather = (card: SketchCard): void => {
    old.set(card.id, card)
    card.children.forEach(gather)
  }
  gather(was)
  const keep = (card: SketchCard): SketchCard => {
    const before = old.get(card.id)
    const same = before && before.level === card.level
    return {
      ...card,
      ...(same && before.x !== undefined && before.y !== undefined ? { x: before.x, y: before.y } : {}),
      ...(same && before.room ? { room: before.room } : {}),
      ...(same && before.mockup && card.kind === 'page' ? { mockup: before.mockup } : {}),
      children: card.children.map(keep),
    }
  }
  return keep(now)
}

/** Each note as a sticky note on its level, in a row above the cards there,
 *  which the canvas centres on the middle. */
const notesLayer = (notes: FlowchartNote[], root: SketchCard): NonNullable<Sketch['layers']>[number] | null => {
  if (!notes.length) return null
  const cards = new Map<string, SketchCard>()
  const gather = (card: SketchCard): void => {
    cards.set(card.id, card)
    card.children.forEach(gather)
  }
  gather(root)
  const items = notes.map((note, i) => {
    const at = note.at || root.id
    const level = notes.filter((one) => (one.at || root.id) === at)
    const k = level.indexOf(note)
    // The canvas spreads a wired level along its wires, a few cards to a row,
    // and wraps one with no wires four to a row; a row is a card and its air.
    const here = cards.get(at)
    const count = here?.children.length ?? 1
    const rows = Math.max(1, Math.ceil(count / (here?.wires.length ? 3 : 4)))
    const tall = rows * 206 - 56
    return {
      id: `note-${i + 1}`,
      at,
      kind: 'sticky',
      x: Math.round((k - (level.length - 1) / 2) * 200 - 90),
      y: -Math.round(tall / 2 + 40 + 110),
      w: 180,
      h: 110,
      text: note.text,
      color: 'yellow',
    }
  })
  return { id: NOTES_LAYER, name: 'Notes', shown: true, snaps: true, items }
}

const count = (cards: SketchCard[]): number => cards.reduce((sum, card) => sum + 1 + count(card.children), 0)
const wires = (card: SketchCard): number => card.wires.length + card.children.reduce((sum, child) => sum + wires(child), 0)

/** Makes a sketch in a project from a Mermaid flowchart an agent wrote, or
 *  replaces the one of that name. The canvas lays its cards out. It reaches
 *  the online copy the next time the app catches up. */
export const drawSketch = async (repo: string, name: string, flowchart: string, shortName = ''): Promise<string> => {
  const all = listProjects()
  const served = shortName ? [shortName.toLowerCase()] : repo ? (await readMap(repo, live)).projects : []
  const projects = all.filter((p) => served.includes(p.shortName))
  if (!projects.length)
    return shortName
      ? `There is no project with the short name "${shortName}" on this computer.`
      : 'This repo names no project this computer has. Name one with `project`.'
  if (projects.length > 1)
    return `This repo serves ${projects.map((p) => p.shortName).join(', ')}. Name the one to draw in with \`project\`.`
  const project = projects[0]!
  if (!iMay(project, 'draw')) return `Whoever is signed in here can only look at ${project.name}, not draw in it. Nothing was drawn.`
  const called = name.trim()
  if (!called) return 'A sketch needs a name. Nothing was drawn.'

  const read = readFlowchart(flowchart, readCardTypes())
  if (!read.ok) return ['Nothing was drawn. Fix these and draw it again:', ...read.problems.map((p) => `- ${p}`)].join('\n')

  const listed = listSketches(project.id).find((s) => s.name.toLowerCase() === called.toLowerCase())
  const was = listed ? readSketch(project.id, listed.id) : null
  const drawn: SketchCard = { ...blankCard(was?.root.id ?? project.id, project.name, 'project', 'project'), children: read.cards, wires: read.wires }
  const root = was ? keepPlaces(was.root, drawn) : drawn
  const layer = notesLayer(read.notes, root)
  const layers = [...(was?.layers ?? []).filter((l) => l.id !== NOTES_LAYER), ...(layer ? [layer] : [])]
  const sketch: Sketch = was
    ? { ...was, root: { ...root, notes: [] }, layers, updatedAt: new Date().toISOString() }
    : { ...newSketch(project.id, called, root, 'Drawn by an agent from a flowchart'), layers }
  writeSketch(sketch)
  oweSketch(sketch)

  const inside = count(read.cards) - read.cards.length
  return [
    `${was ? 'Replaced' : 'Made'} the sketch "${sketch.name}" in ${project.name} (${project.shortName}): ${read.cards.length} cards on the top level and ${inside} inside them, ${wires(root)} wires and ${read.notes.length} notes. The canvas lays the cards out.`,
    project.online ? 'It goes online the next time the app is open.' : '',
    'Call `sketch` to read it back.',
  ]
    .filter(Boolean)
    .join(' ')
}
