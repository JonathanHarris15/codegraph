// codegraph: test ui canvas
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { inviteMember } from '../src/features/invite-member.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { startSketch } from '../src/features/start-sketch.js'
import { openFolderCloud, useCloud, type Member } from '../src/modules/cloud/index.js'
import { listProjects } from '../src/modules/projects/index.js'
import { pull } from '../src/modules/sync/index.js'
import { aComputer, aMappedRepo, closeYard, git, githubAnswers, openTheApp, openYard, type Yard } from './yard.js'

/** Two real copies of the app, on two people's "computers", with a folder standing
 *  in for the online side and for GitHub: what is sent really does go from one
 *  window to the other. */
const PATIENCE = 15_000
const ana: Member = { id: '1', login: 'ana', name: 'Ana', avatar: '' }
const ben: Member = { id: '2', login: 'ben', name: 'Ben', avatar: '' }
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
const apps: ElectronApplication[] = []
let anaPage: Page
let benPage: Page

const open = async (home: string, online: string, github: string): Promise<Page> => {
  const app = await openTheApp(home, { CODEGRAPH_CLOUD_FOLDER: online, CODEGRAPH_GITHUB_HOST: github })
  apps.push(app)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1300, height: 800 })
  return page
}
const intoWeb = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).dblclick({ timeout: PATIENCE })
  await page.waitForTimeout(900)
}
const web = (page: Page) => page.locator('.map-world [data-card$="container:web"]')
const db = (page: Page) => page.locator('.map-world [data-card$="container:db"]')
/** How far the web card is from the db card, in card widths, which is the same on
 *  any screen at any zoom. */
const apart = async (page: Page): Promise<{ x: number; y: number }> => {
  const [a, b] = [(await web(page).boundingBox())!, (await db(page).boundingBox())!]
  return { x: (a.x - b.x) / b.width, y: (a.y - b.y) / b.width }
}
const picture = async (page: Page, name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}

beforeAll(async () => {
  yard = openYard('together-page')
  const github = join(yard.path, 'github')
  const online = join(yard.path, 'online')
  mkdirSync(join(github, 'ana'), { recursive: true })
  const repo = aMappedRepo(yard)
  execFileSync('git', ['clone', '--bare', '--quiet', repo, join(github, 'ana', 'notes.git')])
  git(repo, 'remote', 'add', 'origin', join(github, 'ana', 'notes.git'))
  git(repo, 'fetch', '--quiet', 'origin')

  useCloud(openFolderCloud(online))
  githubAnswers({ '/users/ben': { status: 200, body: { id: 2, login: 'ben', name: 'Ben', avatar_url: '' } } })
  const anas = aComputer(yard, 'ana', github)
  const bens = aComputer(yard, 'ben', github)
  anas.be(ana)
  const { id } = await createProject('Notes')
  await linkSoftwareSystem(id, repo)
  const { keepProject } = await import('../src/modules/projects/index.js')
  const { sendProject } = await import('../src/modules/sync/index.js')
  const project = listProjects()[0]!
  keepProject({ ...project, systems: project.systems.map((s) => ({ ...s, remote: 'ana/notes' })) })
  await sendProject(id)
  await inviteMember(id, 'ben', 'collaborator')
  const { saveSketch } = await import('../src/features/save-sketch.js')
  const { blankCard } = await import('../src/modules/sketches/index.js')
  const plan = await startSketch(id, 'Plan')
  await saveSketch({ ...plan, root: { ...plan.root, children: [{ ...blankCard('thing', 'thing', 'system', 'software system'), x: 200, y: 200 }] } })
  bens.be(ben)
  await pull(ben)
  useCloud(null)
  vi.unstubAllGlobals()

  anaPage = await open(anas.home, online, github)
  benPage = await open(bens.home, online, github)
  await intoWeb(anaPage)
  await intoWeb(benPage)
}, 90_000)

afterAll(async () => {
  for (const app of apps) await app.close()
  closeYard(yard)
})

