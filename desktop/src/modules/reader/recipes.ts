// codegraph: module reader
import { parse } from 'yaml'

/** Where a repo keeps its recipes, one Markdown file each, beside DESIGN.md. */
export const RECIPES = 'recipes'

/** How one kind of page lays itself out (ADR 0024): what it is for and not
 *  for, a reference page, the UI blocks its skeleton is built from, and its
 *  rules, states and don'ts as written. Most of it is words for people and
 *  agents; the skeleton and the reference are what the check holds. */
export type Recipe = {
  name: string
  file: string
  useWhen: string
  notFor: string
  /** The file of the page that shows the recipe done right, as written. */
  reference: string
  /** The id of the page that file belongs to; '' when it is not a page. */
  referencePage: string
  /** The skeleton, as written. */
  skeleton: string
  /** The names its skeleton builds the page from, in the order written. */
  blocks: string[]
  /** The words under each heading, as written. */
  sections: { heading: string; words: string }[]
  /** The ids of the pages that say they follow it. */
  pages: string[]
}

export const isRecipe = (path: string): boolean => new RegExp(`^${RECIPES}/[^/]+\\.md$`, 'i').test(path)

const words = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** One recipe file, as far as it can be read. Which pages follow it is the
 *  map's to say. */
export const readRecipe = (path: string, text: string): Omit<Recipe, 'pages' | 'referencePage'> => {
  let body = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  let front: Record<string, unknown> = {}
  const top = body.match(/^---\n([\s\S]*?)\n---[ \t]*(\n|$)/)
  if (top) {
    try {
      const read: unknown = parse(top[1]!)
      if (read && typeof read === 'object' && !Array.isArray(read)) front = read as Record<string, unknown>
    } catch {
      // Front matter that is not yaml leaves the recipe its file name and words.
    }
    body = body.slice(top[0].length)
  }
  const sections = body
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const [heading, ...rest] = chunk.split('\n')
      return { heading: heading!.trim(), words: rest.join('\n').trim() }
    })
  const skeletonWords = sections.find((s) => /^skeleton$/i.test(s.heading))?.words ?? ''
  const skeleton = skeletonWords.match(/```[^\n]*\n([\s\S]*?)```/)?.[1]?.trimEnd() ?? ''
  const blocks = [...new Set([...skeleton.matchAll(/<([A-Z][\w.]*)/g)].map((m) => m[1]!))]
  return {
    name: words(front.recipe) || path.split('/').pop()!.replace(/\.md$/i, ''),
    file: path,
    useWhen: words(front['use-when']),
    notFor: words(front['not-for']),
    reference: words(front.reference).replace(/^\.\//, ''),
    skeleton,
    blocks,
    sections,
  }
}
