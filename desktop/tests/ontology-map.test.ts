// codegraph: test module reader
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adrFileFor, borrowTerm, checkAcross, checkRepo, live, readMap, termFileFor, writeAdr, writeTerm, type Adr, type Mismatch, type Term } from '../src/modules/reader/index.js'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''

beforeAll(() => {
  yard = openYard('ontology-map')
  repo = aMappedRepo(yard)
})

afterAll(() => closeYard(yard))

const put = (into: string, files: Record<string, string>): void => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(into, path)), { recursive: true })
    writeFileSync(join(into, path), text)
  }
}

/** Does something with some files added to the repo's live folder, then
 *  takes them away again. */
const withFiles = async <T>(files: Record<string, string>, act: () => Promise<T>): Promise<T> => {
  put(repo, files)
  try {
    return await act()
  } finally {
    for (const path of Object.keys(files)) rmSync(join(repo, path))
  }
}

const checkWith = (files: Record<string, string>): Promise<Mismatch[]> => withFiles(files, () => checkRepo(repo))
const says = (found: Mismatch[]): string[] => found.map((m) => m.says).sort()

const NOTE = [
  '---',
  'term: Note',
  'store: notes',
  'avoid: [memo, jotting]',
  '---',
  'Something a person writes down to keep.',
  '',
].join('\n')

/** An ADR's six sections, as the template lays them out, every one written. */
const SECTIONS = [
  '## Context',
  '',
  'Notes were saved from two places.',
  '',
  '## Decision',
  '',
  'Only the notes module writes notes.',
  '',
  '## Alternatives',
  '',
  '- **Each writer saves its own:** two copies of one rule.',
  '- **Do nothing:** notes go missing.',
  '',
  '## Evidence',
  '',
  'A note saved twice in the test data.',
  '',
  '## Consequences',
  '',
  '- **Good:** one place to save a note.',
  '- **Bad:** the nightly tidy must ask the module.',
  '- **Follow-up work:** move the tidy over.',
  '',
  '## Revisit when',
  '',
  'Notes are saved somewhere other than this app.',
  '',
].join('\n')

const ADR = (head: string[], title = '1. Notes are kept by one module', body = SECTIONS): string =>
  ['---', ...head, '---', `# ${title}`, '', body].join('\n')

const ACCEPTED = (...rules: string[]): string => ADR(['adr: 1', 'status: accepted', 'rules:', ...rules.map((r) => `  - ${r}`)])

/** The note term, as settled by ADR 1. */
const SETTLED_NOTE = NOTE.replace('avoid:', 'settled by: [1]\navoid:')

describe('reading the ontology map', () => {
  it("reads a repo's terms and ADRs from its codegraph folder", async () => {
    const map = await withFiles(
      {
        'codegraph/terms/note.md': SETTLED_NOTE,
        'codegraph/adr/0001-notes-are-kept-by-one-module.md': ADR([
          'adr: 1',
          'status: accepted',
          'date: 2026-11-04',
          'deciders: [Jonathan Harris]',
          'consulted: Claude, while planning notes',
          'area: backend',
          'related: [NOTES-12]',
          'terms: [Note]',
          'rules:',
          '  - only writer: { store: notes, by: module notes }',
          '  - never reaches: { from: page notes, to: trigger nightly-tidy }',
          '  - only through: { to: mailer, by: module notes }',
        ]),
      },
      () => readMap(repo, live),
    )
    expect(map.ontology.terms).toEqual([
      {
        name: 'Note',
        file: 'codegraph/terms/note.md',
        says: 'Something a person writes down to keep.',
        store: 'notes',
        pointsAt: [],
        avoid: ['memo', 'jotting'],
        settledBy: [1],
        sum: expect.stringMatching(/^[0-9a-f]{6}$/),
        borrowed: null,
      },
    ])
    expect(map.ontology.adrs).toEqual([
      {
        number: 1,
        title: 'Notes are kept by one module',
        file: 'codegraph/adr/0001-notes-are-kept-by-one-module.md',
        status: 'accepted',
        date: '2026-11-04',
        deciders: ['Jonathan Harris'],
        consulted: 'Claude, while planning notes',
        area: 'backend',
        related: ['NOTES-12'],
        replaces: [],
        terms: ['Note'],
        rules: [
          { kind: 'only writer', store: 'notes', by: 'module notes' },
          { kind: 'never reaches', from: 'page notes', to: 'trigger nightly-tidy' },
          { kind: 'only through', to: 'mailer', by: 'module notes' },
        ],
        context: 'Notes were saved from two places.',
        decision: 'Only the notes module writes notes.',
        alternatives: [
          { option: 'Each writer saves its own', whyNot: 'two copies of one rule.' },
          { option: 'Do nothing', whyNot: 'notes go missing.' },
        ],
        evidence: 'A note saved twice in the test data.',
        good: 'one place to save a note.',
        bad: 'the nightly tidy must ask the module.',
        followUp: 'move the tidy over.',
        revisit: 'Notes are saved somewhere other than this app.',
      },
    ])
  })

  it('reads how many of another term a term points at, and the words for it', async () => {
    const map = await withFiles(
      {
        'codegraph/terms/garment.md': [
          '---',
          'term: Garment',
          'points at:',
          '  - term: Wardrobe',
          '    how many: one',
          '    says: the wardrobe it hangs in',
          '  - term: Tag',
          '    how many: many',
          '---',
          'One piece of clothing.',
        ].join('\n'),
      },
      () => readMap(repo, live),
    )
    expect(map.ontology.terms[0]!.pointsAt).toEqual([
      { term: 'Wardrobe', howMany: 'one', says: 'the wardrobe it hangs in' },
      { term: 'Tag', howMany: 'many', says: '' },
    ])
  })

  it('reads where a borrowed term came from', async () => {
    const copy = borrowTerm(NOTE, 'acme/notes-api', 'a1b2c3d')
    const map = await withFiles({ 'codegraph/terms/note.md': copy }, () => readMap(repo, live))
    expect(map.ontology.terms[0]!.borrowed).toEqual({ from: 'acme/notes-api', commit: 'a1b2c3d', sum: expect.stringMatching(/^[0-9a-f]{6}$/) })
    expect(map.ontology.terms[0]!.says).toBe('Something a person writes down to keep.')
  })

  it('has an empty ontology map where there is no codegraph folder', async () => {
    expect((await readMap(repo, live)).ontology).toEqual({ terms: [], adrs: [] })
  })
})

