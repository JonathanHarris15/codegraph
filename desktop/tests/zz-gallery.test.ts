// codegraph: test ui projects, settings, canvas
// Design-pass gallery: not a test, a camera. Run with GALLERY=<folder>.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Page } from 'playwright'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { aMappedRepo, aPicture, aSoftwareSystem, closeYard, openTheApp, openYard, type Yard } from './yard.js'

const out = process.env.GALLERY ?? ''
let yard: Yard
let app: ElectronApplication
let page: Page

const snap = async (name: string): Promise<void> => {
  await page.waitForTimeout(700)
  if (out) await page.screenshot({ path: join(out, `${name}.png`) })
}
const theme = async (t: 'light' | 'dark'): Promise<void> => {
  await page.evaluate((x) => (document.documentElement.dataset['theme'] = x), t)
}
const both = async (name: string): Promise<void> => {
  await theme('light')
  await snap(`${name}-light`)
  await theme('dark')
  await snap(`${name}-dark`)
  await theme('light')
}

beforeAll(async () => {
  if (out) mkdirSync(out, { recursive: true })
  yard = openYard('gallery')
  const notes = aMappedRepo(yard)
  writeFileSync(join(notes, '.git', 'info', 'exclude'), 'codegraph-screenshots/\n')
  mkdirSync(join(notes, 'codegraph-screenshots'))
  writeFileSync(join(notes, 'codegraph-screenshots', 'new-note.png'), aPicture())
  const api = aSoftwareSystem(yard, 'billing-api', { setUp: true })
  const old = aSoftwareSystem(yard, 'old-site')
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [
        { id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: notes, remote: '' }] },
        {
          id: 'billing',
          name: 'Billing',
          createdAt: '',
          systems: [
            { id: 'billing-api', name: 'billing-api', path: api, remote: '' },
            { id: 'old-site', name: 'old-site', path: old, remote: '' },
          ],
        },
        { id: 'empty', name: 'Garden planner', createdAt: '', systems: [] },
      ],
    }),
  )
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ timeout: 15000 })
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('gallery', () => {
  it('projects', async () => {
    await page.getByText('Garden planner').first().waitFor({ timeout: 15000 })
    await both('01-projects')
    await page.getByRole('tab', { name: 'My sketches' }).click()
    await both('02-sketches-tab')
    await page.getByRole('tab', { name: 'Projects' }).click()
  }, 60_000)

  it('dialogs', async () => {
    await page.getByRole('button', { name: 'New project' }).first().click()
    await both('03-new-project')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'GitHub', exact: true }).click()
    await both('04-github')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Your agent' }).click()
    await both('05-agent')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }, 60_000)

  it('settings', async () => {
    await page.evaluate(() => (window.location.hash = '#/settings'))
    await both('06-settings')
    await page.evaluate(() => (window.location.hash = ''))
    await page.getByRole('heading', { name: 'Projects' }).waitFor({ timeout: 15000 })
  }, 60_000)

  it('canvas', async () => {
    await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
    await page.getByRole('button', { name: 'Open notes' }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await both('07-map-project')
    await page.getByRole('button', { name: 'Open notes' }).dblclick()
    await page.getByRole('button', { name: 'Open web' }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await both('08-map-system')
    await page.getByRole('button', { name: 'Open web' }).dblclick()
    await page.getByRole('button', { name: 'Open new-note' }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await both('09-map-container')
    await page.getByRole('button', { name: 'Open write-note' }).dblclick()
    await page.getByText('writeNote').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await both('10-map-code')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Show the overview' }).click()
    await both('11-overview')
    await page.getByRole('button', { name: 'Hide the overview' }).click()
    await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: /Keys/ }).click()
    await both('13-keys')
    await page.keyboard.press('Escape')
  }, 90_000)

  it('sketch', async () => {
    await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: /^Sketch/ }).click()
    await page.waitForTimeout(1500)
    await both('14-sketch')
    await page.getByRole('button', { name: 'Hand to your agent' }).first().click()
    await both('15-hand-to-agent')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.mouse.click(820, 700, { button: 'right' })
    await both('12-board-menu')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const card = page.locator('.map-world .map-card[role="button"]').first()
    await card.click()
    await both('16-sketch-picked')
  }, 90_000)
})
