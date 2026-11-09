// codegraph: test module reader
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkRepo, type Mismatch } from '../src/modules/reader/index.js'
import { aMappedRepo, aSoftwareSystem, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''

beforeAll(() => {
  yard = openYard('check')
  repo = aMappedRepo(yard)
})

afterAll(() => closeYard(yard))

/** Checks the repo with some files added to its live folder, then takes
 *  them away again. */
const checkWith = async (files: Record<string, string>): Promise<Mismatch[]> => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
  try {
    return await checkRepo(repo)
  } finally {
    for (const path of Object.keys(files)) rmSync(join(repo, path))
  }
}

const says = (found: Mismatch[]): string[] => found.map((m) => m.says)

describe('checking a repo against its tags', () => {
  it('finds nothing wrong with a repo whose code matches its tags', async () => {
    expect(await checkRepo(repo)).toEqual([])
  })

  it('says a repo with no config is not set up', async () => {
    const plain = aSoftwareSystem(yard, 'plain')
    expect(says(await checkRepo(plain))).toEqual([
      'There is no codegraph.config.json, so this repo is not set up for codegraph.',
    ])
  })

  it('names a code file with no tag, but lets type declarations be', async () => {
    const found = await checkWith({
      'app/modules/helper.ts': 'export const help = 1\n',
      'app/env.d.ts': 'declare const x: number\n',
    })
    expect(found).toEqual([{ file: 'app/modules/helper.ts', line: 1, says: 'It has no tag saying what it belongs to.' }])
  })

  it('names a wire with no words saying what it is for', async () => {
    const found = await checkWith({
      'app/pages/about.tsx': "// codegraph: page about at /about\nimport { writeNote } from '../features/write-note'\nexport const About = () => writeNote('')\n",
    })
    expect(found).toEqual([
      { file: 'app/pages/about.tsx', line: 2, says: 'The wire from page about to feature write-note has no words saying what it is for.' },
    ])
  })

  it('holds a feature to the modules it says it uses', async () => {
    const found = await checkWith({
      'app/features/share-note.ts':
        "// codegraph: feature share-note uses notes, people\nimport { listNotes } from '~/modules/notes' // codegraph: wire finds the note\nexport const share = listNotes\n",
      'app/features/archive.ts':
        "// codegraph: feature archive\nimport { listNotes } from '~/modules/notes' // codegraph: wire finds old notes\nexport const archive = listNotes\n",
    })
    expect(says(found).sort()).toEqual([
      'Feature archive uses module notes but its tag does not say so.',
      'Feature share-note says it uses people, but never does.',
    ])
  })

  it('names a name taken from a module that is not on its front door', async () => {
    const found = await checkWith({
      'app/features/nag.ts':
        "// codegraph: feature nag uses notes\nimport { tellOwner } from '~/modules/notes' // codegraph: wire nags the owner\nexport const nag = tellOwner\n",
    })
    expect(found).toEqual([
      { file: 'app/features/nag.ts', line: 2, says: 'It takes tellOwner from module notes, which is not on its front door.' },
    ])
  })

  it('names a module with no front door that others reach', async () => {
    const found = await checkWith({
      'app/modules/quiet.ts': '// codegraph: module quiet\nexport const hush = 1\n',
      'app/features/listen.ts':
        "// codegraph: feature listen uses quiet\nimport { hush } from '../modules/quiet' // codegraph: wire keeps it down\nexport const listen = hush\n",
    })
    expect(says(found)).toEqual(['Module quiet is reached from outside, but has no front door.'])
  })

  it('keeps each kind of component in its place', async () => {
    const found = await checkWith({
      'app/modules/bad.ts':
        "// codegraph: module bad\n// codegraph: front door bad\nimport { writeNote } from '../features/write-note' // codegraph: wire writes from below\nexport const bad = writeNote\n",
      'app/pages/pay.tsx':
        "// codegraph: page pay at /pay\n// codegraph: store payments in db\nexport const Pay = () => fetch('https://stripe.example') // codegraph: wire to stripe: takes the money\n",
    })
    expect(says(found).sort()).toEqual([
      'A store is kept by a module, but page pay keeps payments.',
      'Module bad reaches feature write-note; a module never reaches a feature, a page or a trigger.',
      'Only a module reaches outside its container, but page pay calls stripe.',
    ])
  })

  it('reads a require the way it reads an import, so a CommonJS feature can keep its uses', async () => {
    const found = await checkWith({
      'app/features/post-note.js': [
        '// codegraph: feature post-note uses notes',
        "const { listNotes } = require('../modules/notes') // codegraph: wire finds the notes",
        'module.exports = { post: () => listNotes() }',
        '',
      ].join('\n'),
    })
    expect(says(found)).toEqual([])
  })

  it('holds a require to the front door, name by name, but lets it take the module whole', async () => {
    const found = await checkWith({
      'app/features/nag-again.js':
        "// codegraph: feature nag-again uses notes\nconst { tellOwner } = require('../modules/notes') // codegraph: wire nags the owner\nmodule.exports = tellOwner\n",
      'app/features/tidy-up.js':
        "// codegraph: feature tidy-up uses notes\nconst notes = require('../modules/notes') // codegraph: wire reads every note\nmodule.exports = () => notes.listNotes()\n",
    })
    expect(says(found)).toEqual(['It takes tellOwner from module notes, which is not on its front door.'])
  })

  it('wants a wire\'s words on the line the import starts on, or on a line of their own above it', async () => {
    const late = await checkWith({
      'app/pages/gather.tsx': [
        '// codegraph: page gather at /gather',
        'import {',
        '  listNotes,',
        "} from '../modules/notes' // codegraph: wire gathers the notes",
        'export const Gather = () => listNotes().length',
        '',
      ].join('\n'),
    })
    expect(says(late)).toEqual(['The wire from page gather to module notes has no words saying what it is for.'])

    const above = await checkWith({
      'app/pages/gather.tsx': [
        '// codegraph: page gather at /gather',
        '// codegraph: wire gathers the notes',
        'import {',
        '  listNotes,',
        "} from '../modules/notes'",
        'export const Gather = () => listNotes().length',
        '',
      ].join('\n'),
    })
    expect(says(above)).toEqual([])
  })

  it('passes on what the reader could not place', async () => {
    const found = await checkWith({ 'loose.ts': '// codegraph: module loose\n' })
    expect(says(found)).toEqual(["loose.ts is not in any container's folders"])
  })
})

