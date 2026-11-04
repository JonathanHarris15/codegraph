// codegraph: test ui canvas
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

/** Moving round the board the way a hand does: a trackpad's two fingers pan
 *  and, with Ctrl, zoom; a mouse wheel zooms and, with Ctrl or Shift, pans;
 *  and dragging the empty board moves it. */
const appFolder = resolve(import.meta.dirname, '..')
const PATIENCE = 15_000

let yard: Yard
let app: ElectronApplication
let page: Page

const card = (): Locator => page.getByRole('button', { name: 'Open web' })
const where = async (): Promise<{ x: number; y: number; w: number }> => {
  const box = (await card().boundingBox())!
  return { x: box.x, y: box.y, w: box.width }
}
/** Waits out the end of one swipe, so the next one is heard on its own. */
const pause = (): Promise<void> => page.waitForTimeout(500)
const centre = async (): Promise<void> => {
  const box = (await page.locator('.map-frame-area').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.85)
}

beforeAll(async () => {
  yard = openYard('board')
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
  app = await electron.launch({ args: ['.', `--user-data-dir=${yard.home}`], cwd: appFolder })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).click()
  await card().waitFor({ timeout: PATIENCE })
  await page.waitForTimeout(900)
  await centre()
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('moving round the board', () => {
  it('pans with two fingers on a trackpad', async () => {
    const was = await where()
    await page.mouse.wheel(12.5, 30.5)
    await page.waitForTimeout(100)
    const now = await where()
    // The screen's scaling stretches the steps, but not their shape.
    expect(now.w).toBeCloseTo(was.w, 0)
    expect(was.x - now.x).toBeGreaterThan(10)
    expect((was.y - now.y) / (was.x - now.x)).toBeCloseTo(30.5 / 12.5, 1)
    await pause()
  })

  it('zooms with Ctrl and two fingers on a trackpad', async () => {
    const was = await where()
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -8.5)
    await page.keyboard.up('Control')
    await page.waitForTimeout(100)
    expect((await where()).w).toBeGreaterThan(was.w)
    await pause()
  })

  it('zooms with a mouse wheel', async () => {
    const was = await where()
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(100)
    expect((await where()).w).toBeLessThan(was.w)
    await pause()
  })

  it('pans up and down with Ctrl and a mouse wheel, and across with Shift', async () => {
    const was = await where()
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, 100)
    await page.keyboard.up('Control')
    await page.waitForTimeout(100)
    const down = await where()
    expect(down.w).toBeCloseTo(was.w, 0)
    expect(was.y - down.y).toBeGreaterThan(90)
    expect(down.x).toBeCloseTo(was.x, 0)
    await pause()

    await page.keyboard.down('Shift')
    await page.mouse.wheel(0, 100)
    await page.keyboard.up('Shift')
    await page.waitForTimeout(100)
    const across = await where()
    expect(down.x - across.x).toBeGreaterThan(90)
    expect(across.y).toBeCloseTo(down.y, 0)
    expect(across.w).toBeCloseTo(down.w, 0)
  })

  it('pans when the empty board is dragged', async () => {
    const was = await where()
    const box = (await page.locator('.map-frame-area').boundingBox())!
    const from = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.9 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 60, from.y - 40, { steps: 8 })
    await page.mouse.up()
    const now = await where()
    expect(now.x - was.x).toBeCloseTo(60, 0)
    expect(now.y - was.y).toBeCloseTo(-40, 0)
  })
})
