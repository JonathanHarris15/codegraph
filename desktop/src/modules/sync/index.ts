// codegraph: module sync
// codegraph: front door useFolder, useHeard, startFollowing, stopFollowing, pull, sendUp, sendSketch, sendFolder, sendMap, sendProject, sendEverything, sendRemoval, catchUp, follow, listRevisions, restoreRevision, pendingCount, removeEverything, projectPath, sketchPath, folderPath, Revision
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { annotationKeys, readAnnotations, removeAnnotations, writeAnnotations, type Layer } from '../annotations/index.js'
import { arrangementKeys, readArrangementFile, removeArrangements, writeArrangementFile, type Arrangement } from '../arrangements/index.js'
import { CloudOffline, theCloud, type Doc, type Member } from '../cloud/index.js'
import { whoIsIn } from '../members/index.js'
import { keyIsShared, PROJECT_KEY } from '../places/index.js'
import { keepProject, listProjects, removeProject, type Project } from '../projects/index.js'
import { keepMockupBytes, listFolders, listSketches, LOOSE, mockupFile, readFolder, readSketch, removeFolder, removeSketch, SHARED_WITH_ME, writeFolder, writeSketch, type Sketch, type SketchCard, type SketchFolder } from '../sketches/index.js'
import { mergeDoc, sameDoc, tally, wordsFor } from '../together/index.js'
import { keepWhole } from '../machine/index.js'

let folder = ''

/** The shell says where this computer keeps codegraph's files. Beside its copy of
 *  everything, this keeps the online copy as last seen, so it can tell what
 *  changed on which side, and a list of what has not gone up yet. */
export const useFolder = (where: string): void => {
  folder = where
  groups.clear()
  queues.clear()
}

const inFolder = (...parts: string[]): string => {
  if (!folder) throw new Error('sync: no folder chosen yet')
  return join(folder, 'sync', ...parts)
}

const kept = (file: string, doc: unknown): void => {
  keepWhole(file, JSON.stringify(doc))
}

const lastSeenFile = (path: string): string => inFolder('seen', `${encodeURIComponent(path)}.json`)
const lastSeen = (path: string): Doc | null => {
  try {
    return JSON.parse(readFileSync(lastSeenFile(path), 'utf8')) as Doc
  } catch {
    return null
  }
}
const see = (path: string, doc: Doc | null): void => {
  if (doc) kept(lastSeenFile(path), doc)
  else rmSync(lastSeenFile(path), { force: true })
}

/** What is waiting to go up, kept on disk so it survives closing the app. */
const pendingFile = (): string => inFolder('pending.json')
const pending = (): string[] => {
  try {
    return JSON.parse(readFileSync(pendingFile(), 'utf8')) as string[]
  } catch {
    return []
  }
}
const markPending = (path: string, is: boolean): void => {
  const all = new Set(pending())
  if (is) all.add(path)
  else all.delete(path)
  kept(pendingFile(), [...all])
}
export const pendingCount = (): number => pending().length

export const projectPath = (projectId: string): string => `projects/${projectId}`
const mapsPath = (projectId: string): string => `projects/${projectId}/maps`
const revisionsPath = (projectId: string): string => `projects/${projectId}/revisions`

/** Where a sketch lives online: with its project; or, for a loose one, on its
 *  own if shared, or else privately under who it belongs to. '' if it does not
 *  go online, as for a project only on this computer or with no one signed in. */
export const sketchPath = (sketch: Pick<Sketch, 'id' | 'projectId' | 'memberIds'>): string => {
  if (sketch.projectId === LOOSE || sketch.projectId === SHARED_WITH_ME) {
    if (sketch.memberIds?.length) return `sketches/${sketch.id}`
    const me = whoIsIn()
    return me ? `members/${me.id}/sketches/${sketch.id}` : ''
  }
  return listProjects().find((p) => p.id === sketch.projectId)?.online ? `projects/${sketch.projectId}/sketches/${sketch.id}` : ''
}

