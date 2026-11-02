// codegraph: tooling
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

/** A scratch yard for a test: real folders, real git, thrown away after. */
export type Yard = { path: string; home: string }

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()

export const openYard = (what: string): Yard => {
  const path = mkdtempSync(join(tmpdir(), `codegraph-${what}-`))
  const home = join(path, 'home')
  mkdirSync(home)
  return { path, home }
}

export const closeYard = (yard: Yard): void => {
  rmSync(yard.path, { recursive: true, force: true })
}

/** A repo on this computer, set up for codegraph as far as it is told to be. */
export const aSoftwareSystem = (
  yard: Yard,
  name: string,
  { setUp = false, remote = '' } = {},
): string => {
  const path = join(yard.path, name)
  mkdirSync(path, { recursive: true })
  git(path, 'init', '--initial-branch=main')
  git(path, 'config', 'user.email', 'test@example.com')
  git(path, 'config', 'user.name', 'Test')
  writeFileSync(
    join(path, 'thing.ts'),
    setUp ? '// codegraph: module thing\n' : 'export const a = 1\n',
  )
  if (setUp) {
    mkdirSync(join(path, '.claude'), { recursive: true })
    writeFileSync(
      join(path, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'codegraph@codegraph': true } }),
    )
    writeFileSync(join(path, 'CLAUDE.md'), '# thing\n\nIt follows the codegraph rules.\n')
  }
  git(path, 'add', '-A')
  git(path, 'commit', '-m', 'first')
  if (remote) git(path, 'remote', 'add', 'origin', `https://github.com/${remote}.git`)
  return path
}

/** Stands in for GitHub: each path fragment gets a status and a body. */
export const githubAnswers = (
  replies: Record<string, { status: number; body: unknown }>,
): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const match = Object.keys(replies).find((path) => url.includes(path))
      const reply = match ? replies[match] : undefined
      if (!reply) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify(reply.body), { status: reply.status })
    }),
  )
}

export const aGithubRepo = (fullName: string) => ({
  full_name: fullName,
  name: fullName.split('/')[1],
  owner: { login: fullName.split('/')[0] },
  default_branch: 'main',
  pushed_at: '2026-01-01T00:00:00Z',
  private: false,
  html_url: `https://github.com/${fullName}`,
  clone_url: `https://github.com/${fullName}.git`,
})

/** What GitHub returns for a repo whose Claude settings name codegraph. */
export const codegraphSettings = {
  status: 200,
  body: {
    encoding: 'base64',
    content: Buffer.from(
      JSON.stringify({ enabledPlugins: { 'codegraph@codegraph': true } }),
    ).toString('base64'),
  },
}

const put = (root: string, files: Record<string, string>): void => {
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, text)
  }
}

/** A small notes app set up for the new codegraph (ADR 0008), written by
 *  hand: a browser app and a database, a page that leads to another, and a
 *  call out to a mailer. Main has it; a branch adds a search page. */
export const aMappedRepo = (yard: Yard, name = 'notes'): string => {
  const path = join(yard.path, name)
  mkdirSync(path, { recursive: true })
  git(path, 'init', '--initial-branch=main')
  git(path, 'config', 'user.email', 'test@example.com')
  git(path, 'config', 'user.name', 'Test')
  put(path, {
    'codegraph.config.json': JSON.stringify({
      projects: ['notes-app'],
      containers: {
        web: { kind: 'browser app', says: 'Where people keep their notes', folders: ['app'] },
        db: { kind: 'database', says: 'Keeps every note' },
      },
    }),
    'tsconfig.json': '{\n  // comments are allowed here\n  "compilerOptions": { "paths": { "~/*": ["./app/*"] } }\n}\n',
    'app/modules/notes.ts': [
      '// codegraph: module notes',
      '// codegraph: front door saveNote, listNotes, Note',
      '// codegraph: store notes in db',
      'export type Note = { id: string; text: string }',
      'export const saveNote = (text: string): Note => ({ id: "1", text })',
      'export const listNotes = (): Note[] => []',
      '',
    ].join('\n'),
    'app/features/write-note.ts': [
      '// codegraph: feature write-note uses notes',
      "import { saveNote } from '~/modules/notes' // codegraph: wire keeps the note",
      'export const writeNote = (text: string) => saveNote(text)',
      '',
    ].join('\n'),
    'app/pages/notes.tsx': [
      '// codegraph: start page notes at /',
      "import { listNotes } from '../modules/notes.js' // codegraph: wire lists the notes",
      'export function NotesPage() {',
      "  return <a href=\"/notes/new\">{listNotes().length}</a>",
      '}',
      '',
    ].join('\n'),
    'app/pages/new-note.tsx': [
      '// codegraph: page new-note at /notes/new',
      "import { writeNote } from '../features/write-note' // codegraph: wire saves what was typed",
      'export function NewNotePage() {',
      "  fetch('https://mail.example') // codegraph: wire to mailer: tells the owner",
      "  return <button onClick={() => writeNote('hi')}>Save</button>",
      '}',
      '',
    ].join('\n'),
    'app/triggers/nightly.ts': [
      '// codegraph: trigger nightly-tidy schedule',
      "import { writeNote } from '../features/write-note'",
      "export const tidy = () => writeNote('')",
      '',
    ].join('\n'),
    'test/write-note.test.ts': "// codegraph: test feature write-note\nexport const nothing = 0\n",
  })
  git(path, 'add', '-A')
  git(path, 'commit', '-m', 'notes')

  git(path, 'checkout', '-q', '-b', 'add-search')
  put(path, { 'app/pages/search.tsx': '// codegraph: page search at /search\nexport const Search = () => null\n' })
  git(path, 'add', '-A')
  git(path, 'commit', '-m', 'add a search page')
  git(path, 'checkout', '-q', 'main')
  return path
}
