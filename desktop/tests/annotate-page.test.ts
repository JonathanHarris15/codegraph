// codegraph: test ui canvas
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Layer } from '../src/modules/annotations/index.js'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

/** Drawing annotations over a map and a sketch the way a person does: from
 *  the library, onto the board, beside cards and between them, on layers
 *  that can be hidden. */
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
const spot = async (across: number, down: number): Promise<{ x: number; y: number }> => {
  const box = (await page.locator('.map-frame-area').boundingBox())!
  return { x: box.x + box.width * across, y: box.y + box.height * down }
}
const middle = async (locator: Locator): Promise<{ x: number; y: number }> => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const drag = async (from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
}
const away = async (): Promise<void> => {
  const at = await spot(0.5, 0.97)
  await page.mouse.click(at.x, at.y)
}
const kept = (): Layer[] => {
  try {
    return (JSON.parse(readFileSync(join(yard.home, 'annotations', 'notes-app.json'), 'utf8')) as { layers: Layer[] }).layers
  } catch {
    return []
  }
}
const open = async (): Promise<void> => {
  app = await electron.launch({ args: ['.', `--user-data-dir=${yard.home}`], cwd: appFolder })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).dblclick()
  await page.getByRole('button', { name: 'Open web' }).waitFor({ timeout: PATIENCE })
  await page.waitForTimeout(900)
}

beforeAll(async () => {
  yard = openYard('annotate')
  const repo = aMappedRepo(yard)
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [{ id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] }],
    }),
  )
  await open()
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('annotating a map', () => {
  it('opens the library of annotations from the tools', async () => {
    await page.getByRole('button', { name: 'Annotate' }).click()
    const library = page.getByRole('complementary', { name: 'Annotations' })
    for (const group of ['Standard', 'Flowchart', 'Containers', 'Shapes']) expect(await shown(library)).toContain(group)
    await page.getByLabel('Search shapes').fill('diamond')
    expect(await page.getByRole('button', { name: 'Add decision' }).count()).toBe(1)
    expect(await page.getByRole('button', { name: 'Add sticky note' }).count()).toBe(0)
    await page.getByLabel('Search shapes').fill('')
  })

  it('puts a sticky note beside a card and writes on it; it keeps beside that card', async () => {
    await page.getByRole('button', { name: 'Add sticky note' }).click()
    const web = (await page.getByRole('button', { name: 'Open web' }).boundingBox())!
    await page.mouse.click(web.x + web.width + 100, web.y + 40)
    await page.getByRole('textbox', { name: 'Annotation text' }).waitFor({ timeout: PATIENCE })
    await page.keyboard.type('Split the db?')
    await away()
    expect(await shown(page.getByRole('button', { name: /^Sticky note annotation/ }).or(page.locator('.map-anno--sticky')))).toContain('Split the db?')
    await expect.poll(() => kept()[0]?.items[0]?.text, { timeout: PATIENCE }).toBe('Split the db?')
  })

  it('keeps it beside the card once it is moved next to one', async () => {
    const sticky = page.locator('.map-anno--sticky')
    const web = (await page.getByRole('button', { name: 'Open web' }).boundingBox())!
    await drag(await middle(sticky), { x: web.x + web.width + 100, y: web.y + 60 })
    await expect.poll(() => kept()[0]?.items[0]?.near?.card, { timeout: PATIENCE }).toBe('notes/container:web')
  })

  it('draws an arrow from the note to a card, holding both ends', async () => {
    await page.getByRole('button', { name: 'Add arrow', exact: true }).click()
    await drag(await middle(page.locator('.map-anno--sticky')), await middle(page.getByLabel('db', { exact: true })))
    await expect
      .poll(() => kept()[0]?.items.find((a) => a.kind === 'arrow'), { timeout: PATIENCE })
      .toMatchObject({ from: { annotation: kept()[0]?.items[0]?.id }, to: { card: 'notes/container:db' } })
    await picture('annotate-1-map')
  })

  it('colours a picked annotation from the bar over it, and undoes it', async () => {
    await page.locator('.map-anno--sticky').click()
    await page.getByRole('button', { name: 'Colour: Blue' }).click()
    await expect.poll(() => kept()[0]?.items[0]?.color, { timeout: PATIENCE }).toBe('blue')
    await page.keyboard.press('Control+z')
    await expect.poll(() => kept()[0]?.items[0]?.color, { timeout: PATIENCE }).toBe('yellow')
  })

  it('hides a layer, and shows it again', async () => {
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Layers', exact: true }).click()
    await page.getByRole('button', { name: 'Hide Annotations' }).click()
    expect(await page.locator('.map-anno--sticky').count()).toBe(0)
    await page.getByRole('button', { name: 'Show Annotations' }).click()
    expect(await shown(page.locator('.map-anno--sticky'))).toContain('Split the db?')
  })

  it('stops lining up with the diagram when its layer is told not to', async () => {
    await page.getByRole('button', { name: 'Annotations lines up with the diagram' }).click()
    await expect.poll(() => kept()[0]?.snaps, { timeout: PATIENCE }).toBe(false)
    await page.getByRole('button', { name: 'Annotations ignores the diagram' }).click()
    await page.getByRole('button', { name: 'Close the layers' }).click()
  })

  it('keeps it all when the app is opened again', async () => {
    await app.close()
    await open()
    expect(await shown(page.locator('.map-anno--sticky'))).toContain('Split the db?')
    expect(await page.locator('.map-anno-line--arrow').count()).toBe(1)
  }, 60_000)
})

describe('annotating a sketch', () => {
  it('moves a note kept beside a card when the card is moved', async () => {
    await page.getByRole('button', { name: /^Sketches/ }).click()
    await page.getByRole('button', { name: 'New sketch' }).click()
    await page.getByRole('button', { name: /^From the map/ }).click()
    const web = page.locator('.map-world').getByRole('button', { name: 'web', exact: true })
    await web.waitFor({ timeout: PATIENCE })
    await page.keyboard.press('a')
    await page.getByRole('button', { name: 'Add sticky note' }).click()
    const box = (await web.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y - 80)
    await page.getByRole('textbox', { name: 'Annotation text' }).waitFor({ timeout: PATIENCE })
    await page.keyboard.type('Rename to app?')
    await away()
    const note = page.locator('.map-anno--sticky').filter({ hasText: 'Rename to app?' })
    await drag(await middle(note), { x: box.x + box.width / 2, y: box.y - 50 })
    // Whatever else the board does as the card moves, the note keeps to it.
    const gap = async (): Promise<{ x: number; y: number }> => {
      const n = (await note.boundingBox())!
      const w = (await web.boundingBox())!
      return { x: Math.round(n.x - w.x), y: Math.round(n.y - w.y) }
    }
    const before = await gap()
    const cardWas = (await web.boundingBox())!
    await drag(await middle(web), { x: box.x + box.width / 2 + 120, y: box.y + box.height / 2 + 60 })
    await page.waitForTimeout(200)
    const cardNow = (await web.boundingBox())!
    expect(Math.abs(cardNow.x - cardWas.x) + Math.abs(cardNow.y - cardWas.y)).toBeGreaterThan(10)
    const after = await gap()
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2)
    await picture('annotate-2-sketch')
  })

  it('never moves a card to line up with an annotation', async () => {
    // The card dragged above ends where it was let go, not on the note's edge.
    const web = (await page.locator('.map-world').getByRole('button', { name: 'web', exact: true }).boundingBox())!
    const note = (await page.locator('.map-anno--sticky').filter({ hasText: 'Rename to app?' }).boundingBox())!
    expect(Math.abs(web.x - note.x)).toBeGreaterThan(1)
  })
})
