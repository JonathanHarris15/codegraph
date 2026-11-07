// codegraph: test feature invite-member
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changeRole } from '../src/features/change-role.js'
import { copySketch } from '../src/features/copy-sketch.js'
import { createProject } from '../src/features/create-project.js'
import { deleteProject } from '../src/features/delete-project.js'
import { deleteSketch } from '../src/features/delete-sketch.js'
import { handOverProject } from '../src/features/hand-over-project.js'
import { inviteMember } from '../src/features/invite-member.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { listMySketches } from '../src/features/list-my-sketches.js'
import { listPoints } from '../src/features/list-points.js'
import { listProjects } from '../src/features/list-projects.js'
import { listRevisions } from '../src/features/list-revisions.js'
import { listSketches } from '../src/features/list-sketches.js'
import { moveSketch } from '../src/features/move-sketch.js'
import { openSketch } from '../src/features/open-sketch.js'
import { putProjectOnline } from '../src/features/put-project-online.js'
import { removeMember } from '../src/features/remove-member.js'
import { restoreRevision } from '../src/features/restore-revision.js'
import { saveAnnotations } from '../src/features/save-annotations.js'
import { saveArrangement } from '../src/features/save-arrangement.js'
import { saveSketch } from '../src/features/save-sketch.js'
import { shareSketch } from '../src/features/share-sketch.js'
import { showAnnotations } from '../src/features/show-annotations.js'
import { showArrangement } from '../src/features/show-arrangement.js'
import { showMap } from '../src/features/show-map.js'
import { startSketch } from '../src/features/start-sketch.js'
import { openFolderCloud, useCloud, type Member } from '../src/modules/cloud/index.js'
import { forgetMember } from '../src/modules/members/index.js'
import { addProject, listProjects as storedProjects } from '../src/modules/projects/index.js'
import { blankCard, LOOSE, SHARED_WITH_ME, writeSketch } from '../src/modules/sketches/index.js'
import { catchUp, pendingCount, pull } from '../src/modules/sync/index.js'
import { aComputer, aMappedRepo, closeYard, git, githubAnswers, openYard, type Yard } from './yard.js'

const ana: Member = { id: '1', login: 'ana', name: 'Ana', avatar: '' }
const ben: Member = { id: '2', login: 'ben', name: 'Ben', avatar: '' }
const raw = (m: Member) => ({ status: 200, body: { id: Number(m.id), login: m.login, name: m.name, avatar_url: '' } })

let yard: Yard
let up = true
let anas: ReturnType<typeof aComputer>
let bens: ReturnType<typeof aComputer>

const beAna = (): void => anas.be(ana)
const beBen = async (): Promise<void> => {
  bens.be(ben)
  await pull(ben)
}
const invited = async (role: 'co-owner' | 'collaborator' | 'viewer' = 'collaborator'): Promise<string> => {
  beAna()
  const { id } = await createProject('Notes')
  expect((await inviteMember(id, 'ben', role)).ok).toBe(true)
  return id
}

beforeEach(() => {
  yard = openYard('together')
  up = true
  anas = aComputer(yard, 'ana')
  bens = aComputer(yard, 'ben')
  useCloud(openFolderCloud(join(yard.path, 'online'), () => up))
  githubAnswers({ '/users/ben': raw(ben), '/users/ana': raw(ana), '/users/ghost': { status: 404, body: {} } })
  beAna()
})

afterEach(() => {
  useCloud(null)
  vi.unstubAllGlobals()
  closeYard(yard)
})

