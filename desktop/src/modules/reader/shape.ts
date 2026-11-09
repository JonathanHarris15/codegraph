// codegraph: module reader
import type { Field, Holds, Shape } from './schema.js'

/** A JSON Schema, as far as the reader looks into one. */
type Node = {
  type?: string | string[]
  format?: string
  enum?: unknown[]
  const?: unknown
  items?: Node
  properties?: Record<string, Node>
  required?: string[]
  additionalProperties?: boolean | Node
  patternProperties?: Record<string, Node>
  description?: string
  pointsAt?: string
  $ref?: string
  $defs?: Record<string, Node>
  definitions?: Record<string, Node>
  anyOf?: Node[]
  oneOf?: Node[]
}

const ANYTHING: Holds = { kind: 'anything' }
const DATES = new Set(['date', 'date-time'])

/** A store's shape, and what it says it is for, read from the JSON Schema the
 *  module that keeps it runs (ADR 0023); null when the text is not JSON. */
export const readShape = (text: string): { shape: Shape; says: string } | null => {
  let root: Node
  try {
    root = JSON.parse(text) as Node
  } catch {
    return null
  }
  if (!root || typeof root !== 'object') return null
  const defs = { ...root.definitions, ...root.$defs }
  /** A record inside a record inside a record this deep is taken to hold
   *  itself, as a tree of replies does, and is not read further. */
  const DEEPEST = 12

  const follow = (node: Node, hops = 0): Node => {
    const ref = node.$ref?.match(/^#\/(?:\$defs|definitions)\/(.+)$/)?.[1]
    if (!ref || !defs[ref] || hops > DEEPEST) return node
    return { ...follow(defs[ref]!, hops + 1), ...node, $ref: undefined }
  }

  const shapeOf = (node: Node, depth: number): Shape => {
    const needed = new Set(node.required ?? [])
    const fields = Object.entries(node.properties ?? {}).map(([name, raw]): Field => {
      const field = follow(raw ?? {})
      return {
        name,
        holds: holdsOf(field, depth + 1),
        says: field.description ?? '',
        needed: needed.has(name),
        pointsAt: field.pointsAt ?? (field.items ? follow(field.items).pointsAt : undefined) ?? '',
      }
    })
    const rest = node.additionalProperties ?? Object.values(node.patternProperties ?? {})[0] ?? true
    if (rest === false) return { fixed: true, fields, others: null }
    return { fixed: false, fields, others: rest === true ? ANYTHING : holdsOf(rest, depth + 1) }
  }

  const holdsOf = (raw: Node, depth: number): Holds => {
    const node = follow(raw)
    if (depth > DEEPEST) return ANYTHING
    if (node.enum) return { kind: 'one of', choices: node.enum.map(String) }
    if (node.const !== undefined) return { kind: 'one of', choices: [String(node.const)] }
    const either = node.anyOf ?? node.oneOf
    const types = Array.isArray(node.type) ? node.type.filter((t) => t !== 'null') : node.type ? [node.type] : []
    if (!types.length && either) {
      const real = either.map((n) => follow(n)).filter((n) => n.type !== 'null')
      return real.length === 1 ? holdsOf(real[0]!, depth) : ANYTHING
    }
    switch (types.length === 1 ? types[0] : node.properties ? 'object' : '') {
      case 'string':
        return { kind: node.format && DATES.has(node.format) ? 'date' : 'text' }
      case 'number':
        return { kind: 'number' }
      case 'integer':
        return { kind: 'whole number' }
      case 'boolean':
        return { kind: 'yes or no' }
      case 'null':
        return { kind: 'nothing' }
      case 'array':
        return { kind: 'list', of: node.items ? holdsOf(node.items, depth + 1) : ANYTHING }
      case 'object':
        return { kind: 'record', shape: shapeOf(node, depth) }
      default:
        return ANYTHING
    }
  }

  return { shape: shapeOf(follow(root), 0), says: root.description ?? '' }
}

/** What a field holds, said the way a person would. */
export const holdsWords = (holds: Holds): string => {
  switch (holds.kind) {
    case 'one of':
      return holds.choices.length > 1
        ? `${holds.choices.slice(0, -1).join(', ')} or ${holds.choices[holds.choices.length - 1]}`
        : (holds.choices[0] ?? 'nothing')
    case 'list':
      return `a list of ${holdsWords(holds.of)}`
    case 'record': {
      const named = holds.shape.fields.map((f) => f.name)
      const of = named.length ? ` of ${named.join(', ')}` : ''
      return holds.shape.fixed ? `a record${of}` : `a record${of}, open to ${holdsWords(holds.shape.others)}`
    }
    default:
      return holds.kind
  }
}