/** Where a folder of sketches lives online: with its project, or privately under
 *  who it belongs to. '' if it does not go online. */
export const folderPath = (library: string, id: string): string => {
  if (library === LOOSE) {
    const me = whoIsIn()
    return me ? `members/${me.id}/folders/${id}` : ''
  }
  return listProjects().find((p) => p.id === library)?.online ? `projects/${library}/folders/${id}` : ''
}

// ---- This computer's copy of each kind of document ----

/** What goes online of a project: not where a repo sits on this computer, nor
 *  the branch this person last looked at. */
const projectDoc = (project: Project): Doc => ({
  id: project.id,
  name: project.name,
  shortName: project.shortName,
  createdAt: project.createdAt,
  ownerId: project.ownerId ?? '',
  members: project.members ?? [],
  // The same again in the forms the online side's access rules can read.
  memberIds: (project.members ?? []).map((m) => m.id),
  roles: Object.fromEntries((project.members ?? []).map((m) => [m.id, m.role])),
  systems: project.systems.map(({ id, name, remote }) => ({ id, name, remote })),
  shallow: project.shallow,
})

const projectFromDoc = (doc: Doc): Project => {
  const here = listProjects().find((p) => p.id === doc['id'])
  const systems = doc['systems'] as { id: string; name: string; remote: string }[]
  return {
    id: String(doc['id']),
    name: String(doc['name']),
    shortName: String(doc['shortName']),
    createdAt: String(doc['createdAt']),
    online: true,
    ownerId: String(doc['ownerId']),
    members: doc['members'] as Project['members'],
    shallow: doc['shallow'] as Project['shallow'],
    systems: systems.map((s) => {
      const mine = here?.systems.find((o) => o.id === s.id)
      return { ...s, path: mine?.path ?? '', ...(mine?.branch ? { branch: mine.branch } : {}) }
    }),
  }
}

type Local = { read: () => Doc | null; write: (doc: Doc | null) => void }

const mapDoc = (projectId: string, key: string): Doc | null => {
  const file = key === PROJECT_KEY ? '' : key
  const places = readArrangementFile(projectId, file)
  const layers = readAnnotations(projectId, file)
  if (!places && !layers.length) return null
  return { id: key, spots: places?.spots ?? [], layers, updatedAt: places?.updatedAt ?? '', from: places?.from ?? '', head: places?.head ?? '' }
}

const keepMapDoc = (projectId: string, key: string, doc: Doc | null): void => {
  const file = key === PROJECT_KEY ? '' : key
  if (!doc) {
    writeArrangementFile(projectId, { spots: [] }, file)
    writeAnnotations(projectId, [], file)
    return
  }
  const was = readArrangementFile(projectId, file)
  writeArrangementFile(
    projectId,
    { ...was, spots: doc['spots'] as Arrangement, updatedAt: String(doc['updatedAt'] ?? ''), from: String(doc['from'] ?? ''), head: String(doc['head'] ?? '') },
    file,
  )
  writeAnnotations(projectId, doc['layers'] as Layer[], file)
}

const localOf = (path: string): Local | null => {
  const parts = path.split('/')
  const [top, a, kind, b] = parts
  if (top === 'projects' && a && !kind)
    return {
      read: () => {
        const project = listProjects().find((p) => p.id === a)
        return project?.online ? projectDoc(project) : null
      },
      write: (doc) => {
        if (doc) keepProject(projectFromDoc(doc))
        else forgetProjectHere(a)
      },
    }
  if (top === 'projects' && a && kind === 'sketches' && b) return localSketch(a, b)
  if (top === 'projects' && a && kind === 'maps' && b) {
    const key = decodeURIComponent(b)
    return { read: () => mapDoc(a, key), write: (doc) => keepMapDoc(a, key, doc) }
  }
  if (top === 'members' && kind === 'sketches' && b) return localSketch(LOOSE, b)
  if (top === 'projects' && a && kind === 'folders' && b) return localFolder(a, b)
  if (top === 'members' && kind === 'folders' && b) return localFolder(LOOSE, b)
  if (top === 'sketches' && a) {
    const inMine = (): string => (readSketch(LOOSE, a) ? LOOSE : SHARED_WITH_ME)
    return {
      // However it is filed here, it is the same document online.
      read: () => {
        const doc = localSketch(inMine(), a).read()
        return doc && { ...doc, projectId: LOOSE }
      },
      write: (doc) => {
        const where = doc && doc['ownerId'] === whoIsIn()?.id ? LOOSE : inMine()
        localSketch(where, a).write(doc && { ...doc, projectId: where })
      },
    }
  }
  return null
}