describe('holding the code to its ADRs', () => {
  it('finds nothing wrong where the code keeps every rule', async () => {
    expect(
      await checkWith({
        'codegraph/terms/note.md': SETTLED_NOTE,
        'codegraph/adr/0001-notes.md': ACCEPTED(
          'only writer: { store: notes, by: module notes }',
          'never reaches: { from: page notes, to: feature write-note }',
          'only through: { to: mailer, by: module notes }',
        ),
      }),
    ).toEqual([])
  })

  it('names the ADR a reach breaks, where the code reaches', async () => {
    const found = await checkWith({
      'codegraph/adr/0001-notes.md': ACCEPTED('never reaches: { from: page new-note, to: feature write-note }'),
    })
    expect(found).toEqual([
      {
        file: 'app/pages/new-note.tsx',
        line: 2,
        says: 'Page new-note reaches feature write-note; ADR 1 says page new-note never reaches feature write-note.',
      },
    ])
  })

  it('holds every component of a kind to a rule that names the kind', async () => {
    const found = await checkWith({
      'codegraph/adr/0001-notes.md': ACCEPTED('never reaches: { from: any page, to: any feature }'),
    })
    expect(says(found)).toEqual([
      'Page new-note reaches feature write-note; ADR 1 says any page never reaches any feature.',
    ])
  })

  it('names a second way out to a system only one component may reach', async () => {
    const found = await checkWith({
      'codegraph/adr/0001-notes.md': ACCEPTED('only through: { to: mailer, by: module notes }'),
      'app/modules/alerts.ts': [
        '// codegraph: module alerts',
        "export const alert = () => fetch('https://mail.example') // codegraph: wire to mailer: sends an alert",
        '',
      ].join('\n'),
    })
    expect(found).toEqual([
      {
        file: 'app/modules/alerts.ts',
        line: 2,
        says: 'Module alerts calls mailer; ADR 1 says only module notes reaches mailer.',
      },
    ])
  })

  it('names a store kept by anything but the one module an ADR lets write it', async () => {
    const found = await checkWith({
      'codegraph/adr/0001-notes.md': ACCEPTED('only writer: { store: notes, by: module archive }'),
      'app/modules/archive.ts': '// codegraph: module archive\nexport const archive = 1\n',
    })
    expect(found).toEqual([
      { file: 'app/modules/notes.ts', line: 3, says: 'Module notes keeps notes; ADR 1 says only module archive writes it.' },
    ])
  })

  it('names a rule that points at nothing in the repo', async () => {
    const found = await checkWith({
      'codegraph/adr/0001-notes.md': ACCEPTED(
        'never reaches: { from: page notes, to: module billing }',
        'only writer: { store: payments, by: module notes }',
      ),
    })
    expect(says(found)).toEqual([
      'ADR 1 names module billing, which is not here.',
      'ADR 1 names the store payments, which is not here.',
    ])
  })

  it('holds the code only to accepted ADRs, and not to any an accepted one replaces', async () => {
    const breaks = 'never reaches: { from: page new-note, to: feature write-note }'
    const found = await checkWith({
      'codegraph/adr/0001-notes.md': ADR(['adr: 1', 'status: proposed', 'rules:', `  - ${breaks}`]),
      'codegraph/adr/0002-old.md': ADR(['adr: 2', 'status: replaced', 'rules:', `  - ${breaks}`], '2. Old'),
      'codegraph/adr/0003-older.md': ADR(['adr: 3', 'status: accepted', 'rules:', `  - ${breaks}`], '3. Older'),
      'codegraph/adr/0004-newer.md': ADR(['adr: 4', 'status: accepted', 'replaces: [3]'], '4. Newer'),
    })
    expect(found).toEqual([])
  })

  it('names each section an accepted ADR leaves out or empty, and lets a proposed one be half written', async () => {
    const half = ['## Context', '', 'Notes were saved from two places.', '', '## Decision', '', 'Only the notes module writes notes.', '', '## Evidence', '', ''].join('\n')
    const found = await checkWith({
      'codegraph/adr/0001-notes.md': ADR(['adr: 1', 'status: accepted'], '1. Notes are kept by one module', half),
      'codegraph/adr/0002-more.md': ADR(['adr: 2', 'status: proposed'], '2. More notes', half),
    })
    expect(found.map((m) => [m.file, m.says])).toEqual([
      ['codegraph/adr/0001-notes.md', 'ADR 1 is accepted but has no Alternatives, Evidence, Consequences or Revisit when. An accepted ADR fills in every section of the template.'],
    ])
  })

  it('names an ADR with no status it knows, a rule it cannot read, and a number taken twice', async () => {
    const found = await checkWith({
      'codegraph/adr/0001-a.md': ADR(['adr: 1', 'status: maybe', 'rules:', '  - always smiles: { at: page notes }']),
      'codegraph/adr/0001-b.md': ADR(['adr: 1', 'status: accepted'], '1. Again'),
    })
    expect(says(found)).toEqual([
      'ADR 1 has a rule codegraph cannot read: always smiles. A rule is never reaches, only through or only writer.',
      'ADR 1 is numbered the same as codegraph/adr/0001-a.md.',
      'ADR 1 says its status is maybe; it is proposed, accepted or replaced.',
    ])
  })
})

