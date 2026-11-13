// codegraph: module flowchart
// codegraph: front door readFlowchart, readField, Flowchart, FlowchartNote
import { randomUUID } from 'node:crypto'
import { kindsAt, kindsInCode, kindsInside, type CardType } from '../card-types/index.js'
import { blankCard, hubOf, isStore, type SketchCard, type SketchField, type SketchWire } from '../sketches/index.js'
import { WIRE_KINDS } from '../wording/index.js'

/** Words written on one level of a flowchart: `at` is the card they are inside,
 *  '' for the top level. */
export type FlowchartNote = { at: string; text: string }

/** What a flowchart draws: the cards on the top level, with everything inside
 *  them, the wires between them, and the notes. Or every line that is wrong. */
export type Flowchart = { ok: true; cards: SketchCard[]; wires: SketchWire[]; notes: FlowchartNote[] } | { ok: false; problems: string[] }

/** One card as the flowchart has it so far. A card belongs to the subgraph it
 *  is first given a name or kind in; one only ever named in wires belongs to
 *  the first subgraph it is wired in. */
type Node = {
  id: string
  name: string
  line: number
  declaredIn: string | null
  seenIn: string
  opened: number
  kind: { cls: string; line: number } | null
  says: string
  at: string
  /** A store's fields, and what any it does not list may hold. */
  fields: (SketchField & { line: number })[]
  others: string
}

type Edge = { from: string; to: string; label: string; line: number }

/** Kinds are written as Mermaid classes, so with dashes for spaces. */
const asClass = (kind: string): string => kind.trim().toLowerCase().replace(/[\s_-]+/g, '-')

const OTHER_DIAGRAMS = /^(sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|quadrantChart|C4\w*)\b/

/** Turns a Mermaid flowchart with codegraph's few tags into a sketch's cards
 *  and wires (the instructions on sketches say how to write one). A subgraph is
 *  the inside of the card of the same id, a class names the card's kind, and a
 *  wire's words start with its kind. Every wrong line is said, by number. */
