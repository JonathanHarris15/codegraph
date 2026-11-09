// codegraph: test module reader
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkRepo, live, readMap, type Store, type SystemMap } from '../src/modules/reader/index.js'
import { closeYard, git, openYard, writeInto, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let map: SystemMap

/** A notes app kept in SQLite through Prisma, the way indie-stack is. */
const PRISMA = `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

/// Someone who can log in
model User {
  id    String @id @default(cuid())
  email String @unique
  role  Role   @default(WRITER)
  tags  String[]

  createdAt DateTime @default(now())
  password Password?
  notes    Note[]
}

enum Role {
  WRITER
  READER
}

model Password {
  hash String

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// whose password it is
  userId String @unique
}

model Note {
  id    String  @id @default(cuid())
  title String
  body  String?
  stars Int
  score Float
  done  Boolean
  extra Json?

  user   User   @relation(fields: [userId], references: [id])
  userId String
  @@index([userId])
}
`

beforeAll(async () => {
  yard = openYard('prisma-stores')
  repo = `${yard.path}/prisma-notes`
  git(yard.path, 'init', '--initial-branch=main', 'prisma-notes')
  writeInto(repo, {
    'codegraph.config.json': JSON.stringify({
      projects: ['notes'],
      containers: { web: { kind: 'web app', says: '', folders: ['app'] }, db: { kind: 'database', says: 'SQLite' } },
    }),
    'prisma/schema.prisma': PRISMA,
    'app/models/user.server.ts': [
      '// codegraph: module users',
      '// codegraph: store users in db from ../../prisma/schema.prisma#User',
      '// codegraph: store passwords in db from ../../prisma/schema.prisma#Password',
      'export const x = 1',
      '',
    ].join('\n'),
    'app/models/note.server.ts': [
      '// codegraph: module notes',
      '// codegraph: store notes in db from ../../prisma/schema.prisma#Note',
      '// codegraph: store drafts in db from ../../prisma/schema.prisma#Draft',
      'export const x = 1',
      '',
    ].join('\n'),
  })
  map = await readMap(repo, live)
})

afterAll(() => closeYard(yard))

const store = (path: string): Store => map.stores.find((s) => s.path === path)!

describe('stores shaped by a Prisma model', () => {
  it('reads each column and what it holds, fixed, as a table is', () => {
    const notes = store('notes').shape!
    expect(notes.fixed).toBe(true)
    expect(notes.fields.map((f) => [f.name, f.holds.kind, f.needed])).toEqual([
      ['id', 'text', true],
      ['title', 'text', true],
      ['body', 'text', false],
      ['stars', 'whole number', true],
      ['score', 'number', true],
      ['done', 'yes or no', true],
      ['extra', 'anything', false],
      ['userId', 'text', true],
    ])
  })

  it('reads an enum as its choices, a list as a list, and the words above a model or field', () => {
    const users = store('users')
    expect(users.says).toBe('Someone who can log in')
    expect(users.shape!.fields.find((f) => f.name === 'role')?.holds).toEqual({ kind: 'one of', choices: ['WRITER', 'READER'] })
    expect(users.shape!.fields.find((f) => f.name === 'tags')?.holds).toEqual({ kind: 'list', of: { kind: 'text' } })
    expect(users.shape!.fields.map((f) => f.name)).not.toContain('notes')
  })

  it('makes a relation a field that points at the store its model keeps', () => {
    expect(map.wires.filter((w) => w.kind === 'points at')).toEqual([
      { from: 'store:db:notes', to: 'store:db:users', kind: 'points at', words: 'userId' },
      { from: 'store:db:passwords', to: 'store:db:users', kind: 'points at', words: 'whose password it is' },
    ])
  })

  it('says plainly when the model is not in the schema, and the check asks for nothing else', async () => {
    expect(map.problems).toEqual(['app/models/note.server.ts shapes drafts by prisma/schema.prisma, which has no model Draft'])
    expect((await checkRepo(repo, live)).filter((m) => m.says.includes('no schema'))).toEqual([])
  })
})