describe('a project online', () => {
  it('is its maker\'s, and points at them rather than sitting under them', async () => {
    const { id } = await createProject('Notes')
    const [project] = await listProjects()
    expect(project).toMatchObject({ id, online: true, role: 'owner', ownerId: '1' })
    expect(project?.members.map((m) => m.login)).toEqual(['ana'])
  })

  it('reaches someone invited by GitHub username, before they ever sign in', async () => {
    const id = await invited()
    await beBen()
    const [project] = await listProjects()
    expect(project).toMatchObject({ id, name: 'Notes', role: 'collaborator' })
    expect(project?.members.map((m) => m.name)).toEqual(['Ana', 'Ben'])
  })

  it('says when GitHub knows no one by that name', async () => {
    const { id } = await createProject('Notes')
    expect(await inviteMember(id, 'ghost', 'viewer')).toEqual({ ok: false, problem: 'GitHub has no one called ghost.' })
  })

  it('never carries where a repo sits on someone\'s computer', async () => {
    const { id } = await createProject('Notes')
    const repo = aMappedRepo(yard)
    git(repo, 'remote', 'add', 'origin', 'https://github.com/ana/notes.git')
    await linkSoftwareSystem(id, repo)
    expect(storedProjects()[0]?.systems[0]?.path).toBe(repo)
    await inviteMember(id, 'ben', 'collaborator')
    await beBen()
    expect(storedProjects()[0]?.systems[0]).toMatchObject({ remote: 'ana/notes', path: '' })
  })

  it('finds a working copy a member links later, by its GitHub name', async () => {
    const { id } = await createProject('Notes')
    const repo = aMappedRepo(yard)
    git(repo, 'remote', 'add', 'origin', 'https://github.com/ana/notes.git')
    await linkSoftwareSystem(id, repo)
    await inviteMember(id, 'ben', 'viewer')
    await beBen()
    expect((await linkSoftwareSystem(id, repo)).ok).toBe(true)
    expect(storedProjects()[0]?.systems).toHaveLength(1)
    expect(storedProjects()[0]?.systems[0]?.path).toBe(repo)
  })

  it('needs signing in to see', async () => {
    await createProject('Notes')
    forgetMember()
    expect(await listProjects()).toEqual([])
  })

  it('can go online from this computer, with everything in it', async () => {
    useCloud(null)
    const local = addProject('Old').id
    await startSketch(local, 'Plan')
    useCloud(openFolderCloud(join(yard.path, 'online'), () => up))
    expect((await listProjects())[0]).toMatchObject({ online: false, role: 'owner' })
    expect((await putProjectOnline(local)).ok).toBe(true)
    await inviteMember(local, 'ben', 'viewer')
    await beBen()
    expect((await listSketches(local)).map((s) => s.name)).toEqual(['Plan'])
  })
})

describe('roles', () => {
  it('stops a collaborator inviting anyone', async () => {
    const id = await invited('collaborator')
    await beBen()
    expect((await inviteMember(id, 'ana', 'viewer')).ok).toBe(false)
    expect((await changeRole(id, '1', 'viewer')).ok).toBe(false)
  })

  it('lets a co-owner invite, but not hand over or delete', async () => {
    const id = await invited('co-owner')
    await beBen()
    expect((await handOverProject(id, '2')).ok).toBe(false)
    expect((await deleteProject(id)).ok).toBe(false)
  })

  it('stops a viewer drawing', async () => {
    const id = await invited('viewer')
    await beAna()
    const sketch = await startSketch(id, 'Plan')
    await beBen()
    const saved = await saveSketch({ ...sketch, name: 'Mine now' })
    expect(saved.name).toBe('Plan')
    expect((await listSketches(id))[0]?.name).toBe('Plan')
  })

  it('stops a viewer deleting or starting a sketch, or agreeing a shallow system', async () => {
    const id = await invited('viewer')
    const sketch = await startSketch(id, 'Plan')
    await beBen()
    await deleteSketch(id, sketch.id)
    expect((await listSketches(id)).length).toBe(1)
    await expect(startSketch(id, 'Mine')).rejects.toThrow()
    const { agreeShallowSystem } = await import('../src/features/agree-shallow-system.js')
    await agreeShallowSystem(id, 'Stripe')
    expect(storedProjects()[0]?.shallow).toEqual([])
    beAna()
    await pull(ana)
    expect((await listSketches(id)).length).toBe(1)
  })

  it('hands a project over whole, and the old owner stays on', async () => {
    const id = await invited()
    await startSketch(id, 'Plan')
    expect((await handOverProject(id, '2')).ok).toBe(true)
    await beBen()
    const [project] = await listProjects()
    expect(project).toMatchObject({ ownerId: '2', role: 'owner' })
    expect(project?.members.find((m) => m.id === '1')?.role).toBe('co-owner')
    expect((await listSketches(id)).map((s) => s.name)).toEqual(['Plan'])
  })

  it('takes a member off, and leaves nothing of it on their computer', async () => {
    const id = await invited()
    await startSketch(id, 'Plan')
    await beBen()
    expect((await listSketches(id)).length).toBe(1)
    beAna()
    expect((await removeMember(id, '2')).ok).toBe(true)
    await beBen()
    expect(await listProjects()).toEqual([])
    expect(await listSketches(id)).toEqual([])
  })

  it('deletes a project for everyone', async () => {
    const id = await invited()
    await beBen()
    beAna()
    expect((await deleteProject(id)).ok).toBe(true)
    await beBen()
    expect(await listProjects()).toEqual([])
  })
})

