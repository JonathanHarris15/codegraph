// codegraph: module reader
import { parse } from 'yaml'

/** Where a repo keeps its design system's tokens and the words behind them,
 *  in Google's open DESIGN.md format (ADR 0024). */
export const DESIGN = 'DESIGN.md'

/** The groups Google's format keeps tokens in. `components` is its word for
 *  what UI blocks use; it is kept so the file stays theirs. */
export type TokenGroup = 'colors' | 'typography' | 'rounded' | 'spacing' | 'components'

/** Raw is the value itself, purpose names another token, block is what one
 *  UI block uses. Read from how a token is written, never declared. */
export type TokenTier = 'raw' | 'purpose' | 'block'

/** One of a type style's or a block token's own values. */
export type TokenPart = { name: string; written: string; value: string }

/** One named value in DESIGN.md: a colour, a space, a corner radius, a type
 *  style, or what one UI block uses. */
export type Token = {
  /** group.name, as another token names it: colors.action */
  id: string
  group: TokenGroup
  name: string
  tier: TokenTier
  /** As written: a value or a {reference}; '' for a token made of parts. */
  written: string
  /** What it comes to with every reference followed; '' when that is not
   *  known, or for a token made of parts. */
  value: string
  /** A type style's or block token's own values; empty for any other. */
  parts: TokenPart[]
  /** The tokens it names, in the order written. */
  names: string[]
  /** The tokens that name it. */
  namedBy: string[]
}

/** A software system's DESIGN.md, as its tokens and the words under its
 *  headings. */
export type DesignSystem = {
  name: string
  description: string
  tokens: Token[]
  sections: { heading: string; words: string }[]
  /** Where the file does not hold together, said plainly. */
  problems: string[]
}

const GROUPS: TokenGroup[] = ['colors', 'typography', 'rounded', 'spacing', 'components']
const MADE_OF_PARTS = new Set<TokenGroup>(['typography', 'components'])
const REFERENCE = /\{([^{}]+)\}/g
const WHOLE_REFERENCE = /^\{([^{}]+)\}$/
const DIMENSION = /^-?\d*\.?\d+(px|em|rem)$/
const COLOUR = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]+|[a-z-]+\(.*\))$/i
const FENCED_YAML = /^```ya?ml\s*\n([\s\S]*?)^```\s*$/gm

const asText = (value: unknown): string => (value === null || value === undefined ? '' : String(value))
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The front matter and every fenced yaml block, and the Markdown left once
 *  they are taken out. */
const splitOut = (text: string): { blocks: string[]; body: string } => {
  const blocks: string[] = []
  let body = text.replace(/^﻿/, '')
  const front = body.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/)
  if (front) {
    blocks.push(front[1]!)
    body = body.slice(front[0].length)
  }
  body = body.replace(/\r\n/g, '\n').replace(FENCED_YAML, (_, yaml: string) => {
    blocks.push(yaml)
    return ''
  })
  return { blocks, body }
}

const sectionsOf = (body: string): DesignSystem['sections'] => {
  const sections: DesignSystem['sections'] = []
  for (const chunk of body.split(/^## /m).slice(1)) {
    const [heading, ...rest] = chunk.split('\n')
    sections.push({ heading: heading!.trim(), words: rest.join('\n').trim() })
  }
  return sections
}

/** Reads a DESIGN.md into its tokens, each with its tier, what it names and
 *  what it comes to. A file that does not hold together still reads as far
 *  as it can, and says where it breaks. */
export const readDesign = (text: string): DesignSystem => {
  const problems: string[] = []
  const { blocks, body } = splitOut(text)
  const tree: Record<string, unknown> = {}
  for (const block of blocks) {
    let read: unknown
    try {
      read = parse(block)
    } catch (error) {
      problems.push(`${DESIGN} has yaml the reader cannot read: ${(error as Error).message.split('\n')[0]}`)
      continue
    }
    if (!isRecord(read)) continue
    for (const [key, value] of Object.entries(read)) {
      if (key in tree) problems.push(`${key} is written more than once`)
      else tree[key] = value
    }
  }

  const tokens: Token[] = []
  for (const group of GROUPS) {
    const entries = tree[group]
    if (!isRecord(entries)) continue
    for (const [name, raw] of Object.entries(entries)) {
      const id = `${group}.${name}`
      const parts =
        MADE_OF_PARTS.has(group) && isRecord(raw)
          ? Object.entries(raw).map(([part, value]) => ({ name: part, written: asText(value), value: '' }))
          : []
      const written = parts.length ? '' : asText(raw)
      const said = parts.length ? parts.map((p) => p.written) : [written]
      const names = [...new Set(said.flatMap((s) => [...s.matchAll(REFERENCE)].map((m) => m[1]!)))]
      const tier: TokenTier = group === 'components' ? 'block' : names.length ? 'purpose' : 'raw'
      tokens.push({ id, group, name, tier, written, value: '', parts, names, namedBy: [] })
    }
  }

  const byId = new Map(tokens.map((t) => [t.id, t]))
  // A part of a type style can be named too: {typography.body-md.fontSize}.
  const partValue = (id: string): string | undefined => {
    const owner = byId.get(id.slice(0, id.lastIndexOf('.')))
    return owner?.parts.find((p) => `${owner.id}.${p.name}` === id)?.written
  }

  const circled = new Set<string>()
  const follow = (written: string, from: Token, trail: string[]): string => {
    const whole = written.match(WHOLE_REFERENCE)
    if (!whole) return written
    const id = whole[1]!
    if (trail.includes(id)) {
      const loop = trail.slice(trail.indexOf(id))
      const key = [...loop].sort().join(' and ')
      if (!circled.has(key)) {
        circled.add(key)
        problems.push(`${key} name each other round in a circle`)
      }
      return ''
    }
    const target = byId.get(id)
    if (target && !target.parts.length) return follow(target.written, target, [...trail, id])
    // A block token may name a whole type style; it comes to the style's name.
    if (target) return from.group === 'components' ? `{${id}}` : ''
    const part = partValue(id)
    return part === undefined ? '' : follow(part, from, [...trail, id])
  }

  for (const t of tokens) {
    for (const id of t.names) {
      const target = byId.get(id)
      if (target) target.namedBy.push(t.id)
      else if (partValue(id) === undefined) problems.push(`${t.id} names {${id}}, which is not a token`)
    }
    if (t.parts.length) for (const p of t.parts) p.value = follow(p.written, t, [t.id])
    else t.value = follow(t.written, t, [t.id])
  }

  for (const t of tokens) {
    if (t.tier !== 'raw' || t.parts.length) continue
    if (t.group === 'colors' && !COLOUR.test(t.written)) problems.push(`${t.id} is not a colour: "${t.written}"`)
    if (t.group === 'rounded' && !DIMENSION.test(t.written))
      problems.push(`${t.id} needs a unit (px, em or rem): "${t.written}"`)
  }

  return {
    name: asText(tree.name),
    description: asText(tree.description),
    tokens,
    sections: sectionsOf(body),
    problems,
  }
}
