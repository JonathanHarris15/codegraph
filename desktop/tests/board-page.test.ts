// codegraph: test ui canvas
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aMappedRepo, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** Moving round the board the way a hand does: a trackpad's two fingers pan
 *  and, with Ctrl, zoom; a mouse wheel zooms and, with Ctrl or Shift, pans;
 *  and dragging the empty board moves it. */
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

/** One wheel event as a Mac hands it over, recorded from a real mouse.
 *  It is made by hand because Playwright's own wheel cannot set the notch
 *  count apart from the step. */
type Scroll = { deltaY: number; wheelDeltaY: number; ctrlKey?: boolean; metaKey?: boolean }
const replay = async (steps: Scroll[]): Promise<void> => {
  await page.evaluate(async (all) => {
    const area = document.querySelector('.map-frame-area')!
    const box = area.getBoundingClientRect()
    for (const step of all) {
      area.dispatchEvent(
        new WheelEvent('wheel', {
          ...step,
          bubbles: true,
          cancelable: true,
          clientX: box.left + box.width / 2,
          clientY: box.top + box.height / 2,
        }),
      )
      // A real wheel's events come a frame apart, not all at once.
      await new Promise((done) => requestAnimationFrame(() => setTimeout(done)))
    }
  }, steps)
  await page.waitForTimeout(300)
}
/** A fast flick of a Mac mouse wheel: it starts on whole notches, then the Mac
 *  speeds it up and the steps turn uneven, but the notches stay whole. */
const flick: Scroll[] = [
  { deltaY: -120, wheelDeltaY: 360 },
  { deltaY: -120, wheelDeltaY: 360 },
  { deltaY: -414.4158935546875, wheelDeltaY: 1080 },
  { deltaY: -270.870361328125, wheelDeltaY: 720 },
  { deltaY: -299.13818359375, wheelDeltaY: 840 },
]

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
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).dblclick()
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

  it('still pans for a trackpad whose steps are big and uneven', async () => {
    await pause()
    const was = await where()
    await replay([{ deltaY: 62.5, wheelDeltaY: -187 }])
    const now = await where()
    expect(now.w).toBeCloseTo(was.w, 0)
    expect(was.y - now.y).toBeCloseTo(62.5, 0)
  })

  it('pans, and does not zoom, with Ctrl or Cmd on a fast flick of a Mac mouse', async () => {
    await pause()
    const travel = flick.reduce((sum, step) => sum - step.deltaY, 0)
    for (const key of ['ctrlKey', 'metaKey'] as const) {
      const was = await where()
      await replay(flick.map((step) => ({ ...step, [key]: true })))
      const now = await where()
      expect(now.w).toBeCloseTo(was.w, 0)
      expect(now.y - was.y).toBeCloseTo(travel, 0)
      await pause()
    }
  })

  it('zooms the whole way, at a steady pace, on a fast flick of a Mac mouse', async () => {
    await pause()
    const was = await where()
    await replay(flick)
    const now = await where()
    // Five steps, none counting for more than one notch, however fast it spun.
    expect(now.w / was.w).toBeCloseTo(Math.exp(0.0015 * 120 * flick.length), 1)
  })

  it('glides from one click of a mouse wheel to the next, rather than jumping', async () => {
    await pause()
    await replay([{ deltaY: 120, wheelDeltaY: -360 }, { deltaY: 120, wheelDeltaY: -360 }])
    await pause()
    const widths = await page.evaluate(async () => {
      const area = document.querySelector('.map-frame-area')!
      const box = area.getBoundingClientRect()
      const width = (): number => document.querySelector('[aria-label="Open web"]')!.getBoundingClientRect().width
      const seen = [width()]
      area.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -120,
          wheelDeltaY: 360,
          bubbles: true,
          cancelable: true,
          clientX: box.left + box.width / 2,
          clientY: box.top + box.height / 2,
        } as WheelEventInit),
      )
      for (let i = 0; i < 30; i += 1) {
        await new Promise((done) => requestAnimationFrame(done))
        seen.push(width())
      }
      return seen
    })
    const steps = new Set(widths.map((w) => w.toFixed(2)))
    expect(steps.size).toBeGreaterThan(3)
    for (let i = 1; i < widths.length; i += 1) expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]! - 0.01)
    expect(widths.at(-1)! / widths[0]!).toBeCloseTo(Math.exp(0.0015 * 120), 2)
  })
})
