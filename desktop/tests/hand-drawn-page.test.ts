// codegraph: test ui canvas
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aMappedRepo, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** People and shallow software systems on a real project's map: added where
 *  the board is right-clicked, named there, and taken away again. */
const PATIENCE = 15_000
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

const settle = (): Promise<void> => page.waitForTimeout(900)

/** Right-clicks the board, clear of the cards, and hands back its menu. */
const menuOnBoard = async (): Promise<Locator> => {
  const board = (await page.locator('.map-frame-area').boundingBox())!
  await page.mouse.click(board.x + board.width * 0.15, board.y + board.height * 0.85, { button: 'right' })
  const menu = page.getByRole('menu', { name: 'What to do here' })
  await menu.waitFor({ timeout: PATIENCE })
  return menu
}

const menuOn = async (card: Locator): Promise<Locator> => {
  await card.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'What to do here' })
  await menu.waitFor({ timeout: PATIENCE })
  return menu
}

beforeAll(async () => {
  yard = openYard('hand-drawn')
  const repo = aMappedRepo(yard)
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [{ id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] }],
    }),
  )
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await shown(page.getByRole('button', { name: 'Open notes' }))
  await settle()
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('people and shallow software systems drawn on the map by hand', () => {
  it('adds a person where the board is right-clicked, and names them there', async () => {
    await (await menuOnBoard()).getByRole('menuitem', { name: 'Add a person here' }).click()
    const name = page.getByLabel('Card name')
    await name.waitFor({ timeout: PATIENCE })
    await name.fill('Note taker')
    await name.press('Enter')
    expect(await shown(page.getByLabel('Note taker', { exact: true }))).toContain('Note taker')
    await settle()
    await picture('hand-1-person')
  })

  it('adds a shallow software system, which the code reaches once it has the name the code calls', async () => {
    await (await menuOnBoard()).getByRole('menuitem', { name: 'Add a shallow software system here' }).click()
    const name = page.getByLabel('Card name')
    await name.waitFor({ timeout: PATIENCE })
    await name.fill('mailer')
    await name.press('Enter')
    expect(await shown(page.getByLabel('mailer', { exact: true }))).toContain('shallow software system')
    await expect.poll(() => page.getByLabel('Wire: notes calls mailer to tell the owner').count(), { timeout: PATIENCE }).toBe(1)
    expect(await page.getByLabel('Suggested software systems').count()).toBe(0)
    await settle()
    await picture('hand-2-shallow')
  })

  it('renames one from its menu', async () => {
    await (await menuOn(page.getByLabel('Note taker', { exact: true }))).getByRole('menuitem', { name: 'Rename' }).click()
    const name = page.getByLabel('Card name')
    await name.fill('Owner')
    await name.press('Enter')
    expect(await shown(page.getByLabel('Owner', { exact: true }))).toContain('Owner')
  })

  it('takes a person off the map with Delete', async () => {
    await page.getByLabel('Owner', { exact: true }).click()
    await page.keyboard.press('Delete')
    await expect.poll(() => page.getByLabel('Owner', { exact: true }).count(), { timeout: PATIENCE }).toBe(0)
  })

  it('takes a shallow software system off from its menu, and asks again since the code still calls it', async () => {
    await (await menuOn(page.getByLabel('mailer', { exact: true }))).getByRole('menuitem', { name: 'Take it off the map' }).click()
    await expect.poll(() => page.getByLabel('mailer', { exact: true }).count(), { timeout: PATIENCE }).toBe(0)
    expect(await shown(page.getByLabel('Suggested software systems'))).toContain('The code calls mailer')
  })

  it('offers nothing of the kind on a software system read from a repo', async () => {
    const menu = await menuOn(page.getByRole('button', { name: 'Open notes' }))
    expect(await menu.getByRole('menuitem', { name: /off the map|^Rename/ }).count()).toBe(0)
    await page.keyboard.press('Escape')
  })
})
