// codegraph: test ui canvas
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

/** Opening a card on a sketch in the built app: it grows where it is, and
 *  everything else on the board stays in reach. */
const appFolder = resolve(import.meta.dirname, '..')
const PATIENCE = 15_000
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page

type Box = { x: number; y: number; width: number; height: number }
const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}
const settle = (): Promise<void> => page.waitForTimeout(700)
const board = async (): Promise<Box> => (await page.locator('.map-frame-area').boundingBox())!
const card = (name: string): Locator => page.locator('.map-world').getByRole('button', { name, exact: true })
const boxOf = async (locator: Locator): Promise<Box> => {
  await locator.first().waitFor({ state: 'visible', timeout: PATIENCE })
  return (await locator.first().boundingBox())!
}
const openBox = (name: string): Locator =>
  page.locator('.map-card--open').filter({ has: page.getByRole('button', { name: `Back out of ${name}` }) })
const worldScale = async (): Promise<number> =>
  page.locator('.map-world').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)
const drag = async (from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 14 })
  await page.mouse.up()
}
const middle = (box: Box): { x: number; y: number } => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

/** Adds a card by double-clicking the board, picks the first kind offered,
 *  and names it. */
const addAt = async (at: { x: number; y: number }, kind: string, name: string): Promise<void> => {
  await page.mouse.dblclick(at.x, at.y)
  await page.getByRole('dialog', { name: 'Add to the board' }).getByRole('option', { name: kind, exact: true }).click()
  await page.getByLabel('Card name').waitFor({ timeout: PATIENCE })
  await page.keyboard.type(name)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100)
}

/** The sketch as kept on disk. */
const kept = (): { root: Record<string, unknown> & { children: { name: string; room?: Box & { w: number; h: number }; children: { name: string }[] }[] } } => {
  const folder = join(yard.home, 'sketches', 'notes-app')
  return JSON.parse(readFileSync(join(folder, readdirSync(folder)[0]!, 'sketch.json'), 'utf8'))
}

