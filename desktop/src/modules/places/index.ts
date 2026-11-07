// codegraph: module places
// codegraph: front door mapKey, mapsNow, readingFolder, keyIsShared, belongsTo, readSpots, writeSpots, readLayers, writeLayers, takeUpMerges, PROJECT_KEY, MapAt
import { arrangementKeys, readArrangementFile, writeArrangementFile, type Arrangement } from '../arrangements/index.js'
import { annotationKeys, hasAnnotations, readAnnotations, writeAnnotations, type Layer } from '../annotations/index.js'
import type { Point } from '../reader/index.js'
import { isAncestor, mainLineRef, mirrorFolder, tipOf } from '../repo/index.js'
import type { SoftwareSystem } from '../projects/index.js'

/** What the project's top level is known by among its maps: there is one, for
 *  everyone. */
export const PROJECT_KEY = 'project'

/** Which map a point is, by a name that stays the same for every member looking
 *  at the same one: a GitHub branch, a commit, or their own local one. */
export const mapKey = (point: Point): string => {
  if (point.kind === 'commit') return `commit:${point.sha}`
  if (point.kind === 'live') return `local:${point.branch ?? 'folder'}`
  return point.where === 'cloud' || /^origin\//.test(point.name) ? `github:${point.name.replace(/^[^/]+\//, '')}` : `local:${point.name}`
}

/** Whether other members can see this map: a local one is never shared. */
export const keyIsShared = (key: string): boolean => !key.includes('local:')

/** One software system's map as it is being looked at. */
export type MapAt = {
  systemId: string
  key: string
  /** The key of the map of its main line, which others start from. */
  mainKey: string
  /** The commit the map is read at, when known. */
  head?: string
}

/** Where a software system's code can be read on this computer: its working
 *  copy, or the history kept of it, if it has been fetched. */
export const readingFolder = (system: Pick<SoftwareSystem, 'path' | 'remote'>): string =>
  system.path || (system.remote ? mirrorFolder(system.remote) : '')

/** Each software system's map, as these points say it is being looked at. */
export const mapsNow = async (systems: SoftwareSystem[], points: Record<string, Point>): Promise<(MapAt & { folder: string; mainRef: string })[]> =>
  Promise.all(
    systems
      .filter((system) => points[system.id])
      .map(async (system) => {
        const point = points[system.id] as Point
        const folder = readingFolder(system)
        const mainRef = folder ? await mainLineRef(folder) : ''
        const onGithub = mainRef.startsWith('origin/')
        const mainKey = `${onGithub ? 'github' : 'local'}:${mainRef.replace(/^origin\//, '') || 'main'}`
        const ref = point.kind === 'live' ? 'HEAD' : point.kind === 'branch' ? point.name : point.sha
        return { systemId: system.id, key: mapKey(point), mainKey, folder, mainRef, head: folder ? await tipOf(folder, ref) : '' }
      }),
  )

/** The software system a thing on the map belongs to: anything inside it, and
 *  the room its card is given when open. Anything else is on the project's top
 *  level, for all maps. */
export const belongsTo = (id: string, systemIds: string[]): string => {
  const bare = id.replace(/^room:/, '')
  return systemIds.find((s) => bare.startsWith(`${s}/`) || (id.startsWith('room:') && bare === s)) ?? ''
}

const fileKey = (at: MapAt): string => `${at.systemId}@${at.key}`
const fileKeyOf = (systemId: string, key: string): string => `${systemId}@${key}`
const sibling = (key: string): string => (key.startsWith('github:') ? key.replace('github:', 'local:') : key.replace('local:', 'github:'))

/** Where a software system's map stands: its own arrangement if it has one. A
 *  map not moved yet starts from the same branch on the other side of GitHub,
 *  then its main line, then what was kept for the project before maps had
 *  their own (ADR 0019). */
const spotsFor = (projectId: string, at: MapAt, old: Arrangement): Arrangement => {
  for (const key of [at.key, sibling(at.key), at.mainKey]) {
    const kept = readArrangementFile(projectId, fileKeyOf(at.systemId, key))
    if (kept) return kept.spots
  }
  return old.filter((spot) => belongsTo(spot.id, [at.systemId]) !== '')
}

export const readSpots = (projectId: string, maps: MapAt[]): Arrangement => {
  const old = readArrangementFile(projectId)?.spots ?? []
  const ids = maps.map((m) => m.systemId)
  return [...old.filter((spot) => !belongsTo(spot.id, ids)), ...maps.flatMap((at) => spotsFor(projectId, at, old))]
}

/** Keeps a whole level's worth of moves: each thing goes to the map it belongs
 *  to, and only maps that really changed are written, so moving a card on one
 *  branch never touches another. Hands back which maps it wrote. */
export const writeSpots = (projectId: string, maps: MapAt[], spots: Arrangement): string[] => {
  const ids = maps.map((m) => m.systemId)
  const was = readArrangementFile(projectId)?.spots ?? []
  const wrote: string[] = []
  const say = (list: Arrangement): string => JSON.stringify([...list].sort((a, b) => a.id.localeCompare(b.id)))
  const top = spots.filter((spot) => !belongsTo(spot.id, ids))
  // What older files kept for a software system stays, for maps not moved yet.
  const keptOld = was.filter((spot) => belongsTo(spot.id, ids))
  if (say(top) !== say(was.filter((spot) => !belongsTo(spot.id, ids)))) {
    writeArrangementFile(projectId, { ...readArrangementFile(projectId), spots: [...top, ...keptOld], updatedAt: new Date().toISOString() })
    wrote.push(PROJECT_KEY)
  }
  for (const at of maps) {
    const mine = spots.filter((spot) => belongsTo(spot.id, [at.systemId]) !== '')
    if (say(mine) === say(spotsFor(projectId, at, was))) continue
    const file = fileKey(at)
    const kept = readArrangementFile(projectId, file)
    writeArrangementFile(
      projectId,
      {
        ...kept,
        spots: mine,
        updatedAt: new Date().toISOString(),
        ...(at.head ? { from: kept?.from || at.head, head: at.head } : {}),
      },
      file,
    )
    wrote.push(file)
  }
  return wrote
}

