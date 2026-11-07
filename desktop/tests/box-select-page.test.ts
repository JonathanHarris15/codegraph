// codegraph: test ui canvas
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Layer } from '../src/modules/annotations/index.js'
import { aMappedRepo, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** Picking with Shift while a card is open: annotations out around it can be
 *  reached without backing out, and nothing else out there can. */
const PATIENCE = 15_000

let yard: Yard
let app: ElectronApplication
let page: Page

const picked = (): Locator => page.locator('.map-anno--picked')
const note = (): Locator => page.getByRole('button', { name: /Annotation: .*out here/ })
const beside = (): Locator => page.getByRole('button', { name: /Annotation: .*beside web/ })
/** The notes as kept: once saved, each goes to the file for its map's branch. */
const kept = (): Layer[] => {
  const onMain = join(yard.home, 'annotations', 'notes-app', encodeURIComponent('notes@local:main') + '.json')
  const file = existsSync(onMain) ? onMain : join(yard.home, 'annotations', 'notes-app.json')
  return (JSON.parse(readFileSync(file, 'utf8')) as { layers: Layer[] }).layers
}
const boxOf = async (one: Locator): Promise<{ x: number; y: number; width: number; height: number }> => (await one.boundingBox())!
const openArea = (): Locator => page.locator('.map-card--open').first()
/** A box drawn with Shift held, from one spot to another. */
const shiftBox = async (from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> => {
  await page.keyboard.down('Shift')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await page.waitForTimeout(150)
}
const round = async (one: Locator, by = 14): Promise<[{ x: number; y: number }, { x: number; y: number }]> => {
  const box = await boxOf(one)
  return [
    { x: box.x - by, y: box.y - by },
    { x: box.x + box.width + by, y: box.y + box.height + by },
  ]
}
const letGo = async (): Promise<void> => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
}

beforeAll(async () => {
  yard = openYard('box-select')
  const repo = aMappedRepo(yard)
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [{ id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] }],
    }),
  )
  mkdirSync(join(yard.home, 'annotations'), { recursive: true })
  const item = { kind: 'sticky', w: 150, h: 90, x: 300, y: -60, at: 'notes' }
  writeFileSync(
    join(yard.home, 'annotations', 'notes-app.json'),
    JSON.stringify({
      version: 1,
      layers: [
        {
          id: 'l',
          name: 'Layer 1',
          shown: true,
          snaps: false,
          items: [
            { ...item, id: 'outer', text: 'out here' },
            // Drawn while the card was open, so it belongs to the card's level,
            // but it sits out past the card's border, where annotations go.
            { ...item, id: 'beside', at: 'notes/container:web', x: -1000, y: -300, text: 'beside web' },
          ],
        },
      ],
    }),
  )
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).dblclick()
  await page.getByRole('button', { name: 'Open web' }).waitFor({ timeout: PATIENCE })
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'Open web' }).dblclick()
  await page.waitForTimeout(1200)
  // Far enough out to see the level around the open card.
  const area = (await page.locator('.map-frame-area').boundingBox())!
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2)
  for (let i = 0; i < 5; i += 1) await page.mouse.wheel(0, 120)
  await page.waitForTimeout(500)
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('picking with Shift around an open card', () => {
  it('starts with the annotation faded, out around the open card', async () => {
    await page.screenshot({ path: process.env.CODEGRAPH_SHOT ?? join(yard.home, 'shot.png') })
    expect(await openArea().count()).toBe(1)
    expect(await note().evaluate((el) => el.closest('.map-up') !== null)).toBe(true)
  })

  it('does not pick it with a plain press', async () => {
    const box = await boxOf(note())
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(150)
    expect(await picked().count()).toBe(0)
  })

  it('picks it with a Shift box, and it stops fading', async () => {
    const [from, to] = await round(note())
    await shiftBox(from, to)
    expect(await picked().count()).toBe(1)
    expect(await note().evaluate((el) => el.closest('.map-up') !== null)).toBe(false)
    await page.getByRole('toolbar', { name: 'What to do with the annotation' }).waitFor({ timeout: PATIENCE })
  })

  it('moves it by dragging, with the card still open', async () => {
    const was = kept()[0]!.items.find((one) => one.id === 'outer')!
    const box = await boxOf(note())
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 20, { steps: 8 })
    await page.mouse.up()
    await expect.poll(() => kept()[0]!.items.find((one) => one.id === 'outer')!.x).toBeGreaterThan(was.x + 10)
    expect(await openArea().count()).toBe(1)
    await letGo()
    expect(await picked().count()).toBe(0)
  })

  it('picks it with a Shift-click too', async () => {
    const box = await boxOf(note())
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await shiftBox(at, at)
    expect(await picked().count()).toBe(1)
    await letGo()
  })

  it('reaches it with a box started inside the open card, too', async () => {
    const area = await boxOf(page.locator('.map-card--open:not(.map-up)'))
    const target = await boxOf(note())
    // From an empty top corner of the card, clear of its handles and its cards.
    await shiftBox({ x: area.x + area.width - 30, y: area.y + 40 }, { x: target.x + 10, y: target.y + 5 })
    expect(await note().evaluate((el) => el.closest('.map-anno--picked') !== null)).toBe(true)
    await letGo()
  })

  it("picks one drawn on the open card's level but sitting past its border, from a box started out there", async () => {
    const area = await boxOf(openArea())
    const spot = await boxOf(beside())
    expect(spot.x + spot.width < area.x || spot.y + spot.height < area.y).toBe(true)
    const [from, to] = await round(beside())
    await shiftBox(from, to)
    expect(await picked().count()).toBe(1)
    expect(await beside().evaluate((el) => el.closest('.map-anno--picked') !== null)).toBe(true)
    await letGo()
  })

  it('still will not pick a card out there', async () => {
    const db = page.locator('.map-card.map-up').first()
    const [from, to] = await round(db)
    await shiftBox(from, to)
    expect(await page.getByRole('toolbar', { name: 'What to do with what is picked' }).count()).toBe(0)
    expect(await db.evaluate((el) => el.classList.contains('map-card--selected'))).toBe(false)
  })

  it('deletes what it picked', async () => {
    const [from, to] = await round(note())
    await shiftBox(from, to)
    await page.keyboard.press('Delete')
    await expect.poll(() => kept()[0]!.items.map((one) => one.id)).toEqual(['beside'])
    expect(await openArea().count()).toBe(1)
  })
})

