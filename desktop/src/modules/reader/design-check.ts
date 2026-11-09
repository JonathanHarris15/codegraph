// codegraph: module reader
import type { Mismatch } from './build.js'
import { DESIGN, type DesignSystem, type Token } from './design.js'
import { RECIPES } from './recipes.js'
import type { Component, SystemMap } from './schema.js'
import type { FileTags } from './tags.js'

/** The groups whose tokens are one value each, and so one variable in the
 *  theme: `colors.action` is `--colors-action`. */
const SINGLE = ['colors', 'spacing', 'rounded'] as const
const VARIABLE = /--((?:colors|spacing|rounded)-[\w-]+)\s*:\s*([^;{}]+)/g
const USED = /var\(\s*--(colors|spacing|rounded)-([\w-]+)\s*[,)]/g
const STYLED = /\.(css|scss|sass|less|tsx|jsx|ts|js|mjs|cjs|html|vue|svelte)$/i
const HEX = /(?<![\w#&.-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi
const FUNCTIONAL = /(?<![\w-])(?:rgba?|hsla?)\([^)]*\)/gi
/** A spacing or corner property, in a stylesheet or a style object, and its value. */
const SIZED = /(?<![\w-])(padding|margin|gap|row-?gap|column-?gap|border-?radius)[\w-]*\s*:\s*['"`]?([^;'"`}]+)/gi
const LENGTH = /(?<![\w.-])-?(\d*\.?\d+)(px|rem|em)\b/g

const variableOf = (id: string): string => `--${id.replace('.', '-')}`

/** A value written so two ways of writing the same one compare equal:
 *  #FFF and #ffffff, var(--colors-x) and {colors.x}. */
const plain = (value: string): string => {
  const v = value.trim().toLowerCase().replace(/\s+/g, ' ')
  const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/)
  if (short) return `#${short.slice(1).filter(Boolean).map((c) => c! + c!).join('')}`
  const named = v.match(/^var\(\s*--(colors|spacing|rounded)-([\w-]+)\s*\)$/)
  return named ? `{${named[1]}.${named[2]}}` : v
}

/** Code with its comments taken out, so a colour named in words is not one. */
const withoutComments = (line: string): string => line.replace(/\/\*.*?\*\//g, '').replace(/(^|\s)\/\/.*$/, '$1').replace(/<!--.*?-->/g, '')

/** The token that has a value, preferring one that says what it is for. */
const tokenWith = (design: DesignSystem, group: string, value: string): Token | undefined => {
  const same = design.tokens.filter((t) => t.group === group && t.value && plain(t.value) === plain(value))
  return same.find((t) => t.tier === 'purpose') ?? same[0]
}

/** Every place a page does not keep to the recipe it follows, or a recipe to
 *  its reference page and the UI blocks there are (ADR 0024). A recipe's
 *  rules are words for people and agents, and are not checked. */
export const checkRecipes = (map: SystemMap, files: Map<string, string>, componentOf: Map<string, Component>): Mismatch[] => {
  const found: Mismatch[] = []
  const blocks = new Set(map.uiBlocks.map((b) => b.name))
  const recipes = new Map(map.recipes.map((r) => [r.name, r]))

  for (const page of map.components.filter((c) => c.kind === 'page' && c.follows)) {
    const at = { file: page.files[0]!.path, line: 1 }
    const recipe = recipes.get(page.follows)
    if (!recipe) {
      found.push({ ...at, says: `Page ${page.name} follows the recipe ${page.follows}, which is not in ${RECIPES}/.` })
      continue
    }
    const code = page.files.map((f) => files.get(f.path) ?? '').join('\n')
    for (const name of recipe.blocks)
      if (blocks.has(name) && !new RegExp(`\\b${name.replace(/[.$]/g, '\\$&')}\\b`).test(code))
        found.push({ ...at, says: `Page ${page.name} follows ${recipe.name}, but does not use ${name}, which its skeleton names.` })
  }

  for (const recipe of map.recipes) {
    const at = { file: recipe.file, line: 1 }
    if (recipe.reference) {
      const page = componentOf.get(recipe.reference)
      if (page?.kind !== 'page') found.push({ ...at, says: `Its reference, ${recipe.reference}, is not a page.` })
      else if (page.follows !== recipe.name)
        found.push({ ...at, says: `Its reference, ${recipe.reference}, is page ${page.name}, which does not say it follows ${recipe.name}.` })
    }
    for (const name of recipe.blocks)
      if (!blocks.has(name)) found.push({ ...at, says: `Its skeleton names ${name}, which is not a UI block.` })
  }
  return found
}

/** Every place a set-up repo's code does not keep to its DESIGN.md: a theme
 *  that does not match it, raw values where a token belongs, and code that
 *  skips a purpose token for the raw one under it (ADR 0024). A line with an
 *  exception keeps its mismatch, with why, so it can be listed apart. */
export const checkDesign = (
  design: DesignSystem,
  files: Map<string, string>,
  tagsOf: Map<string, FileTags>,
  componentOf: Map<string, Component>,
): Mismatch[] => {
  const found: Mismatch[] = []
  const byId = new Map(design.tokens.map((t) => [t.id, t]))

  const themes = [...tagsOf].filter(([, tags]) => tags.theme).map(([path]) => path)
  if (!themes.length && design.tokens.length)
    found.push({ file: DESIGN, line: 1, says: `${DESIGN} has tokens, but no file is tagged \`theme\` to say where the code makes them.` })
  for (const extra of themes.slice(1))
    found.push({ file: extra, line: 1, says: `Only one file is the theme, and ${themes[0]} is already.` })

  const theme = themes[0]
  if (theme) {
    const declared = new Map<string, { line: number; value: string }>()
    files
      .get(theme)!
      .split(/\r?\n/)
      .forEach((text, i) => {
        for (const m of withoutComments(text).matchAll(VARIABLE))
          if (!declared.has(m[1]!)) declared.set(m[1]!, { line: i + 1, value: m[2]!.trim() })
      })
    for (const token of design.tokens.filter((t) => (SINGLE as readonly string[]).includes(t.group))) {
      const name = variableOf(token.id)
      const there = declared.get(name.slice(2))
      if (!there) found.push({ file: theme, line: 1, says: `The theme has no ${name} for ${token.id}, which ${DESIGN} has as ${token.written}.` })
      else if (plain(there.value) !== plain(token.written))
        found.push({ file: theme, line: there.line, says: `${name} is ${there.value} here, but ${DESIGN} has ${token.id} as ${token.written}.` })
    }
    for (const [name, { line }] of declared)
      if (!byId.has(name.replace('-', '.')))
        found.push({ file: theme, line, says: `--${name} is not a token in ${DESIGN}. Add it there, or take it out of the theme.` })
  }

  for (const [path, text] of files) {
    if (path === theme || !STYLED.test(path) || !componentOf.has(path)) continue
    const tags = tagsOf.get(path)!
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = i + 1
      const why = tags.exceptions.get(line)
      if (why === '') found.push({ file: path, line, says: 'An exception says why it breaks the design system, after `exception`.' })
      const add = (says: string): void => {
        found.push(why ? { file: path, line, says, onPurpose: why } : { file: path, line, says })
      }
      const code = withoutComments(raw)

      for (const colour of [...code.matchAll(HEX), ...code.matchAll(FUNCTIONAL)].map((m) => m[0])) {
        const same = tokenWith(design, 'colors', colour)
        add(
          same
            ? `A raw colour, ${colour}, where a token belongs: ${same.id} is that colour, so use var(${variableOf(same.id)}).`
            : `A raw colour, ${colour}, where a token belongs. Add it to ${DESIGN}, or use one it has.`,
        )
      }

      for (const sized of code.matchAll(SIZED)) {
        const corner = /radius/i.test(sized[1]!)
        const group = corner ? 'rounded' : 'spacing'
        for (const length of sized[2]!.matchAll(LENGTH)) {
          if (Number(length[1]) === 0) continue
          const same = tokenWith(design, group, length[0])
          const what = corner ? 'corner' : 'size'
          add(
            same
              ? `A raw ${what}, ${length[0]}, where a token belongs: ${same.id} is that ${what}, so use var(${variableOf(same.id)}).`
              : `A raw ${what}, ${length[0]}, where a token belongs. Add it to ${DESIGN}, or use one it has.`,
          )
        }
      }

      for (const used of code.matchAll(USED)) {
        const id = `${used[1]}.${used[2]}`
        const token = byId.get(id)
        if (!token) {
          add(`It uses var(--${used[1]}-${used[2]}), which is not a token in ${DESIGN}.`)
          continue
        }
        const purposes = token.namedBy.filter((n) => byId.get(n)?.tier === 'purpose')
        if (token.tier === 'raw' && purposes.length)
          add(`It uses ${id}, a raw token, where a token for what it is for belongs: ${purposes.join(', ')} ${purposes.length === 1 ? 'names' : 'name'} it.`)
      }
    })
  }
  return found
}
