// codegraph: test ui canvas
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aMappedRepo, aPicture, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** The built app on a blank computer that knows one project: the notes app
 *  the tests write by hand. */
const PATIENCE = 15_000
/** Where a run leaves pictures of what it saw, when asked to. */
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page

const shown = async (locator: Locator): Promise<string> => {
  const one = locator.first()
  await one.waitFor({ state: 'visible', timeout: PATIENCE })
  return (await one.textContent()) ?? ''
}

const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}

/** Lets a card finish opening before looking. */
const settle = (): Promise<void> => page.waitForTimeout(900)

beforeAll(async () => {
  yard = openYard('canvas')
  const repo = aMappedRepo(yard)
  // Set-up repos keep their screenshots out of git, as this one does.
  writeFileSync(join(repo, '.git', 'info', 'exclude'), 'codegraph-screenshots/\n')
  mkdirSync(join(repo, 'codegraph-screenshots'))
  writeFileSync(join(repo, 'codegraph-screenshots', 'new-note.png'), aPicture())
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [
        { id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] },
      ],
    }),
  )
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.waitForLoadState('domcontentloaded')
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('the canvas in the real app', () => {
  it('opens a project from the grid onto its map', async () => {
    await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
    expect(await shown(page.getByRole('button', { name: 'Open notes' }))).toContain('notes')
    await settle()
    await picture('1-project')
  })

  it("shows each software system's branch on its card at the project level, not in the bar", async () => {
    const onCard = page.locator('.map-world').getByRole('button', { name: 'Branch of notes' })
    expect(await shown(onCard)).toContain('main')
    expect(await page.locator('.map-bar').getByRole('button', { name: /^Branch of/ }).count()).toBe(0)
  })

  it('suggests what the code calls out to, and draws it once agreed', async () => {
    expect(await shown(page.getByLabel('Suggested software systems'))).toContain('The code calls mailer')
    await page.getByRole('button', { name: 'Add it' }).click()
    expect(await shown(page.getByLabel('mailer', { exact: true }))).toContain('shallow software system')
    expect(await page.getByLabel('Wire: notes calls mailer to tell the owner').count()).toBe(1)
    await settle()
    await picture('1b-shallow')
  })

  it('opens a software system and shows its containers, wired together', async () => {
    await page.getByRole('button', { name: 'Open notes' }).dblclick()
    expect(await shown(page.getByRole('button', { name: 'Open web' }))).toContain('browser app')
    expect(await shown(page.getByLabel('db', { exact: true }))).toContain('database')
    // Opening notes keeps the project level around it, so its wires are on
    // screen too: name the one we mean rather than taking the first.
    expect(await page.getByLabel('Wire: web keeps notes in db').count()).toBe(1)
    await settle()
    await picture('2-system')
  })

  it('opens a container and shows its pages as frames, with the wires between components', async () => {
    await page.getByRole('button', { name: 'Open web' }).dblclick()
    expect(await shown(page.getByRole('button', { name: 'Open new-note' }))).toContain('/notes/new')
    expect(await shown(page.getByText('No screenshot yet'))).toBe('No screenshot yet')
    await page.getByRole('img', { name: 'new-note as it looks' }).waitFor({ state: 'visible', timeout: PATIENCE })
    expect(await page.getByLabel('Wire: new-note asks write-note to save what was typed').count()).toBe(1)
    expect(await shown(page.getByRole('navigation', { name: 'Where you are' }))).toContain('web')
    await settle()
    await picture('3-container')
  })

  it('opens down to the code', async () => {
    await page.getByRole('button', { name: 'Open write-note' }).dblclick()
    expect(await shown(page.getByText('writeNote'))).toBe('writeNote')
    await settle()
    await picture('4-code')
  })

  it('backs out', async () => {
    await page.keyboard.press('Escape')
    await settle()
    await page.keyboard.press('Escape')
    expect(await shown(page.getByRole('button', { name: 'Open web' }))).toContain('web')
  })

  it('reads another branch when it is picked, without leaving the level', async () => {
    const branch = page.getByRole('button', { name: 'Branch of notes' })
    expect(await shown(branch)).toContain('main')
    await branch.click()
    const menu = page.getByRole('menu', { name: 'Branches of notes' })
    expect(await shown(menu.getByRole('menuitemradio', { name: /^main/ }))).toContain('checked out')
    expect(await shown(menu.getByRole('menuitemradio', { name: /^add-search/ }))).toContain('local')
    await menu.getByRole('menuitemradio', { name: /^add-search/ }).click()
    await expect.poll(async () => branch.textContent(), { timeout: PATIENCE }).toContain('not checked out')
    await page.getByRole('button', { name: 'Open web' }).dblclick()
    expect(await shown(page.getByRole('button', { name: 'Open search' }))).toContain('/search')
    await settle()
    await picture('5-branch')
  })

  it('switches the folder to the branch being looked at, from the bar', async () => {
    await page.getByRole('button', { name: 'Switch folder to add-search' }).click()
    const branch = page.getByRole('button', { name: 'Branch of notes' })
    await expect.poll(async () => branch.textContent(), { timeout: PATIENCE }).not.toContain('not checked out')
    await expect.poll(async () => branch.textContent(), { timeout: PATIENCE }).toContain('add-search')
    await expect.poll(() => page.getByRole('button', { name: /^Switch folder/ }).count(), { timeout: PATIENCE }).toBe(0)
  })

  it('opens on the branch picked for a repo on the projects page', async () => {
    await page.getByRole('button', { name: '← Projects' }).click()
    const row = page.getByRole('button', { name: 'Branch of notes' })
    expect(await shown(row)).toContain('add-search')
    await row.click()
    await page.getByRole('menu', { name: 'Branches of notes' }).getByRole('menuitemradio', { name: /^main/ }).click()
    await expect.poll(async () => row.textContent(), { timeout: PATIENCE }).toContain('main')
    await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
    const card = page.locator('.map-world').getByRole('button', { name: 'Branch of notes' })
    await expect.poll(async () => card.textContent(), { timeout: PATIENCE }).toContain('main')
    await page.getByRole('button', { name: 'Open notes' }).dblclick()
    const bar = page.locator('.map-bar').getByRole('button', { name: 'Branch of notes' })
    await expect.poll(async () => bar.textContent(), { timeout: PATIENCE }).toContain('main')
    expect(await bar.textContent()).toContain('not checked out')
  })
})