const localSketch = (projectId: string, id: string): Local => ({
  read: () => readSketch(projectId, id) as unknown as Doc | null,
  write: (doc) => {
    if (doc) writeSketch({ ...(doc as unknown as Sketch), projectId })
    else removeSketch(projectId, id)
  },
})

const localFolder = (library: string, id: string): Local => ({
  read: () => readFolder(library, id) as unknown as Doc | null,
  write: (doc) => {
    if (doc) writeFolder({ ...(doc as unknown as SketchFolder), library })
    else removeFolder(library, id)
  },
})

/** Leaves nothing of a project on this computer. */
const forgetProjectHere = (projectId: string): void => {
  for (const sketch of listSketches(projectId)) removeSketch(projectId, sketch.id)
  for (const one of listFolders(projectId)) removeFolder(projectId, one.id)
  removeArrangements(projectId)
  removeAnnotations(projectId)
  removeProject(projectId)
}

// ---- Pictures ----

const mockupsIn = (card: SketchCard): string[] => [...(card.mockup ? [card.mockup] : []), ...card.children.flatMap(mockupsIn)]

const sendMockups = async (path: string, doc: Doc): Promise<void> => {
  const cloud = theCloud()
  const sketch = doc as unknown as Sketch
  if (!cloud || !sketch.root) return
  for (const name of mockupsIn(sketch.root)) {
    const marker = inFolder('files', encodeURIComponent(`${path}/${name}`))
    const file = mockupFile(sketch.projectId, sketch.id, name)
    if (existsSync(marker) || !existsSync(file)) continue
    await cloud.putFile(`${path}/${name}`, readFileSync(file))
    kept(marker, 1)
  }
}

const takeMockups = async (path: string, doc: Doc, projectId: string): Promise<void> => {
  const cloud = theCloud()
  const sketch = doc as unknown as Sketch
  if (!cloud || !sketch.root) return
  for (const name of mockupsIn(sketch.root)) {
    if (existsSync(mockupFile(projectId, sketch.id, name))) continue
    const bytes = await cloud.getFile(`${path}/${name}`)
    if (bytes) keepMockupBytes(projectId, sketch.id, name, bytes)
  }
}

// ---- Revisions ----

/** One entry in a project's history. Its snapshot, kept as a file, is how the
 *  thing stood when this stretch of work ended. */
export type Revision = {
  id: string
  memberId: string
  memberName: string
  avatar: string
  at: string
  /** What it changed, by where it lives online. */
  target: string
  /** What it changed, in words: "Search sketch", "the map of notes on main". */
  targetName: string
  says: string
  /** Whether going back to it means anything: who is on a project does not. */
  restorable: boolean
}

const GROUP_MS = 5 * 60 * 1000
/** A member's stretch of work: changes to one thing with no long pause and no
 *  one else's change in between. It lives only as long as the app runs. */
const groups = new Map<string, { id: string; start: Doc | null; lastAt: number; last: Doc | null }>()

