// codegraph: module cloud
// codegraph: fakes firebase because the project is not set up yet, and tests cannot reach one
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CloudOffline, type Cloud, type Doc, type Member, type Room, type RoomNow, type Seen } from './schema.js'
import { keepWhole } from '../machine/index.js'

const POLL_MS = 40
const BEAT_MS = 500
const GONE_MS = 2000
const LOCK_TRIES = 400

const safe = (part: string): string => encodeURIComponent(part)

/** A folder doing the online side's job. Two copies of the app pointed at one
 *  folder really do see each other: it is how this is tested, and how it can
 *  be tried on one computer. `reachable` can be turned off to act as offline. */
export const openFolderCloud = (root: string, reachable: () => boolean = () => true): Cloud => {
  const fileOf = (path: string): string => join(root, 'docs', ...path.split('/').map(safe)) + '.json'
  const dirOf = (collection: string): string => join(root, 'docs', ...collection.split('/').map(safe))
  const need = (): void => {
    if (!reachable()) throw new CloudOffline('the online side cannot be reached')
  }

  const readFile = (file: string): Doc | null => {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as Doc
    } catch {
      return null
    }
  }
  const put = (file: string, doc: Doc): void => keepWhole(file, JSON.stringify(doc))
  const listDir = (collection: string): Doc[] => {
    const dir = dirOf(collection)
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => readFile(join(dir, name)))
      .filter((doc): doc is Doc => doc !== null)
  }

  /** One writer at a time on one document: making a folder either works or
   *  says someone else has it. */
  const locked = async <T>(file: string, work: () => T): Promise<T> => {
    const lock = `${file}.lock`
    mkdirSync(dirname(file), { recursive: true })
    for (let tries = 0; ; tries++) {
      try {
        mkdirSync(lock)
        break
      } catch {
        if (tries >= LOCK_TRIES) rmSync(lock, { recursive: true, force: true })
        await new Promise((go) => setTimeout(go, 5))
      }
    }
    try {
      return work()
    } finally {
      rmSync(lock, { recursive: true, force: true })
    }
  }

  const names = (doc: Doc, memberId: string): boolean => Array.isArray(doc['memberIds']) && (doc['memberIds'] as unknown[]).includes(memberId)

  /** Hears something by asking again and again, and passing on what differs. */
  const poll = <T>(ask: () => T, heard: (now: T) => void): (() => void) => {
    let last = ''
    let first = true
    const look = (): void => {
      if (!reachable()) return
      const now = ask()
      const said = JSON.stringify(now)
      if (first || said !== last) {
        first = false
        last = said
        heard(now)
      }
    }
    const timer = setInterval(look, POLL_MS)
    timer.unref?.()
    queueMicrotask(look)
    return () => clearInterval(timer)
  }

  const room = (id: string, member: Member): Room => {
    const dir = join(root, 'rooms', safe(id))
    const peopleDir = join(dir, 'people')
    const heldDir = join(dir, 'held')
    const mine = join(peopleDir, `${safe(member.id)}.json`)
    let state: Doc = {}
    let left = false
    const held = new Set<string>()

    const beat = (): void => {
      if (left || !reachable()) return
      try {
        put(mine, { member, state, beat: Date.now() } as unknown as Doc)
      } catch {
        // A missed beat is no loss: the next comes well before anyone counts
        // this member gone. Thrown from a timer, it would stop the whole app.
      }
    }
    beat()
    const timer = setInterval(beat, BEAT_MS)
    timer.unref?.()

    const inRoom = (): (Seen & { beat: number })[] =>
      existsSync(peopleDir)
        ? readdirSync(peopleDir)
            .filter((name) => name.endsWith('.json'))
            .map((name) => readFile(join(peopleDir, name)) as unknown as (Seen & { beat: number }) | null)
            .filter((one): one is Seen & { beat: number } => one !== null)
            .filter((one) => Date.now() - one.beat < GONE_MS)
        : []

    const fileOfHold = (item: string): string => join(heldDir, `${safe(item)}.json`)

    const now = (): RoomNow => {
      const people = inRoom()
      const here = new Set(people.map((one) => one.member.id))
      const taken: Record<string, string> = {}
      if (existsSync(heldDir))
        for (const name of readdirSync(heldDir).filter((n) => n.endsWith('.json'))) {
          const doc = readFile(join(heldDir, name))
          // A member who dropped off holds nothing.
          if (doc && here.has(String(doc['by']))) taken[String(doc['item'])] = String(doc['by'])
        }
      return { people: people.map(({ member: m, state: s }) => ({ member: m, state: s })), held: taken }
    }

    return {
      say: (next) => {
        state = next
        beat()
      },
      hold: async (item) => {
        need()
        const file = fileOfHold(item)
        return locked(file, () => {
          const was = readFile(file)
          const here = new Set(inRoom().map((one) => one.member.id))
          if (was && was['by'] !== member.id && here.has(String(was['by']))) return false
          put(file, { item, by: member.id })
          held.add(item)
          return true
        })
      },
      letGo: async (item) => {
        for (const one of item ? [item] : [...held]) {
          held.delete(one)
          const file = fileOfHold(one)
          await locked(file, () => {
            if (readFile(file)?.['by'] === member.id) rmSync(file, { force: true })
          })
        }
      },
      watch: (heard) => poll(now, heard),
      leave: async () => {
        left = true
        clearInterval(timer)
        for (const one of [...held]) {
          const file = fileOfHold(one)
          if (readFile(file)?.['by'] === member.id) rmSync(file, { force: true })
        }
        held.clear()
        rmSync(mine, { force: true })
      },
    }
  }

  return {
    signIn: async (_token, member) => {
      need()
      return member
    },
    signOut: async () => undefined,
    read: async (path) => {
      need()
      return readFile(fileOf(path))
    },
    change: async (path, how) => {
      need()
      const file = fileOf(path)
      return locked(file, () => {
        const next = how(readFile(file))
        if (next === null) rmSync(file, { force: true })
        else put(file, next)
        return next
      })
    },
    list: async (collection) => {
      need()
      return listDir(collection)
    },
    naming: async (collection, memberId) => {
      need()
      return listDir(collection).filter((doc) => names(doc, memberId))
    },
    watch: (collection, heard) => poll(() => listDir(collection), heard),
    watchNaming: (collection, memberId, heard) => poll(() => listDir(collection).filter((doc) => names(doc, memberId)), heard),
    putFile: async (path, bytes) => {
      need()
      const file = join(root, 'files', ...path.split('/').map(safe))
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, bytes)
    },
    getFile: async (path) => {
      need()
      const file = join(root, 'files', ...path.split('/').map(safe))
      return existsSync(file) && statSync(file).isFile() ? readFileSync(file) : null
    },
    removeFile: async (path) => {
      need()
      rmSync(join(root, 'files', ...path.split('/').map(safe)), { force: true })
    },
    room,
  }
}
