// codegraph: feature start-sketch in workspace
// codegraph: uses projects, sketches, sync, members, places, repo, reader
import { randomUUID } from 'node:crypto'
import { findProject } from '../modules/projects/index.js'
import { iMay } from '../modules/members/index.js'
import { readingFolder } from '../modules/places/index.js'
import type { Point } from '../modules/reader/index.js'
import { tipOf } from '../modules/repo/index.js'
import { sendSketchSoon } from '../modules/sync/index.js'
import { blankCard, LOOSE, newSketch, writeSketch, type Level, type Sketch, type SketchCard, type SketchField } from '../modules/sketches/index.js'

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
  /** A store's fields, null when its shape is unknown. */
  fields?: SketchField[] | null
  others?: string
  children: MapCard[]
  wires: { from: string; to: string; kind: string; words: string }[]
}

/** A card of the map as a sketch card: the same, with room for a mockup and
 *  notes, and no screenshot, since a sketch is not the code. A store keeps
 *  its fields. */
const fromMap = (card: MapCard): SketchCard => ({
  ...blankCard(card.id, card.name, card.level, card.kind),
  ...(card.role ? { role: card.role } : {}),
  ...(card.look ? { look: card.look } : {}),
  says: card.says,
  at: card.at,
  start: card.start,
  setUp: card.setUp,
  names: [...card.names],
  ...(card.fields !== undefined ? { fields: card.fields && card.fields.map((f) => ({ ...f })), others: card.others ?? '' } : {}),
  children: card.children.map(fromMap),
  wires: card.wires.map((w) => ({ id: randomUUID(), from: w.from, to: w.to, kind: w.kind, words: w.words })),
})

/** The software system a snapshot was read from, and where in its history. */
export type SnapshotAt = { systemId: string; point: Point }

/** Where in a repo's history the map was read: its branch and short commit,
 *  as "main · a1b2c3d", or '' when that cannot be told. */
const whereRead = async (projectId: string, at: SnapshotAt): Promise<string> => {
  const system = findProject(projectId)?.systems.find((s) => s.id === at.systemId)
  if (!system) return ''
  const { point } = at
  const branch = point.kind === 'branch' ? point.name.replace(/^origin\//, '') : point.kind === 'live' ? (point.branch ?? '') : ''
  const ref = point.kind === 'live' ? 'HEAD' : point.kind === 'branch' ? point.name : point.sha
  const folder = readingFolder(system)
  const tip = folder ? await tipOf(folder, ref).catch(() => '') : ''
  return [branch, tip.trim().slice(0, 7)].filter(Boolean).join(' · ')
}

/** Starts a sketch in a project's library: blank, or a snapshot of the map
 *  the person is looking at, to draw a change over. A snapshot says where it
 *  was read from, when the page names the software system. It is ready to
 *  open at once; going online follows, as a slow connection would hold it up. */
export const startSketch = async (projectId: string, name: string, snapshot?: MapCard, at?: SnapshotAt): Promise<Sketch> => {
  const project = findProject(projectId)
  if (!project && projectId !== LOOSE) throw new Error('no project with that id')
  if (project && !iMay(project, 'draw')) throw new Error('a viewer cannot start a sketch here')
  const where = snapshot && at ? await whereRead(projectId, at) : ''
  // The day here, as the sketch's name says it, not the day in Greenwich.
  const now = new Date()
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const sketch = snapshot
    ? newSketch(projectId, name, fromMap(snapshot), `A snapshot of the map${where ? ` at ${where}` : ''}, ${day}`)
    : newSketch(projectId, name, blankCard(project?.id ?? randomUUID(), project?.name ?? name, 'project', 'project'))
  writeSketch(sketch)
  sendSketchSoon(sketch)
  return sketch
}
