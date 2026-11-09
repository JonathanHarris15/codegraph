// codegraph: module reader
import type { UiBlock } from './blocks.js'
import type { DesignSystem } from './design.js'
import type { Proposal } from './proposal.js'
import type { Recipe } from './recipes.js'

/** Where in a repo's history to read it: the folder as it is now, with
 *  whatever is not committed, or a branch or commit read straight from git. */
export type Point =
  | {
      kind: 'live'
      /** The branch checked out there, when it is listed. */
      branch?: string
    }
  | {
      kind: 'branch'
      name: string
      /** On this computer only, only on GitHub, or both; when it is listed. */
      where?: 'local' | 'cloud' | 'both'
      /** Commits on this computer GitHub has not got, and the other way. */
      ahead?: number
      behind?: number
      /** It is the branch checked out in the folder. */
      current?: boolean
    }
  | { kind: 'commit'; sha: string; title: string }

export const live: Point = { kind: 'live' }

export type ComponentKind = 'module' | 'feature' | 'page' | 'trigger'

/** How one card reaches another, read as the verb of a sentence: a page
 *  asks a feature, reads a module; a feature uses a module; a trigger starts
 *  a feature; a module keeps things in a store; a page leads to a page; a
 *  software system calls another; a store points at a store. */
export type WireKind = 'uses' | 'asks' | 'reads' | 'starts' | 'keeps' | 'leads to' | 'calls' | 'points at'

/** One file at the bottom level, with the names declared in it. */
export type CodeFile = {
  path: string
  names: string[]
}

export type Component = {
  /** container:kind:name, unique within the repo. */
  id: string
  name: string
  kind: ComponentKind
  /** What the team calls it, written after `as` in its tag, like a queue or a
   *  gateway; '' for none. Its kind still says what rules it keeps to. */
  type: string
  container: string
  files: CodeFile[]
  /** A page's address, where it has one. */
  at: string
  /** The recipe a page says it follows; '' for none (ADR 0024). */
  follows: string
  start: boolean
  /** schedule, event or command, for a trigger. */
  trigger: string
  frontDoor: string[]
  /** A page's screenshot, as its tests last took it, as a data URL; '' when
   *  there is none, or the map is not of the live folder. */
  shot: string
}

export type Container = {
  /** container:name */
  id: string
  name: string
  kind: string
  says: string
  stores: string[]
}

/** What a field holds (ADR 0023). Anything is loose: the schema does not say. */
export type Holds =
  | { kind: 'text' | 'number' | 'whole number' | 'yes or no' | 'date' | 'nothing' | 'anything' }
  | { kind: 'one of'; choices: string[] }
  | { kind: 'list'; of: Holds }
  | { kind: 'record'; shape: Shape }

/** One named value in a record. */
export type Field = {
  name: string
  holds: Holds
  says: string
  /** Every record has it. */
  needed: boolean
  /** The store whose records its id, or each id in its list, belongs to, as
   *  the schema names it; '' for none. */
  pointsAt: string
}

/** A store's fields, or a record's inside one. A fixed shape lists every
 *  field a record may have; an open one says what any other field holds. */
export type Shape = { fixed: true; fields: Field[]; others: null } | { fixed: false; fields: Field[]; others: Holds }

/** One kind of thing kept in a database or on disk, owned by one module. */
export type Store = {
  /** store:container:path */
  id: string
  name: string
  /** Its name, after the path of the store it lives inside, if any:
   *  people/involvement. Unique within its container. */
  path: string
  /** The path of the store whose every record holds one of these; '' for none. */
  inside: string
  container: string
  /** The component that keeps it. */
  keeper: string
  says: string
  /** The schema file its shape is read from; '' for none. */
  schema: string
  /** null when there is no schema to read it from: unknown, never guessed. */
  shape: Shape | null
}

export const storeId = (container: string, path: string): string => `store:${container}:${path}`

/** A wire read from the code. From is a component or a store; to is a
 *  component, a container that keeps things, a store, or something outside
 *  the repo by name. */
export type Wire = {
  from: string
  to: string
  kind: WireKind
  words: string
}

/** A software system as its code says it is, at one point. */
export type SystemMap = {
  point: Point
  /** It has a codegraph config to read. */
  setUp: boolean
  projects: string[]
  containers: Container[]
  components: Component[]
  /** What each database or folder on disk keeps, inner stores too. */
  stores: Store[]
  wires: Wire[]
  /** Calls out of the repo: `wire to <name>`. */
  outside: Wire[]
  /** Things the reader could not make sense of, said plainly. */
  problems: string[]
  /** The change drawn over this map on this branch, if there is one. */
  proposal: Proposal | null
  /** Its DESIGN.md, read whether or not the repo is set up; null when it has none. */
  design: DesignSystem | null
  /** The named pieces of screen its pages are built from, by folder (ADR 0024). */
  uiBlocks: UiBlock[]
  /** How each kind of its pages lays itself out, from recipes/. */
  recipes: Recipe[]
  /** The proposal's mockups, by the id of the page each is for, as data URLs. */
  mockups: Record<string, string>
}

export const outsideId = (name: string): string => `outside:${name}`
