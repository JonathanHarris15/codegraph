// codegraph: module cloud
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { GithubAuthProvider, getAuth, signInWithCredential, signOut as firebaseSignOut, type Auth } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  query,
  runTransaction,
  where,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import {
  getDatabase,
  onDisconnect,
  onValue,
  ref as spot,
  remove,
  runTransaction as runRoomTransaction,
  set,
  type Database,
} from 'firebase/database'
import { deleteObject, getBytes, getStorage, ref as fileRef, uploadBytes, type FirebaseStorage } from 'firebase/storage'
import { CloudOffline, type Cloud, type Doc, type Member, type Room, type RoomNow, type Seen } from './schema.js'

/** What the Firebase console hands over for a web app, plus the Realtime
 *  Database's address, which it leaves out until that database exists. */
export type FirebaseSettings = {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  databaseURL: string
}

/** Long enough for a slow connection, short enough that work waiting on it goes
 *  to the pending list (ADR 0021) rather than hanging. Firestore never fails
 *  fast on its own when offline. */
const WAIT_MS = 15_000

/** The fields lifted out of a document so the access rules and the "names this
 *  member" question can see them. Everything else rides in `body`, as text, so
 *  Firestore's own limits on shapes (no arrays in arrays, no undefined, no
 *  `__names__`) never reach codegraph's documents. */
const LIFTED = ['id', 'ownerId', 'memberIds', 'roles', 'members'] as const

const pack = (whole: Doc): DocumentData => {
  const out: DocumentData = { body: JSON.stringify(whole) }
  for (const key of LIFTED) if (whole[key] !== undefined) out[key] = JSON.parse(JSON.stringify(whole[key]))
  return out
}

const unpack = (data: DocumentData | undefined): Doc | null => {
  if (!data || typeof data['body'] !== 'string') return null
  try {
    return JSON.parse(data['body']) as Doc
  } catch {
    return null
  }
}

/** A Realtime Database key can hold no `. # $ [ ] /`. */
const key = (part: string): string => encodeURIComponent(part).replace(/\./g, '%2E')

const codeOf = (problem: unknown): string =>
  typeof problem === 'object' && problem !== null && 'code' in problem ? String((problem as { code: unknown }).code) : ''

const OFFLINE = new Set(['unavailable', 'deadline-exceeded', 'auth/network-request-failed', 'storage/retry-limit-exceeded'])

/** Turns "could not reach it" into `CloudOffline`, and leaves any other refusal
 *  as it is. */
const reach = async <T>(work: () => Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_, fail) => {
    timer = setTimeout(() => fail(new CloudOffline('the online side took too long')), WAIT_MS)
    timer.unref?.()
  })
  try {
    return await Promise.race([work(), late])
  } catch (problem) {
    if (problem instanceof CloudOffline) throw problem
    if (OFFLINE.has(codeOf(problem)) || /offline/i.test(String((problem as Error)?.message))) throw new CloudOffline(String(problem))
    throw problem
  } finally {
    clearTimeout(timer)
  }
}

/** The online side, on Firebase: Firestore for documents, Storage for files, the
 *  Realtime Database for rooms, because it can tell when someone drops off and
 *  free what they held. People sign in with the GitHub token the app already
 *  has (ADR 0017). */