describe('sketches on a project', () => {
  const drawn = (name: string, x = 0) => ({ ...blankCard(name, name, 'system', 'software system'), x })

  it('are seen by every member', async () => {
    const id = await invited()
    const sketch = await startSketch(id, 'Plan')
    await saveSketch({ ...sketch, root: { ...sketch.root, children: [drawn('web')] } })
    await beBen()
    const opened = await openSketch(id, sketch.id)
    expect(opened?.sketch.root.children.map((c) => c.id)).toEqual(['web'])
  })

  it('keep what two members changed, when it is different things', async () => {
    const id = await invited()
    const first = await startSketch(id, 'Plan')
    const sketch = await saveSketch({ ...first, root: { ...first.root, children: [drawn('web'), drawn('db')] } })
    await beBen()
    await saveSketch({ ...sketch, root: { ...sketch.root, children: [drawn('web', 50), drawn('db')] } }, sketch)
    beAna()
    await saveSketch({ ...sketch, root: { ...sketch.root, children: [drawn('web'), drawn('db', 90)] } }, sketch)
    await beBen()
    const opened = await openSketch(id, sketch.id)
    expect(opened?.sketch.root.children.map((c) => c.x)).toEqual([50, 90])
  })

  it('merge what a window had not seen yet, rather than undoing it', async () => {
    const id = await invited()
    const first = await startSketch(id, 'Plan')
    const sketch = await saveSketch({ ...first, root: { ...first.root, children: [drawn('web'), drawn('db')] } })
    await beBen()
    await saveSketch({ ...sketch, root: { ...sketch.root, children: [drawn('web', 50), drawn('db')] } }, sketch)
    beAna()
    await pull(ana)
    // Ana's window still has the version from before Ben's move.
    const saved = await saveSketch({ ...sketch, name: 'Renamed' }, sketch)
    expect(saved.name).toBe('Renamed')
    expect(saved.root.children[0]?.x).toBe(50)
  })

  it('bring their mockups along', async () => {
    const id = await invited()
    const sketch = await startSketch(id, 'Plan')
    const { keepMockup } = await import('../src/modules/sketches/index.js')
    const picture = join(yard.path, 'p.png')
    execFileSync('sh', ['-c', `printf picture > "${picture}"`])
    const name = keepMockup(id, sketch.id, 'web', picture)
    await saveSketch({ ...sketch, root: { ...sketch.root, children: [{ ...drawn('web'), mockup: name }] } })
    await beBen()
    expect((await openSketch(id, sketch.id))?.mockups['web']).toContain('base64')
  })

  it('go for everyone when one is deleted', async () => {
    const id = await invited()
    const sketch = await startSketch(id, 'Plan')
    await beBen()
    expect((await listSketches(id)).length).toBe(1)
    beAna()
    await deleteSketch(id, sketch.id)
    await beBen()
    expect(await listSketches(id)).toEqual([])
  })
})