export const readFlowchart = (text: string, types: CardType[] = []): Flowchart => {
  const problems: string[] = []
  const nodes = new Map<string, Node>()
  const edges: Edge[] = []
  const notes: { in: string; text: string }[] = []
  const subgraphs = new Map<string, number>()
  const stack: { id: string; line: number }[] = []
  const here = (): string => stack[stack.length - 1]?.id ?? ''

  const touch = (id: string, line: number, declared: boolean): Node => {
    let node = nodes.get(id)
    if (!node) {
      node = { id, name: '', line, declaredIn: null, seenIn: here(), opened: 0, kind: null, says: '', at: '', fields: [], others: '' }
      nodes.set(id, node)
    }
    if (declared && node.declaredIn === null) {
      node.declaredIn = here()
      node.line = line
    }
    return node
  }

  const lines = text.replace(/\r/g, '').split('\n')
  let started = false
  lines.forEach((raw, i) => {
    const n = i + 1
    const line = raw.trim()
    if (!line || line.startsWith('```')) return
    if (line.startsWith('%%')) {
      const note = /^%%\s*note\s*:\s*(.+)$/i.exec(line)
      const says = /^%%\s*(says|at)\s+([\w-]+)\s*:\s*(.+)$/i.exec(line)
      const field = /^%%\s*(field|open)\s+([\w-]+)\s*:\s*(.+)$/i.exec(line)
      if (field) {
        const node = touch(field[2]!, n, false)
        if (field[1]!.toLowerCase() === 'open') node.others = field[3]!.trim()
        else {
          const read = fieldOf(field[3]!)
          if (typeof read === 'string') problems.push(`Line ${n}: ${read}`)
          else node.fields.push({ ...read, line: n })
        }
      } else if (note) notes.push({ in: here(), text: note[1]!.trim() })
      else if (says) {
        const node = touch(says[2]!, n, false)
        if (says[1]!.toLowerCase() === 'says') node.says = says[3]!.trim()
        else node.at = says[3]!.trim()
      }
      return
    }
    if (!started) {
      started = true
      if (OTHER_DIAGRAMS.test(line)) {
        problems.push(`Line ${n}: only a flowchart can be drawn as a sketch. Start with \`flowchart LR\`.`)
        return
      }
      if (/^(flowchart|graph)\b/i.test(line)) return
    }
    if (/^(flowchart|graph)\b/i.test(line) || /^direction\s+\w+$/i.test(line) || /^(classDef|style|linkStyle|click)\b/.test(line)) return

    const sub = /^subgraph\s+(.+?)\s*;?$/.exec(line)
    if (sub) {
      const rest = sub[1]!
      const named = /^([\w-]+)\s*\[\s*"?(.*?)"?\s*\]$/.exec(rest) ?? /^([\w-]+)$/.exec(rest)
      const id = named ? named[1]! : rest.replace(/^"(.*)"$/, '$1')
      const title = named ? (named[2] ?? '') : id
      if (subgraphs.has(id)) {
        problems.push(`Line ${n}: subgraph ${id} is opened again; it was first opened on line ${subgraphs.get(id)}. Put everything inside a card in one subgraph.`)
      }
      subgraphs.set(id, n)
      const node = touch(id, n, true)
      if (title && !node.name) node.name = cleanName(title)
      node.opened ||= n
      stack.push({ id, line: n })
      return
    }
    if (/^end\s*;?$/.test(line)) {
      if (!stack.length) problems.push(`Line ${n}: \`end\` with no subgraph open.`)
      else stack.pop()
      return
    }
    const cls = /^class\s+(.+?)\s+([\w-]+)\s*;?$/.exec(line)
    if (cls) {
      for (const id of cls[1]!.split(',').map((s) => s.trim()).filter(Boolean)) {
        const node = touch(id, n, false)
        node.kind ??= { cls: cls[2]!, line: n }
      }
      return
    }
    for (const statement of splitStatements(line)) {
      const read = readStatement(statement)
      if (typeof read === 'string') {
        problems.push(`Line ${n}: ${read}`)
        continue
      }
      for (const group of read.groups)
        for (const one of group) {
          const node = touch(one.id, n, Boolean(one.name || one.cls))
          if (one.name && !node.name) node.name = one.name
          if (one.cls) node.kind ??= { cls: one.cls, line: n }
        }
      read.links.forEach((label, k) => {
        if (label === null) return
        for (const from of read.groups[k]!) for (const to of read.groups[k + 1]!) edges.push({ from: from.id, to: to.id, label, line: n })
      })
    }
  })
  for (const open of stack) problems.push(`Line ${open.line}: subgraph ${open.id} is never closed with \`end\`.`)
  if (!nodes.size && !problems.length) return { ok: false, problems: ['There is nothing to draw: the flowchart has no cards.'] }

  // The cards, level by level from the top.
  const placeOf = (node: Node): string => node.declaredIn ?? node.seenIn
  const inside = new Map<string, Node[]>()
  for (const node of [...nodes.values()].sort((a, b) => a.line - b.line))
    inside.set(placeOf(node), [...(inside.get(placeOf(node)) ?? []), node])
  const cards = new Map<string, SketchCard>()
  const parent = new Map<string, string>()
  const saved = types.filter((type) => type.name.trim())

  const build = (at: SketchCard | null): SketchCard[] => {
    const id = at?.id ?? ''
    const { level, kinds: allowed } = kindsInside(at ?? { level: 'project', kind: 'project' }, saved.map((type) => type.name.trim()))
    const where = at ? `inside ${at.name}` : 'on the top level'
    const out: SketchCard[] = []
    for (const node of inside.get(id) ?? []) {
      if (at && (at.kind === 'person' || at.level === 'code')) {
        problems.push(`Line ${nodes.get(id)?.opened || node.line}: a ${at.kind} has nothing inside, so ${node.id} cannot be drawn inside ${at.name}.`)
        continue
      }
      const kind = node.kind ? allowed.find((one) => asClass(one) === asClass(node.kind!.cls)) : allowed[0]
      if (!kind) {
        problems.push(
          `Line ${node.kind!.line}: "${node.kind!.cls}" is not a kind of card that goes ${where}. Here it can be: ${allowed.join(', ')}. Write it with dashes for spaces, like :::${asClass(allowed[0]!)}.`,
        )
        continue
      }
      const type = saved.find((one) => one.name.trim() === kind && !kindsAt[level].includes(kind) && !(kindsInCode[level] ?? []).includes(kind))
      const card: SketchCard = {
        ...blankCard(node.id, node.name || node.id, level, kind),
        says: node.says,
        at: node.at,
        ...(type ? { look: { icon: type.icon, shape: type.shape, color: type.color } } : {}),
        ...(isStore(kind) ? { fields: node.fields.map(({ line: _, ...field }) => field), others: node.others } : {}),
      }
      if (!isStore(kind) && (node.fields.length || node.others))
        problems.push(`Line ${node.fields[0]?.line ?? node.line}: ${node.id} is a ${kind}, and only a store or an inner store has fields.`)
      cards.set(node.id, card)
      parent.set(node.id, id)
      card.children = build(card)
      out.push(card)
    }
    return out
  }
  const top = build(null)
  for (const node of nodes.values())
    if (!cards.has(node.id) && !problems.length) problems.push(`Line ${node.line}: ${node.id} is drawn inside itself.`)

  // The wires: each lives inside the card both its ends are in. One that
  // reaches into a card from outside wires to the card, and inside it from the
  // hub that makes on its border to the part it really reaches.
  const topWires: SketchWire[] = []
  const wiresOf = (id: string): SketchWire[] => (id ? cards.get(id)!.wires : topWires)
  const pathOf = (id: string): string[] => {
    const path: string[] = []
    for (let at = id; at; at = parent.get(at) ?? '') path.unshift(at)
    return path
  }
  const nameOf = (id: string): string => cards.get(id)?.name ?? id
  const add = (list: SketchWire[], wire: Omit<SketchWire, 'id'>): SketchWire =>
    list.find((w) => w.from === wire.from && w.to === wire.to && w.kind === wire.kind && w.words === wire.words) ??
    (list.push({ id: randomUUID(), ...wire }), list[list.length - 1]!)

  for (const edge of edges) {
    if (!cards.has(edge.from) || !cards.has(edge.to)) continue
    const said = wireOf(edge.label)
    if (typeof said === 'string') {
      problems.push(`Line ${edge.line}: ${said}`)
      continue
    }
    if (edge.from === edge.to) {
      problems.push(`Line ${edge.line}: a wire runs from ${edge.from} to itself.`)
      continue
    }
    const a = pathOf(edge.from)
    const b = pathOf(edge.to)
    let k = 0
    while (k < a.length && k < b.length && a[k] === b[k]) k += 1
    if (k === a.length || k === b.length) {
      const [outer, inner] = k === a.length ? [edge.from, edge.to] : [edge.to, edge.from]
      problems.push(`Line ${edge.line}: ${inner} is inside ${nameOf(outer)}, so no wire can join them. Wire ${inner} to something beside ${nameOf(outer)} instead.`)
      continue
    }
    const deep = [a, b].find((path) => path.length - k > 2)
    if (deep) {
      problems.push(
        `Line ${edge.line}: a wire can reach only one level into a card, and ${deep[deep.length - 1]} is ${deep.length - k - 1} levels inside ${nameOf(deep[k]!)}. Wire it to the card it is in instead.`,
      )
      continue
    }
    const from = a[k]!
    const to = b[k]!
    const outer = add(wiresOf(k ? a[k - 1]! : ''), { from, to, ...said })
    if (a.length - k === 2) add(cards.get(from)!.wires, { from: edge.from, to: hubOf(outer.id), ...said })
    if (b.length - k === 2) add(cards.get(to)!.wires, { from: hubOf(outer.id), to: edge.to, ...said })
  }
  if (problems.length) return { ok: false, problems: [...new Set(problems)].sort((x, y) => lineOf(x) - lineOf(y)) }
  return { ok: true, cards: top, wires: topWires, notes: notes.map((note) => ({ at: note.in, text: note.text })) }
}

