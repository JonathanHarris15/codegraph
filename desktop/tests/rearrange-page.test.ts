// codegraph: test ui canvas
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aMappedRepo, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** Moving a map's cards and its wires' words about: a map is read from the
 *  code, so where a person likes things is kept beside it, and going into a
 *  card takes two clicks so one can drag. */
const PATIENCE = 15_000

let yard: Yard
let app: ElectronApplication
let page: Page

const card = (name: string): Locator => page.getByRole('button', { name: `Open ${name}` })
/** A card by its id, since a card with nothing inside it does not open and
 *  so is no button. */
const onBoard = (id: string): Locator => page.locator(`.map-card[data-card="${id}"]`)
const boxOf = async (one: Locator): Promise<{ x: number; y: number }> => {
  const box = (await one.boundingBox())!
  return { x: Math.round(box.x), y: Math.round(box.y) }
}
const drag = async (one: Locator, dx: number, dy: number): Promise<void> => {
  const box = (await one.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 12)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + 12 + dy, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(400)
}
const kept = (): { id: string; x: number; y: number }[] =>
  JSON.parse(readFileSync(join(yard.home, 'arrangements', 'notes-app.json'), 'utf8')).spots

beforeAll(async () => {
  yard = openYard('rearrange')
  const repo = aMappedRepo(yard)
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
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await card('notes').waitFor({ timeout: PATIENCE })
  await page.waitForTimeout(900)
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('moving a map about', () => {
  it('goes into a card on a double-click, not on a single one', async () => {
    await card('notes').click()
    await page.waitForTimeout(600)
    expect(await card('web').count()).toBe(0)
    await card('notes').dblclick()
    await card('web').waitFor({ timeout: PATIENCE })
    await page.waitForTimeout(900)
  })

  it('drags a card to where it is dropped, and leaves the others alone', async () => {
    const was = await boxOf(card('web'))
    const still = await boxOf(onBoard('notes/container:db'))
    await drag(card('web'), -160, -90)
    const now = await boxOf(card('web'))
    expect(now.x).toBeLessThan(was.x - 80)
    expect(now.y).toBeLessThan(was.y - 40)
    expect(await boxOf(onBoard('notes/container:db'))).toEqual(still)
  })

  it('keeps where it was put beside the map, so it is there next time', async () => {
    const spots = kept()
    expect(spots.length).toBeGreaterThan(1)
    expect(spots.map((s) => s.id)).toContain('notes/container:web')
  })

  it("drags a wire's words out from under whatever they sit on", async () => {
    const said = page.locator('.map-sentence').first()
    const words = (await said.textContent()) ?? ''
    const was = await boxOf(said)
    await drag(said, 70, 60)
    const again = page.locator('.map-sentence', { hasText: words }).first()
    const now = await boxOf(again)
    expect(now.x).toBeGreaterThan(was.x + 30)
    expect(now.y).toBeGreaterThan(was.y + 30)
  })

  it("lets go of a moved sentence when a card its wire joins is dragged", async () => {
    // A wire bent through a sentence is two curves; a smooth one is one.
    const bent = (): Promise<number> =>
      page.$$eval('.map-wire path', (paths) => paths.filter((path) => (path.getAttribute('d') ?? '').split('C').length > 2).length)
    const moved = kept().find((spot) => spot.id.includes('>'))!
    const joined = onBoard(moved.id.split('>')[0]!)
    expect(await bent()).toBeGreaterThan(0)

    const box = (await joined.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 12)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + 12 + 30, { steps: 8 })
    // Already smooth, with the card still in the hand.
    expect(await bent()).toBe(0)
    await page.mouse.up()
    await page.waitForTimeout(400)
    expect(await bent()).toBe(0)
    expect(kept().map((spot) => spot.id)).not.toContain(moved.id)

    // And now it goes along with the wire.
    const said = page.locator('.map-sentence').first()
    const was = await boxOf(said)
    await drag(joined, 80, 0)
    const now = await boxOf(said)
    expect(now.x - was.x).toBeGreaterThan(10)
    expect(await bent()).toBe(0)
  })

  it('puts a card back where the map had it, from the right-click menu', async () => {
    const moved = await boxOf(card('web'))
    await card('web').click({ button: 'right' })
    await page.getByRole('menu', { name: 'What to do here' }).waitFor({ timeout: PATIENCE })
    await page.getByRole('menuitem', { name: /Put it back/ }).click()
    await page.waitForTimeout(500)
    const back = await boxOf(card('web'))
    expect(back.x).toBeGreaterThan(moved.x + 80)
    expect(kept().map((s) => s.id)).not.toContain('notes/container:web')
  })

  it('fills the screen with the card under the pointer when F is pressed', async () => {
    const db = onBoard('notes/container:db')
    const was = (await db.boundingBox())!
    await db.hover()
    await page.keyboard.press('f')
    await page.waitForTimeout(600)
    const now = (await db.boundingBox())!
    expect(now.width).toBeGreaterThan(was.width * 1.5)
  })

  it("lights up a card's wires while the pointer is over it", async () => {
    await page.mouse.move(10, 500)
    await page.waitForTimeout(200)
    expect(await page.locator('.map-wire--lit').count()).toBe(0)
    await onBoard('notes/container:db').hover()
    await page.waitForTimeout(200)
    expect(await page.locator('.map-wire--lit').count()).toBeGreaterThan(0)
    expect(await page.locator('.map-wire-flow').count()).toBeGreaterThan(0)
  })
})
