// codegraph: test ui canvas, sketch
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Sketch } from '../src/modules/sketches/index.js'
import { messy, run } from './wardrobe-mess.js'
import { aMappedRepo, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** What is in focus on a level (ADR 0031): a still level shows no sentences;
 *  a card under the pointer, or picked, lights its wires and shows theirs; and
 *  a wire can be clicked on its line to show its own. */
const PATIENCE = 15_000
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page

const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}
const settle = (): Promise<void> => page.waitForTimeout(900)
const card = (name: string): Locator => page.locator(`.map-world [data-card][aria-label="${name}"]`)
const middle = async (locator: Locator): Promise<{ x: number; y: number }> => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
/** The sentences a person can see. */
const shown = (): Promise<number> => page.locator('.map-sentence:not(.map-sentence--quiet)').count()
/** Somewhere on a wire's own line, on the screen, a little way along it. */
const onWire = (index: number): Promise<{ x: number; y: number }> =>
  page.locator('.map-wire-hit').nth(index).evaluate((path) => {
    const line = path as SVGPathElement
    const at = line.getPointAtLength(line.getTotalLength() * 0.4)
    const m = line.getScreenCTM()!
    return { x: m.a * at.x + m.c * at.y + m.e, y: m.b * at.x + m.d * at.y + m.f }
  })
/** Off every card and every wire, where nothing is drawn. */
const away = async (): Promise<void> => {
  const board = (await page.locator('.map-frame-area').first().boundingBox())!
  await page.mouse.move(board.x + 8, board.y + board.height - 8)
  await page.waitForTimeout(250)
}

const keep = (id: string, name: string, sketch: Sketch): void => {
  const folder = join(yard.home, 'sketches', 'notes-app', id)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'sketch.json'), JSON.stringify({ ...sketch, id, name, projectId: 'notes-app' }))
}

beforeAll(async () => {
  yard = openYard('focus-page')
  const repo = aMappedRepo(yard)
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [{ id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] }],
    }),
  )
  keep('tidied', 'Tidied', run(messy(), [{ do: 'tidy', in: 'server' }]))
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.evaluate(() => window.localStorage.setItem('codegraph-panel', 'no'))
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).waitFor({ timeout: PATIENCE })
}, 60_000)

/** Opens the tidied sketch and goes inside the wardrobe server. */
const openSketch = async (): Promise<void> => {
  await page.getByRole('button', { name: /^Project sketches/ }).click()
  await page.getByRole('button', { name: /^Tidied/ }).click()
  await card('Wardrobe').waitFor({ timeout: PATIENCE })
  await settle()
  await card('Wardrobe').dblclick()
  await settle()
  if (!(await card('Wardrobe API').isVisible())) {
    await card('Wardrobe Backend').dblclick()
    await settle()
  }
  await card('Wardrobe API').waitFor({ timeout: PATIENCE })
  await settle()
}

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('on the map', () => {
  it('a wire can be clicked too, and a click on the board lets it go', async () => {
    await page.getByRole('button', { name: 'Open notes' }).dblclick()
    await page.locator('.map-wire-hit').first().waitFor({ timeout: PATIENCE })
    await settle()
    await away()
    expect(await shown()).toBe(0)
    const at = await onWire(0)
    await page.mouse.click(at.x, at.y)
    await away()
    await picture('focus-4-map-wire')
    expect(await page.locator('.map-sentence--selected:not(.map-sentence--quiet)').count()).toBe(1)
    const board = (await page.locator('.map-frame-area').first().boundingBox())!
    await page.mouse.click(board.x + 8, board.y + board.height - 8)
    await page.waitForTimeout(250)
    expect(await shown()).toBe(0)
    await page.keyboard.press('Escape')
    await settle()
  })
})

describe('a level at rest', () => {
  it('shows no wire’s sentence', async () => {
    await openSketch()
    await away()
    expect(await page.locator('.map-sentence').count()).toBeGreaterThan(10)
    expect(await shown()).toBe(0)
    await picture('focus-0-still')
  })
})

describe('a card in focus', () => {
  it('draws its wires in and shows their sentences while the pointer is on it', async () => {
    const at = await middle(card('Firestore'))
    await page.mouse.move(at.x, at.y)
    await page.waitForTimeout(100)
    // Its wires draw in from where they start.
    expect(await page.locator('.map-wire-draw').count()).toBeGreaterThan(2)
    await page.waitForTimeout(600)
    await picture('focus-1-hover')
    expect(await page.locator('.map-world--lit').count()).toBe(1)
    expect(await shown()).toBe(await page.locator('.map-wire--lit').count())
    await away()
    expect(await shown()).toBe(0)
  })

  it('keeps the focus once clicked, until it is let go', async () => {
    const firestore = await middle(card('Firestore'))
    await page.mouse.click(firestore.x, firestore.y)
    await away()
    await picture('focus-2-held')
    expect(await page.locator('.map-world--lit').count()).toBe(1)
    const held = await shown()
    expect(held).toBeGreaterThan(2)
    // Passing over another card does not move a held focus.
    const api = await middle(card('Wardrobe API'))
    await page.mouse.move(api.x, api.y)
    await page.waitForTimeout(250)
    expect(await card('Firestore').evaluate((el) => el.classList.contains('map-card--hovered'))).toBe(true)
    expect(await shown()).toBe(held)
    await away()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    expect(await page.locator('.map-world--lit').count()).toBe(0)
    expect(await shown()).toBe(0)
  })
})

describe('a wire', () => {
  it('can be clicked on its line, which shows its sentence', async () => {
    await away()
    const at = await onWire(0)
    await page.mouse.click(at.x, at.y)
    await away()
    await picture('focus-3-wire')
    expect(await page.locator('.map-sentence--selected:not(.map-sentence--quiet)').count()).toBe(1)
    expect(await page.locator('.map-wire--selected').count()).toBe(1)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    expect(await shown()).toBe(0)
  })
})

