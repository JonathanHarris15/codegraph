// codegraph: test ui canvas, sketch
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aChurchRepo, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** Drawing a church's stores on a sketch, the way a person would. */
const PATIENCE = 15_000
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
const fieldsOf = (store: string): Locator => page.getByRole('list', { name: `Fields of ${store}` })
const lines = async (store: string): Promise<string[]> => {
  await fieldsOf(store).waitFor({ state: 'visible', timeout: PATIENCE })
  return fieldsOf(store).getByRole('listitem').allTextContents()
}
const spot = async (across: number, down: number): Promise<{ x: number; y: number }> => {
  const box = (await page.locator('.map-frame-area').boundingBox())!
  return { x: box.x + box.width * across, y: box.y + box.height * down }
}

beforeAll(async () => {
  yard = openYard('store-sketches-page')
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

describe('stores on a sketch', () => {
  it('snapshots a database with every store and its fields', async () => {
    await open('Church')
    await open('church')
    await open('firestore')
    await page.getByRole('button', { name: /^Sketches/ }).click()
    await page.getByRole('button', { name: 'New sketch' }).click()
    await page.getByRole('button', { name: /^From the map/ }).click()
    await page.getByLabel('Sketch name').waitFor({ timeout: PATIENCE })
    expect(await lines('rosters')).toEqual(['personId→ people', 'countwhole number', 'doneyes or no'])
    expect(await lines('households')).toEqual(['memberIds→ people', 'any otheranything'])
  })

  it('offers only a store to add inside a database', async () => {
    const library = page.getByRole('complementary', { name: 'Cards' })
    await library.waitFor({ state: 'visible', timeout: PATIENCE })
    expect(await library.getByRole('button', { name: /^Card: / }).allTextContents()).toEqual([
      expect.stringContaining('store'),
    ])
  })

  it('adds a store, fixed and empty, and writes its fields beside the board', async () => {
    await page.getByRole('button', { name: 'Card: store' }).click()
    const at = await spot(0.5, 0.85)
    await page.mouse.click(at.x, at.y)
    await page.getByLabel('Card name').waitFor({ timeout: PATIENCE })
    await page.keyboard.type('services')
    await page.keyboard.press('Enter')
    await page.locator('.map-world').getByRole('button', { name: 'services', exact: true }).click()

    const shape = page.getByLabel('The shape of services')
    await shape.waitFor({ timeout: PATIENCE })
    expect(await shape.getByRole('radio', { name: /^Fixed/ }).isChecked()).toBe(true)
    await shape.getByRole('button', { name: 'Add a field' }).click()
    await shape.getByLabel('Name of field 1').fill('title')
    await shape.getByLabel('Every record has it').check()
    await shape.getByRole('button', { name: 'Add a field' }).click()
    await shape.getByLabel('Name of field 2').fill('leaderId')
    await shape.getByLabel('What field 2 points at').selectOption('people')
    await expect.poll(() => lines('services'), { timeout: PATIENCE }).toEqual(['titletext', 'leaderId→ people'])
    expect(await page.locator('.map-field-name--needed').filter({ hasText: 'title' }).count()).toBe(1)
  })

  it('adds fields on the store card itself, one after another', async () => {
    await page.getByRole('button', { name: 'Add a field to services' }).click()
    const name = page.getByLabel('Name of a new field of services')
    await name.waitFor({ timeout: PATIENCE })
    await name.fill('heldOn')
    await page.getByLabel('What the new field of services holds').selectOption('date')
    await name.press('Enter')
    await name.fill('location')
    await page.getByLabel('What the new field of services holds').selectOption('text')
    await name.press('Enter')
    await name.press('Escape')
    await expect
      .poll(() => lines('services'), { timeout: PATIENCE })
      .toEqual(['titletext', 'leaderId→ people', 'heldOndate', 'locationtext'])
    expect(await page.getByRole('button', { name: 'Add a field to services' }).count()).toBe(1)
    await picture('store-add-on-card')
    // Each field added is undone on its own, back to the two the rest of these
    // tests expect.
    await page.keyboard.press('Control+Z')
    await expect.poll(() => lines('services'), { timeout: PATIENCE }).toEqual(['titletext', 'leaderId→ people', 'heldOndate'])
    await page.keyboard.press('Control+Z')
    await expect.poll(() => lines('services'), { timeout: PATIENCE }).toEqual(['titletext', 'leaderId→ people'])
  })

  it('wires the store to the one a field points at', async () => {
    await expect
      .poll(() => page.getByRole('button', { name: /^Wire: services points at people/ }).count(), { timeout: PATIENCE })
      .toBe(1)
  })

  it('designs a store beside it on the board: data types, choices, lists, and inner stores', async () => {
    await page.locator('.map-world').getByRole('button', { name: 'services', exact: true }).click()
    await page.getByRole('button', { name: 'Fields and inner stores' }).click()
    const editor = page.getByRole('dialog', { name: 'Design services' })
    await editor.waitFor({ timeout: PATIENCE })
    await editor.getByRole('button', { name: 'Add a field' }).click()
    await editor.getByLabel('Name of field 3').fill('status')
    await editor.getByLabel('What field 3 holds').selectOption('choices')
    await editor.getByLabel('Choices for field 3, split by commas').fill('planned, held, cancelled')
    await editor.getByLabel('Choices for field 3, split by commas').blur()
    await editor.getByRole('button', { name: 'Add a field' }).click()
    await editor.getByLabel('Name of field 4').fill('hymns')
    await editor.getByLabel('What field 4 holds').selectOption('a list')
    await editor.getByLabel('Each item of field 4 is').selectOption('whole number')
    await expect
      .poll(() => lines('services'), { timeout: PATIENCE })
      .toEqual(['titletext', 'leaderId→ people', 'statusplanned, held or cancelled', 'hymnsa list of whole number'])

    await editor.getByLabel('Name of a new inner store').fill('readings')
    await editor.getByRole('button', { name: 'Add an inner store' }).click()
    await expect.poll(() => editor.getByRole('listitem').allTextContents(), { timeout: PATIENCE }).toContain('readings')
    expect(await page.locator('.map-world .map-chip--store').allTextContents()).toContain('readings')
    expect(await page.getByRole('toolbar', { name: 'What to do with what is picked' }).count()).toBe(0)
    const panel = page.getByRole('complementary').getByLabel('Choices for field 3, split by commas')
    if (await panel.count()) expect(await panel.inputValue()).toBe('planned, held, cancelled')
    await picture('store-editor')
    await editor.getByRole('button', { name: 'Close' }).click()
    await page.locator('.map-world').getByRole('button', { name: 'services', exact: true }).click()
  })

  it('opens a store up to say what any other field holds', async () => {
    const shape = page.getByLabel('The shape of services')
    await shape.getByRole('radio', { name: /^Open/ }).check()
    await shape.getByLabel('Any other field holds').selectOption('text')
    await expect
      .poll(() => lines('services'), { timeout: PATIENCE })
      .toEqual(['titletext', 'leaderId→ people', 'statusplanned, held or cancelled', 'hymnsa list of whole number', 'any othertext'])
    await picture('store-sketch')
  })
})
