// codegraph: test ui canvas
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aChurchRepo, closeYard, openTheApp, openYard, type Yard } from './yard.js'

const PATIENCE = 15_000
/** Where a run leaves pictures of what it saw, when asked to. */
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page

const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}
const settle = (): Promise<void> => page.waitForTimeout(900)
const open = async (name: string): Promise<void> => {
  const card = page.getByRole('button', { name: `Open ${name}`, exact: true })
  await card.waitFor({ state: 'visible', timeout: PATIENCE })
  await card.dblclick()
  await settle()
}

beforeAll(async () => {
  yard = openYard('stores-page')
  const repo = aChurchRepo(yard)
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [{ id: 'church', name: 'Church', createdAt: '', systems: [{ id: 'church', name: 'church', path: repo, remote: '' }] }],
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

describe('stores on the canvas', () => {
  it("opens a database to its stores, each listing its fields", async () => {
    await open('Church')
    await open('church')
    await open('firestore')
    const people = page.getByRole('list', { name: 'Fields of people' })
    await people.waitFor({ state: 'visible', timeout: PATIENCE })
    const lines = await people.getByRole('listitem').allTextContents()
    expect(lines).toEqual(['nametext', 'birthdaydate', 'sexmale or female', 'householdId→ households', 'customFieldsa record, open to text', 'photoa record of url, open to anything'])
    const households = await page.getByRole('list', { name: 'Fields of households' }).getByRole('listitem').allTextContents()
    expect(households).toEqual(['memberIds→ people', 'any otheranything'])
    expect(await page.locator('.map-world').textContent()).toContain('Its shape is unknown: no schema says it.')
    await picture('stores-1-database')
  })

  it('opens a store to the stores that live inside it', async () => {
    await open('people')
    await expect.poll(() => page.getByRole('list', { name: 'Fields of involvement' }).isVisible(), { timeout: PATIENCE }).toBe(true)
    expect(await page.getByRole('list', { name: 'Fields of involvement' }).getByRole('listitem').allTextContents()).toEqual([
      'roleId→ roles',
      'sincedate',
    ])
    expect(await page.getByRole('navigation', { name: 'Where you are' }).textContent()).toContain('peoplestore')
    await picture('stores-2-inner')
  })
})
