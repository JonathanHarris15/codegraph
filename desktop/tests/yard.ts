// codegraph: tooling
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ElectronApplication } from 'playwright'
import { vi } from 'vitest'
import { useFolder as useAnnotationsFolder } from '../src/modules/annotations/index.js'
import { useFolder as useArrangementsFolder } from '../src/modules/arrangements/index.js'
import { useFolder as useCardTypesFolder } from '../src/modules/card-types/index.js'
import type { Member } from '../src/modules/cloud/index.js'
import { saveToken, useFolder as useGithubFolder } from '../src/modules/github/index.js'
import { rememberMember, useFolder as useMembersFolder } from '../src/modules/members/index.js'
import { useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import { useMirrors } from '../src/modules/repo/index.js'
import { useFolder as useSketchesFolder } from '../src/modules/sketches/index.js'
import { useFolder as useSyncFolder } from '../src/modules/sync/index.js'

/** A scratch yard for a test: real folders, real git, thrown away after. */
export type Yard = { path: string; home: string }

/** Another program reading every file under a folder, over and over, as fast
 *  as it can: the other window, polling. On Windows a file open for reading
 *  cannot be written over for that moment. Hands back how to stop it. */
export const aReaderOf = async (folder: string): Promise<() => void> => {
  const reader = spawn(process.execPath, ['-e', READ_EVERYTHING, folder], { stdio: 'ignore' })
  await new Promise((go) => setTimeout(go, 300))
  return () => reader.kill()
}

const READ_EVERYTHING = `
const { readdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const walk = (dir) => {
  let names = []
  try { names = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const one of names) {
    const path = join(dir, one.name)
    if (one.isDirectory()) walk(path)
    else try { readFileSync(path) } catch {}
  }
}
for (;;) walk(process.argv[1])
`

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

/** Opens the real app for a page test, in a window a person cannot touch: see
 *  hands-off-window.cjs. Playwright is only loaded by the tests that ask. */
export const openTheApp = async (home: string, env: Record<string, string> = {}): Promise<ElectronApplication> => {
  const { _electron: electron } = await import('playwright')
  const tests = import.meta.dirname
  return electron.launch({
    args: ['-r', join(tests, 'hands-off-window.cjs'), '.', `--user-data-dir=${home}`],
    cwd: resolve(tests, '..'),
    env: { ...process.env, ...env } as Record<string, string>,
  })
}

/** A second name for a folder: a symbolic link, a junction on Windows, which
 *  needs no special rights there. */
export const aLinkTo = (yard: Yard, folder: string, name = 'link'): string => {
  const link = join(yard.path, name)
  symlinkSync(folder, link, 'junction')
  return link
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
  if (setUp)
    writeFileSync(
      join(path, 'codegraph.config.json'),
      JSON.stringify({ projects: [name], containers: { app: { kind: 'command-line tool', folders: [''] } } }),
    )
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

/** What GitHub returns for a repo set up for codegraph: its config. */
export const codegraphConfig = {
  status: 200,
  body: {
    encoding: 'base64',
    content: Buffer.from(JSON.stringify({ projects: ['mosaic'], containers: {} })).toString('base64'),
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
      "export const tellOwner = () => fetch('https://mail.example') // codegraph: wire to mailer: tells the owner",
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
      "  return <button onClick={() => writeNote('hi')}>Save</button>",
      '}',
      '',
    ].join('\n'),
    'app/triggers/nightly.ts': [
      '// codegraph: trigger nightly-tidy schedule',
      "import { writeNote } from '../features/write-note' // codegraph: wire clears out empty notes",
      "export const tidy = () => writeNote('')",
      '',
    ].join('\n'),
    'test/write-note.test.ts': "// codegraph: test feature write-note\nexport const nothing = 0\n",
    'vitest.config.ts': '// codegraph: tooling\nexport default {}\n',
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

/** The built codegraph MCP, started the way an agent starts it, in the
 *  folder the agent works in. Tests call its tools as an agent would. */
export const anAgentIn = async (folder: string, home = '') => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
  const server = join(import.meta.dirname, '..', 'out', 'main', 'mcp.js')
  const client = new Client({ name: 'test-agent', version: '0' })
  // A home of its own, when given, stands in for where the app keeps its files.
  const env = { ...(process.env as Record<string, string>), ...(home ? { CODEGRAPH_HOME: home } : {}) }
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server], cwd: folder, env }))
  const call = async (tool: string, args: Record<string, unknown> = {}): Promise<string> => {
    const answer = (await client.callTool({ name: tool, arguments: args })) as { content: { text: string }[] }
    return answer.content.map((c) => c.text).join('\n')
  }
  return { client, call, close: () => client.close() }
}