export const openFirebaseCloud = (settings: FirebaseSettings): Cloud => {
  const app: FirebaseApp = initializeApp(settings, `codegraph-${Date.now()}`)
  const auth: Auth = getAuth(app)
  const store: Firestore = initializeFirestore(app, { ignoreUndefinedProperties: true })
  const files: FirebaseStorage = getStorage(app)
  let live: Database | null = null
  const rooms = (): Database => (live ??= getDatabase(app, settings.databaseURL))

  // Firebase in the main process forgets a sign-in when the app closes, so the
  // token is kept here and used again whenever it is needed.
  let token = ''
  let signingIn: Promise<void> | null = null
  const signedIn = async (): Promise<void> => {
    if (auth.currentUser) return
    if (!token) throw new Error('Not signed in.')
    signingIn ??= reach(async () => {
      await signInWithCredential(auth, GithubAuthProvider.credential(token))
    }).finally(() => {
      signingIn = null
    })
    await signingIn
  }
  const online = async <T>(work: () => Promise<T>): Promise<T> => {
    await signedIn()
    return reach(work)
  }

  const read = (path: string): Promise<Doc | null> =>
    online(async () => {
      try {
        return unpack((await getDoc(doc(store, path))).data())
      } catch (problem) {
        // What a member may not see is, to them, not there.
        if (codeOf(problem) === 'permission-denied') return null
        throw problem
      }
    })

  const listed = (docs: { data: () => unknown }[]): Doc[] => docs.map((one) => unpack(one.data() as DocumentData | undefined)).filter((one): one is Doc => one !== null)

  const watchQuery = (asked: ReturnType<typeof query> | ReturnType<typeof collection>, heard: (docs: Doc[]) => void): (() => void) => {
    let stop: (() => void) | null = null
    let stopped = false
    void signedIn()
      .then(() => {
        if (stopped) return
        stop = onSnapshot(
          asked,
          (seen) => heard(listed(seen.docs)),
          () => undefined,
        )
      })
      .catch(() => undefined)
    return () => {
      stopped = true
      stop?.()
    }
  }

  const room = (id: string, member: Member): Room => {
    const db = rooms()
    const place = `rooms/${key(id)}`
    const mine = spot(db, `${place}/people/${key(member.id)}`)
    const held = new Set<string>()
    const listeners: (() => void)[] = []
    let state: Doc = {}
    let left = false

    // Realtime Database rules cannot read Firestore, so who may be in a room is
    // copied across from the project or shared sketch on the way in. Only a
    // member can read that document, so only a member can do the copying.
    const ready = (async () => {
      await signedIn()
      const [kind, rest] = id.split(/:(.*)/s)
      const path = kind === 'project' ? `projects/${rest}` : kind === 'sketch' ? `sketches/${rest}` : ''
      const there = path ? await read(path) : null
      const ids = Array.isArray(there?.['memberIds']) ? (there['memberIds'] as string[]) : []
      if (ids.length) await set(spot(db, `roomMembers/${key(id)}`), Object.fromEntries(ids.map((one) => [key(one), true])))
      if (left) return
      await onDisconnect(mine).remove()
      await set(mine, { member, state })
    })().catch(() => undefined)

    const holdSpot = (item: string) => spot(db, `${place}/held/${key(item)}`)

    return {
      say: (next) => {
        state = next
        void ready.then(() => (left ? undefined : set(mine, { member, state }))).catch(() => undefined)
      },
      hold: async (item) => {
        await ready
        const there = holdSpot(item)
        const done = await reach(() =>
          runRoomTransaction(there, (now: string | null) => (now === null || now === member.id ? member.id : undefined)),
        )
        if (!done.committed) return false
        held.add(item)
        await onDisconnect(there).remove()
        return true
      },
      letGo: async (item) => {
        for (const one of item ? [item] : [...held]) {
          held.delete(one)
          const there = holdSpot(one)
          await runRoomTransaction(there, (now: string | null) => (now === member.id ? null : now)).catch(() => undefined)
          await onDisconnect(there).cancel().catch(() => undefined)
        }
      },
      watch: (heard) => {
        let stop: (() => void) | null = null
        let stopped = false
        void ready.then(() => {
          if (stopped) return
          stop = onValue(
            spot(db, place),
            (seen) => {
              const now = (seen.val() ?? {}) as { people?: Record<string, Seen>; held?: Record<string, string> }
              const people = Object.values(now.people ?? {}).map((one) => ({ member: one.member, state: one.state ?? {} }))
              const here = new Set(people.map((one) => one.member.id))
              const taken: Record<string, string> = {}
              // A member who dropped off holds nothing; the key is undone, as it
              // was made from the item.
              for (const [made, by] of Object.entries(now.held ?? {})) if (here.has(by)) taken[decodeURIComponent(made)] = by
              heard({ people, held: taken } satisfies RoomNow)
            },
            () => undefined,
          )
          listeners.push(() => stop?.())
        })
        return () => {
          stopped = true
          stop?.()
        }
      },
      leave: async () => {
        left = true
        for (const stop of listeners) stop()
        await Promise.all(
          [...held].map(async (one) => {
            const there = holdSpot(one)
            await runRoomTransaction(there, (now: string | null) => (now === member.id ? null : now)).catch(() => undefined)
            await onDisconnect(there).cancel().catch(() => undefined)
          }),
        )
        held.clear()
        await remove(mine).catch(() => undefined)
        await onDisconnect(mine).cancel().catch(() => undefined)
      },
    }
  }

  return {
    signIn: async (githubToken, member) => {
      token = githubToken
      if (auth.currentUser) await firebaseSignOut(auth)
      await signedIn()
      // Members are GitHub's number for the account (ADR 0017); Firebase must
      // agree, or the access rules would be checking someone else.
      const said = (await auth.currentUser?.getIdTokenResult())?.claims['firebase'] as
        | { identities?: Record<string, string[]> }
        | undefined
      const github = said?.identities?.['github.com']?.[0]
      if (github && github !== member.id) throw new Error('Firebase and GitHub disagree about who this is.')
      return member
    },
    signOut: async () => {
      token = ''
      await firebaseSignOut(auth).catch(() => undefined)
    },
    read,
    change: (path, how) =>
      online(() =>
        runTransaction(store, async (step) => {
          const at = doc(store, path)
          let was: Doc | null = null
          try {
            was = unpack((await step.get(at)).data())
          } catch (problem) {
            if (codeOf(problem) !== 'permission-denied') throw problem
          }
          const next = how(was)
          if (next === null) {
            if (was !== null) step.delete(at)
          } else step.set(at, pack(next))
          return next
        }),
      ),
    list: (path) => online(async () => listed((await getDocs(collection(store, path))).docs)),
    naming: (path, memberId) =>
      online(async () => listed((await getDocs(query(collection(store, path), where('memberIds', 'array-contains', memberId)))).docs)),
    watch: (path, heard) => watchQuery(collection(store, path), heard),
    watchNaming: (path, memberId, heard) => watchQuery(query(collection(store, path), where('memberIds', 'array-contains', memberId)), heard),
    putFile: (path, bytes) =>
      online(async () => {
        await uploadBytes(fileRef(files, path), new Uint8Array(bytes))
      }),
    getFile: (path) =>
      online(async () => {
        try {
          return Buffer.from(await getBytes(fileRef(files, path)))
        } catch (problem) {
          if (codeOf(problem) === 'storage/object-not-found') return null
          throw problem
        }
      }),
    removeFile: (path) =>
      online(async () => {
        try {
          await deleteObject(fileRef(files, path))
        } catch (problem) {
          if (codeOf(problem) !== 'storage/object-not-found') throw problem
        }
      }),
    room,
  }
}