describe('when things happen at once', () => {
  it('keeps what is saved here while a send is on its way', async () => {
    const id = await invited()
    const sketch = await startSketch(id, 'Plan')
    const inner = openFolderCloud(join(yard.path, 'online'), () => up)
    let during: (() => void) | null = () => writeSketch({ ...sketch, name: 'Newer', updatedAt: 'later' })
    useCloud({
      ...inner,
      change: async (path, how) => {
        const out = await inner.change(path, how)
        const once = during
        during = null
        once?.()
        return out
      },
    })
    await saveSketch({ ...sketch, name: 'First' })
    await new Promise((go) => setTimeout(go, 200))
    expect((await listSketches(id))[0]?.name).toBe('Newer')
    useCloud(inner)
    await beBen()
    expect((await listSketches(id))[0]?.name).toBe('Newer')
  })
})

describe('offline', () => {
  it('keeps a project made offline, rather than taking it as removed', async () => {
    up = false
    await createProject('Offline')
    up = true
    await pull(ana)
    expect((await listProjects()).map((p) => p.name)).toEqual(['Offline'])
    await catchUp()
    expect(pendingCount()).toBe(0)
  })

  it('keeps an offline edit to something another member has deleted', async () => {
    const id = await invited()
    const sketch = await startSketch(id, 'Plan')
    await beBen()
    up = false
    const offline = await saveSketch({ ...sketch, name: 'Still wanted' })
    up = true
    beAna()
    await deleteSketch(id, sketch.id)
    await beBen()
    expect((await listSketches(id)).map((s) => s.name)).toEqual(['Still wanted'])
    expect(offline.id).toBe(sketch.id)
  })

  it('keeps working, and goes up on reconnecting', async () => {
    const id = await invited()
    const sketch = await startSketch(id, 'Plan')
    up = false
    await saveSketch({ ...sketch, name: 'Done on a train' })
    expect((await openSketch(id, sketch.id))?.sketch.name).toBe('Done on a train')
    expect(pendingCount()).toBe(1)
    up = true
    await catchUp()
    expect(pendingCount()).toBe(0)
    await beBen()
    expect((await listSketches(id))[0]?.name).toBe('Done on a train')
  })

  it('makes a new project when there is no connection', async () => {
    up = false
    const { id } = await createProject('Offline')
    expect(pendingCount()).toBe(1)
    up = true
    await catchUp()
    await inviteMember(id, 'ben', 'viewer')
    await beBen()
    expect((await listProjects())[0]?.name).toBe('Offline')
  })

  it('merges item by item when two changed one thing, keeping both in the history', async () => {
    const id = await invited()
    const first = await startSketch(id, 'Plan')
    const sketch = await saveSketch({ ...first, root: { ...first.root, children: [blankCard('web', 'web', 'system')] } })
    await beBen()
    beAna()
    up = false
    await saveSketch({ ...sketch, name: 'Ana offline' })
    up = true
    await beBen()
    await saveSketch({ ...sketch, name: 'Ben online' }, sketch)
    beAna()
    await catchUp()
    await beBen()
    expect((await listSketches(id))[0]?.name).toBe('Ana offline')
    const says = (await listRevisions(id)).filter((r) => r.target.includes('sketches')).map((r) => r.memberName)
    expect(says).toContain('Ben')
    expect(says).toContain('Ana')
  })
})

