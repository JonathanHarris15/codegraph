// codegraph: test ui canvas, sketch
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { blankCard, type Sketch, type SketchCard } from '../src/modules/sketches/index.js'
import { aMappedRepo, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** Choosing how a board draws its wires, moving the pieces of a right-angle
 *  wire, and stores wired to the stores their fields point at. */
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
const card = (name: string): Locator => page.locator(`.map-world [data-card][aria-label="${name}"]`)
const middle = (box: Box): { x: number; y: number } => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
const drag = async (from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 14 })
  await page.mouse.up()
}
const wirePaths = (): Promise<string[]> =>
  page.locator('.map-wire > path:first-child').evaluateAll((all) => all.map((path) => path.getAttribute('d') ?? ''))
const folder = (): string => join(yard.home, 'sketches', 'notes-app', 'wires')
const kept = (): Sketch => JSON.parse(readFileSync(join(folder(), 'sketch.json'), 'utf8'))

const at = (one: SketchCard, x: number, y: number): SketchCard => ({ ...one, x, y })
const store = (id: string, name: string, fields: SketchCard['fields']): SketchCard => ({ ...blankCard(id, name, 'component', 'store'), fields, others: '' })

beforeAll(async () => {
  yard = openYard('square-wires-page')
  const repo = aMappedRepo(yard)
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [{ id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] }],
    }),
  )
  // A sketch kept before stores were wired by their fields: two stores, one
  // pointing at the other, and no wire between them yet.
  const data: SketchCard = {
    ...at(blankCard('data', 'Data', 'container', 'database'), 700, 380),
    children: [
      at(store('rosters', 'rosters', [{ name: 'personId', holds: 'text', needed: true, pointsAt: 'people' }]), 0, 0),
      at(store('people', 'people', [{ name: 'name', holds: 'text', needed: true, pointsAt: '' }]), 420, 160),
    ],
  }
  const system: SketchCard = { ...at(blankCard('app', 'Notes app', 'system', 'software system'), 500, 80), children: [data] }
  const root: SketchCard = {
    ...blankCard('notes-app', 'Notes', 'project', 'project'),
    children: [at(blankCard('reader', 'Reader', 'system', 'person'), 0, 0), system, at(blankCard('mail', 'Mail', 'system', 'shallow software system'), 120, 360)],
    wires: [
      { id: 'reads', from: 'reader', to: 'app', kind: 'uses', words: 'to read notes' },
      { id: 'sends', from: 'app', to: 'mail', kind: 'calls', words: 'to send a reminder' },
    ],
  }
  mkdirSync(folder(), { recursive: true })
  writeFileSync(join(folder(), 'sketch.json'), JSON.stringify({ id: 'wires', projectId: 'notes-app', name: 'Wires', createdAt: '', updatedAt: '', from: '', root }))
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  // The panel about what is picked is put away, as a person can ask, so it
  // covers nothing these tests reach for.
  await page.evaluate(() => window.localStorage.setItem('codegraph-panel', 'no'))
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).waitFor({ timeout: PATIENCE })
  await page.getByRole('button', { name: /^Project sketches/ }).click()
  await page.getByRole('button', { name: /^Wires/ }).click()
  await card('Reader').waitFor({ timeout: PATIENCE })
  await settle()
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

/** The board's own menu, opened with a right-click on empty board. */
const boardMenu = async () => {
  const board = (await page.locator('.map-frame-area').boundingBox())!
  await page.mouse.click(board.x + board.width - 120, board.y + 80, { button: 'right' })
  const menu = page.getByRole('menu', { name: 'What to do here' })
  await menu.waitFor({ timeout: PATIENCE })
  return menu
}

