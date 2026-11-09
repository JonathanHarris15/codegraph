// codegraph: module reader
import type { ComponentKind } from './schema.js'

/** What a file's own tags say about it (ADR 0008). */
export type FileTags = {
  role:
    | { kind: ComponentKind; name: string; type: string; uses: string[]; at: string; start: boolean; trigger: string; follows: string }
    | { kind: 'test' }
    | { kind: 'tooling' }
    /** Renders each named state of one UI block, for the live view and its
     *  screenshots; not part of any component, like a test. */
    | { kind: 'states'; of: string }
    | null
  /** The UI blocks the file holds, each by its name in the code and the
   *  folder it is kept in: `ui block forms/inputs/DatePicker`. */
  uiBlocks: { name: string; folder: string }[]
  frontDoor: string[]
  /** `store X in Y`, then `inside Z` for an inner store and `from P` for
   *  the schema its shape is read from, beside this file. */
  stores: { name: string; in: string; inside: string; from: string; line: number }[]
  /** Words for the wire made on a line, by line number from 1. */
  wires: Map<number, { to: string; words: string }>
  /** The file is where the code makes DESIGN.md's tokens (ADR 0024). */
  theme: boolean
  /** Lines that break the design system on purpose, by line number from 1,
   *  with why; '' where no why was given. */
  exceptions: Map<number, string>
  problems: string[]
}

/** A line that is only a comment holding a tag, in any common comment. */
const OWN_LINE = /^\s*(?:\/\/|#|--|\/\*+|<!--|\{\/\*)\s*codegraph:\s*(.*?)\s*(?:\*+\/\}?|-->)?\s*$/
/** A wire's words trailing the code on its line. */
const TRAILING = /(?:\/\/|#|--|\/\*+|<!--|\{\/\*)\s*codegraph:\s*wire\s+(.*?)\s*(?:\*+\/\}?|-->)?\s*$/
/** An exception trailing the code on its line, with why or without. */
const TRAILING_EXCEPTION = /(?:\/\/|#|--|\/\*+|<!--|\{\/\*)\s*codegraph:\s*exception\b\s*(.*?)\s*(?:\*+\/\}?|-->)?\s*$/

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
  const tags: FileTags = {
    role: null,
    uiBlocks: [],
    frontDoor: [],
    stores: [],
    wires: new Map(),
    theme: false,
    exceptions: new Map(),
    problems: [],
  }
  const lines = text.split(/\r?\n/)
  const setRole = (role: NonNullable<FileTags['role']>): void => {
    if (tags.role) tags.problems.push(`${path} says what it belongs to more than once`)
    else tags.role = role
  }
  const component = (
    kind: ComponentKind,
    name: string,
    more: Partial<{ type: string; uses: string[]; at: string; start: boolean; trigger: string; follows: string }> = {},
  ) => setRole({ kind, name, type: '', uses: [], at: '', start: false, trigger: '', follows: '', ...more })

  let waiting: { to: string; words: string } | null = null
  let excepting: string | null = null
  lines.forEach((line, index) => {
    const own = line.match(OWN_LINE)
    if (!own) {
      const trailing = line.match(TRAILING)
      if (trailing) tags.wires.set(index + 1, wire(trailing[1]!))
      else if (waiting && line.trim()) tags.wires.set(index + 1, waiting)
      const exception = line.match(TRAILING_EXCEPTION)
      if (exception) tags.exceptions.set(index + 1, exception[1]!.trim())
      else if (excepting !== null && line.trim()) tags.exceptions.set(index + 1, excepting)
      if (line.trim()) {
        waiting = null
        excepting = null
      }
      return
    }
    const said = own[1]!
    let match: RegExpMatchArray | null
    if ((match = said.match(/^exception\b\s*(.*)$/))) excepting = match[1]!.trim()
    else if (said === 'theme') tags.theme = true
    else if ((match = said.match(/^ui block\s+(\S+)$/))) {
      const path = match[1]!.replace(/^\/+|\/+$/g, '')
      const cut = path.lastIndexOf('/')
      tags.uiBlocks.push({ name: path.slice(cut + 1), folder: cut < 0 ? '' : path.slice(0, cut) })
    } else if ((match = said.match(/^states\s+(\S+)$/))) setRole({ kind: 'states', of: match[1]! })
    else if ((match = said.match(/^wire\s+(.+)$/))) waiting = wire(match[1]!)
    else if ((match = said.match(/^module\s+(\S+)(?:\s+as\s+(.+))?$/))) component('module', match[1]!, { type: match[2] ?? '' })
    else if ((match = said.match(/^front door\s+(.+)$/))) tags.frontDoor.push(...list(match[1]!))
    else if ((match = said.match(/^store\s+(\S+)\s+in\s+(\S+)(?:\s+inside\s+(\S+))?(?:\s+from\s+(\S+))?$/)))
      tags.stores.push({ name: match[1]!, in: match[2]!, inside: match[3] ?? '', from: match[4] ?? '', line: index + 1 })
    else if ((match = said.match(/^feature\s+(\S+)(?:\s+as\s+(.+?))?(?:\s+uses\s+(.+))?$/)))
      component('feature', match[1]!, { type: match[2] ?? '', uses: list(match[3] ?? '') })
    else if ((match = said.match(/^(start\s+)?page\s+(\S+)(?:\s+as\s+(.+?))?(?:\s+at\s+(\S+))?(?:\s+follows\s+(\S+))?$/)))
      component('page', match[2]!, { type: match[3] ?? '', at: match[4] ?? '', start: Boolean(match[1]), follows: match[5] ?? '' })
    else if ((match = said.match(/^trigger\s+(\S+)\s+(schedule|event|command)(?:\s+as\s+(.+))?$/)))
      component('trigger', match[1]!, { trigger: match[2]!, type: match[3] ?? '' })
    else if (/^test\s+/.test(said)) setRole({ kind: 'test' })
    else if (said === 'tooling') setRole({ kind: 'tooling' })
    else if (/^(fakes|shape of)\s+/.test(said)) return
    else tags.problems.push(`${path} has a tag the reader does not know: "${said}"`)
  })
  return tags
}