describe('the history', () => {
  it('says who changed what, in one entry per stretch of work', async () => {
    const id = await invited()
    const first = await startSketch(id, 'Plan')
    let sketch = await saveSketch({ ...first, root: { ...first.root, children: [blankCard('a', 'a', 'system')] } })
    sketch = await saveSketch({ ...sketch, root: { ...sketch.root, children: [...sketch.root.children, blankCard('b', 'b', 'system')] } })
    const revisions = (await listRevisions(id)).filter((r) => r.target.includes('sketches'))
    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toMatchObject({ memberName: 'Ana', targetName: 'the Plan sketch', restorable: true })
    expect(revisions[0]?.says).toBe('started it')
  })

  it('starts a new entry when someone else steps in', async () => {
    const id = await invited()
    const sketch = await startSketch(id, 'Plan')
    const later = await saveSketch({ ...sketch, name: 'Plan 2' })
    await beBen()
    await saveSketch({ ...later, name: 'Plan 3' })
    const names = (await listRevisions(id)).filter((r) => r.target.includes('sketches')).map((r) => r.memberName)
    expect(names).toEqual(expect.arrayContaining(['Ana', 'Ben']))
  })

  it('goes back to an old version as a new entry, losing nothing', async () => {
    const id = await invited()
    const sketch = await startSketch(id, 'Plan')
    const named = await saveSketch({ ...sketch, name: 'Good' })
    const good = (await listRevisions(id)).find((r) => r.target.includes('sketches'))!
    await beBen()
    await saveSketch({ ...named, name: 'Worse' })
    const before = (await listRevisions(id)).length
    expect((await restoreRevision(id, good.id)).ok).toBe(true)
    expect((await listSketches(id))[0]?.name).toBe('Good')
    expect((await listRevisions(id)).length).toBeGreaterThan(before)
  })

  it('does not let a viewer go back', async () => {
    const id = await invited('viewer')
    const sketch = await startSketch(id, 'Plan')
    await saveSketch({ ...sketch, name: 'Two' })
    const one = (await listRevisions(id)).find((r) => r.target.includes('sketches'))!
    await beBen()
    expect((await restoreRevision(id, one.id)).ok).toBe(false)
  })

  it('records who joined, with nothing to go back to', async () => {
    const id = await invited()
    const members = (await listRevisions(id)).filter((r) => r.target === `projects/${id}`)
    expect(members.length).toBeGreaterThan(0)
    expect(members[0]?.restorable).toBe(false)
  })
})

