// codegraph: module reader
import type { Proposal } from './proposal.js'

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
 *  software system calls another. */
export type WireKind = 'uses' | 'asks' | 'reads' | 'starts' | 'keeps' | 'leads to' | 'calls'

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
  /** The change drawn over this map on this branch, if there is one. */
  proposal: Proposal | null
  /** The proposal's mockups, by the id of the page each is for, as data URLs. */
  mockups: Record<string, string>
}

export const outsideId = (name: string): string => `outside:${name}`
