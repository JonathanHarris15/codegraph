// codegraph: module reader
import type { Field, Holds, Shape } from './schema.js'

/** What each of Prisma's own types holds, in the map's words. */
const SCALARS: Record<string, Holds> = {
  String: { kind: 'text' },
  Boolean: { kind: 'yes or no' },
  Int: { kind: 'whole number' },
  BigInt: { kind: 'whole number' },
  Float: { kind: 'number' },
  Decimal: { kind: 'number' },
  DateTime: { kind: 'date' },
  Json: { kind: 'anything' },
  Bytes: { kind: 'anything' },
}

/** The blocks of a Prisma schema of one kind, `model` or `enum`, by name,
 *  each with its lines and the `///` words above it. */
const blocks = (text: string, kind: string): Map<string, { lines: string[]; says: string }> => {
  const found = new Map<string, { lines: string[]; says: string }>()
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i]!.match(new RegExp(`^\\s*${kind}\\s+(\\w+)\\s*\\{`))
    if (!open) continue
    const body: string[] = []
    let j = i + 1
    for (; j < lines.length && !/^\s*\}/.test(lines[j]!); j++) body.push(lines[j]!)
    found.set(open[1]!, { lines: body, says: wordsAbove(lines, i) })
    i = j
  }
  return found
}

/** The `///` lines directly above a line, as one sentence. */
const wordsAbove = (lines: string[], at: number): string => {
  const said: string[] = []
  for (let k = at - 1; k >= 0 && /^\s*\/\/\//.test(lines[k]!); k--) said.unshift(lines[k]!.replace(/^\s*\/\/\/\s?/, '').trim())
  return said.join(' ')
}

/** A store's shape read from one model of a Prisma schema (ADR 0023). A table
 *  holds only its columns, so the shape is fixed. A field whose type is another
 *  model is the relation, not a column: the column it names in `fields` points
 *  at that model, by the model's name. Null when there is no such model. */
export const readPrismaShape = (text: string, model: string): { shape: Shape; says: string } | null => {
  const models = blocks(text, 'model')
  const found = models.get(model)
  if (!found) return null
  const enums = blocks(text, 'enum')
  const fields: Field[] = []
  const pointing = new Map<string, string>()
  found.lines.forEach((line, i) => {
    const column = line.match(/^\s*(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/)
    if (!column || line.trim().startsWith('//') || line.trim().startsWith('@@')) return
    const [, name, type, list, optional, rest] = column
    if (models.has(type!)) {
      const keys = rest!.match(/@relation\([^)]*fields:\s*\[([^\]]*)\]/)?.[1]
      for (const key of (keys ?? '').split(',').map((k) => k.trim()).filter(Boolean)) pointing.set(key, type!)
      return
    }
    const choices = enums.get(type!)?.lines.map((l) => l.trim().split(/\s+/)[0]!).filter((w) => /^\w+$/.test(w))
    const one: Holds = choices ? { kind: 'one of', choices } : (SCALARS[type!] ?? { kind: 'anything' })
    fields.push({
      name: name!,
      holds: list ? { kind: 'list', of: one } : one,
      says: wordsAbove(found.lines, i),
      needed: !optional && !list,
      pointsAt: '',
    })
  })
  for (const field of fields) field.pointsAt = pointing.get(field.name) ?? ''
  return { shape: { fixed: true, fields, others: null }, says: found.says }
}