/** The built MCP's check, run from a terminal the way CI would. */
export const checkFromTerminal = (folder: string): { code: number; said: string } => {
  const server = join(import.meta.dirname, '..', 'out', 'main', 'mcp.js')
  try {
    return { code: 0, said: execFileSync(process.execPath, [server, 'check', folder], { encoding: 'utf8' }) }
  } catch (failed) {
    const { status, stdout } = failed as { status: number; stdout: string }
    return { code: status, said: stdout }
  }
}

/** A real, tiny picture: one blue pixel, as a PNG. */
export const aPicture = (): Buffer =>
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )

/** Writes a proposal into a repo's live folder, the way a person drawing on
 *  the canvas or an agent would, and its mockups beside it. */
export const aProposal = (repo: string, proposal: Record<string, unknown>, pictures: string[] = []): void => {
  put(repo, { 'codegraph-proposal/proposal.json': JSON.stringify(proposal, null, 2) })
  for (const name of pictures) writeFileSync(join(repo, 'codegraph-proposal', name), aPicture())
}

/** Writes files into a repo's live folder, as an agent building would. */
export const writeInto = (repo: string, files: Record<string, string>): void => put(repo, files)

/** The proposal on search, used across the proposal tests: a search page
 *  that asks a new feature, which reads the notes; the nightly tidy crossed out. */
export const searchProposal = (base: string) => ({
  says: 'Let people search their notes',
  sketch: '',
  base,
  components: [
    { container: 'web', kind: 'page', name: 'search', says: 'Finds a note by its words', at: '/search', mockup: 'search.png' },
    { container: 'web', kind: 'feature', name: 'find-notes', says: 'Looks through the notes', at: '', mockup: '' },
    { container: 'web', kind: 'trigger', name: 'nightly-tidy', says: '', at: '', mockup: '', gone: true },
  ],
  wires: [
    { from: 'web/page search', to: 'web/feature find-notes', kind: 'asks', words: 'to find notes' },
    { from: 'web/feature find-notes', to: 'web/module notes', kind: 'uses', words: 'reads every note' },
  ],
})

/** Builds the search proposal in the live folder, wholly or but for the
 *  last step. */
export const buildSearch = (repo: string, { all = true } = {}): void => {
  writeInto(repo, {
    'app/pages/search.tsx': [
      '// codegraph: page search at /search',
      "import { findNotes } from '../features/find-notes' // codegraph: wire to find notes",
      'export const Search = () => findNotes()',
      '',
    ].join('\n'),
    'app/features/find-notes.ts': [
      '// codegraph: feature find-notes uses notes',
      "import { listNotes } from '../modules/notes' // codegraph: wire reads every note",
      'export const findNotes = () => listNotes()',
      '',
    ].join('\n'),
  })
  if (all) rmSync(join(repo, 'app/triggers/nightly.ts'))
}

/** A computer of its own in a yard: all of codegraph's stores pointed at a folder
 *  of its own, as though it were another person's machine, with whoever is signed
 *  in there. Only one can be "here" at a time. */
export const aComputer = (yard: Yard, name: string, github = '') => {
  const home = join(yard.path, `computer-${name}`)
  mkdirSync(home, { recursive: true })
  return {
    home,
    be: (who?: Member): void => {
      useProjectsFolder(home)
      useSketchesFolder(home)
      useAnnotationsFolder(home)
      useArrangementsFolder(home)
      useCardTypesFolder(home)
      useGithubFolder(home)
      useMembersFolder(home)
      useSyncFolder(home)
      useMirrors(home, github || 'https://github.invalid')
      if (who) {
        rememberMember(who)
        saveToken('token-of-' + who.login)
      }
    },
  }
}
