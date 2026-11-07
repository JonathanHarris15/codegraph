// codegraph: test ui canvas
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Annotation, Layer } from '../src/modules/annotations/index.js'
import { aMappedRepo, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** Drawing annotations over a map and a sketch the way a person does: from
 *  the library, onto the board, beside cards and between them, on layers
 *  that can be hidden. */
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
  app = await openTheApp(yard.home)
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
    // Each group is named for what its shapes do, and says so under its name.
    for (const group of ['Notes', 'Lines', 'Frames', 'Shapes'])
      expect(await library.getByRole('button', { name: group, exact: true }).count()).toBe(1)
    expect(await shown(library)).toContain('Drawn round what they hold')
    await page.getByLabel('Search shapes').fill('diamond')
    expect(await page.getByRole('button', { name: 'Add diamond' }).count()).toBe(1)
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

  const note = (): Annotation | undefined => kept()[0]?.items.find((a) => a.kind === 'sticky')
  const dot = (edge: string): Locator => page.getByRole('button', { name: `Pull an arrow out of the ${edge} of the note` })
  const tip = (): Locator => page.getByRole('button', { name: 'The tip of the note’s arrow' })

  it('pulls an arrow out of a sticky note’s edge and points it anywhere, holding nothing', async () => {
    const lines = kept()[0]?.items.length
    const sticky = page.locator('.map-anno--sticky')
    await sticky.click()
    const db = await middle(page.getByLabel('db', { exact: true }))
    await drag(await middle(dot('bottom')), db)
    await expect.poll(() => note()?.pointers?.length, { timeout: PATIENCE }).toBe(1)
    // It is a part of the note: no new annotation, and nothing it holds.
    expect(kept()[0]?.items.length).toBe(lines)
    const from = (await sticky.boundingBox())!
    const k = from.width / note()!.w
    expect(Math.abs(from.x + note()!.pointers![0]!.dx * k - db.x)).toBeLessThan(3)
    expect(Math.abs(from.y + note()!.pointers![0]!.dy * k - db.y)).toBeLessThan(3)
    expect(Object.keys(note()!.pointers![0]!).sort()).toEqual(['dx', 'dy'])
    await picture('annotate-3-pointer')
  })

  it('carries its arrow along when the note is moved', async () => {
    const sticky = page.locator('.map-anno--sticky')
    const was = await middle(tip())
    const at = await middle(sticky)
    await drag(at, { x: at.x - 40, y: at.y + 30 })
    await page.waitForTimeout(200)
    const now = await middle(tip())
    expect(Math.abs(now.x - was.x - -40)).toBeLessThan(8)
    expect(Math.abs(now.y - was.y - 30)).toBeLessThan(8)
  })

  it('moves the tip, puts out a short arrow on a click, and takes only the arrow on Delete', async () => {
    const before = note()!.pointers![0]!
    const at = await middle(tip())
    await drag(at, { x: at.x - 120, y: at.y + 20 })
    await expect.poll(() => note()?.pointers?.[0]?.dx, { timeout: PATIENCE }).not.toBe(before.dx)
    await page.locator('.map-anno--sticky').hover()
    await dot('left').click()
    await expect.poll(() => note()?.pointers?.length, { timeout: PATIENCE }).toBe(2)
    await page.keyboard.press('Delete')
    await expect.poll(() => note()?.pointers?.length, { timeout: PATIENCE }).toBe(1)
    expect(await page.locator('.map-anno--sticky').count()).toBe(1)
  })

  it('takes an arrow back when its tip is dragged onto its own note, and undoes it', async () => {
    await drag(await middle(tip()), await middle(page.locator('.map-anno--sticky')))
    await expect.poll(() => note()?.pointers?.length, { timeout: PATIENCE }).toBe(0)
    await page.keyboard.press('Control+z')
    await expect.poll(() => note()?.pointers?.length, { timeout: PATIENCE }).toBe(1)
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
    expect(await page.locator('.map-anno-pointer').count()).toBe(1)
  }, 60_000)
})

