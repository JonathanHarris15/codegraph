// codegraph: test module repo
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changesIn, commitFolder, fileAtHead, leaveMainLine, writeWorkingFile } from '../src/modules/repo/index.js'
import { aMappedRepo, closeYard, git, openYard, type Yard } from './yard.js'

/** What the ontology map writes in a working copy, how it shows as a diff to
 *  commit, and committing just that (ADR 0035). */
let yard: Yard
let repo = ''

beforeEach(() => {
  yard = openYard('repo-folder')
  repo = aMappedRepo(yard)
})

afterEach(() => closeYard(yard))

describe('writing in a folder of a working copy', () => {
  it('writes a file in a folder that is not there yet, whole', () => {
    writeWorkingFile(repo, 'codegraph/terms/note.md', '---\nterm: Note\n---\nA note.\n')
    expect(readFileSync(join(repo, 'codegraph/terms/note.md'), 'utf8')).toBe('---\nterm: Note\n---\nA note.\n')
  })

  it('reads a file as the last commit has it, last newline and all, or nothing', async () => {
    writeWorkingFile(repo, 'codegraph/terms/note.md', 'A note.\n')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'note')
    expect(await fileAtHead(repo, 'codegraph/terms/note.md')).toBe('A note.\n')
    expect(await fileAtHead(repo, 'codegraph/terms/nothing.md')).toBe('')
  })
})

describe('the changes in a folder, as a diff to commit', () => {
  it('lists each new, changed and removed file in it, with its lines', async () => {
    writeWorkingFile(repo, 'codegraph/terms/note.md', 'A note.\n')
    writeWorkingFile(repo, 'codegraph/terms/pin.md', 'A pin.\n')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'terms')
    writeWorkingFile(repo, 'codegraph/terms/note.md', 'A note kept.\n')
    git(repo, 'rm', '-q', 'codegraph/terms/pin.md')
    writeWorkingFile(repo, 'codegraph/adr/0001-one.md', '# 1. One\n')
    writeWorkingFile(repo, 'app/elsewhere.ts', '// codegraph: tooling\n')

    const changes = await changesIn(repo, 'codegraph')
    expect(changes.map((c) => [c.file, c.state])).toEqual([
      ['codegraph/adr/0001-one.md', 'added'],
      ['codegraph/terms/note.md', 'changed'],
      ['codegraph/terms/pin.md', 'removed'],
    ])
    expect(changes[0]!.lines).toEqual([{ kind: 'added', text: '# 1. One' }])
    expect(changes[1]!.lines.filter((l) => l.kind !== 'same')).toEqual([
      { kind: 'removed', text: 'A note.' },
      { kind: 'added', text: 'A note kept.' },
    ])
  })

  it('has none when nothing in it has changed', async () => {
    expect(await changesIn(repo, 'codegraph')).toEqual([])
  })
})

describe('committing a folder', () => {
  it('commits what changed in the folder and nothing else', async () => {
    writeWorkingFile(repo, 'codegraph/terms/note.md', 'A note.\n')
    writeWorkingFile(repo, 'app/elsewhere.ts', '// codegraph: tooling\n')
    const sha = await commitFolder(repo, 'codegraph', 'Note is a term')
    expect(sha).toMatch(/^[0-9a-f]{7,}$/)
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('Note is a term')
    expect(git(repo, 'show', '--name-only', '--format=', 'HEAD')).toBe('codegraph/terms/note.md')
    expect(git(repo, 'status', '--porcelain')).toContain('app/elsewhere.ts')
  })

  it('commits nothing when nothing in the folder changed', async () => {
    expect(await commitFolder(repo, 'codegraph', 'Nothing')).toBe('')
  })
})

describe('leaving the main line before a change', () => {
  it('starts a branch of a free name and moves onto it when on the main line', async () => {
    git(repo, 'branch', 'ontology/terms')
    expect(await leaveMainLine(repo, 'ontology/terms')).toBe('ontology/terms-2')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('ontology/terms-2')
  })

  it('stays on a branch that is not the main line', async () => {
    git(repo, 'switch', '-q', '-c', 'my-work')
    expect(await leaveMainLine(repo, 'ontology/terms')).toBe('my-work')
    expect(existsSync(join(repo, '.git'))).toBe(true)
  })

  it('keeps what was not committed, on the new branch', async () => {
    writeFileSync(join(repo, 'loose.txt'), 'kept')
    await leaveMainLine(repo, 'ontology/terms')
    expect(readFileSync(join(repo, 'loose.txt'), 'utf8')).toBe('kept')
  })
})
