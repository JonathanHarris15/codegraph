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
