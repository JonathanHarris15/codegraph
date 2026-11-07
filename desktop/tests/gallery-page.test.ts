// codegraph: test ui gallery
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { inviteMember } from '../src/features/invite-member.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { saveSketch } from '../src/features/save-sketch.js'
import { startSketch } from '../src/features/start-sketch.js'
import { openFolderCloud, useCloud, type Member } from '../src/modules/cloud/index.js'
import { keepProject, listProjects } from '../src/modules/projects/index.js'
import { blankCard } from '../src/modules/sketches/index.js'
import { pull, sendProject } from '../src/modules/sync/index.js'
import { aComputer, aMappedRepo, closeYard, git, githubAnswers, openYard, type Yard } from './yard.js'

/** The gallery and a project as a viewer sees them, with a repo they can reach and
 *  one GitHub will not hand over; then signed out. */
const appFolder = resolve(import.meta.dirname, '..')
const PATIENCE = 15_000
const ana: Member = { id: '1', login: 'ana', name: 'Ana', avatar: '' }
const ben: Member = { id: '2', login: 'ben', name: 'Ben', avatar: '' }

let yard: Yard
let app: ElectronApplication
let page: Page

beforeAll(async () => {
  yard = openYard('gallery-page')
  const hub = join(yard.path, 'github')
  const online = join(yard.path, 'online')
  mkdirSync(join(hub, 'ana'), { recursive: true })
  const repo = aMappedRepo(yard)
  execFileSync('git', ['clone', '--bare', '--quiet', repo, join(hub, 'ana', 'notes.git')])
  git(repo, 'remote', 'add', 'origin', join(hub, 'ana', 'notes.git'))
  git(repo, 'fetch', '--quiet', 'origin')

  useCloud(openFolderCloud(online))
  githubAnswers({ '/users/ben': { status: 200, body: { id: 2, login: 'ben', name: 'Ben', avatar_url: '' } } })
  const anas = aComputer(yard, 'ana', hub)
  const bens = aComputer(yard, 'ben', hub)
  anas.be(ana)
  const { id } = await createProject('Notes')
  await linkSoftwareSystem(id, repo)
  const project = listProjects()[0]!
  keepProject({ ...project, systems: [...project.systems.map((s) => ({ ...s, remote: 'ana/notes' })), { id: 'secret', name: 'secret', path: '', remote: 'ana/secret' }] })
  await sendProject(id)
  await inviteMember(id, 'ben', 'viewer')
  const plan = await startSketch(id, 'Plan')
  await saveSketch({ ...plan, root: { ...plan.root, children: [{ ...blankCard('thing', 'thing', 'system', 'software system'), x: 200, y: 200 }] } })
  bens.be(ben)
  await pull(ben)
  useCloud(null)
  vi.unstubAllGlobals()

  app = await electron.launch({ args: ['.', `--user-data-dir=${bens.home}`], cwd: appFolder, env: { ...process.env, CODEGRAPH_CLOUD_FOLDER: online, CODEGRAPH_GITHUB_HOST: hub } })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1300, height: 800 })
}, 90_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('a viewer', () => {
  it('sees who they are, and what they are on the project', async () => {
    await page.getByText('Ben', { exact: true }).waitFor({ timeout: PATIENCE })
    expect(await page.getByRole('button', { name: 'Members of Notes' }).textContent()).toContain('you are a viewer')
  })

  it('sees who is on it, with no way to change that', async () => {
    await page.getByRole('button', { name: 'Members of Notes' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByText('@ana').waitFor({ timeout: PATIENCE })
    expect(await page.getByLabel('Invite by GitHub username').count()).toBe(0)
    await page.getByRole('button', { name: 'Done' }).click()
  })

  it('sees a repo GitHub will not hand over greyed out, saying why', async () => {
    await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
    const card = page.locator('.map-world .map-card--out-of-reach')
    await card.waitFor({ timeout: PATIENCE })
    expect(await card.textContent()).toContain('You need adding to this repo on GitHub to open it.')
    expect(await page.getByRole('button', { name: 'Open secret' }).count()).toBe(0)
  })

  it('can open a repo they can reach, but not move anything on it', async () => {
    await page.getByRole('button', { name: 'Open notes' }).dblclick()
    await page.waitForTimeout(900)
    const web = page.locator('.map-world [data-card$="container:web"]')
    const db = page.locator('.map-world [data-card$="container:db"]')
    const apart = async (): Promise<number> => (await web.boundingBox())!.x - (await db.boundingBox())!.x
    const before = await apart()
    const was = (await web.boundingBox())!
    await page.mouse.move(was.x + was.width / 2, was.y + 12)
    await page.mouse.down()
    await page.mouse.move(was.x + 200, was.y + 200, { steps: 6 })
    await page.mouse.up()
    // The drag moves the board, as it does on empty space; the cards stay put.
    expect(await apart()).toBeCloseTo(before, 0)
  })

  it('can read a sketch but not draw on it', async () => {
    await page.getByRole('button', { name: /^Sketches/ }).click()
    await page.getByText('Plan').first().click()
    await page.locator('.map-world [data-card="thing"]').waitFor({ timeout: PATIENCE })
    expect(await page.getByRole('button', { name: 'Card: software system' }).count()).toBe(0)
    expect(await page.getByLabel('Sketch name').getAttribute('readonly')).not.toBeNull()
    await page.getByRole('button', { name: '← Map' }).click()
    await page.getByRole('button', { name: '← Projects' }).click()
  })
})

describe('sketches outside any project', () => {
  it('has a library of a member\'s own, to draw in straight away', async () => {
    await page.getByRole('button', { name: 'Sketches tab' }).click()
    await page.getByRole('button', { name: 'New sketch' }).first().click()
    await page.getByLabel('Sketch name').fill('My idea')
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: '← Sketches' }).click()
    await page.getByRole('button', { name: 'Open My idea' }).waitFor({ timeout: PATIENCE })
    expect(await page.getByText('Only you').count()).toBe(1)
  })
})

describe('signed out', () => {
  it('shows no projects, and asks to sign in, but keeps the sketches open', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.getByRole('button', { name: 'Sign in with GitHub' }).first().waitFor({ timeout: PATIENCE })
    await page.getByRole('button', { name: 'Projects tab' }).click()
    await page.getByText('Sign in to see your projects').waitFor({ timeout: PATIENCE })
    expect(await page.getByRole('button', { name: 'Open Notes', exact: true }).count()).toBe(0)
    await page.getByRole('button', { name: 'Sketches tab' }).click()
    await page.getByRole('button', { name: 'Open My idea' }).waitFor({ timeout: PATIENCE })
  })
})
