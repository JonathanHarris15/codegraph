// codegraph: test ui canvas
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

/** The built app on a blank computer that knows one project: the notes app
 *  the tests write by hand. */
const appFolder = resolve(import.meta.dirname, '..')
const PATIENCE = 15_000
/** Where a run leaves pictures of what it saw, when asked to. */
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

/** Lets a tunnel finish before looking. */
const settle = (): Promise<void> => page.waitForTimeout(900)

beforeAll(async () => {
  yard = openYard('canvas')
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
  await page.waitForLoadState('domcontentloaded')
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('the canvas in the real app', () => {
  it('opens a project from the grid onto its map', async () => {
    await page.getByRole('link', { name: 'Open map' }).click()
    expect(await shown(page.getByRole('button', { name: 'Open notes' }))).toContain('notes')
    await settle()
    await picture('1-project')
  })

  it('tunnels into a software system and shows its containers, wired together', async () => {
    await page.getByRole('button', { name: 'Open notes' }).click()
    expect(await shown(page.getByRole('button', { name: 'Open web' }))).toContain('browser app')
    expect(await shown(page.getByLabel('db', { exact: true }))).toContain('database')
    expect(await shown(page.locator('.map-wire-words'))).toBe('keeps notes')
    await settle()
    await picture('2-system')
  })

  it('tunnels into a container and shows its pages as frames, with the wires between components', async () => {
    await page.getByRole('button', { name: 'Open web' }).click()
    expect(await shown(page.getByRole('button', { name: 'Open new-note' }))).toContain('/notes/new')
    expect(await shown(page.getByText('No screenshot yet'))).toBe('No screenshot yet')
    expect(await shown(page.getByText('saves what was typed'))).toBe('saves what was typed')
    expect(await shown(page.getByRole('navigation', { name: 'Where you are' }))).toContain('web')
    await settle()
    await picture('3-container')
  })

  it('tunnels down to the code', async () => {
    await page.getByRole('button', { name: 'Open write-note' }).click()
    expect(await shown(page.getByText('writeNote'))).toBe('writeNote')
    await settle()
    await picture('4-code')
  })

  it('tunnels back out', async () => {
    await page.keyboard.press('Escape')
    await settle()
    await page.keyboard.press('Escape')
    expect(await shown(page.getByRole('button', { name: 'Open web' }))).toContain('web')
  })

  it('reads another branch when it is picked, without leaving the level', async () => {
    await page.getByLabel('Where to read notes').selectOption('branch:add-search')
    await page.getByRole('button', { name: 'Open web' }).click()
    expect(await shown(page.getByRole('button', { name: 'Open search' }))).toContain('/search')
    await settle()
    await picture('5-branch')
  })
})