describe('maps online', () => {
  const setUp = async (): Promise<{ id: string; system: string; main: { kind: 'branch'; name: string; where: 'cloud' } }> => {
    const github = join(yard.path, 'github')
    mkdirSync(join(github, 'ana'), { recursive: true })
    const repo = aMappedRepo(yard)
    execFileSync('git', ['clone', '--bare', '--quiet', repo, join(github, 'ana', 'notes.git')])
    git(repo, 'remote', 'add', 'origin', join(github, 'ana', 'notes.git'))
    git(repo, 'fetch', '--quiet', 'origin')
    git(repo, 'remote', 'set-url', 'origin', join(github, 'ana', 'notes.git'))
    anas = aComputer(yard, 'ana', github)
    bens = aComputer(yard, 'ben', github)
    beAna()
    const { id } = await createProject('Notes')
    await linkSoftwareSystem(id, repo)
    const project = storedProjects()[0]!
    const { keepProject } = await import('../src/modules/projects/index.js')
    keepProject({ ...project, systems: project.systems.map((s) => ({ ...s, remote: 'ana/notes' })) })
    await inviteMember(id, 'ben', 'collaborator')
    return { id, system: project.systems[0]!.id, main: { kind: 'branch', name: 'origin/main', where: 'cloud' } }
  }

  it('shows a GitHub map to a member with no working copy, in GitHub\'s words', async () => {
    const { id, system } = await setUp()
    await beBen()
    const shown = await showMap(id)
    const one = shown.systems.find((s) => s.id === system)
    expect(one).toMatchObject({ reach: 'open', mapKey: 'github:main' })
    expect(shown.card.children[0]?.children.length).toBeGreaterThan(0)
    const points = await listPoints(id, system)
    expect(points.flatMap((p) => (p.kind === 'branch' ? [p.name] : []))).toContain('origin/main')
    expect(points.some((p) => p.kind === 'live')).toBe(false)
  })

  it('greys out a repo GitHub will not hand over, saying why', async () => {
    const { id, system } = await setUp()
    const { rmSync } = await import('node:fs')
    rmSync(join(yard.path, 'github', 'ana', 'notes.git'), { recursive: true, force: true })
    await beBen()
    const shown = await showMap(id)
    expect(shown.systems.find((s) => s.id === system)?.reach).toBe('no-access')
    expect(shown.card.children[0]?.outOfReach).toMatch(/adding to this repo/)
  })

  it('shares a layout on a GitHub map, and keeps a local one to itself', async () => {
    const { id, system, main } = await setUp()
    const inside = `${system}/container:web`
    await saveArrangement(id, [{ id: inside, x: 11, y: 22 }], { [system]: main })
    await saveArrangement(id, [{ id: inside, x: 77, y: 88 }], { [system]: { kind: 'live', branch: 'main' } })
    await beBen()
    expect(await showArrangement(id, { [system]: main })).toEqual([{ id: inside, x: 11, y: 22 }])
    const { arrangementKeys } = await import('../src/modules/arrangements/index.js')
    expect(arrangementKeys(id).some((k) => k.includes('local:'))).toBe(false)
  })

  it('keeps notes to the branch they were written on', async () => {
    const { id, system, main } = await setUp()
    const layer = { id: 'l', name: 'L', shown: true, snaps: true, items: [{ id: 'n', at: `${system}/container:web`, kind: 'sticky', x: 0, y: 0, w: 9, h: 9, text: 'why?', color: '' }] }
    await saveAnnotations(id, [layer], { [system]: main })
    await beBen()
    expect((await showAnnotations(id, { [system]: main }))[0]?.items.map((i) => i.text)).toEqual(['why?'])
    const other = { kind: 'branch', name: 'origin/add-search', where: 'cloud' } as const
    expect((await showAnnotations(id, { [system]: other })).flatMap((l) => l.items)).toEqual([])
  })

  it('stops a viewer moving things on a GitHub map, but not their own', async () => {
    const { id, system, main } = await setUp()
    const inside = `${system}/container:web`
    await saveArrangement(id, [{ id: inside, x: 1, y: 1 }], { [system]: main })
    await changeRole(id, '2', 'viewer')
    await beBen()
    expect(await saveArrangement(id, [{ id: inside, x: 9, y: 9 }], { [system]: main })).toEqual([{ id: inside, x: 1, y: 1 }])
  })

  it('leaves other people\'s notes alone when a viewer saves their own', async () => {
    const { id, system, main } = await setUp()
    const note = (key: string, at: string, text: string) => ({ id: key, at, kind: 'sticky', x: 0, y: 0, w: 9, h: 9, text, color: '' })
    const layer = (...items: ReturnType<typeof note>[]) => ({ id: 'l', name: 'L', shown: true, snaps: true, items })
    await saveAnnotations(id, [layer(note('top', id, 'for everyone'), note('n', `${system}/container:web`, 'on main'))], { [system]: main })
    await changeRole(id, '2', 'viewer')
    await beBen()
    const seen = await showAnnotations(id, { [system]: main })
    // Ben, a viewer, tries to take them all off a shared map.
    await saveAnnotations(id, [{ ...seen[0]!, items: [] }], { [system]: main }, seen)
    beAna()
    await pull(ana)
    expect((await showAnnotations(id, { [system]: main }))[0]?.items.map((i) => i.id).sort()).toEqual(['n', 'top'])
  })

  it('marks the main line when a proposal is being built elsewhere', async () => {
    const { id, system } = await setUp()
    const repo = storedProjects()[0]!.systems[0]!.path
    const { writeFileSync } = await import('node:fs')
    git(repo, 'switch', '-c', 'build-it', 'main')
    mkdirSync(join(repo, 'codegraph-proposal'))
    writeFileSync(join(repo, 'codegraph-proposal', 'proposal.json'), JSON.stringify({ says: 'x', containers: [], components: [], wires: [] }))
    git(repo, 'add', '-A')
    git(repo, 'commit', '-m', 'outline')
    git(repo, 'push', '--quiet', 'origin', 'build-it')
    git(repo, 'switch', 'main')
    const shown = await showMap(id)
    expect(shown.systems.find((s) => s.id === system)?.proposalsElsewhere).toEqual(['origin/build-it'])
  })
})

