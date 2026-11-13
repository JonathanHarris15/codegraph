// codegraph: test feature describe-map
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { describeMap } from '../src/features/describe-map.js'
import { aMappedRepo, anAgentIn, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let agent: Awaited<ReturnType<typeof anAgentIn>>

beforeAll(async () => {
  yard = openYard('describe-map')
  agent = await anAgentIn(aMappedRepo(yard))
})

afterAll(async () => {
  await agent.close()
  closeYard(yard)
})

describe('the map in words, called straight', () => {
  it('says plainly when a repo is not set up', async () => {
    expect(await describeMap(yard.home)).toMatch(/^This repo has no codegraph.config.json/)
  })

  it('says the design system, each token with its tier and what it comes to', async () => {
    const repo = aMappedRepo(yard, 'designed')
    writeFileSync(
      join(repo, 'DESIGN.md'),
      [
        '---',
        'name: Daylight',
        'description: Calm neutrals and one accent.',
        'colors:',
        '  blue-500: "#2563eb"',
        '  action: "{colors.blue-500}"',
        '  paper: "#fff"',
        'components:',
        '  button-primary:',
        '    backgroundColor: "{colors.action}"',
        '    textColor: "{colors.paper}"',
        '    padding: 12px',
        '  broken:',
        '    textColor: "{colors.nope}"',
        '---',
      ].join('\n'),
    )
    const said = await describeMap(repo)
    expect(said).toContain(
      [
        'Design system Daylight, from DESIGN.md: Calm neutrals and one accent.',
        '  colors.blue-500 (raw) #2563eb',
        '  colors.action (purpose) {colors.blue-500}, which is #2563eb',
        '  colors.paper (raw) #fff',
        '  components.button-primary (block):',
        '    backgroundColor {colors.action}, which is #2563eb',
        '    textColor {colors.paper}, which is #fff',
        '    padding 12px',
        '  components.broken (block):',
        '    textColor {colors.nope}, which is not known',
        '  Does not hold together:',
        '    components.broken names {colors.nope}, which is not a token',
      ].join('\n'),
    )
  })
})

describe('UI blocks in words', () => {
  it('names each UI block by folder, with its options, what they mean, and its states', async () => {
    const repo = aMappedRepo(yard, 'blocks')
    mkdirSync(join(repo, 'app', 'ui'), { recursive: true })
    writeFileSync(
      join(repo, 'app', 'ui', 'row.tsx'),
      [
        '// codegraph: module ui',
        '// codegraph: ui block settings/SettingsRow',
        '/** One setting, label left, control right. */',
        'export const SettingsRow = (props: {',
        '  /** What it is called. */',
        '  label: string',
        '  /**',
        '   * How loud it is.',
        '   * danger: only in the danger zone',
        '   */',
        "  tone?: 'plain' | 'danger'",
        '}) => null',
        '',
      ].join('\n'),
    )
    writeFileSync(join(repo, 'app', 'ui', 'row.states.tsx'), '// codegraph: states SettingsRow\nexport const loading = () => null\n')
    expect(await describeMap(repo)).toContain(
      [
        'UI blocks, by folder:',
        '  settings/SettingsRow, in module ui, app/ui/row.tsx: One setting, label left, control right.',
        '    label: string. What it is called.',
        "    tone (optional): 'plain' | 'danger'. How loud it is.",
        '      danger: only in the danger zone',
        '    States, in app/ui/row.states.tsx: loading',
      ].join('\n'),
    )
  })
})

describe('recipes in words', () => {
  it('names each recipe, what it is for, its reference, what it is built from, and who follows it', async () => {
    const repo = aMappedRepo(yard, 'recipes')
    mkdirSync(join(repo, 'recipes'))
    writeFileSync(
      join(repo, 'recipes', 'list-page.md'),
      '---\nrecipe: list-page\nuse-when: A page of many records.\nnot-for: One record.\nreference: app/pages/notes.tsx\n---\n\n## Skeleton\n```\n<NoteList />\n```\n',
    )
    writeFileSync(
      join(repo, 'app', 'pages', 'notes.tsx'),
      "// codegraph: start page notes at / follows list-page\nimport { listNotes } from '../modules/notes.js' // codegraph: wire lists the notes\nexport const N = () => listNotes()\n",
    )
    const said = await describeMap(repo)
    expect(said).toContain('  page notes (at /; start page; follows list-page)')
    expect(said).toContain(
      [
        'Recipes, in recipes/. Read the file for its rules before building a page that follows one:',
        '  list-page, recipes/list-page.md: A page of many records.',
        '    Not for: One record.',
        '    Reference: page notes, app/pages/notes.tsx',
        '    Built from: NoteList',
        '    Followed by: page notes',
      ].join('\n'),
    )
  })
})

describe('an agent reading the map', () => {
  it('lists the tools an agent can call', async () => {
    const { tools } = await agent.client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['check', 'draw', 'edit', 'instructions', 'looking', 'map', 'propose', 'sketch', 'sketches', 'working-on'])
  })

  it('reads containers, components, files and wires in words', async () => {
    const said = await agent.call('map')
    expect(said).toContain('Serves notes-app. Read at the live folder.')
    expect(said).toContain('Container web (browser app): Where people keep their notes')
    expect(said).toContain('  module notes (front door saveNote, listNotes, Note)\n    app/modules/notes.ts')
    expect(said).toContain('  page new-note asks feature write-note to save what was typed')
    expect(said).toContain('  module notes calls mailer to tell the owner')
  })
})