describe('choosing how wires are drawn', () => {
  it('draws curved wires until told otherwise', async () => {
    // The choice is kept off the zoom bar: it is on the board's right-click menu.
    const menu = await boardMenu()
    expect(await menu.getByRole('menuitem', { name: /^Draw wires at right angles/ }).count()).toBe(1)
    await page.keyboard.press('Escape')
    expect((await wirePaths()).every((d) => d.includes('C'))).toBe(true)
    await picture('square-1-curved')
  })

  it('draws every wire in straight pieces and right angles once asked', async () => {
    const menu = await boardMenu()
    await menu.getByRole('menuitem', { name: /^Draw wires at right angles/ }).click()
    expect(await page.getByRole('menu', { name: 'What to do here' }).count()).toBe(0)
    await settle()
    const paths = await wirePaths()
    expect(paths.length).toBe(2)
    expect(paths.every((d) => !d.includes('C'))).toBe(true)
    await picture('square-2-square')
  })
})

describe('moving the pieces of a right-angle wire', () => {
  it('shows a handle on each piece of a picked wire, and drags a piece across on the grid', async () => {
    await page.locator('.map-sentence', { hasText: 'to read notes' }).click()
    const pieces = page.locator('.map-wire-piece')
    await pieces.first().waitFor({ timeout: PATIENCE })
    expect(await pieces.count()).toBeGreaterThan(0)
    await picture('square-3-picked')
    const handle = (await pieces.nth(Math.floor((await pieces.count()) / 2)).boundingBox())!
    const down = (await pieces.nth(Math.floor((await pieces.count()) / 2)).getAttribute('class'))!.includes('down')
    await drag(middle(handle), { x: middle(handle).x + (down ? 90 : 0), y: middle(handle).y + (down ? 0 : 90) })
    await settle()
    const wire = kept().root.wires.find((w) => w.id === 'reads')!
    expect(wire.bends?.length).toBeGreaterThan(1)
    expect(wire.bends!.every((p) => p.x % 12 === 0 || p.y % 12 === 0)).toBe(true)
    await picture('square-4-moved')
  })

  it('adds two bends when the piece leaving a card is dragged', async () => {
    const before = kept().root.wires.find((w) => w.id === 'reads')!.bends!.length
    const first = (await page.locator('.map-wire-piece').first().boundingBox())!
    const down = (await page.locator('.map-wire-piece').first().getAttribute('class'))!.includes('down')
    await drag(middle(first), { x: middle(first).x + (down ? -60 : 0), y: middle(first).y + (down ? 0 : 60) })
    await settle()
    expect(kept().root.wires.find((w) => w.id === 'reads')!.bends!.length).toBe(before + 2)
    await picture('square-5-more-bends')
  })

  it('undoes a move in one step, and lets the wire find its own way from its menu', async () => {
    const before = kept().root.wires.find((w) => w.id === 'reads')!.bends!.length
    await page.keyboard.press('Control+z')
    await settle()
    expect(kept().root.wires.find((w) => w.id === 'reads')!.bends!.length).toBe(before - 2)
    await page.locator('.map-sentence', { hasText: 'to read notes' }).click({ button: 'right' })
    const menu = page.getByRole('menu', { name: 'What to do here' })
    await menu.waitFor({ timeout: PATIENCE })
    await menu.getByRole('menuitem', { name: /Let it find its own way/ }).click()
    await settle()
    expect(kept().root.wires.find((w) => w.id === 'reads')!.bends).toBeUndefined()
  })
})

describe('stores whose fields point at each other', () => {
  it('are wired as soon as the sketch is open, though no one drew the wire', async () => {
    await page.keyboard.press('Escape')
    // Let the wire go, so the panel about it is put away and the card is clear.
    const board = (await page.locator('.map-frame-area').boundingBox())!
    await page.mouse.click(board.x + board.width * 0.6, board.y + board.height * 0.97)
    await page.getByRole('complementary', { name: 'What is picked' }).waitFor({ state: 'detached', timeout: PATIENCE })
    await card('Notes app').dblclick()
    await settle()
    await card('Data').dblclick()
    await settle()
    const said = page.locator('.map-sentence', { hasText: 'personId' })
    await said.waitFor({ timeout: PATIENCE })
    expect(await said.textContent()).toContain('points at')
    await picture('square-6-stores')
  })
})
