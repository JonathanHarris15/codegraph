// codegraph: module cloud

/** Someone signed in, known by GitHub's number for their account, which stays
 *  the same when they change their username (ADR 0017). */
export type Member = {
  id: string
  login: string
  name: string
  avatar: string
}

export type Doc = Record<string, unknown>

/** One member as a room sees them, and what they last said about themselves. */
export type Seen = { member: Member; state: Doc }

/** Who is in a room right now, and which things are held, by whom. */
export type RoomNow = { people: Seen[]; held: Record<string, string> }

/** A place members are together right now. Nothing said here is kept: when a
 *  member drops off, what they said and what they held goes with them. */
export type Room = {
  /** Replaces what this member says about themselves: a cursor, say. */
  say: (state: Doc) => void
  /** Takes hold of something. False when another member has it. */
  hold: (item: string) => Promise<boolean>
  /** Lets go of one thing, or of everything this member holds. */
  letGo: (item?: string) => Promise<void>
  watch: (heard: (now: RoomNow) => void) => () => void
  leave: () => Promise<void>
}

/** Everything codegraph asks of the online side, and the only way to it. A path
 *  names a document, like `projects/abc/sketches/def`; the path above it names
 *  the collection it is in. Firebase is one answer to this; a folder is another,
 *  for tests and for trying the app with no Firebase project. */
export type Cloud = {
  /** Proves who a member is with their GitHub token, and hands back who. */
  signIn: (githubToken: string, member: Member) => Promise<Member>
  signOut: () => Promise<void>
  read: (path: string) => Promise<Doc | null>
  /** Works out a document's new value from its latest one, with nobody else's
   *  change able to land in between. Returning null removes it. */
  change: (path: string, how: (latest: Doc | null) => Doc | null) => Promise<Doc | null>
  /** Every document directly in a collection. */
  list: (collection: string) => Promise<Doc[]>
  /** Every document in a top-level collection that names this member. */
  naming: (collection: string, memberId: string) => Promise<Doc[]>
  /** Hears the documents in a collection, once now and after each change. */
  watch: (collection: string, heard: (docs: Doc[]) => void) => () => void
  /** Hears the top-level documents that name this member, likewise. */
  watchNaming: (collection: string, memberId: string, heard: (docs: Doc[]) => void) => () => void
  putFile: (path: string, bytes: Buffer) => Promise<void>
  getFile: (path: string) => Promise<Buffer | null>
  removeFile: (path: string) => Promise<void>
  room: (id: string, member: Member) => Room
}

/** The online side could not be reached. What was being done stays on this
 *  computer, to go up later (ADR 0021). */
export class CloudOffline extends Error {}
