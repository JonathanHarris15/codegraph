// codegraph: module reader

/** Where in a repo's history to read it: the folder as it is now, with
 *  whatever is not committed, or a branch or commit read straight from git. */
export type Point =
  | { kind: 'live' }
  | { kind: 'branch'; name: string }
  | { kind: 'commit'; sha: string; title: string }

export const live: Point = { kind: 'live' }

export type ComponentKind = 'module' | 'feature' | 'page' | 'trigger'

export type WireKind = 'uses' | 'acts on' | 'shows' | 'starts' | 'keeps' | 'leads to' | 'calls'

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
  container: string
  files: CodeFile[]
  /** A page's address, where it has one. */
  at: string
  start: boolean
  /** schedule, event or command, for a trigger. */
  trigger: string
  frontDoor: string[]
}

export type Container = {
  /** container:name */
  id: string
  name: string
  kind: string
  says: string
  stores: string[]
}

/** A wire read from the code. From is a component; to is a component, a
 *  container that keeps things, or something outside the repo by name. */
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
  wires: Wire[]
  /** Calls out of the repo: `wire to <name>`. */
  outside: Wire[]
  /** Things the reader could not make sense of, said plainly. */
  problems: string[]
}

export const outsideId = (name: string): string => `outside:${name}`