const nameOfTarget = (target: string, doc: Doc | null): string => {
  const [, projectId, kind, b] = target.split('/')
  if (!kind) return 'the project'
  if (kind === 'sketches') return `the ${String(doc?.['name'] ?? 'sketch')} sketch`
  const key = decodeURIComponent(b ?? '')
  if (key === PROJECT_KEY) return "the project's top level"
  const [systemId = '', map = ''] = key.split('@')
  const system = listProjects().find((p) => p.id === projectId)?.systems.find((s) => s.id === systemId)
  return `the map of ${system?.name ?? 'a software system'} on ${map.replace(/^(github|commit):/, '')}`
}

const isRevised = (path: string): boolean => /^projects\/[^/]+(\/(sketches|maps)\/[^/]+)?$/.test(path)

const noteRevision = async (path: string, me: Member, was: Doc | null, now: Doc | null, says?: string): Promise<void> => {
  const cloud = theCloud()
  if (!cloud || !isRevised(path) || sameDoc(was, now)) return
  const projectId = path.split('/')[1] ?? ''
  const key = `${path}|${me.id}`
  const open = groups.get(key)
  const fresh = !open || Date.now() - open.lastAt > GROUP_MS || !sameDoc(open.last, was) || Boolean(says)
  const id = fresh ? randomUUID() : open.id
  const start = fresh ? was : open.start
  groups.set(key, { id, start, lastAt: Date.now(), last: now })
  const restorable = path.includes('/sketches/') || path.includes('/maps/')
  if (restorable) await cloud.putFile(`${revisionsPath(projectId)}/${id}.json`, Buffer.from(JSON.stringify(now ?? was)))
  const revision: Revision = {
    id,
    memberId: me.id,
    memberName: me.name,
    avatar: me.avatar,
    at: new Date().toISOString(),
    target: path,
    targetName: nameOfTarget(path, now ?? was),
    says: says ?? (now === null ? 'took it away' : start === null ? 'started it' : wordsFor(tally(start, now))),
    restorable: restorable && now !== null,
  }
  await cloud.change(`${revisionsPath(projectId)}/${id}`, () => revision as unknown as Doc)
}

export const listRevisions = async (projectId: string): Promise<Revision[]> => {
  const cloud = theCloud()
  if (!cloud) return []
  const docs = (await cloud.list(revisionsPath(projectId))) as unknown as Revision[]
  return docs.sort((a, b) => b.at.localeCompare(a.at))
}

/** Puts something back as a revision left it, as a new revision of its own, so
 *  nothing is lost by doing it. False if it cannot be found. */
export const restoreRevision = async (projectId: string, revisionId: string): Promise<boolean> => {
  const cloud = theCloud()
  if (!cloud) return false
  const revision = (await cloud.read(`${revisionsPath(projectId)}/${revisionId}`)) as unknown as Revision | null
  const bytes = revision?.restorable ? await cloud.getFile(`${revisionsPath(projectId)}/${revisionId}.json`) : null
  const local = revision ? localOf(revision.target) : null
  if (!revision || !bytes || !local) return false
  local.write(JSON.parse(bytes.toString('utf8')) as Doc)
  await sendUp(revision.target, `went back to the version from ${revision.at}`)
  return true
}

// ---- Up and down ----

const queues = new Map<string, Promise<void>>()

/** One document at a time up the line, so its changes land in the order made. */
export const sendUp = (path: string, says?: string): Promise<void> => {
  const after = queues.get(path) ?? Promise.resolve()
  const next = after.then(() => sendNow(path, says))
  queues.set(path, next)
  return next
}

/** A project lists who is on it three ways, for searching and for access rules;
 *  whatever a merge does, they always agree. */
const tidy = (path: string, doc: Doc | null): Doc | null =>
  doc && /^projects\/[^/]+$/.test(path)
    ? {
        ...doc,
        memberIds: ((doc['members'] ?? []) as { id: string }[]).map((m) => m.id),
        roles: Object.fromEntries(((doc['members'] ?? []) as { id: string; role: string }[]).map((m) => [m.id, m.role])),
      }
    : doc