const onlyFor = (layers: Layer[], keep: (at: string) => boolean): Layer[] => layers.map((l) => ({ ...l, items: l.items.filter((i) => keep(i.at)) }))

const inSystem = (at: string, systemId: string): boolean => at === systemId || at.startsWith(`${systemId}/`)

/** A software system's notes at one map. A new map starts with none, but for one
 *  already holding the notes older files kept: the main line (ADR 0019). */
const layersFor = (projectId: string, at: MapAt, old: Layer[]): Layer[] => {
  for (const key of [at.key, sibling(at.key)]) if (hasAnnotations(projectId, fileKeyOf(at.systemId, key))) return readAnnotations(projectId, fileKeyOf(at.systemId, key))
  return at.key === at.mainKey ? onlyFor(old, (where) => inSystem(where, at.systemId)) : []
}

/** Every layer's metadata and notes, gathered from each map being looked at. */
export const readLayers = (projectId: string, maps: MapAt[]): Layer[] => {
  const old = readAnnotations(projectId)
  const ids = maps.map((m) => m.systemId)
  const out = new Map<string, Layer>()
  const take = (layers: Layer[]): void => {
    for (const layer of layers) {
      const was = out.get(layer.id)
      out.set(layer.id, was ? { ...was, items: [...was.items, ...layer.items] } : { ...layer, items: [...layer.items] })
    }
  }
  take(onlyFor(old, (where) => !ids.some((id) => inSystem(where, id))))
  for (const at of maps) take(layersFor(projectId, at, old))
  return [...out.values()]
}

/** Keeps the layers, each note going to the map it belongs to. Hands back which
 *  maps it wrote. Layers with nothing on a map are still written, so a person's
 *  own layer stays when its last note goes. */
export const writeLayers = (projectId: string, maps: MapAt[], layers: Layer[]): string[] => {
  const ids = maps.map((m) => m.systemId)
  const wrote: string[] = []
  const old = readAnnotations(projectId)
  const keptOld = old.flatMap((l) => l.items.filter((i) => ids.some((id) => inSystem(i.at, id))).map((i) => ({ layer: l.id, item: i })))
  const top = onlyFor(layers, (where) => !ids.some((id) => inSystem(where, id))).map((l) => ({
    ...l,
    items: [...l.items, ...keptOld.filter((k) => k.layer === l.id).map((k) => k.item)],
  }))
  if (JSON.stringify(top) !== JSON.stringify(old)) {
    writeAnnotations(projectId, top)
    wrote.push(PROJECT_KEY)
  }
  for (const at of maps) {
    const mine = onlyFor(layers, (where) => inSystem(where, at.systemId))
    if (JSON.stringify(mine) === JSON.stringify(layersFor(projectId, at, old))) continue
    if (!mine.some((l) => l.items.length) && !layersFor(projectId, at, old).some((l) => l.items.length)) continue
    writeAnnotations(projectId, mine, fileKey(at))
    wrote.push(fileKey(at))
  }
  return wrote
}

/** Looks for branches merged into a software system's main line since last
 *  time. The main line takes the whole layout of whichever side was last worked
 *  on, and all of the branch's notes (ADR 0019). A branch with no commits of its
 *  own has nothing merged, and is left alone. Hands back the maps it wrote. */
export const takeUpMerges = async (projectId: string, repo: string, at: MapAt, mainRef: string): Promise<string[]> => {
  if (!repo || at.key !== at.mainKey) return []
  const mainTip = await tipOf(repo, mainRef)
  if (!mainTip) return []
  const mainFile = fileKey(at)
  const prefix = `${at.systemId}@`
  const wrote = new Set<string>()
  const keys = new Set(
    [...arrangementKeys(projectId), ...annotationKeys(projectId)].filter((k) => k.startsWith(prefix) && k !== mainFile && !k.includes('@commit:')),
  )
  for (const file of keys) {
    const key = file.slice(prefix.length)
    const name = key.replace(/^(github|local):/, '')
    const kept = readArrangementFile(projectId, file)
    const tip = (await tipOf(repo, key.startsWith('github:') ? `origin/${name}` : name)) || kept?.head || ''
    if (!tip || tip === mainTip || kept?.merged === tip) continue
    if (kept?.from === tip || !(await isAncestor(repo, tip, mainTip))) continue
    const main = readArrangementFile(projectId, mainFile)
    if (kept && (kept.updatedAt ?? '') > (main?.updatedAt ?? '')) {
      writeArrangementFile(projectId, { ...main, spots: kept.spots, updatedAt: kept.updatedAt ?? new Date().toISOString() }, mainFile)
      wrote.add(mainFile)
    }
    const theirs = readAnnotations(projectId, file)
    if (theirs.some((l) => l.items.length)) {
      const mine = readAnnotations(projectId, mainFile)
      const merged = mine.map((l) => ({ ...l, items: [...l.items] }))
      for (const layer of theirs) {
        const same = merged.find((l) => l.id === layer.id)
        if (same) same.items = [...same.items, ...layer.items.filter((i) => !same.items.some((o) => o.id === i.id))]
        else merged.push(layer)
      }
      writeAnnotations(projectId, merged, mainFile)
      wrote.add(mainFile)
    }
    writeArrangementFile(projectId, { ...(kept ?? { spots: [] }), merged: tip }, file)
  }
  return [...wrote]
}