const lineOf = (problem: string): number => Number(/^Line (\d+)/.exec(problem)?.[1] ?? 0)

/** A wire's words: its kind, then what it is for after a colon. A wire with no
 *  words uses what it points at. */
const wireOf = (label: string): { kind: string; words: string } | string => {
  const said = label.trim().replace(/^"(.*)"$/, '$1')
  if (!said) return { kind: 'uses', words: '' }
  const split = /^([^:]+?)\s*:\s*(.*)$/.exec(said)
  const kind = (split ? split[1]! : said).trim().toLowerCase()
  if (!WIRE_KINDS.includes(kind))
    return `"${kind}" is not a kind of wire. A wire's words start with its kind, one of ${WIRE_KINDS.join(', ')}, then what it is for: |calls: to fetch suggestions|.`
  return { kind, words: split ? split[2]!.trim() : '' }
}

const cleanName = (name: string): string =>
  name
    .replace(/^"(.*)"$/, '$1')
    .replace(/^`(.*)`$/, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** A line can hold several statements, split by `;` outside names and words. */
const splitStatements = (line: string): string[] => {
  const out: string[] = []
  let quoted = false
  let piped = false
  let from = 0
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (c === '"') quoted = !quoted
    else if (c === '|' && !quoted) piped = !piped
    else if (c === ';' && !quoted && !piped) {
      out.push(line.slice(from, i))
      from = i + 1
    }
  }
  out.push(line.slice(from))
  return out.map((s) => s.trim()).filter(Boolean)
}

type Named = { id: string; name: string; cls: string }

const SHAPES: [string, string[]][] = [
  ['([', ['])']],
  ['[[', [']]']],
  ['[(', [')]']],
  ['((', ['))']],
  ['{{', ['}}']],
  ['[/', ['/]', '\\]']],
  ['[\\', ['\\]', '/]']],
  ['(', [')']],
  ['[', [']']],
  ['{', ['}']],
  ['>', [']']],
]