describe('holding the code to its DESIGN.md (ADR 0024)', () => {
  const DESIGN = [
    '---',
    'name: Daylight',
    'colors:',
    '  blue-500: "#2563eb"',
    '  paper: "#ffffff"',
    '  action: "{colors.blue-500}"',
    'spacing:',
    '  md: 16px',
    'rounded:',
    '  md: 8px',
    '---',
    '',
  ].join('\n')
  const THEME = [
    '/* codegraph: module design-system */',
    '/* codegraph: theme */',
    ':root {',
    '  --colors-blue-500: #2563EB;',
    '  --colors-paper: #fff;',
    '  --colors-action: var(--colors-blue-500);',
    '  --spacing-md: 16px;',
    '  --rounded-md: 8px;',
    '}',
    '',
  ].join('\n')
  const page = (...lines: string[]): string => ['// codegraph: page styled at /styled', ...lines, ''].join('\n')

  it('finds nothing wrong when the theme matches DESIGN.md and the code uses its tokens', async () => {
    const found = await checkWith({
      'DESIGN.md': DESIGN,
      'app/theme.css': THEME,
      'app/pages/styled.tsx': page("export const S = () => <b style={{ color: 'var(--colors-action)', padding: 'var(--spacing-md)' }} />"),
    })
    expect(found).toEqual([])
  })

  it('wants a file tagged as the theme the code makes from DESIGN.md', async () => {
    const found = await checkWith({ 'DESIGN.md': DESIGN })
    expect(found).toEqual([
      { file: 'DESIGN.md', line: 1, says: 'DESIGN.md has tokens, but no file is tagged `theme` to say where the code makes them.' },
    ])
  })

  it('holds the theme to DESIGN.md, token for token', async () => {
    const theme = THEME.replace('  --colors-paper: #fff;\n', '')
      .replace('--spacing-md: 16px', '--spacing-md: 12px')
      .replace('}', '  --colors-ink: #111;\n}')
    const found = await checkWith({ 'DESIGN.md': DESIGN, 'app/theme.css': theme })
    expect(found).toEqual([
      { file: 'app/theme.css', line: 1, says: 'The theme has no --colors-paper for colors.paper, which DESIGN.md has as #ffffff.' },
      { file: 'app/theme.css', line: 6, says: '--spacing-md is 12px here, but DESIGN.md has spacing.md as 16px.' },
      { file: 'app/theme.css', line: 8, says: '--colors-ink is not a token in DESIGN.md. Add it there, or take it out of the theme.' },
    ])
  })

  it('names a raw colour where a token belongs, and the token that has that value', async () => {
    const found = await checkWith({
      'DESIGN.md': DESIGN,
      'app/theme.css': THEME,
      'app/pages/styled.tsx': page(
        '// A colour in a comment, #abc, is not one.',
        "export const S = () => <b style={{ color: '#FFF', background: 'rgb(1, 2, 3)' }} />",
      ),
    })
    expect(found).toEqual([
      { file: 'app/pages/styled.tsx', line: 3, says: 'A raw colour, #FFF, where a token belongs: colors.paper is that colour, so use var(--colors-paper).' },
      { file: 'app/pages/styled.tsx', line: 3, says: 'A raw colour, rgb(1, 2, 3), where a token belongs. Add it to DESIGN.md, or use one it has.' },
    ])
  })

  it('names a raw space or corner where a token belongs, in styles and stylesheets', async () => {
    const found = await checkWith({
      'DESIGN.md': DESIGN,
      'app/theme.css': THEME,
      'app/pages/card.css': '/* codegraph: page styled */\n.card {\n  padding: 16px;\n  border-radius: 3px;\n  margin: 0;\n  width: 200px;\n}\n',
      'app/pages/styled.tsx': page("export const S = () => <b style={{ gap: '12px' }} />"),
    })
    expect(says(found)).toEqual([
      'A raw size, 16px, where a token belongs: spacing.md is that size, so use var(--spacing-md).',
      'A raw corner, 3px, where a token belongs. Add it to DESIGN.md, or use one it has.',
      'A raw size, 12px, where a token belongs. Add it to DESIGN.md, or use one it has.',
    ])
  })

  it('names code that skips a purpose token for the raw one under it', async () => {
    const found = await checkWith({
      'DESIGN.md': DESIGN,
      'app/theme.css': THEME,
      'app/pages/styled.tsx': page("export const S = () => <b style={{ color: 'var(--colors-blue-500)', background: 'var(--colors-paper)' }} />"),
    })
    expect(found).toEqual([
      {
        file: 'app/pages/styled.tsx',
        line: 2,
        says: 'It uses colors.blue-500, a raw token, where a token for what it is for belongs: colors.action names it.',
      },
    ])
  })

  it('lets an exception break the design system on purpose, and keeps why, apart', async () => {
    const found = await checkWith({
      'DESIGN.md': DESIGN,
      'app/theme.css': THEME,
      'app/pages/styled.tsx': page(
        "export const Logo = () => <b style={{ color: '#ff6600' }} /> // codegraph: exception the brand logo's own orange",
        '// codegraph: exception the map tiles come in this grey',
        "export const Tile = () => <b style={{ background: '#e5e5e5' }} />",
        "export const Odd = () => <b style={{ color: '#123456' }} /> // codegraph: exception",
      ),
    })
    expect(found).toEqual([
      { file: 'app/pages/styled.tsx', line: 2, says: 'A raw colour, #ff6600, where a token belongs. Add it to DESIGN.md, or use one it has.', onPurpose: "the brand logo's own orange" },
      { file: 'app/pages/styled.tsx', line: 4, says: 'A raw colour, #e5e5e5, where a token belongs. Add it to DESIGN.md, or use one it has.', onPurpose: 'the map tiles come in this grey' },
      { file: 'app/pages/styled.tsx', line: 5, says: 'An exception says why it breaks the design system, after `exception`.' },
      { file: 'app/pages/styled.tsx', line: 5, says: 'A raw colour, #123456, where a token belongs. Add it to DESIGN.md, or use one it has.' },
    ])
  })

  it('leaves colours alone in a repo with no DESIGN.md to hold them to', async () => {
    const found = await checkWith({ 'app/pages/styled.tsx': page("export const S = () => <b style={{ color: '#fff' }} />") })
    expect(found).toEqual([])
  })
})