describe('two members on one map', () => {
  it('shows each who is there', async () => {
    await expect.poll(() => benPage.getByRole('button', { name: 'Ana', exact: true }).count(), { timeout: PATIENCE }).toBe(1)
    await expect.poll(() => anaPage.getByRole('button', { name: 'Ben', exact: true }).count(), { timeout: PATIENCE }).toBe(1)
  })

  it('opens on GitHub\'s main line for both, one with no working copy', async () => {
    expect(await web(benPage).count()).toBe(1)
    expect(await benPage.getByRole('button', { name: 'Branch of notes' }).textContent()).toContain('on GitHub')
    expect(await anaPage.getByRole('button', { name: 'Branch of notes' }).textContent()).toContain('on GitHub')
  })

  it('shows one member\'s cursor on the other\'s screen', async () => {
    const box = (await anaPage.locator('.map-frame-area, .map-frame').first().boundingBox())!
    await anaPage.mouse.move(box.x + 300, box.y + 300)
    await anaPage.mouse.move(box.x + 320, box.y + 320, { steps: 4 })
    await benPage.getByRole('status', { name: "Ana's cursor" }).waitFor({ timeout: PATIENCE })
    await picture(benPage, 'together-cursor')
  })

  it('holds a card while it is dragged, and shows it moving', async () => {
    const before = await apart(benPage)
    const box = (await web(anaPage).boundingBox())!
    const from = { x: box.x + box.width / 2, y: box.y + 12 }
    await anaPage.mouse.move(from.x, from.y)
    await anaPage.mouse.down()
    await anaPage.mouse.move(from.x + 120, from.y + 90, { steps: 8 })
    await benPage.getByRole('status', { name: 'Ana has hold of web' }).waitFor({ timeout: PATIENCE })
    await picture(benPage, 'together-held')
    await expect.poll(() => apart(benPage), { timeout: PATIENCE }).not.toEqual(before)
    await anaPage.mouse.up()
    await expect.poll(() => benPage.getByRole('status', { name: 'Ana has hold of web' }).count(), { timeout: PATIENCE }).toBe(0)
  })

  it('lands where it was put, on both screens', async () => {
    await expect
      .poll(async () => {
        const [a, b] = [await apart(anaPage), await apart(benPage)]
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
      }, { timeout: PATIENCE })
      .toBeLessThan(0.05)
  })

  it('says who did what in the history', async () => {
    await anaPage.getByRole('button', { name: 'History' }).click()
    const panel = anaPage.getByRole('complementary', { name: 'History' })
    await panel.getByText('on the map of notes on main').first().waitFor({ timeout: PATIENCE })
    expect(await panel.textContent()).toContain('Ana')
    await anaPage.getByRole('button', { name: 'Close', exact: true }).click()
  })
})

describe('sketches together', () => {
  it('reach both, and a change by one reaches the other', async () => {
    await anaPage.getByRole('button', { name: /^Sketches/ }).click()
    await anaPage.getByText('Plan').first().click()
    await anaPage.getByLabel('Sketch name').waitFor({ timeout: PATIENCE })
    await benPage.getByRole('button', { name: /^Sketches/ }).click()
    await benPage.getByText('Plan').first().click()
    await benPage.getByLabel('Sketch name').waitFor({ timeout: PATIENCE })

    await anaPage.getByLabel('Sketch name').fill('Plan B')
    await expect.poll(() => benPage.getByLabel('Sketch name').inputValue(), { timeout: PATIENCE }).toBe('Plan B')
  })

  const thing = (page: Page) => page.locator('.map-world [data-card="thing"]')

  it('shows who else has it open', async () => {
    const box = (await thing(anaPage).boundingBox())!
    await anaPage.mouse.move(box.x - 40, box.y - 40)
    await anaPage.mouse.move(box.x - 20, box.y - 20, { steps: 4 })
    await benPage.getByRole('status', { name: "Ana's cursor" }).waitFor({ timeout: PATIENCE })
  })

  it('holds a card someone is typing on: the other sees it, and cannot take it', async () => {
    await thing(anaPage).locator('.map-name').dblclick()
    await benPage.getByRole('status', { name: 'Ana has hold of thing' }).waitFor({ timeout: PATIENCE })
    await picture(benPage, 'together-typing')
    const was = (await thing(benPage).boundingBox())!
    await benPage.mouse.move(was.x + was.width / 2, was.y + 12)
    await benPage.mouse.down()
    await benPage.mouse.move(was.x + 200, was.y + 200, { steps: 6 })
    await benPage.mouse.up()
    const after = (await thing(benPage).boundingBox())!
    expect(Math.abs(after.x - was.x)).toBeLessThan(1)
    await anaPage.keyboard.type('renamed')
    await anaPage.keyboard.press('Enter')
    await benPage.locator('.map-world [data-card="thing"] .map-name', { hasText: 'renamed' }).waitFor({ timeout: PATIENCE })
    await expect.poll(() => benPage.getByRole('status', { name: 'Ana has hold of' }).count(), { timeout: PATIENCE }).toBe(0)
  })
})
