// codegraph: module reader
import type { ComponentKind } from './schema.js'

/** What a file's own tags say about it (ADR 0008). */
export type FileTags = {
  role:
    | { kind: ComponentKind; name: string; uses: string[]; at: string; start: boolean; trigger: string }
    | { kind: 'test' }
    | { kind: 'tooling' }
    | null
  frontDoor: string[]
  stores: { name: string; in: string }[]
  /** Words for the wire made on a line, by line number from 1. */
  wires: Map<number, { to: string; words: string }>
  problems: string[]
}

/** A line that is only a comment holding a tag, in any common comment. */
const OWN_LINE = /^\s*(?:\/\/|#|--|\/\*+|<!--|\{\/\*)\s*codegraph:\s*(.*?)\s*(?:\*+\/\}?|-->)?\s*$/
/** A wire's words trailing the code on its line. */
const TRAILING = /(?:\/\/|#|--|\/\*+|<!--|\{\/\*)\s*codegraph:\s*wire\s+(.*?)\s*(?:\*+\/\}?|-->)?\s*$/

const list = (words: string): string[] =>
  words
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean)

const wire = (said: string): { to: string; words: string } => {
  const aimed = said.match(/^to\s+([^:]+):\s*(.*)$/)
  return aimed ? { to: aimed[1]!.trim(), words: aimed[2]!.trim() } : { to: '', words: said.trim() }
}

export const readTags = (path: string, text: string): FileTags => {
  const tags: FileTags = { role: null, frontDoor: [], stores: [], wires: new Map(), problems: [] }
  const lines = text.split(/\r?\n/)
  const setRole = (role: NonNullable<FileTags['role']>): void => {
    if (tags.role) tags.problems.push(`${path} says what it belongs to more than once`)
    else tags.role = role
  }
  const component = (kind: ComponentKind, name: string, more: Partial<{ uses: string[]; at: string; start: boolean; trigger: string }> = {}) =>
    setRole({ kind, name, uses: [], at: '', start: false, trigger: '', ...more })

  let waiting: { to: string; words: string } | null = null
  lines.forEach((line, index) => {
    const own = line.match(OWN_LINE)
    if (!own) {
      const trailing = line.match(TRAILING)
      if (trailing) tags.wires.set(index + 1, wire(trailing[1]!))
      else if (waiting && line.trim()) tags.wires.set(index + 1, waiting)
      if (line.trim()) waiting = null
      return
    }
    const said = own[1]!
    let match: RegExpMatchArray | null
    if ((match = said.match(/^wire\s+(.+)$/))) waiting = wire(match[1]!)
    else if ((match = said.match(/^module\s+(\S+)$/))) component('module', match[1]!)
    else if ((match = said.match(/^front door\s+(.+)$/))) tags.frontDoor.push(...list(match[1]!))
    else if ((match = said.match(/^store\s+(\S+)\s+in\s+(\S+)$/))) tags.stores.push({ name: match[1]!, in: match[2]! })
    else if ((match = said.match(/^feature\s+(\S+)(?:\s+uses\s+(.+))?$/)))
      component('feature', match[1]!, { uses: list(match[2] ?? '') })
    else if ((match = said.match(/^(start\s+)?page\s+(\S+)(?:\s+at\s+(\S+))?$/)))
      component('page', match[2]!, { at: match[3] ?? '', start: Boolean(match[1]) })
    else if ((match = said.match(/^trigger\s+(\S+)\s+(schedule|event|command)$/)))
      component('trigger', match[1]!, { trigger: match[2]! })
    else if (/^test\s+/.test(said)) setRole({ kind: 'test' })
    else if (said === 'tooling') setRole({ kind: 'tooling' })
    else if (/^(fakes|shape of)\s+/.test(said)) return
    else tags.problems.push(`${path} has a tag the reader does not know: "${said}"`)
  })
  return tags
}