describe('picking with Shift on a sketch', () => {
  it('reaches an annotation out around the open card, and only with Shift', async () => {
    await page.getByRole('button', { name: 'Back out of web' }).click()
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: /^Sketches/ }).click()
    await page.getByRole('button', { name: 'New sketch' }).click()
    await page.getByRole('button', { name: /^From the map/ }).click()
    const world = page.locator('.map-world')
    const web = world.getByRole('button', { name: 'web', exact: true })
    await web.waitFor({ timeout: PATIENCE })
    await page.waitForTimeout(600)

    await page.keyboard.press('Shift+A')
    await page.getByRole('button', { name: 'Add sticky note' }).click()
    const box = await boxOf(web)
    await page.mouse.click(box.x + box.width / 2, box.y - 110)
    await page.getByRole('textbox', { name: 'Annotation text' }).waitFor({ timeout: PATIENCE })
    await page.keyboard.type('misc diagram')
    const area = await boxOf(page.locator('.map-frame-area'))
    await page.mouse.click(area.x + area.width - 30, area.y + area.height - 30)
    const sticky = page.locator('.map-anno--sticky').filter({ hasText: 'misc diagram' })
    await sticky.waitFor({ timeout: PATIENCE })

    const opening = await boxOf(web)
    await page.mouse.dblclick(opening.x + opening.width / 2, opening.y + opening.height - 12)
    await page.waitForTimeout(1200)
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2)
    for (let i = 0; i < 5; i += 1) await page.mouse.wheel(0, 120)
    await page.waitForTimeout(500)
    expect(await sticky.evaluate((el) => el.classList.contains('map-up'))).toBe(true)

    const [from, to] = await round(sticky)
    await shiftBox(from, to)
    expect(await picked().count()).toBe(1)
    await page.keyboard.press('Delete')
    await expect.poll(() => sticky.count()).toBe(0)
    expect(await page.locator('.map-card--open').count()).toBeGreaterThan(0)
  })
})
