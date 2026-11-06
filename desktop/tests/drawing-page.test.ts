// codegraph: test ui canvas
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Layer } from '../src/modules/annotations/index.js'
import type { SketchCard } from '../src/modules/sketches/index.js'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

/** Drawing on a sketch in the built app: wires through their sentences, what
 *  hovering shows, hubs on an open card's border, a person's own card types,
 *  and annotations that keep to their shapes and out of an open card's way. */
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
const card = (name: string): Locator => page.locator(`.map-world [data-card][aria-label="${name}"]`)
const boxOf = async (locator: Locator): Promise<Box> => {
  await locator.first().waitFor({ state: 'visible', timeout: PATIENCE })
  return (await locator.first().boundingBox())!
}
const middle = (box: Box): { x: number; y: number } => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
const drag = async (from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 14 })
  await page.mouse.up()
}
const openBox = (name: string): Locator =>
  page.locator('.map-card--open').filter({ has: page.getByRole('button', { name: `Back out of ${name}` }) })
const addAt = async (at: { x: number; y: number }, kind: string, name: string): Promise<void> => {
  await page.mouse.dblclick(at.x, at.y)
  await page.getByRole('dialog', { name: 'Add to the board' }).getByRole('option', { name: kind, exact: true }).click()
  await page.getByLabel('Card name').waitFor({ timeout: PATIENCE })
  await page.keyboard.type(name)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100)
}
/** Wires one card to another from the dot on the side facing it. */
const wire = async (from: string, to: string, side = 'e'): Promise<void> => {
  const a = await boxOf(card(from))
  await page.mouse.move(middle(a).x, middle(a).y)
  const dot = card(from).locator(`.map-handle--${side}`)
  await drag(middle(await boxOf(dot)), middle(await boxOf(card(to))))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
}
const away = async (): Promise<void> => {
  const area = await board()
  await page.mouse.move(area.x + 6, area.y + area.height - 6)
  await page.mouse.click(area.x + 6, area.y + area.height - 6)
  await page.waitForTimeout(100)
}
const kept = (): { root: SketchCard; layers?: Layer[] } => {
  const folder = join(yard.home, 'sketches', 'notes-app')
  return JSON.parse(readFileSync(join(folder, readdirSync(folder)[0]!, 'sketch.json'), 'utf8'))
}
/** The last point a wire's path passes through before the one it ends at. */
const wirePaths = (): Promise<string[]> =>
  page.locator('.map-wire > path:first-child').evaluateAll((all) => all.map((path) => path.getAttribute('d') ?? ''))

beforeAll(async () => {
  yard = openYard('drawing')
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
  await page.getByRole('button', { name: 'Hide this panel' }).click().catch(() => undefined)
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('the context level', () => {
  it('draws a person as the little person icon', async () => {
    const area = await board()
    await addAt({ x: area.x + area.width * 0.25, y: area.y + area.height * 0.5 }, 'person', 'Reader')
    await addAt({ x: area.x + area.width * 0.7, y: area.y + area.height * 0.5 }, 'software system', 'Notes app')
    await away()
    await settle()
    expect(await card('Reader').evaluate((el) => el.classList.contains('map-card--shape-person'))).toBe(true)
    await page.locator('.map-card--shape-person').waitFor({ timeout: PATIENCE })
    await picture('draw-1-person')
  })
})

describe('a wire and its sentence', () => {
  it('runs the wire through the sentence, wherever the sentence is dragged', async () => {
    await wire('Reader', 'Notes app')
    await settle()
    const chip = await boxOf(page.locator('.map-sentence'))
    await drag(middle(chip), { x: middle(chip).x + 10, y: middle(chip).y + 170 })
    await away()
    await settle()
    await picture('draw-2-sentence-moved')
    const moved = await boxOf(page.locator('.map-sentence'))
    const [d] = await wirePaths()
    // Two runs, and the point they meet at is the sentence's middle on screen.
    expect(d!.split(' C ').length).toBe(3)
    const [x, y] = d!.split(' C ')[1]!.split(', ')[2]!.split(' ').map(Number)
    const k = await page.locator('.map-world').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform))
    expect(k.a * x! + k.e + (await board()).x).toBeCloseTo(middle(moved).x, -1)
    expect(k.d * y! + k.f + (await board()).y).toBeCloseTo(middle(moved).y, -1)
  })
})

