// codegraph: test ui canvas, sketch
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Sketch } from '../src/modules/sketches/index.js'
import { messy, run } from './wardrobe-mess.js'
import { aMappedRepo, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** A messy level an agent drew, tidied, as the canvas draws it: every wire at
 *  right angles, none through a card. */
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
const wirePaths = (): Promise<string[]> =>
  page.locator('.map-wire > path:first-child').evaluateAll((all) => all.map((path) => path.getAttribute('d') ?? ''))

const keep = (id: string, name: string, sketch: Sketch): void => {
  const folder = join(yard.home, 'sketches', 'notes-app', id)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'sketch.json'), JSON.stringify({ ...sketch, id, name, projectId: 'notes-app' }))
}

/** Opens a sketch and goes inside the wardrobe server. */
const openInside = async (name: string): Promise<void> => {
  await page.getByRole('button', { name: /^Project sketches/ }).click()
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
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

beforeAll(async () => {
  yard = openYard('tidy-page')
  const repo = aMappedRepo(yard)
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [{ id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] }],
    }),
  )
  keep('messy', 'Messy', messy())
  keep('tidied', 'Tidied', run(messy(), [{ do: 'tidy', in: 'server' }]))
  keep('across', 'Across', run(messy(), [{ do: 'tidy', in: 'server', direction: 'right' }]))
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.evaluate(() => window.localStorage.setItem('codegraph-panel', 'no'))
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).waitFor({ timeout: PATIENCE })
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('a tidied level', () => {
  it('was a mess before', async () => {
    await openInside('Messy')
    await picture('tidy-0-messy')
  })

  it('draws every wire at right angles once tidied', async () => {
    await page.keyboard.press('Escape')
    await openInside('Tidied')
    const paths = await wirePaths()
    expect(paths.length).toBeGreaterThan(20)
    expect(paths.some((d) => d.includes('C'))).toBe(false)
    await picture('tidy-1-down')
  })

  it('and reading right', async () => {
    await page.keyboard.press('Escape')
    await openInside('Across')
    expect((await wirePaths()).some((d) => d.includes('C'))).toBe(false)
    await picture('tidy-2-right')
  })
})