/** Takes something off the online side that stays on this computer, as when a
 *  sketch moves from one place online to another. */
export const sendRemoval = async (path: string): Promise<void> => {
  const cloud = theCloud()
  if (!cloud) return
  try {
    await cloud.change(path, () => null)
  } catch (problem) {
    if (!(problem instanceof CloudOffline)) throw problem
  }
  see(path, null)
}

const sendNow = async (path: string, says?: string): Promise<void> => {
  const cloud = theCloud()
  const me = whoIsIn()
  const local = localOf(path)
  if (!cloud || !me || !local) return
  const mine = local.read()
  const base = lastSeen(path)
  let latest: Doc | null = null
  let merged: Doc | null = null
  try {
    merged = await cloud.change(path, (now) => {
      latest = now
      if (mine === null) return null
      return tidy(path, now === null ? mine : mergeDoc(base, mine, now))
    })
    see(path, merged)
    markPending(path, false)
    // Something may have been saved here while this was on its way. It is kept, and
    // goes up after this.
    const since = local.read()
    if (!sameDoc(since, mine)) {
      if (since && merged) {
        const both = mergeDoc(mine, since, merged)
        if (!sameDoc(both, since)) local.write(both)
      }
      void sendUp(path)
    } else if (merged && !sameDoc(merged, mine)) local.write(merged)
    if (merged && path.includes('sketches')) await sendMockups(path, merged)
    await noteRevision(path, me, latest, merged, says)
  } catch (problem) {
    if (!(problem instanceof CloudOffline)) throw problem
    markPending(path, true)
  }
}

export const sendProject = (projectId: string): Promise<void> => sendUp(projectPath(projectId))

/** Sends up a sketch that has just been kept. */
export const sendSketch = async (sketch: Sketch): Promise<void> => {
  const path = sketchPath(sketch)
  if (path) await sendUp(path)
}

/** Sends up a folder just made, renamed, moved or deleted. */
export const sendFolder = async (library: string, id: string): Promise<void> => {
  const path = folderPath(library, id)
  if (path) await sendUp(path)
}

/** Sends up the maps just written. A local map stays on this computer. */
export const sendMap = async (projectId: string, keys: string[]): Promise<void> => {
  if (!listProjects().find((p) => p.id === projectId)?.online) return
  for (const key of keys) if (keyIsShared(key)) await sendUp(`${mapsPath(projectId)}/${encodeURIComponent(key)}`)
}

/** Sends everything that could not go up before. */
export const catchUp = async (): Promise<void> => {
  for (const path of pending()) await sendUp(path)
}

/** Takes in what the online copy now says. Anything changed here and not yet up
 *  is kept, and goes up. True if this computer's copy changed. */
const takeDown = async (path: string, theirs: Doc | null): Promise<boolean> => {
  const local = localOf(path)
  if (!local) return false
  const mine = local.read()
  const base = lastSeen(path)
  if (sameDoc(mine, theirs)) {
    see(path, theirs)
    return false
  }
  if (theirs === null) {
    see(path, null)
    // New here, or changed here since it was last seen: a change here keeps it.
    // Being taken off a project is different, and is dealt with where that is heard.
    const isProject = /^projects\/[^/]+$/.test(path)
    if (mine !== null && !isProject && (base === null || !sameDoc(mine, base))) {
      await sendUp(path)
      return false
    }
    local.write(null)
    return true
  }
  const merged = tidy(path, mine === null ? theirs : mergeDoc(base, mine, theirs)) as Doc
  see(path, theirs)
  if (!sameDoc(merged, mine)) local.write(merged)
  if (!sameDoc(merged, theirs)) await sendUp(path)
  if (path.includes('sketches')) {
    const where = path.startsWith('sketches/') ? (readSketch(LOOSE, String(merged['id'])) ? LOOSE : SHARED_WITH_ME) : (merged as unknown as Sketch).projectId
    await takeMockups(path, merged, where)
  }
  return !sameDoc(merged, mine)
}