describe('inside a software system', () => {
  it('offers a blank card, a database, and the old kinds as templates', async () => {
    const system = await boxOf(card('Notes app'))
    await page.mouse.dblclick(middle(system).x, system.y + system.height - 12)
    await settle()
    const cards = page.getByRole('complementary', { name: 'Cards' })
    await cards.getByRole('button', { name: 'Card: database' }).waitFor({ timeout: PATIENCE })
    await cards.getByRole('button', { name: 'Card: web app' }).waitFor({ timeout: PATIENCE })
    expect(await cards.textContent()).toContain('Templates')
    await picture('draw-3-open')
  })

  it('fades what is outside the card open, and it cannot be picked', async () => {
    expect(await card('Reader').evaluate((el) => el.classList.contains('map-up--1'))).toBe(true)
    const reader = await boxOf(card('Reader'))
    await page.mouse.click(middle(reader).x, middle(reader).y)
    expect(await page.getByRole('toolbar', { name: 'What to do with what is picked' }).count()).toBe(0)
  })

  it('makes a card type in the library, and places cards of it', async () => {
    await page.getByRole('button', { name: 'New card type…' }).click()
    await page.getByLabel('Type name').fill('queue')
    await page.getByRole('radio', { name: 'Icon: mail' }).click()
    await page.getByRole('radio', { name: 'Shape: Diamond' }).click()
    await page.getByRole('radio', { name: 'Colour: teal' }).click()
    await page.getByRole('button', { name: 'Save type' }).click()
    await page.getByRole('button', { name: 'Card: queue' }).waitFor({ timeout: PATIENCE })
    await picture('draw-4-type-saved')
    const open = await boxOf(openBox('Notes app'))
    await addAt({ x: open.x + open.width * 0.25, y: open.y + open.height * 0.4 }, 'queue', 'Jobs')
    await addAt({ x: open.x + open.width * 0.72, y: open.y + open.height * 0.4 }, 'card', 'Worker')
    await away()
    await settle()
    expect(await card('Jobs').evaluate((el) => el.classList.contains('map-card--shape-diamond'))).toBe(true)
    await expect
      .poll(() => kept().root.children.find((c) => c.name === 'Notes app')?.children.find((c) => c.name === 'Jobs')?.look, { timeout: PATIENCE })
      .toEqual({ icon: 'mail', shape: 'diamond', color: 'teal' })
  })

  it('remembers the type for the next sketch', () => {
    const types = JSON.parse(readFileSync(join(yard.home, 'card-types.json'), 'utf8')) as { types: { name: string }[] }
    expect(types.types.map((t) => t.name)).toEqual(['queue'])
  })

  it('changes a card’s icon, type and colour right on it', async () => {
    const worker = () => kept().root.children.find((c) => c.name === 'Notes app')?.children.find((c) => c.name === 'Worker')
    await page.getByRole('button', { name: 'Change the icon of Worker' }).click()
    await page.locator('.map-look-pop').getByRole('radio', { name: 'Icon: bolt' }).click()
    await expect.poll(() => worker()?.look?.icon, { timeout: PATIENCE }).toBe('bolt')
    expect(await page.locator('.map-look-pop').count()).toBe(0)

    await page.getByRole('toolbar', { name: 'What to do with what is picked' }).getByRole('radio', { name: 'Colour: orange' }).click()
    await expect.poll(() => worker()?.look?.color, { timeout: PATIENCE }).toBe('orange')

    await page.getByRole('button', { name: 'Change the type of Worker' }).click()
    const type = page.getByRole('textbox', { name: 'Type name' }).first()
    await type.waitFor({ timeout: PATIENCE })
    // A blank card has no type to edit yet, so the box starts empty.
    expect(await type.inputValue()).toBe('')
    await page.waitForTimeout(300)
    await page.keyboard.type('worker pool')
    await page.keyboard.press('Enter')
    await expect.poll(() => worker()?.kind, { timeout: PATIENCE }).toBe('worker pool')
    expect(worker()?.look).toMatchObject({ icon: 'bolt', color: 'orange' })
    await settle()
    await picture('draw-5a-restyled')
    await away()
  })

  it('leaves a database’s icon and type alone', async () => {
    const open = await boxOf(openBox('Notes app'))
    await addAt({ x: open.x + open.width * 0.5, y: open.y + open.height * 0.82 }, 'database', 'Store')
    await away()
    expect(await page.getByRole('button', { name: 'Change the icon of Store' }).count()).toBe(0)
    expect(await page.getByRole('button', { name: 'Change the type of Store' }).count()).toBe(0)
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    await settle()
  })

  it('stops a wire at the diamond’s real edge', async () => {
    await wire('Jobs', 'Worker')
    await settle()
    await picture('draw-5-diamond-wire')
    const d = (await wirePaths()).at(-1)!
    const start = d.split(' ')
    const k = await page.locator('.map-world').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform))
    const jobs = await boxOf(card('Jobs'))
    const area = await board()
    const x = k.a * Number(start[1]) + k.e + area.x
    const y = k.d * Number(start[2]) + k.f + area.y
    // On the slanted edge: its distance from the middle, as shares of the box,
    // is the same on any point of a diamond's edge.
    const edge = Math.abs(x - middle(jobs).x) / jobs.width + Math.abs(y - middle(jobs).y) / jobs.height
    expect(edge).toBeCloseTo(0.48, 1)
  })

  it('lights up what a card is wired to, and steps the rest back', async () => {
    const worker = await boxOf(card('Worker'))
    await page.mouse.move(middle(worker).x, middle(worker).y)
    await page.waitForTimeout(250)
    await picture('draw-6-hover')
    expect(await page.locator('.map-world--lit').count()).toBe(1)
    expect(await card('Jobs').evaluate((el) => el.classList.contains('map-card--wired'))).toBe(true)
    expect(await page.locator('.map-wire--lit').count()).toBeGreaterThan(0)
    await away()
  })
})

