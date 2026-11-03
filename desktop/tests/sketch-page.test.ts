// codegraph: test ui canvas
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

/** The built app on a blank computer that knows one project, drawing
 *  sketches of it. */
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

/** Clicks the bare canvas at a share of its width and height. */
const clickCanvas = async (across: number, down: number): Promise<void> => {
  const area = page.locator('.map-frame-area')
  const box = (await area.boundingBox())!
  await page.mouse.click(box.x + box.width * across, box.y + box.height * down)
}

/** Drags with the mouse from the middle of one thing to the middle of another. */
const dragBetween = async (from: Locator, to: Locator): Promise<void> => {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
}

const tool = (name: string): Locator => page.getByRole('toolbar', { name: 'Drawing tools' }).getByRole('button', { name })

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
  it('starts a blank sketch from the library', async () => {
    await page.getByRole('button', { name: /^Sketches/ }).click()
    await page.getByRole('button', { name: 'Blank sketch' }).click()
    expect(await page.getByLabel('Sketch name').inputValue()).toBe('New sketch')
    expect(await shown(page.getByText('Nothing drawn here yet'))).toContain('Pick Card')
  })

  it('places two cards and names them', async () => {
    await tool('Card').click()
    await clickCanvas(0.3, 0.5)
    await page.getByLabel('Name', { exact: true }).fill('notes')
    await tool('Card').click()
    await clickCanvas(0.65, 0.5)
    await page.getByLabel('Name', { exact: true }).fill('search')
    await page.getByLabel('Kind', { exact: true }).selectOption('shallow software system')
    expect(await shown(page.getByRole('button', { name: 'search', exact: true }))).toContain('shallow software system')
  })

  it('wires one to the other, and says what for', async () => {
    await tool('Wire').click()
    await dragBetween(page.getByRole('button', { name: 'notes', exact: true }), page.getByRole('button', { name: 'search', exact: true }))
    await page.getByLabel('What it is for').fill('finds notes by their words')
    expect(await shown(page.getByText('finds notes by their words'))).toBe('finds notes by their words')
  })

  it('moves the far card aside so the words have room, clear of both cards', async () => {
    await page.waitForTimeout(300)
    const words = (await page.getByText('finds notes by their words').boundingBox())!
    const notes = (await page.getByRole('button', { name: 'notes', exact: true }).boundingBox())!
    const search = (await page.getByRole('button', { name: 'search', exact: true }).boundingBox())!
    expect(words.x).toBeGreaterThan(notes.x + notes.width)
    expect(words.x + words.width).toBeLessThan(search.x)
  })

  it('leaves a note', async () => {
    await tool('Note').click()
    await clickCanvas(0.45, 0.2)
    await page.getByRole('textbox', { name: 'Note' }).fill('Which search service?')
    expect(await shown(page.locator('.map-note'))).toBe('Which search service?')
    await settle()
    await picture('sketch-1-drawn')
  })

  it('keeps it all: back to the map, and open it again', async () => {
    await page.getByLabel('Sketch name').fill('Search')
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: '← Map' }).click()
    await page.getByRole('button', { name: 'Open notes' }).waitFor({ timeout: PATIENCE })

    await page.getByRole('button', { name: /^Sketches/ }).click()
    await page.getByRole('button', { name: /^Search/ }).click()
    expect(await shown(page.getByText('finds notes by their words'))).toBe('finds notes by their words')
    expect(await shown(page.locator('.map-note'))).toBe('Which search service?')
  })

  it('tunnels into a card to draw what is inside it', async () => {
    await tool('Select').click()
    await page.getByRole('button', { name: 'notes', exact: true }).dblclick()
    expect(await shown(page.getByText('Nothing drawn here yet'))).toContain('Pick Card')
    expect(await shown(page.getByRole('navigation', { name: 'Where you are' }))).toContain('notes')
    await settle()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'search', exact: true }).waitFor({ timeout: PATIENCE })
  })

  it('starts a sketch from a snapshot of the map, every card as it stood', async () => {
    await page.getByRole('button', { name: '← Map' }).click()
    await page.getByRole('button', { name: 'Open notes' }).click()
    await page.getByRole('button', { name: 'Open web' }).waitFor({ timeout: PATIENCE })
    await page.getByRole('button', { name: /^Sketches/ }).click()
    await page.getByRole('button', { name: 'Sketch from the map' }).click()

    expect(await page.getByLabel('Sketch name').inputValue()).toBe('notes, as it could be')
    await page.getByRole('button', { name: 'web', exact: true }).dblclick()
    expect(await shown(page.getByRole('button', { name: 'write-note', exact: true }))).toContain('feature')
    await settle()
    await picture('sketch-2-from-map')
  })
})