describe('holding the code to its terms', () => {
  const WARDROBE = {
    'app/modules/wardrobe.ts': [
      '// codegraph: module wardrobe',
      '// codegraph: store garments in db from garments.schema.json',
      '// codegraph: store wardrobes in db from wardrobes.schema.json',
      '// codegraph: store categories in db from categories.schema.json',
      'export const wardrobe = 1',
      '',
    ].join('\n'),
    'app/modules/garments.schema.json': JSON.stringify({
      type: 'object',
      additionalProperties: false,
      required: ['wardrobeId'],
      properties: {
        wardrobeId: { type: 'string', pointsAt: 'wardrobes', description: 'the wardrobe it hangs in' },
        categoryIds: { type: 'array', items: { type: 'string', pointsAt: 'categories' } },
      },
    }),
    'app/modules/wardrobes.schema.json': JSON.stringify({ type: 'object', additionalProperties: false, properties: {} }),
    'app/modules/categories.schema.json': JSON.stringify({ type: 'object', additionalProperties: false, properties: {} }),
  }
  const term = (name: string, store: string, ...rest: string[]): string =>
    ['---', `term: ${name}`, `store: ${store}`, ...rest, '---', `A ${name.toLowerCase()}.`].join('\n')

  it('finds nothing wrong where every store points as its term says', async () => {
    const found = await checkWith({
      ...WARDROBE,
      'codegraph/terms/garment.md': term(
        'Garment',
        'garments',
        'points at:',
        '  - { term: Wardrobe, how many: one }',
        '  - { term: Category, how many: many }',
      ),
      'codegraph/terms/wardrobe.md': term('Wardrobe', 'wardrobes'),
      'codegraph/terms/category.md': term('Category', 'categories'),
    })
    expect(found).toEqual([])
  })

  it("names a store whose shape does not point the way its term says", async () => {
    const found = await checkWith({
      ...WARDROBE,
      'codegraph/terms/garment.md': term(
        'Garment',
        'garments',
        'points at:',
        '  - { term: Wardrobe, how many: many }',
        '  - { term: Category, how many: one }',
        '  - { term: Note, how many: none or one }',
      ),
      'codegraph/terms/wardrobe.md': term('Wardrobe', 'wardrobes'),
      'codegraph/terms/category.md': term('Category', 'categories'),
      'codegraph/terms/note.md': term('Note', 'notes'),
    })
    expect(says(found)).toEqual([
      'Garment points at Note, but no field of garments points at notes.',
      'Garment points at many Wardrobes, but garments.wardrobeId holds only one.',
      'Garment points at one Category, but garments.categoryIds holds a list.',
    ])
  })

  it('names a term whose store, linked term or ADR is not there', async () => {
    const found = await checkWith({
      'codegraph/terms/garment.md': term('Garment', 'garments', 'settled by: [7]', 'points at:', '  - { term: Wardrobe, how many: one }'),
      'codegraph/adr/0001-notes.md': ADR(['adr: 1', 'status: accepted', 'terms: [Outfit]']),
    })
    expect(says(found)).toEqual([
      'ADR 1 names the term Outfit, which is not here.',
      'Garment is kept in the store garments, which is not here.',
      'Garment points at the term Wardrobe, which is not here.',
      'Garment says it is settled by ADR 7, which is not here.',
    ])
  })

  it('names a term defined twice in one repo', async () => {
    const found = await checkWith({ 'codegraph/terms/note.md': NOTE, 'codegraph/terms/notes.md': NOTE })
    expect(says(found)).toEqual(['Note is defined in codegraph/terms/note.md too.'])
  })

  it('names a component, store or field called by one of its avoid words', async () => {
    const found = await checkWith({
      'codegraph/terms/note.md': NOTE,
      'app/modules/memos.ts': [
        '// codegraph: module memos',
        '// codegraph: store jottings in db from jottings.schema.json',
        'export const memos = 1',
        '',
      ].join('\n'),
      'app/modules/jottings.schema.json': JSON.stringify({
        type: 'object',
        additionalProperties: false,
        properties: { memoText: { type: 'string' } },
      }),
    })
    expect(says(found)).toEqual([
      'Module memos says "memo"; the term is Note.',
      'The field memoText of jottings says "memo"; the term is Note.',
      'The store jottings says "jotting"; the term is Note.',
    ])
  })
})

