// codegraph: test ui sketch
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aMappedRepo, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** A blank sketch with a phone app drawn as a software system of its own,
 *  Billing beside it, and a person who uses the phone app. Dragging the phone
 *  app onto Billing puts it inside, as one of Billing's containers. */
const PATIENCE = 15_000
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page

const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}
const card = (name: string): Locator => page.locator('.map-world').getByRole('button', { name, exact: true })
const spot = async (across: number, down: number): Promise<{ x: number; y: number }> => {
  const box = (await page.locator('.map-frame-area').boundingBox())!
  return { x: box.x + box.width * across, y: box.y + box.height * down }
}
const middle = async (locator: Locator): Promise<{ x: number; y: number }> => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const place = async (kind: string, name: string, across: number, down: number): Promise<void> => {
  await page.getByRole('button', { name: `Card: ${kind}` }).click()
  const at = await spot(across, down)
  await page.mouse.click(at.x, at.y)
  await page.getByLabel('Card name').waitFor({ timeout: PATIENCE })
  await page.keyboard.type(name)
  await page.keyboard.press('Enter')
  await card(name).waitFor({ timeout: PATIENCE })
}

beforeAll(async () => {
  yard = openYard('move-inside')
  const repo = aMappedRepo(yard)
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({ version: 2, projects: [{ id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] }] }),
  )
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).waitFor({ timeout: PATIENCE })
  await page.getByRole('button', { name: /^Project sketches/ }).click()
  await page.getByRole('button', { name: 'New sketch' }).click()
  await page.getByRole('button', { name: /^Blank/ }).click()
  await place('software system', 'billing', 0.3, 0.45)
  await place('software system', 'phone', 0.7, 0.45)
  await place('person', 'ana', 0.7, 0.85)
  await card('ana').hover()
  const dot = card('ana').locator('.map-handle--n')
  await dot.waitFor({ timeout: PATIENCE })
  const from = await middle(dot)
  const to = await middle(card('phone'))
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
  await page.getByRole('button', { name: /^Wire: ana .* phone/ }).waitFor({ timeout: PATIENCE })
}, 90_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('putting a software system inside another on a sketch', () => {
  it('says what letting go will do while the card is held over one that can hold it', async () => {
    await page.mouse.click((await spot(0.5, 0.1)).x, (await spot(0.5, 0.1)).y)
    const from = await middle(card('phone'))
    const to = await middle(card('billing'))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 16 })
    await page.getByRole('status').filter({ hasText: 'Let go to put it inside billing' }).waitFor({ timeout: PATIENCE })
    expect(await card('billing').getAttribute('class')).toContain('map-card--target')
    await picture('move-inside-held')
    await page.mouse.up()
  })

  it('puts it inside, and points the wire to it at the card it went into', async () => {
    await expect.poll(() => card('phone').count(), { timeout: PATIENCE }).toBe(0)
    await page.getByRole('button', { name: /^Wire: ana .* billing/ }).waitFor({ timeout: PATIENCE })
    await picture('move-inside-done')
  })

  it('runs the wire on to it inside, as one of its containers', async () => {
    await card('billing').dblclick()
    await card('phone').waitFor({ timeout: PATIENCE })
    expect(await card('phone').textContent()).not.toContain('software system')
    expect(await page.locator('.map-hub').count()).toBeGreaterThan(0)
    await page.waitForTimeout(800)
    await picture('move-inside-opened')
  })

  it('comes back out with one undo', async () => {
    // Escape with nothing picked backs out a level.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    await page.keyboard.press('Control+z')
    await card('phone').waitFor({ timeout: PATIENCE })
    await page.getByRole('button', { name: /^Wire: ana .* phone/ }).waitFor({ timeout: PATIENCE })
  })
})
