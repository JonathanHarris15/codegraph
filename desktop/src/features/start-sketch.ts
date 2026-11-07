// codegraph: feature start-sketch in workspace
// codegraph: uses projects, sketches, sync, members
import { randomUUID } from 'node:crypto'
import { listProjects } from '../modules/projects/index.js'
import { sendSketch } from '../modules/sync/index.js'
import { blankCard, LOOSE, newSketch, writeSketch, type Level, type Sketch, type SketchCard } from '../modules/sketches/index.js'

/** A card of the map, as the page hands it over to snapshot. */
export type MapCard = {
  id: string
  name: string
  level: Level
  kind: string
  role?: string
  look?: SketchCard['look']
  says: string
  at: string
  start: boolean
  setUp: boolean
  names: string[]
  children: MapCard[]
  wires: { from: string; to: string; kind: string; words: string }[]
}

/** A card of the map as a sketch card: the same, with room for a mockup and
 *  notes, and no screenshot, since a sketch is not the code. */
const fromMap = (card: MapCard): SketchCard => ({
  ...blankCard(card.id, card.name, card.level, card.kind),
  ...(card.role ? { role: card.role } : {}),
  ...(card.look ? { look: card.look } : {}),
  says: card.says,
  at: card.at,
  start: card.start,
  setUp: card.setUp,
  names: [...card.names],
  children: card.children.map(fromMap),
  wires: card.wires.map((w) => ({ id: randomUUID(), from: w.from, to: w.to, kind: w.kind, words: w.words })),
})

/** Starts a sketch in a project's library: blank, or a snapshot of the map
 *  the person is looking at, to draw a change over. */
export const startSketch = async (projectId: string, name: string, snapshot?: MapCard): Promise<Sketch> => {
  const project = listProjects().find((p) => p.id === projectId)
  if (!project && projectId !== LOOSE) throw new Error('no project with that id')
  const sketch = snapshot
    ? newSketch(projectId, name, fromMap(snapshot), `A snapshot of the map, ${new Date().toISOString().slice(0, 10)}`)
    : newSketch(projectId, name, blankCard(project?.id ?? randomUUID(), project?.name ?? name, 'project', 'project'))
  writeSketch(sketch)
  await sendSketch(sketch)
  return sketch
}