describe('borrowed terms', () => {
  it('finds nothing wrong with a copy as codegraph wrote it', async () => {
    const found = await checkWith({ 'codegraph/terms/note.md': borrowTerm(NOTE, 'acme/notes-api', 'a1b2c3d') })
    expect(found).toEqual([])
  })

  it('does not hold this repo to the shape a borrowed term has in its own', async () => {
    const copy = borrowTerm(NOTE.replace('store: notes', 'store: somewhere-else'), 'acme/notes-api', 'a1b2c3d')
    expect(await checkWith({ 'codegraph/terms/note.md': copy })).toEqual([])
  })

  it('names a copy someone has edited by hand', async () => {
    const copy = borrowTerm(NOTE, 'acme/notes-api', 'a1b2c3d').replace('to keep', 'to remember')
    const found = await checkWith({ 'codegraph/terms/note.md': copy })
    expect(found).toEqual([
      {
        file: 'codegraph/terms/note.md',
        line: 1,
        says: 'Note was borrowed from acme/notes-api and has been edited since. Borrow it again rather than changing the copy.',
      },
    ])
  })

  it('still holds the code to the avoid words of a borrowed term', async () => {
    const found = await checkWith({
      'codegraph/terms/note.md': borrowTerm(NOTE, 'acme/notes-api', 'a1b2c3d'),
      'app/modules/memos.ts': '// codegraph: module memos\nexport const memos = 1\n',
    })
    expect(says(found)).toEqual(['Module memos says "memo"; the term is Note.'])
  })
})

