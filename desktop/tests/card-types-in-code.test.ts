// codegraph: test module reader
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { saveProposal } from '../src/features/save-proposal.js'
import { showCardTypes } from '../src/features/show-card-types.js'
import { useFolder as useCardTypes } from '../src/modules/card-types/index.js'
import { systemCard, withLooks } from '../src/modules/cards/index.js'
import { addProject, addSoftwareSystem, useFolder as useProjects } from '../src/modules/projects/index.js'
import { blankProposal, checkRepo, live, measure, proposalFrom, readMap, type DrawnCard, type SystemMap } from '../src/modules/reader/index.js'
import { readTags } from '../src/modules/reader/tags.js'
import { blankCard } from '../src/modules/sketches/index.js'
import { aMappedRepo, closeYard, git, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let map: SystemMap

const jobsFile = (tag: string): void =>
  writeFileSync(join(repo, 'app', 'jobs.ts'), `// codegraph: ${tag}\n// codegraph: front door addJob\nexport const addJob = (): void => undefined\n`)

const queue = { icon: 'mail', shape: 'hexagon' as const, color: 'teal' }
const drawing = (kind = 'queue'): DrawnCard =>
  ({
    ...blankCard('s', 'notes', 'system', 'software system'),
    children: [
      {
        ...blankCard('web', 'web', 'container', 'browser app'),
        children: [{ ...blankCard('jobs', 'jobs', 'component', kind), look: queue }],
      },
    ],
  }) as unknown as DrawnCard

beforeAll(async () => {
  yard = openYard('types-in-code')
  useProjects(yard.home)
  useCardTypes(yard.home)
  repo = aMappedRepo(yard)
  jobsFile('module jobs as queue')
  map = await readMap(repo, live)
})

afterAll(() => closeYard(yard))

describe('a tag says what the team calls a component', () => {
  const role = (tag: string) => readTags('a.ts', `// codegraph: ${tag}\n`).role

  it('reads it after any kind, and the rest of the tag as before', () => {
    expect(role('module jobs as message queue')).toMatchObject({ kind: 'module', name: 'jobs', type: 'message queue' })
    expect(role('feature send as webhook uses mail, people')).toMatchObject({ kind: 'feature', type: 'webhook', uses: ['mail', 'people'] })
    expect(role('page home as landing at /')).toMatchObject({ kind: 'page', type: 'landing', at: '/' })
    expect(role('start page home as landing at /')).toMatchObject({ start: true, type: 'landing' })
    expect(role('trigger tidy schedule as cron')).toMatchObject({ kind: 'trigger', trigger: 'schedule', type: 'cron' })
  })

  it('has none when it is left out', () => {
    expect(role('module notes')).toMatchObject({ type: '' })
    expect(role('feature write uses notes')).toMatchObject({ type: '', uses: ['notes'] })
    expect(role('page note at /notes/:id')).toMatchObject({ type: '', at: '/notes/:id' })
  })
})

describe('the map of a repo with a typed component', () => {
  it('reads the type beside its kind', () => {
    expect(map.components.find((c) => c.name === 'jobs')).toMatchObject({ kind: 'module', type: 'queue' })
  })

  it('shows the type on the card, keeps the kind, and draws it in its saved look', () => {
    const top = withLooks(systemCard('notes', 'notes', map), [{ id: 't', name: 'queue', ...queue }])
    const card = top.children.find((c) => c.name === 'web')!.children.find((c) => c.name === 'jobs')!
    expect(card).toMatchObject({ kind: 'queue', role: 'module', look: queue })
    expect(card.id).toBe('notes/web:module:jobs')
  })

  it('holds it to a module’s rules whatever it is called', async () => {
    writeFileSync(
      join(repo, 'app', 'jobs.ts'),
      `// codegraph: module jobs as queue
// codegraph: front door addJob
import { writeNote } from './features/write-note' // codegraph: wire writes a job
export const addJob = (): void => writeNote('')
`,
    )
    expect((await checkRepo(repo)).map((m) => m.says)).toContainEqual(expect.stringContaining('a module never reaches a feature'))
    jobsFile('module jobs as queue')
  })

  it('says so when two files disagree on what it is called', async () => {
    writeFileSync(join(repo, 'app', 'jobs-more.ts'), '// codegraph: module jobs as stream\nexport const more = 1\n')
    expect((await readMap(repo, live)).problems.join(' ')).toMatch(/jobs is called both (queue and stream|stream and queue)/)
    git(repo, 'clean', '-fdq', 'app/jobs-more.ts')
  })
})

describe('a proposal for a typed card', () => {
  const measured = (against: SystemMap, proposal: ReturnType<typeof proposalFrom>) =>
    measure(against, proposal, null).items.find((item) => item.what === 'component')!

  it('asks for nothing when the code is already tagged that way', () => {
    expect(proposalFrom(drawing(), map, { absentIsGone: false }).components).toEqual([])
  })

  it('asks for the new type when the type drawn changes', () => {
    const proposal = proposalFrom(drawing('stream'), map, { absentIsGone: false })
    expect(proposal.components[0]).toMatchObject({ name: 'jobs', kind: 'module', type: 'stream' })
    expect(measured(map, proposal).state).not.toBe('built')
  })

  it('is built once the tag says what was drawn', () => {
    const proposal = { ...blankProposal(), components: [{ container: 'web', kind: 'module' as const, type: 'queue', name: 'jobs', says: '', at: '', mockup: '' }] }
    expect(measured(map, proposal).state).toBe('built')
  })

  it('remembers the look of a type going into the code', async () => {
    const project = addProject('Notes', 'notes-app')
    const system = addSoftwareSystem(project.id, { name: 'notes', path: repo, remote: '' })
    await saveProposal(project.id, system.id, drawing('stream'), 'Stream the jobs')
    expect(await showCardTypes()).toMatchObject([{ name: 'stream', ...queue }])
    git(repo, 'clean', '-fdq', 'codegraph-proposal')
  })
})
