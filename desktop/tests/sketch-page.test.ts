// codegraph: test ui canvas
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

/** The built app on a blank computer that knows one project, drawing
 *  sketches of it the way a person would: from the card library, by typing
 *  onto cards, and by dragging wires from a card's dots. */
const appFolder = resolve(import.meta.dirname, '..')
const PATIENCE = 15_000
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page

const shown = async (locator: Locator): Promise<string> => {
  const one = locator.first()
  await one.waitFor({ state: 'visible', timeout: PATIENCE })
  return (await one.textContent()) ?? ''
}
const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}
const settle = (): Promise<void> => page.waitForTimeout(900)

/** A spot on the board, as a share of its width and height. */
const spot = async (across: number, down: number): Promise<{ x: number; y: number }> => {
  const box = (await page.locator('.map-frame-area').boundingBox())!
  return { x: box.x + box.width * across, y: box.y + box.height * down }
}

const card = (name: string): Locator => page.locator('.map-world').getByRole('button', { name, exact: true })
const wire = (said: string): Locator => page.getByRole('button', { name: `Wire: ${said}` })

/** Drags with the mouse from one place to another, the way a hand does. */
const drag = async (from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
}
const middle = async (locator: Locator): Promise<{ x: number; y: number }> => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

beforeAll(async () => {
  yard = openYard('sketch')
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
  await page.getByRole('link', { name: 'Open map' }).click()
  await page.getByRole('button', { name: 'Open notes' }).waitFor({ timeout: PATIENCE })
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('drawing a sketch in the real app', () => {
  it('starts a blank sketch, with the cards for its level beside the tools', async () => {
    await page.getByRole('button', { name: /^Sketches/ }).click()
    await page.getByRole('button', { name: 'Blank sketch' }).click()
    expect(await page.getByLabel('Sketch name').inputValue()).toBe('New sketch')
    expect(await shown(page.getByText('Nothing drawn here yet'))).toContain('Drag a card in from the left')
    const library = page.getByRole('complementary', { name: 'Cards' })
    expect(await shown(library)).toContain('software system')
    expect(await shown(library)).toContain('person')
  })

  it('places a card by clicking it in the library, then the board, and names it by typing', async () => {
    await page.getByRole('button', { name: 'Card: software system' }).click()
    const at = await spot(0.25, 0.5)
    await page.mouse.click(at.x, at.y)
    await page.getByLabel('Card name').waitFor({ timeout: PATIENCE })
    await page.keyboard.type('notes')
    await page.keyboard.press('Enter')
    expect(await shown(card('notes'))).toContain('software system')
  })

  it('places another by dragging it in from the library', async () => {
    const from = await middle(page.getByRole('button', { name: 'Card: shallow software system' }))
    await drag(from, await spot(0.62, 0.5))
    await page.getByLabel('Card name').waitFor({ timeout: PATIENCE })
    await page.keyboard.type('search')
    await page.keyboard.press('Enter')
    expect(await shown(card('search'))).toContain('shallow software system')
  })

  it('wires one to the other from the dot on its side, and reads it as a sentence', async () => {
    await page.mouse.click((await spot(0.5, 0.9)).x, (await spot(0.5, 0.9)).y)
    await card('notes').hover()
    const dot = card('notes').locator('.map-handle--e')
    await dot.waitFor({ timeout: PATIENCE })
    await drag(await middle(dot), await middle(card('search')))
    await page.keyboard.press('Enter')
    await page.getByLabel('What the wire is for', { exact: true }).waitFor({ timeout: PATIENCE })
    await page.keyboard.type('finds notes by their words')
    await page.keyboard.press('Enter')
    expect(await shown(wire('notes calls search to find notes by their words'))).toContain('to find notes by their words')
  })

  it('keeps the sentence clear of both cards', async () => {
    await page.waitForTimeout(300)
    const words = (await wire('notes calls search to find notes by their words').boundingBox())!
    const notes = (await card('notes').boundingBox())!
    const search = (await card('search').boundingBox())!
    const clear = (a: typeof words, b: typeof words): boolean =>
      a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
    expect(clear(words, notes)).toBe(true)
    expect(clear(words, search)).toBe(true)
  })

  it('makes the card at the end of a wire let go on empty board', async () => {
    await card('notes').click()
    const dot = card('notes').locator('.map-handle--s')
    await dot.waitFor({ timeout: PATIENCE })
    await drag(await middle(dot), await spot(0.3, 0.85))
    expect(await shown(page.getByRole('dialog', { name: 'What does the wire reach?' }))).toContain('software system')
    await page.keyboard.type('software')
    await page.keyboard.press('Enter')
    await page.getByLabel('Card name').waitFor({ timeout: PATIENCE })
    await page.keyboard.type('billing')
    await page.keyboard.press('Enter')
    expect(await shown(wire('notes calls billing'))).toContain('billing')
  })

  it('leaves a note with a double-click on the board', async () => {
    const at = await spot(0.45, 0.18)
    await page.mouse.dblclick(at.x, at.y)
    await page.getByRole('dialog', { name: 'Add to the board' }).waitFor({ timeout: PATIENCE })
    await page.keyboard.type('note')
    await page.keyboard.press('Enter')
    await page.getByRole('textbox', { name: 'Note', exact: true }).waitFor({ timeout: PATIENCE })
    await page.keyboard.type('Which search service?')
    await page.keyboard.press('Escape')
    expect(await shown(page.locator('.map-note'))).toBe('Which search service?')
    await settle()
    await picture('sketch-1-drawn')
  })

  it('undoes and redoes', async () => {
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await page.locator('.map-note').count()).toBe(0)
    await page.keyboard.press('Control+Shift+z')
    expect(await shown(page.locator('.map-note'))).toBe('Which search service?')
  })

  it('takes a picked card away with Delete, and Undo brings it back', async () => {
    await card('billing').click()
    await page.keyboard.press('Delete')
    await page.waitForTimeout(200)
    expect(await card('billing').count()).toBe(0)
    await page.keyboard.press('Control+z')
    expect(await shown(card('billing'))).toContain('billing')
  })

  it('copies and pastes a card', async () => {
    await card('search').click()
    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(200)
    expect(await card('search').count()).toBe(2)
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await card('search').count()).toBe(1)
  })

  it('moves a card by dragging it, settling on the grid', async () => {
    const before = (await card('billing').boundingBox())!
    await drag(await middle(card('billing')), { x: before.x + before.width / 2 + 133, y: before.y + before.height / 2 + 7 })
    await page.waitForTimeout(200)
    const after = (await card('billing').boundingBox())!
    expect(after.x).toBeGreaterThan(before.x + 80)
  })

  it('adds a card beside another, wired, with one click on its dot', async () => {
    await page.mouse.click((await spot(0.5, 0.97)).x, (await spot(0.5, 0.97)).y)
    // Everything in view first, so no dot sits behind the panel; then a
    // picked card keeps its dots, so the click on one cannot race the hover.
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+0')
    await card('search').click()
    const dot = card('search').locator('.map-handle--e')
    await dot.waitFor({ timeout: PATIENCE })
    await dot.click()
    await page.getByLabel('Card name').waitFor({ timeout: PATIENCE })
    await page.keyboard.type('index')
    await page.keyboard.press('Enter')
    expect(await shown(card('index'))).toContain('shallow software system')
    expect(await shown(wire('search calls index'))).toContain('index')
  })

  it('goes on from a name to what the card is for with Tab', async () => {
    await card('index').click()
    await page.keyboard.press('Enter')
    await page.getByLabel('Card name').waitFor({ timeout: PATIENCE })
    await page.keyboard.press('Tab')
    await page.getByRole('textbox', { name: 'What it is for' }).first().waitFor({ timeout: PATIENCE })
    await page.keyboard.type('Finds words fast')
    await page.keyboard.press('Enter')
    expect(await shown(card('index'))).toContain('Finds words fast')
  })

  it('takes a card off from the right-click menu', async () => {
    await card('index').click({ button: 'right' })
    await page.getByRole('menu', { name: 'What to do here' }).waitFor({ timeout: PATIENCE })
    await page.getByRole('menuitem', { name: /Take it off the sketch/ }).click()
    await page.waitForTimeout(200)
    expect(await card('index').count()).toBe(0)
  })

  it('copies a card by dragging it with Alt held', async () => {
    await page.keyboard.press('Escape')
    await page.keyboard.press('0')
    const from = await middle(card('billing'))
    await page.keyboard.down('Alt')
    await drag(from, { x: from.x + 40, y: from.y + 220 })
    await page.keyboard.up('Alt')
    await page.waitForTimeout(200)
    expect(await card('billing').count()).toBe(2)
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await card('billing').count()).toBe(1)
  })

  it('points a wire at another card by dragging its end', async () => {
    await page.keyboard.press('Escape')
    await page.keyboard.press('0')
    await wire('notes calls search to find notes by their words').click()
    const end = page.locator('.map-wire-end').nth(1)
    await end.waitFor({ timeout: PATIENCE })
    await drag(await middle(end), await middle(card('billing')))
    expect(await shown(wire('notes calls billing to find notes by their words'))).toContain('billing')
    await page.keyboard.press('Control+z')
    expect(await shown(wire('notes calls search to find notes by their words'))).toContain('search')
  })

  it('keeps it all: back to the map, and open it again', async () => {
    await page.getByLabel('Sketch name').fill('Search')
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: '← Map' }).click()
    await page.getByRole('button', { name: 'Open notes' }).waitFor({ timeout: PATIENCE })

    await page.getByRole('button', { name: /^Sketches/ }).click()
    await page.getByRole('button', { name: /^Search/ }).click()
    expect(await shown(wire('notes calls search to find notes by their words'))).toContain('notes')
    expect(await shown(page.locator('.map-note'))).toBe('Which search service?')
  })

  it('draws inside a card, from the bar over it', async () => {
    await card('notes').click()
    await page.getByRole('button', { name: 'Draw inside it' }).click()
    expect(await shown(page.getByText('Nothing drawn here yet'))).toContain('Drag a card in from the left')
    expect(await shown(page.getByRole('complementary', { name: 'Cards' }))).toContain('web app')
    expect(await shown(page.getByRole('navigation', { name: 'Where you are' }))).toContain('notes')
    await settle()
    await page.keyboard.press('Escape')
    await card('search').waitFor({ timeout: PATIENCE })
  })

  it('starts a sketch from a snapshot of the map, every card as it stood', async () => {
    await page.getByRole('button', { name: '← Map' }).click()
    await page.getByRole('button', { name: 'Open notes' }).click()
    await page.getByRole('button', { name: 'Open web' }).waitFor({ timeout: PATIENCE })
    await page.getByRole('button', { name: /^Sketches/ }).click()
    await page.getByRole('button', { name: 'Sketch from the map' }).click()

    expect(await page.getByLabel('Sketch name').inputValue()).toBe('notes, as it could be')
    await card('web').click()
    await page.getByRole('button', { name: 'Draw inside it' }).click()
    expect(await shown(card('write-note'))).toContain('feature')
    await settle()
    await picture('sketch-2-from-map')
  })
})