/** Which of the documents last seen in a collection have gone from it. */
const seenIn = (collection: string): string[] => {
  const dir = inFolder('seen')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => decodeURIComponent(n.slice(0, -5)))
    .filter((p) => p.startsWith(`${collection}/`) && !p.slice(collection.length + 1).includes('/'))
}

const idPart = (collection: string, doc: Doc): string => {
  const id = String(doc['id'])
  return collection.endsWith('/maps') ? encodeURIComponent(id) : id
}

/** Something heard could not be taken in just now, as when the connection drops
 *  part way. It is heard again when the online copy next changes, or at next start. */
const quietly = (problem: unknown): void => {
  console.error('codegraph: could not take in a change from online', problem)
}

/** Stays in step with everything that names this member, for as long as it is
 *  not stopped, and says what changed. */
export const follow = (me: Member, changed: (what: { projectId: string; path: string }) => void): (() => void) => {
  const cloud = theCloud()
  if (!cloud) return () => undefined
  const stops = new Map<string, () => void>()

  const turns = new Map<string, Promise<void>>()
  /** One at a time on a collection, so an older answer never lands after a newer. */
  const inTurn = (collection: string, work: () => Promise<void>): Promise<void> => {
    const next = (turns.get(collection) ?? Promise.resolve()).then(work, work)
    turns.set(collection, next)
    return next
  }
  const takeAll = (collection: string, docs: Doc[], projectId: string): Promise<void> =>
    inTurn(collection, async () => {
      const here = new Set(docs.map((doc) => `${collection}/${idPart(collection, doc)}`))
      for (const doc of docs) {
        const path = `${collection}/${idPart(collection, doc)}`
        if (await takeDown(path, doc)) changed({ projectId, path })
      }
      for (const path of seenIn(collection)) {
        // What was heard may be older than something just sent, so make sure.
        if (here.has(path) || (await cloud.read(path)) !== null) continue
        if (await takeDown(path, null)) changed({ projectId, path })
      }
    })
  const watching = (collection: string, projectId: string): void => {
    if (stops.has(collection)) return
    stops.set(
      collection,
      cloud.watch(collection, (docs) => void takeAll(collection, docs, projectId).catch(quietly)),
    )
  }

  const heardProjects = async (docs: Doc[]): Promise<void> => {
    const ids = new Set(docs.map((d) => String(d['id'])))
    await takeAll('projects', docs, '')
    for (const id of ids) {
      watching(`projects/${id}/sketches`, id)
      watching(`projects/${id}/folders`, id)
      watching(mapsPath(id), id)
    }
    // Taken off a project: it goes from this computer too. One never seen online
    // has not reached it yet, and is still to go up.
    for (const project of listProjects())
      if (project.online && !ids.has(project.id) && lastSeen(projectPath(project.id))) {
        forgetProjectHere(project.id)
        see(projectPath(project.id), null)
        changed({ projectId: project.id, path: projectPath(project.id) })
      }
  }

  stops.set('projects', cloud.watchNaming('projects', me.id, (docs) => void heardProjects(docs).catch(quietly)))
  watching(`members/${me.id}/sketches`, LOOSE)
  watching(`members/${me.id}/folders`, LOOSE)
  stops.set(
    'sketches',
    cloud.watchNaming('sketches', me.id, (docs) => void takeAll('sketches', docs, SHARED_WITH_ME).catch(quietly)),
  )
  return () => {
    for (const stop of stops.values()) stop()
    stops.clear()
  }
}