describe('loose sketches', () => {
  it('can be made with no one signed in', async () => {
    forgetMember()
    const sketch = await startSketch(LOOSE, 'Idea')
    expect((await listMySketches()).map((s) => s.name)).toEqual(['Idea'])
    expect((await openSketch(LOOSE, sketch.id))?.sketch.name).toBe('Idea')
  })

  it('go up when their maker signs in', async () => {
    forgetMember()
    await startSketch(LOOSE, 'Done signed out')
    const { rememberMember } = await import('../src/modules/members/index.js')
    const { startFollowing, stopFollowing } = await import('../src/modules/sync/index.js')
    rememberMember(ana)
    await startFollowing(ana)
    stopFollowing()
    const other = aComputer(yard, 'ana-mac')
    other.be(ana)
    await pull(ana)
    expect((await listMySketches()).map((s) => s.name)).toEqual(['Done signed out'])
  })

  it('stay private, and follow their member to another computer', async () => {
    await startSketch(LOOSE, 'Idea')
    const other = aComputer(yard, 'ana-mac')
    other.be(ana)
    await pull(ana)
    expect((await listMySketches()).map((s) => s.name)).toEqual(['Idea'])
    await beBen()
    expect(await listMySketches()).toEqual([])
  })

  it('reach the people they are shared with, and show as theirs', async () => {
    const sketch = await startSketch(LOOSE, 'Idea')
    expect((await shareSketch(sketch.id, 'ben', 'collaborator')).ok).toBe(true)
    await beBen()
    expect(await listMySketches()).toMatchObject([{ name: 'Idea', theirs: true, owner: 'Ana', role: 'collaborator' }])
    const opened = await openSketch(SHARED_WITH_ME, sketch.id)
    await saveSketch({ ...opened!.sketch, name: 'Better idea' })
    beAna()
    await pull(ana)
    expect((await listMySketches())[0]).toMatchObject({ name: 'Better idea', theirs: false, sharedWith: 1 })
  })

  it('stop a viewer changing them', async () => {
    const sketch = await startSketch(LOOSE, 'Idea')
    await shareSketch(sketch.id, 'ben', 'viewer')
    await beBen()
    const opened = await openSketch(SHARED_WITH_ME, sketch.id)
    expect((await saveSketch({ ...opened!.sketch, name: 'No' })).name).toBe('Idea')
  })

  it('can be copied to your own library by someone they are shared with', async () => {
    const sketch = await startSketch(LOOSE, 'Idea')
    await shareSketch(sketch.id, 'ben', 'viewer')
    await beBen()
    const copy = await copySketch(SHARED_WITH_ME, sketch.id)
    expect(copy).toMatchObject({ projectId: LOOSE, name: 'Idea (copy)' })
    expect(copy?.members).toBeUndefined()
    expect((await saveSketch({ ...copy!, name: 'Mine' })).name).toBe('Mine')
  })

  it('move into a project, for all its members, and stop being shared', async () => {
    const id = await invited()
    const sketch = await startSketch(LOOSE, 'Idea')
    expect((await moveSketch(sketch.id, id)).ok).toBe(true)
    expect(await listMySketches()).toEqual([])
    await beBen()
    expect((await listSketches(id)).map((s) => s.name)).toEqual(['Idea'])
  })
})
