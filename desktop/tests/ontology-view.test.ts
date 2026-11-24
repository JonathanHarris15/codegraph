// codegraph: test feature show-ontology
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { borrow } from '../src/features/borrow-term.js'
import { commitOntology } from '../src/features/commit-ontology.js'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { saveAdr, saveTerm } from '../src/features/save-ontology.js'
import { showOntology } from '../src/features/show-ontology.js'
import { useChooser } from '../src/modules/machine/index.js'
import { findProject, useFolder } from '../src/modules/projects/index.js'
import type { Adr } from '../src/modules/reader/index.js'
import { aMappedRepo, closeYard, git, openYard, type Yard } from './yard.js'

/** The ontology map in the app: a project's terms and ADRs read from each of
 *  its repos on this computer, written back as files on a branch, shown as a
 *  diff and committed (ADRs 0035, 0038). */
let yard: Yard
let api = ''
let web = ''
let projectId = ''
const systemOf = (path: string): string => findProject(projectId)!.systems.find((s) => s.path === path)!.id

const NOTE = '---\nterm: Note\nstore: notes\navoid: [memo]\n---\nSomething a person writes down to keep.\n'

const blankAdr = (number: number, title: string): Omit<Adr, 'file'> => ({
  number,
  title,
  status: 'proposed',
  date: '',
  deciders: [],
  consulted: '',
  area: '',
  related: [],
  replaces: [],
  terms: [],
  rules: [],
  context: '',
  decision: '',
  alternatives: [],
  evidence: '',
  good: '',
  bad: '',
  followUp: '',
  revisit: '',
})

beforeEach(async () => {
  yard = openYard('ontology-view')
  useFolder(yard.home)
  useChooser(async () => '')
  api = aMappedRepo(yard, 'api')
  web = aMappedRepo(yard, 'web')
  mkdirSync(join(api, 'codegraph', 'terms'), { recursive: true })
  writeFileSync(join(api, 'codegraph', 'terms', 'note.md'), NOTE)
  git(api, 'add', '-A')
  git(api, 'commit', '-q', '-m', 'Note is a term')
  projectId = (await createProject('Notes')).id
  await linkSoftwareSystem(projectId, api)
  await linkSoftwareSystem(projectId, web)
})

afterEach(() => closeYard(yard))

describe("showing a project's ontology map", () => {
  it("reads each repo's terms and ADRs, and what is not committed yet", async () => {
    writeFileSync(join(api, 'codegraph', 'terms', 'pin.md'), '---\nterm: Pin\n---\nA note kept on top.\n')
    const shown = await showOntology(projectId)
    expect(shown.repos.map((r) => [r.name, r.terms.map((t) => t.name)])).toEqual([
      ['api', ['Note', 'Pin']],
      ['web', []],
    ])
    expect(shown.repos[0]!.changes.map((c) => [c.file, c.state])).toEqual([['codegraph/terms/pin.md', 'added']])
    expect(shown.repos[0]!.here).toBe(true)
  })

  it('puts what the check finds beside the term or decision it is about', async () => {
    writeFileSync(join(api, 'app', 'modules', 'memos.ts'), '// codegraph: module memos\nexport const memos = 1\n')
    writeFileSync(join(api, 'codegraph', 'terms', 'pin.md'), '---\nterm: Pin\nsettled by: [9]\n---\nA pin.\n')
    const findings = (await showOntology(projectId)).repos[0]!.findings
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ about: 'term:Note', says: 'Module memos says "memo"; the term is Note.' }),
        expect.objectContaining({ about: 'term:Pin', says: 'Pin says it is settled by ADR 9, which is not here.' }),
      ]),
    )
  })

  it('finds a borrowed copy gone stale, beside the copy', async () => {
    await borrow(web, 'Note')
    writeFileSync(join(api, 'codegraph', 'terms', 'note.md'), NOTE.replace('to keep', 'to remember'))
    const web_ = (await showOntology(projectId)).repos[1]!
    expect(web_.terms[0]!.borrowed?.from).toBe('api')
    expect(web_.findings.map((f) => [f.about, f.says.split('.')[0]])).toEqual([['term:Note', 'Note has changed in api since ' + git(api, 'rev-parse', '--short=7', 'HEAD')]])
  })
})

describe('writing the ontology map from the app', () => {
  it('writes a term on a branch of its own, never on the main line', async () => {
    const done = await saveTerm(projectId, systemOf(web), { name: 'Pin', says: 'A note kept on top.', store: '', pointsAt: [], avoid: ['sticky'], settledBy: [] })
    expect(done).toEqual({ ok: true, branch: 'ontology', file: 'codegraph/terms/pin.md', problem: '' })
    expect(git(web, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('ontology')
    expect((await showOntology(projectId)).repos[1]!.terms[0]).toEqual(
      expect.objectContaining({ name: 'Pin', says: 'A note kept on top.', avoid: ['sticky'] }),
    )
  })

  it('moves the file when a term is renamed', async () => {
    await saveTerm(projectId, systemOf(web), { name: 'Pin', says: 'x', store: '', pointsAt: [], avoid: [], settledBy: [] })
    await saveTerm(projectId, systemOf(web), { name: 'Pinned note', says: 'x', store: '', pointsAt: [], avoid: [], settledBy: [] }, 'Pin')
    expect(existsSync(join(web, 'codegraph', 'terms', 'pin.md'))).toBe(false)
    expect(existsSync(join(web, 'codegraph', 'terms', 'pinned-note.md'))).toBe(true)
  })

  it('will not change a borrowed copy', async () => {
    await borrow(web, 'Note')
    const done = await saveTerm(projectId, systemOf(web), { name: 'Note', says: 'changed', store: '', pointsAt: [], avoid: [], settledBy: [] })
    expect(done.ok).toBe(false)
    expect(done.problem).toBe('Note is borrowed from api. Change it there, then borrow it again.')
  })

  it('writes an ADR on the template, and moves its file when its title changes', async () => {
    await saveAdr(projectId, systemOf(web), blankAdr(1, 'Notes are kept once'))
    await saveAdr(projectId, systemOf(web), { ...blankAdr(1, 'A note is kept once'), context: 'Notes were saved twice.' })
    expect(existsSync(join(web, 'codegraph', 'adr', '0001-notes-are-kept-once.md'))).toBe(false)
    const text = readFileSync(join(web, 'codegraph', 'adr', '0001-a-note-is-kept-once.md'), 'utf8')
    expect(text).toContain('## Context\n\nNotes were saved twice.')
    expect((await showOntology(projectId)).repos[1]!.adrs[0]).toEqual(expect.objectContaining({ number: 1, title: 'A note is kept once' }))
  })

  it('commits what changed in codegraph/ and nothing else, and says so', async () => {
    await saveTerm(projectId, systemOf(web), { name: 'Pin', says: 'x', store: '', pointsAt: [], avoid: [], settledBy: [] })
    writeFileSync(join(web, 'app', 'loose.ts'), '// codegraph: tooling\n')
    const done = await commitOntology(projectId, systemOf(web), 'Pin is a term')
    expect(done.ok).toBe(true)
    expect(git(web, 'log', '-1', '--format=%s')).toBe('Pin is a term')
    expect((await showOntology(projectId)).repos[1]!.changes).toEqual([])
    expect(git(web, 'status', '--porcelain')).toContain('app/loose.ts')
  })

  it('says there is nothing to commit', async () => {
    expect(await commitOntology(projectId, systemOf(web), 'Nothing')).toEqual({ ok: false, commit: '', problem: 'Nothing in codegraph/ has changed since the last commit.' })
  })
})