describe("checking across a project's repos", () => {
  const term = (says: string): string => `---\nterm: Address\navoid: [location]\n---\n${says}\n`

  /** The notes repo calls mailer, so the two reach each other. */
  const twoRepos = async (mailerFiles: Record<string, string>, notesFiles: Record<string, string>) => {
    const mailer = aMappedRepo(yard, `mailer-${Math.random().toString(36).slice(2, 8)}`)
    put(mailer, mailerFiles)
    const read = await withFiles(notesFiles, () => readMap(repo, live))
    return checkAcross([
      { address: 'acme/mailer', map: await readMap(mailer, live) },
      { address: 'acme/notes', map: read },
    ])
  }

  it('finds nothing wrong with a copy of the term as its defining repo has it now', async () => {
    const defined = term('Where a letter goes.')
    const found = await twoRepos(
      { 'codegraph/terms/address.md': defined },
      { 'codegraph/terms/address.md': borrowTerm(defined, 'acme/mailer', 'a1b2c3d') },
    )
    expect(found).toEqual([])
  })

  it('names a copy the defining repo has moved on from', async () => {
    const found = await twoRepos(
      { 'codegraph/terms/address.md': term('Where a letter or a parcel goes.') },
      { 'codegraph/terms/address.md': borrowTerm(term('Where a letter goes.'), 'acme/mailer', 'a1b2c3d') },
    )
    expect(found).toEqual([
      {
        address: 'acme/notes',
        mismatch: {
          file: 'codegraph/terms/address.md',
          line: 1,
          says: 'Address has changed in acme/mailer since a1b2c3d. Borrow it again.',
        },
      },
    ])
  })

  it('names a copy whose term is gone from the repo it was borrowed from', async () => {
    const found = await twoRepos({}, { 'codegraph/terms/address.md': borrowTerm(term('Where a letter goes.'), 'acme/mailer', 'a1b2c3d') })
    expect(found.map((f) => f.mismatch.says)).toEqual(['Address was borrowed from acme/mailer, which no longer defines it.'])
  })

  it('names a term two repos both define when one reaches the other', async () => {
    const found = await twoRepos(
      { 'codegraph/terms/address.md': term('Where a letter goes.') },
      { 'codegraph/terms/address.md': term('Where a note is sent.') },
    )
    expect(found.map((f) => [f.address, f.mismatch.says])).toEqual([
      ['acme/notes', 'Address is defined in acme/mailer too, which this repo reaches. Borrow it from one of them.'],
    ])
  })

  it('lets two repos that never reach each other each have a term of the same name', async () => {
    const elsewhere = aMappedRepo(yard, 'elsewhere')
    put(elsewhere, { 'codegraph/terms/address.md': term('Where a parcel goes.') })
    const found = await withFiles({ 'codegraph/terms/address.md': term('Where a note is sent.') }, async () =>
      checkAcross([
        { address: 'acme/elsewhere', map: await readMap(elsewhere, live) },
        { address: 'acme/notes', map: await readMap(repo, live) },
      ]),
    )
    expect(found).toEqual([])
  })
})

describe('writing terms and ADRs back to their files', () => {
  it('names a term’s file for the term, and an ADR’s for its number and title', () => {
    expect(termFileFor('Garment Care')).toBe('codegraph/terms/garment-care.md')
    expect(adrFileFor(4, 'A garment belongs to one wardrobe')).toBe('codegraph/adr/0004-a-garment-belongs-to-one-wardrobe.md')
  })

  it('writes a term that reads back as it was, words with colons and all', async () => {
    const term: Omit<Term, 'file' | 'sum' | 'borrowed'> = {
      name: 'Garment',
      says: 'One piece of clothing: a pair of socks is one garment.',
      store: 'garments',
      pointsAt: [
        { term: 'Wardrobe', howMany: 'one', says: 'the wardrobe it hangs in' },
        { term: 'Category', howMany: 'many', says: '' },
      ],
      avoid: ['item', 'piece'],
      settledBy: [4],
    }
    const map = await withFiles({ [termFileFor('Garment')]: writeTerm(term) }, () => readMap(repo, live))
    expect(map.ontology.terms[0]).toEqual({ ...term, file: 'codegraph/terms/garment.md', sum: expect.any(String), borrowed: null })
  })

  it('writes an ADR on the template that reads back as it was', async () => {
    const adr: Omit<Adr, 'file'> = {
      number: 4,
      title: 'A garment belongs to one wardrobe',
      status: 'accepted',
      date: '2026-11-04',
      deciders: ['Jonathan Harris'],
      consulted: 'Claude, while planning: closet browsing',
      area: 'backend',
      related: ['WARD-38'],
      replaces: [2],
      terms: ['Garment'],
      rules: [{ kind: 'only writer', store: 'garments', by: 'module wardrobe' }],
      context: 'Garments were written from three places.\n\nTwo could disagree.',
      decision: 'One wardrobe per garment.',
      alternatives: [{ option: 'Many wardrobes', whyNot: 'every count would need to say which.' }],
      evidence: 'Two garments in two wardrobes.',
      good: 'One place to move a garment.',
      bad: 'Sharing means a copy.',
      followUp: 'Route the import through it.',
      revisit: 'When people ask to share.',
    }
    const file = adrFileFor(4, adr.title)
    const map = await withFiles({ [file]: writeAdr(adr) }, () => readMap(repo, live))
    expect(map.ontology.adrs[0]).toEqual({ ...adr, file })
  })
})