describe('the keys on a map', () => {
  const spots = async (n: number): Promise<void> => {
    await expect.poll(() => kept()[0]?.items.filter((a) => a.kind === 'text').length, { timeout: PATIENCE }).toBe(n)
  }
  const said = (): Locator => page.getByRole('status').filter({ hasText: 'Esc' })

  it('gets a shape ready with its letter, says so, and puts it down', async () => {
    await page.keyboard.press('t')
    expect(await shown(said())).toContain('Text')
    const at = await spot(0.2, 0.9)
    await page.mouse.click(at.x, at.y)
    await page.getByRole('textbox', { name: 'Annotation text' }).waitFor({ timeout: PATIENCE })
    await page.keyboard.type('words')
    await away()
    await spots(1)
    expect(await said().count()).toBe(0)
  })

  it('lets a letter go with Esc, or by pressing it again', async () => {
    await page.keyboard.press('t')
    await page.keyboard.press('Escape')
    expect(await said().count()).toBe(0)
    await page.keyboard.press('r')
    await page.keyboard.press('r')
    expect(await said().count()).toBe(0)
  })

  it('swaps one tool for another with whatever is picked', async () => {
    await page.locator('.map-anno--text').click()
    await page.keyboard.press('h')
    expect(await page.getByRole('button', { name: 'Pan' }).getAttribute('aria-pressed')).toBe('true')
    await page.keyboard.press('z')
    expect(await page.getByRole('button', { name: 'Area' }).getAttribute('aria-pressed')).toBe('true')
    await page.keyboard.press('n')
    expect(await page.getByRole('button', { name: 'Area' }).getAttribute('aria-pressed')).toBe('false')
    expect(await shown(said())).toContain('Sticky note')
    await page.keyboard.press('v')
    expect(await said().count()).toBe(0)
    expect(await page.getByRole('button', { name: 'Pick' }).getAttribute('aria-pressed')).toBe('true')
    await page.keyboard.press('Escape')
  })

  it('stops for words being typed', async () => {
    await page.keyboard.press('Shift+A')
    await page.getByLabel('Search shapes').fill('')
    await page.getByLabel('Search shapes').pressSequentially('rtn')
    expect(await said().count()).toBe(0)
    await page.getByLabel('Search shapes').fill('')
    await page.getByRole('button', { name: 'Close the annotations' }).click()
  })

  it('steps through the layers with the brackets, and draws on the one it lands on', async () => {
    await page.keyboard.press('Shift+L')
    await page.getByRole('button', { name: 'New layer' }).click()
    await page.getByRole('button', { name: 'Close the layers' }).click()
    await page.keyboard.press('[')
    expect(await shown(page.getByRole('status').filter({ hasText: 'Drawing on Annotations' }))).toContain('Annotations')
    await page.keyboard.press(']')
    expect(await shown(page.getByRole('status').filter({ hasText: 'Drawing on Layer 2' }))).toContain('Layer 2')
  })

  it('lists every key with the question mark', async () => {
    await page.keyboard.press('?')
    const list = page.getByRole('dialog', { name: 'Keys' })
    expect(await shown(list)).toContain('Sticky note')
    await page.waitForTimeout(300)
    await picture('annotate-4-keys')
    await page.keyboard.press('Escape')
    expect(await list.count()).toBe(0)
  })
})

describe('annotating a sketch', () => {
  it('moves a note kept beside a card when the card is moved', async () => {
    await page.getByRole('button', { name: /^Sketches/ }).click()
    await page.getByRole('button', { name: 'New sketch' }).click()
    await page.getByRole('button', { name: /^From the map/ }).click()
    const web = page.locator('.map-world').getByRole('button', { name: 'web', exact: true })
    await web.waitFor({ timeout: PATIENCE })
    await page.keyboard.press('Shift+A')
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

  it('picks a card with its number, even with another card picked', async () => {
    const web = page.locator('.map-world').getByRole('button', { name: 'web', exact: true })
    await web.click()
    await page.keyboard.press('1')
    const first = page.getByRole('button', { name: 'Card: ' }).first()
    await first.waitFor({ timeout: PATIENCE })
    expect(await first.getAttribute('aria-pressed')).toBe('true')
    expect(await first.locator('kbd').textContent()).toBe('1')
    await picture('annotate-5-cards')
    const at = await spot(0.8, 0.85)
    await page.mouse.click(at.x, at.y)
    await page.getByLabel('Card name').waitFor({ timeout: PATIENCE })
    await page.keyboard.type('made with a key')
    await page.keyboard.press('Enter')
    await page.locator('.map-world').getByRole('button', { name: 'made with a key', exact: true }).waitFor({ timeout: PATIENCE })
    // With that card still picked, a letter picks a tool rather than writing on it.
    await page.keyboard.press('w')
    expect(await page.getByRole('button', { name: 'Wire', exact: true }).getAttribute('aria-pressed')).toBe('true')
    await page.keyboard.press('v')
    expect(await page.getByLabel('Card name').count()).toBe(0)
    await page.keyboard.press('Control+z')
  })

  it('never moves a card to line up with an annotation', async () => {
    // The card dragged above ends where it was let go, not on the note's edge.
    const web = (await page.locator('.map-world').getByRole('button', { name: 'web', exact: true }).boundingBox())!
    const note = (await page.locator('.map-anno--sticky').filter({ hasText: 'Rename to app?' }).boundingBox())!
    expect(Math.abs(web.x - note.x)).toBeGreaterThan(1)
  })
})