beforeAll(async () => {
  yard = openYard('open-card')
  const repo = aMappedRepo(yard)
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [{ id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] }],
    }),
  )
  app = await electron.launch({ args: ['.', `--user-data-dir=${yard.home}`], cwd: appFolder })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).waitFor({ timeout: PATIENCE })
  await page.getByRole('button', { name: /^Sketches/ }).click()
  await page.getByRole('button', { name: 'New sketch' }).click()
  await page.getByRole('button', { name: /^Blank/ }).click()
  await page.getByLabel('Sketch name').waitFor({ timeout: PATIENCE })
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('opening a card in the real app', () => {
  it('says nothing on an empty board, where it would be in the way', async () => {
    expect(await page.getByText('Nothing drawn here yet').count()).toBe(0)
  })

  it('grows the card in place, without zooming, and pushes its neighbours aside', async () => {
    const area = await board()
    await addAt({ x: area.x + area.width * 0.3, y: area.y + area.height * 0.5 }, 'software system', 'Beside')
    await addAt({ x: area.x + area.width * 0.6, y: area.y + area.height * 0.5 }, 'software system', 'Main')
    await settle()
    await picture('open-1-before')
    const scale = await worldScale()
    const beside = await boxOf(card('Beside'))
    await card('Main').click()
    await page.mouse.click(area.x + 8, area.y + 8)
    const main = await boxOf(card('Main'))
    // Double-click the body of the card, not its name.
    await page.mouse.dblclick(main.x + main.width / 2, main.y + main.height - 12)
    await page.waitForTimeout(120)
    await picture('open-2-mid')
    await settle()
    await picture('open-3-open')
    expect(await worldScale()).toBeCloseTo(scale, 3)
    const open = await boxOf(openBox('Main'))
    expect(open.width).toBeGreaterThan(area.width * 0.65)
    expect(open.height).toBeGreaterThan(area.height * 0.65)
    const pushed = await boxOf(card('Beside'))
    expect(pushed.x + pushed.width).toBeLessThanOrEqual(open.x)
    expect(pushed.x).toBeLessThan(beside.x)
  })

  it('draws inside it and outside it, each on its own level', async () => {
    const open = await boxOf(openBox('Main'))
    await addAt({ x: open.x + 200, y: open.y + 160 }, 'web app', 'Inner')
    await settle()
    expect((await boxOf(card('Inner'))).x).toBeGreaterThan(open.x)
    await addAt({ x: open.x - 50, y: open.y + 40 }, 'shallow software system', 'Outer')
    await settle()
    await picture('open-4-both')
    await expect.poll(() => kept().root.children.map((c) => c.name).sort(), { timeout: PATIENCE }).toEqual(['Beside', 'Main', 'Outer'])
    await expect.poll(() => kept().root.children.find((c) => c.name === 'Main')?.children.map((c) => c.name), { timeout: PATIENCE }).toEqual(['Inner'])
    // Pressing a card outside picks it up at once, with no second click.
    const outer = await boxOf(card('Outer'))
    await drag(middle(outer), { x: middle(outer).x, y: middle(outer).y + 30 })
    await settle()
    expect(Math.round((await boxOf(card('Outer'))).y - outer.y)).toBeGreaterThan(10)
  })

  it('keeps growing when a card is carried past its edge', async () => {
    // Bring the open card back on screen: adding a card out to the side moved
    // the board along to it.
    await page.keyboard.press('Control+0')
    await settle()
    const open = await boxOf(openBox('Main'))
    const inner = await boxOf(card('Inner'))
    const k = await worldScale()
    await drag(middle(inner), { x: open.x + open.width - 40, y: middle(inner).y })
    await settle()
    await picture('open-5-grown')
    const grown = await boxOf(openBox('Main'))
    const moved = await boxOf(card('Inner'))
    expect(grown.x + grown.width).toBeGreaterThan(moved.x + moved.width)
    expect(grown.width).toBeGreaterThan(open.width)
    // The far edge held still: the card grew towards the drag.
    expect(Math.abs(grown.x - open.x)).toBeLessThan(40 * k)
    await expect.poll(() => kept().root.children.find((c) => c.name === 'Main')?.room?.w, { timeout: PATIENCE }).toBeGreaterThan(open.width / k)
  })

  it('resizes from its corner, and pushes further as it grows', async () => {
    const open = await boxOf(openBox('Main'))
    const corner = await boxOf(page.locator('.map-grip--sw').last())
    await drag(middle(corner), { x: middle(corner).x + 60, y: middle(corner).y - 120 })
    await settle()
    const smaller = await boxOf(openBox('Main'))
    expect(smaller.height).toBeLessThan(open.height)
    expect(smaller.width).toBeLessThan(open.width)
    expect(Math.round(smaller.y)).toBe(Math.round(open.y))
    await picture('open-6-resized')
    // One undo puts it back as it was.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await settle()
    expect(Math.round((await boxOf(openBox('Main'))).height)).toBe(Math.round(open.height))
  })

  it('opens a card inside the open one the same way', async () => {
    const inner = await boxOf(card('Inner'))
    await page.mouse.dblclick(inner.x + inner.width / 2, inner.y + inner.height - 10)
    await settle()
    await picture('open-7-nested')
    const nested = await boxOf(openBox('Inner'))
    const area = await board()
    expect(nested.width).toBeGreaterThan(area.width * 0.5)
    expect(await page.getByRole('navigation', { name: 'Where you are' }).textContent()).toContain('Inner')
    await addAt({ x: nested.x + 120, y: nested.y + 120 }, 'module', 'Deep').catch(async () => {
      await page.keyboard.press('Escape')
    })
    await settle()
  })

  it('backs out with the button on the card, one level at a time', async () => {
    await page.getByRole('button', { name: 'Back out of Inner' }).click()
    await settle()
    expect(await page.getByRole('button', { name: 'Back out of Inner' }).count()).toBe(0)
    await expect.poll(async () => page.getByRole('button', { name: 'Back out of Main' }).count()).toBe(1)
    await picture('open-8-back-one')
    await page.getByRole('button', { name: 'Back out of Main' }).click()
    await settle()
    expect(await page.locator('.map-card--open').count()).toBe(0)
    await card('Main').waitFor({ timeout: PATIENCE })
    await picture('open-9-closed')
  })

  it('remembers how much room it was given', async () => {
    const room = kept().root.children.find((c) => c.name === 'Main')?.room
    const main = await boxOf(card('Main'))
    await page.mouse.dblclick(main.x + main.width / 2, main.y + main.height - 12)
    await settle()
    const k = await worldScale()
    const open = await boxOf(openBox('Main'))
    expect(open.width / k).toBeCloseTo(room!.w, -1)
  })

  it('zooming does not open or close anything', async () => {
    const area = await board()
    await page.mouse.move(area.x + 20, area.y + 20)
    for (let i = 0; i < 12; i += 1) await page.mouse.wheel(0, 240)
    await settle()
    expect(await page.locator('.map-card--open').count()).toBe(1)
    await picture('open-10-zoomed-out')
  })
})