const ARROW = /^<?(?:-{2,}>|-{3,}|-\.+->|-\.+-|={2,}>|={3,}|--[ox]|~~~)/
const WORDED_ARROW = /^(?:--|==|-\.)\s+(.+?)\s+(?:-{2,}>|={2,}>|\.-+>|-{2,}|={2,}|\.-+)/

/** One statement: cards, joined by wires. Each wire's words, or null for an
 *  invisible link, which draws nothing. A string says what is wrong. */
const readStatement = (statement: string): { groups: Named[][]; links: (string | null)[] } | string => {
  let rest = statement
  const groups: Named[][] = []
  const links: (string | null)[] = []
  const readNode = (): Named | string => {
    const id = /^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*/.exec(rest)
    if (!id) return `could not read "${statement}". A card is written like api["Wardrobe API"]:::server, and a wire like a -->|calls: to fetch suggestions| b.`
    rest = rest.slice(id[0].length)
    let name = ''
    const shape = SHAPES.find(([open]) => rest.startsWith(open))
    if (shape) {
      const [open, closes] = shape
      let body = rest.slice(open.length)
      let after = -1
      if (body.startsWith('"')) {
        const end = body.indexOf('"', 1)
        if (end < 0) return `the name of ${id[0]} has no closing quote.`
        name = body.slice(1, end)
        body = body.slice(end + 1).trimStart()
        const close = closes.find((c) => body.startsWith(c))
        if (!close) return `the name of ${id[0]} is not closed with ${closes[0]}.`
        rest = body.slice(close.length)
      } else {
        const found = closes.map((c) => [body.indexOf(c), c] as const).filter(([at]) => at >= 0).sort((x, y) => x[0] - y[0])[0]
        if (!found) return `the name of ${id[0]} is not closed with ${closes[0]}.`
        after = found[0]
        name = body.slice(0, after)
        rest = body.slice(after + found[1].length)
      }
      name = cleanName(name)
    }
    const cls = /^:::([\w-]+)/.exec(rest)
    if (cls) rest = rest.slice(cls[0].length)
    return { id: id[0], name, cls: cls?.[1] ?? '' }
  }
  const readGroup = (): Named[] | string => {
    const group: Named[] = []
    for (;;) {
      rest = rest.trimStart()
      const node = readNode()
      if (typeof node === 'string') return node
      group.push(node)
      const and = /^\s*&\s*/.exec(rest)
      if (!and) return group
      rest = rest.slice(and[0].length)
    }
  }
  const first = readGroup()
  if (typeof first === 'string') return first
  groups.push(first)
  for (;;) {
    rest = rest.trimStart()
    if (!rest) return { groups, links }
    const plain = ARROW.exec(rest)
    const worded = plain ? null : WORDED_ARROW.exec(rest)
    if (!plain && !worded)
      return links.length
        ? `could not read "${rest}" in "${statement}". A wire is written like a -->|calls: to fetch suggestions| b.`
        : `could not read "${statement}". A card is written like api["Wardrobe API"]:::server, and a wire like a -->|calls: to fetch suggestions| b.`
    rest = rest.slice((plain ?? worded)![0].length)
    let label = worded ? worded[1]! : ''
    const piped = plain ? /^\s*\|([^|]*)\|/.exec(rest) : null
    if (piped) {
      label = piped[1]!
      rest = rest.slice(piped[0].length)
    }
    links.push(plain?.[0] === '~~~' ? null : label)
    const next = readGroup()
    if (typeof next === 'string') return `a wire with nothing it reaches: ${next}`
    groups.push(next)
  }
}

/** One field of a store, as an agent writes it: its name, a colon, what it
 *  holds, then `needed` if every record has it and `points at <store>` if it
 *  holds another record's id: `owner: text, needed, points at people`. */
export const readField = (said: string): SketchField | string => {
  const split = /^([^:]+?)\s*:\s*(.*)$/.exec(said.trim())
  if (!split || !split[1]!.trim()) return `could not read the field "${said.trim()}". Write it like \`owner: text, needed, points at people\`.`
  const [holds = '', ...more] = split[2]!.split(',').map((part) => part.trim())
  const field: SketchField = { name: split[1]!.trim(), holds: holds || 'text', needed: false, pointsAt: '' }
  for (const part of more) {
    const points = /^points\s+at\s+(.+)$/i.exec(part)
    if (/^needed$/i.test(part)) field.needed = true
    else if (points) field.pointsAt = points[1]!.trim()
    else if (part) return `"${part}" in the field ${field.name} is not \`needed\` or \`points at <store>\`.`
  }
  return field
}
const fieldOf = readField