/** Takes in everything once, for signing in, and for tests. */
export const pull = async (me: Member): Promise<void> => {
  const cloud = theCloud()
  if (!cloud) return
  const takeAll = async (collection: string, docs: Doc[]): Promise<void> => {
    const here = new Set(docs.map((doc) => `${collection}/${idPart(collection, doc)}`))
    for (const doc of docs) await takeDown(`${collection}/${idPart(collection, doc)}`, doc)
    for (const path of seenIn(collection)) if (!here.has(path)) await takeDown(path, null)
  }
  const projects = await cloud.naming('projects', me.id)
  await takeAll('projects', projects)
  const ids = new Set(projects.map((d) => String(d['id'])))
  for (const id of ids) {
    await takeAll(`projects/${id}/sketches`, await cloud.list(`projects/${id}/sketches`))
    await takeAll(`projects/${id}/folders`, await cloud.list(`projects/${id}/folders`))
    await takeAll(mapsPath(id), await cloud.list(mapsPath(id)))
  }
  for (const project of listProjects())
    if (project.online && !ids.has(project.id) && lastSeen(projectPath(project.id))) {
      forgetProjectHere(project.id)
      see(projectPath(project.id), null)
    }
  await takeAll(`members/${me.id}/sketches`, await cloud.list(`members/${me.id}/sketches`))
  await takeAll(`members/${me.id}/folders`, await cloud.list(`members/${me.id}/folders`))
  await takeAll('sketches', await cloud.naming('sketches', me.id))
}

let heard: (what: { projectId: string; path: string }) => void = () => undefined
let stopNow: (() => void) | null = null

/** The shell says who to tell when something changes from outside. */
export const useHeard = (who: (what: { projectId: string; path: string }) => void): void => {
  heard = who
}

export const stopFollowing = (): void => {
  stopNow?.()
  stopNow = null
  if (retrying) clearInterval(retrying)
  retrying = null
}

const RETRY_MS = 20_000
let retrying: ReturnType<typeof setInterval> | null = null

/** Catches up, then stays in step, until signed out. */
export const startFollowing = async (me: Member): Promise<void> => {
  stopFollowing()
  if (!theCloud()) return
  try {
    await catchUp()
    await pull(me)
    // Sketches made with no one signed in go up now, and follow this member.
    for (const listed of listSketches(LOOSE)) {
      const sketch = readSketch(LOOSE, listed.id)
      const path = sketch ? sketchPath(sketch) : ''
      if (sketch && path && !lastSeen(path)) await sendUp(path)
    }
    for (const one of listFolders(LOOSE)) {
      const path = folderPath(LOOSE, one.id)
      if (path && !lastSeen(path)) await sendUp(path)
    }
  } catch (problem) {
    if (!(problem instanceof CloudOffline)) throw problem
  }
  stopNow = follow(me, (what) => heard(what))
  // What could not go up is tried again, so coming back online sends it.
  retrying = setInterval(() => void catchUp().catch(quietly), RETRY_MS)
  retrying.unref?.()
}

/** Sends up all of a project: its record, its sketches, and its shared maps. */
export const sendEverything = async (projectId: string): Promise<void> => {
  await sendProject(projectId)
  for (const listed of listSketches(projectId)) {
    const sketch = readSketch(projectId, listed.id)
    if (sketch) await sendSketch(sketch)
  }
  for (const one of listFolders(projectId)) await sendFolder(projectId, one.id)
  const keys = new Set([...arrangementKeys(projectId), ...annotationKeys(projectId)])
  await sendMap(projectId, [PROJECT_KEY, ...keys])
}

/** Takes a project off the online side altogether, with all that is in it. */
export const removeEverything = async (projectId: string): Promise<void> => {
  const cloud = theCloud()
  if (!cloud) return
  for (const collection of [`projects/${projectId}/sketches`, `projects/${projectId}/folders`, mapsPath(projectId), revisionsPath(projectId)]) {
    for (const doc of await cloud.list(collection)) {
      const id = idPart(collection, doc)
      await cloud.change(`${collection}/${id}`, () => null)
      see(`${collection}/${id}`, null)
    }
  }
  await cloud.change(projectPath(projectId), () => null)
  see(projectPath(projectId), null)
}
