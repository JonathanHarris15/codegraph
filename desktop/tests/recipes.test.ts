// codegraph: test module reader
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkRepo, live, readMap, type Mismatch, type SystemMap } from '../src/modules/reader/index.js'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

/** Recipes: how one kind of page lays itself out, written in recipes/, and
 *  held to the pages that say they follow one (ADR 0024). */
let yard: Yard
let repo = ''
let map: SystemMap

const RECIPE = [
  '---',
  'recipe: settings-page',
  'use-when: A page where the user changes options for one thing.',
  'not-for: Forms that create something new (use `create-form`).',
  'reference: app/pages/account.tsx',
  '---',
  '',
  '# Settings page',
  '',
  '## Skeleton',
  '```',
  '<PageHeader title subtitle? />        // no actions in the header',
  '<SettingsRow label hint? control />   // repeat',
  '<DangerZone />                        // always last',
  '```',
  '',
  '## Rules',
  '- Danger zone is always last.',
  '',
  "## Don't",
  '- Don\'t put tabs on a settings page.',
  '',
].join('\n')

const BLOCKS = [
  '// codegraph: module ui',
  '// codegraph: front door PageHeader, SettingsRow, DangerZone',
  '// codegraph: ui block layout/PageHeader',
  '// codegraph: ui block settings/SettingsRow',
  '// codegraph: ui block settings/DangerZone',
  'export const PageHeader = (props: { title: string }) => null',
  'export const SettingsRow = (props: { label: string }) => null',
  'export const DangerZone = () => null',
  '',
].join('\n')

const pageThat = (name: string, follows: string, uses: string[]): string =>
  [
    `// codegraph: page ${name} at /${name}${follows ? ` follows ${follows}` : ''}`,
    `import { ${uses.join(', ')} } from '../ui/blocks' // codegraph: wire draws the page`,
    `export const Page = () => <>${uses.map((u) => `<${u} />`).join('')}</>`,
    '',
  ].join('\n')

const put = (files: Record<string, string>): void => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
}

beforeAll(async () => {
  yard = openYard('recipes')
  repo = aMappedRepo(yard)
  put({
    'recipes/settings-page.md': RECIPE,
    'app/ui/blocks.tsx': BLOCKS,
    'app/pages/account.tsx': pageThat('account', 'settings-page', ['PageHeader', 'SettingsRow', 'DangerZone']),
  })
  map = await readMap(repo, live)
})

afterAll(() => closeYard(yard))

describe('reading recipes', () => {
  it('reads each recipe in recipes/: what it is for and not for, and its reference page', () => {
    expect(map.recipes.map((r) => [r.name, r.file, r.useWhen, r.notFor, r.reference])).toEqual([
      [
        'settings-page',
        'recipes/settings-page.md',
        'A page where the user changes options for one thing.',
        'Forms that create something new (use `create-form`).',
        'app/pages/account.tsx',
      ],
    ])
    expect(map.problems).toEqual([])
  })

  it('reads the UI blocks its skeleton is built from, and the words under each heading', () => {
    const recipe = map.recipes[0]!
    expect(recipe.blocks).toEqual(['PageHeader', 'SettingsRow', 'DangerZone'])
    expect(recipe.skeleton).toContain('<SettingsRow label hint? control />')
    expect(recipe.sections.map((s) => s.heading)).toEqual(['Skeleton', 'Rules', "Don't"])
    expect(recipe.sections[1]!.words).toBe('- Danger zone is always last.')
  })

  it('knows which pages follow it, and which is its reference', () => {
    expect(map.components.find((c) => c.name === 'account')?.follows).toBe('settings-page')
    expect(map.recipes[0]!.pages).toEqual(['web:page:account'])
    expect(map.recipes[0]!.referencePage).toBe('web:page:account')
  })

  it('takes the recipe name from the file when the front matter has none', async () => {
    put({ 'recipes/list-page.md': '# List page\n\n## Rules\n\nOne list a page.\n' })
    const now = await readMap(repo, live)
    rmSync(join(repo, 'recipes', 'list-page.md'))
    expect(now.recipes.map((r) => r.name)).toEqual(['list-page', 'settings-page'])
  })
})

describe('holding pages to their recipes', () => {
  const checkWith = async (files: Record<string, string>): Promise<Mismatch[]> => {
    put(files)
    try {
      return (await checkRepo(repo)).filter((m) => m.file.startsWith('app/pages/') || m.file.startsWith('recipes/'))
    } finally {
      for (const path of Object.keys(files)) rmSync(join(repo, path))
      put({ 'recipes/settings-page.md': RECIPE, 'app/pages/account.tsx': pageThat('account', 'settings-page', ['PageHeader', 'SettingsRow', 'DangerZone']) })
    }
  }

  it('finds nothing wrong when every page uses the UI blocks its recipe names', async () => {
    expect(await checkRepo(repo)).toEqual([])
  })

  it('names each UI block a page leaves out of the skeleton it follows', async () => {
    const found = await checkWith({ 'app/pages/team.tsx': pageThat('team', 'settings-page', ['PageHeader']) })
    expect(found).toEqual([
      { file: 'app/pages/team.tsx', line: 1, says: 'Page team follows settings-page, but does not use SettingsRow, which its skeleton names.' },
      { file: 'app/pages/team.tsx', line: 1, says: 'Page team follows settings-page, but does not use DangerZone, which its skeleton names.' },
    ])
  })

  it('names a page that follows a recipe there is none of', async () => {
    const found = await checkWith({ 'app/pages/team.tsx': pageThat('team', 'nope', ['PageHeader']) })
    expect(found).toEqual([{ file: 'app/pages/team.tsx', line: 1, says: 'Page team follows the recipe nope, which is not in recipes/.' }])
  })

  it('holds a recipe to its reference page, and its skeleton to the UI blocks there are', async () => {
    const found = await checkWith({
      'app/pages/account.tsx': pageThat('account', '', ['PageHeader', 'SettingsRow', 'DangerZone']),
      'recipes/settings-page.md': RECIPE.replace('<DangerZone />', '<DangerZone />\n<AppShell />'),
    })
    expect(found).toEqual([
      { file: 'recipes/settings-page.md', line: 1, says: 'Its reference, app/pages/account.tsx, is page account, which does not say it follows settings-page.' },
      { file: 'recipes/settings-page.md', line: 1, says: 'Its skeleton names AppShell, which is not a UI block.' },
    ])
  })

  it('names a reference that is not a page', async () => {
    const found = await checkWith({ 'recipes/settings-page.md': RECIPE.replace('app/pages/account.tsx', 'app/pages/gone.tsx') })
    expect(found).toEqual([{ file: 'recipes/settings-page.md', line: 1, says: 'Its reference, app/pages/gone.tsx, is not a page.' }])
  })
})