describe('hubs on an open card’s border', () => {
  it('shows one where the wire from outside meets the border', async () => {
    expect(await page.locator('.map-hub').count()).toBe(1)
    expect(await page.locator('.map-hub').getAttribute('aria-label')).toContain('Reader')
  })

  it('lets several parts inside link to it', async () => {
    const hub = () => boxOf(page.locator('.map-hub'))
    await drag(middle(await hub()), middle(await boxOf(card('Jobs'))))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    await drag(middle(await hub()), middle(await boxOf(card('Worker'))))
    await page.keyboard.press('Escape')
    await away()
    await settle()
    await picture('draw-7-hub')
    await expect
      .poll(
        () => kept().root.children.find((c) => c.name === 'Notes app')?.wires.filter((w) => w.from.startsWith('hub:')).length,
        { timeout: PATIENCE },
      )
      .toBe(2)
  })

  it('names the far end of the wire in the hub’s sentences', async () => {
    const said = await page.locator('.map-sentence').allTextContents()
    expect(said.filter((one) => one.includes('Reader') && (one.includes('Jobs') || one.includes('Worker'))).length).toBe(2)
  })
})

describe('annotations', () => {
  it('keeps a diamond’s words inside it, cut short, and shows more as it grows', async () => {
    await page.getByRole('button', { name: 'Annotate' }).click()
    await page.getByRole('button', { name: 'Add diamond' }).click()
    const open = await boxOf(openBox('Notes app'))
    await page.mouse.click(open.x + open.width * 0.5, open.y + open.height * 0.8)
    const shape = page.locator('.map-anno--diamond')
    await shape.waitFor({ timeout: PATIENCE })
    await shape.dblclick()
    await page.getByRole('textbox', { name: 'Annotation text' }).waitFor({ timeout: PATIENCE })
    await page.keyboard.type('Words that go on and on, far longer than any small diamond could hold, on and on and on until they run out of room.')
    await away()
    await settle()
    await picture('draw-8-diamond-words')
    const fit = (): Promise<{ inside: boolean; cut: boolean; lines: number }> =>
      page.locator('.map-anno--diamond').evaluate((el) => {
        const text = el.querySelector('.map-anno-text') as HTMLElement
        const box = el.getBoundingClientRect()
        const words = text.getBoundingClientRect()
        const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        const reach = Math.abs(words.right - middle.x) / box.width + Math.abs(words.top - middle.y) / box.height
        return { inside: reach <= 0.5, cut: text.scrollHeight > text.clientHeight, lines: Number(getComputedStyle(text).webkitLineClamp) }
      })
    const small = await fit()
    expect(small.inside).toBe(true)
    expect(small.cut).toBe(true)
    await shape.click()
    const corner = await boxOf(page.locator('.map-anno-corner--se'))
    await drag(middle(corner), { x: middle(corner).x + 200, y: middle(corner).y + 120 })
    await settle()
    expect((await fit()).lines).toBeGreaterThan(small.lines)
    await picture('draw-9-diamond-grown')
  })

  it('holds a line on a shape’s seam, not its box', async () => {
    await away()
    await page.getByRole('button', { name: 'Add arrow', exact: true }).click()
    const shape = await boxOf(page.locator('.map-anno--diamond'))
    const k = await page.locator('.map-world').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)
    await drag({ x: shape.x - 160 * k, y: middle(shape).y }, middle(shape))
    await settle()
    await picture('draw-10-line-on-seam')
    const line = page.locator('.map-anno-line:not(.map-anno-pointer) > path:first-child').first()
    const d = (await line.getAttribute('d'))!
    const m = await page.locator('.map-world').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform))
    const area = await board()
    const end = d.split(' L ')[1]!.split(' ').map(Number)
    // Dropped on it, away from any seam, it holds whichever faces it: the
    // diamond's left tip.
    expect(m.a * end[0]! + m.e + area.x).toBeCloseTo(shape.x + shape.width * 0.02, -1)
    expect(m.d * end[1]! + m.f + area.y).toBeCloseTo(middle(shape).y, -1)
  })

  it('keeps a line on a frame the whole way while the frame is dragged', async () => {
    await away()
    await page.getByRole('button', { name: 'Add frame', exact: true }).click()
    const open = await boxOf(openBox('Notes app'))
    const start = { x: open.x + open.width * 0.3, y: open.y + open.height * 0.72 }
    await page.mouse.click(start.x, start.y)
    await page.keyboard.press('Escape')
    await away()
    const frame = page.locator('.map-anno--frame')
    const title = await boxOf(frame.locator('.map-anno-title'))
    await page.getByRole('button', { name: 'Add arrow', exact: true }).click()
    const shape = await boxOf(page.locator('.map-anno--diamond'))
    await drag(middle(shape), middle(await boxOf(frame)))
    await settle()
    const line = page.locator('.map-anno-line--arrow > path:first-child').last()
    const before = await line.getAttribute('d')
    await page.mouse.move(middle(title).x, middle(title).y)
    await page.mouse.down()
    await page.mouse.move(middle(title).x - 60, middle(title).y - 50, { steps: 8 })
    await page.waitForTimeout(100)
    // Still held: the line has already gone with it.
    expect(await line.getAttribute('d')).not.toBe(before)
    await page.mouse.up()
    await settle()
    await page.keyboard.press('Control+z')
    await settle()
  })

  it('draws a bending line, and a wire with words typed through its middle', async () => {
    await away()
    await page.getByRole('button', { name: 'Add bending line', exact: true }).click()
    const open = await boxOf(openBox('Notes app'))
    const at = (x: number, y: number) => ({ x: open.x + open.width * x, y: open.y + open.height * y })
    await drag(at(0.05, 0.05), at(0.3, 0.2))
    await settle()
    expect(await page.locator('.map-anno-line--curve > path:first-child').getAttribute('d')).toContain(' C ')

    await page.getByRole('button', { name: 'Add wire with words', exact: true }).click()
    await drag(at(0.35, 0.05), at(0.62, 0.2))
    await page.getByRole('textbox', { name: 'Annotation text' }).waitFor({ timeout: PATIENCE })
    await page.keyboard.type('hands the job over')
    await page.keyboard.press('Enter')
    await settle()
    await picture('draw-10b-wires')
    const words = page.getByRole('button', { name: 'Wire words: hands the job over' })
    const chip = await boxOf(words)
    const d = (await page.locator('.map-anno-line--wire > path:first-child').getAttribute('d'))!
    const n = d.replace(/[MC,]/g, ' ').trim().split(/\s+/).map(Number)
    const m = await page.locator('.map-world').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform))
    const area = await board()
    const midX = (n[0]! + 3 * n[2]! + 3 * n[4]! + n[6]!) / 8
    // The line passes through the middle of its words.
    expect(m.a * midX + m.e + area.x).toBeCloseTo(middle(chip).x, -1)
    await expect
      .poll(() => (kept().layers ?? []).flatMap((l) => l.items).find((a) => a.kind === 'wire')?.text, { timeout: PATIENCE })
      .toBe('hands the job over')
    await away()
  })

  it('moves out of the way when a card opens, and comes back when it closes', async () => {
    await away()
    const worker = await boxOf(card('Worker'))
    await page.getByRole('button', { name: 'Add sticky note' }).click()
    await page.mouse.click(middle(worker).x, worker.y + worker.height + 40)
    await page.keyboard.press('Escape')
    await away()
    await settle()
    const before = await boxOf(page.locator('.map-anno--sticky'))
    await page.mouse.dblclick(middle(worker).x, worker.y + worker.height - 30)
    await settle()
    await picture('draw-11-pushed')
    const opened = await boxOf(openBox('Worker'))
    const pushed = await boxOf(page.locator('.map-anno--sticky'))
    const clear =
      pushed.x + pushed.width <= opened.x || pushed.x >= opened.x + opened.width || pushed.y + pushed.height <= opened.y || pushed.y >= opened.y + opened.height
    expect(clear).toBe(true)
    await page.getByRole('button', { name: 'Back out of Worker' }).click()
    await settle()
    const back = await boxOf(page.locator('.map-anno--sticky'))
    expect(Math.abs(back.x - before.x)).toBeLessThan(2)
    expect(Math.abs(back.y - before.y)).toBeLessThan(2)
  })
})
