// codegraph: test ui projects
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page,
} from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/** The built app, opened on a blank computer: its own folder for files, so
 *  the real projects on this machine are left alone. */
const appFolder = resolve(import.meta.dirname, '..')
const PATIENCE = 15_000

let home = ''
let app: ElectronApplication
let page: Page

const open = async (): Promise<void> => {
  app = await electron.launch({ args: ['.', `--user-data-dir=${home}`], cwd: appFolder })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
}

/** Waits for something to show, and hands back what it says. */
const shown = async (locator: Locator): Promise<string> => {
  const one = locator.first()
  await one.waitFor({ state: 'visible', timeout: PATIENCE })
  return (await one.textContent()) ?? ''
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'codegraph-page-'))
  await open()
}, 60_000)

afterAll(async () => {
  await app?.close()
  rmSync(home, { recursive: true, force: true })
})

describe('the projects screen in the real app', () => {
  it('opens on the projects screen', async () => {
    expect(await shown(page.getByRole('heading', { name: 'Projects' }))).toBe('Projects')
  })

  it('says there are no projects yet, on a computer that has none', async () => {
    expect(await shown(page.getByText('No projects yet'))).toContain('No projects yet')
  })

  it('offers to sign in to GitHub', async () => {
    expect(await shown(page.getByRole('button', { name: 'Sign in' }))).toBe('Sign in')
  })

  it('makes a project and shows it as a card', async () => {
    await page.getByRole('button', { name: 'New project' }).first().click()
    await page.getByLabel('What is it called?').fill('Mosaic Manager')
    await page.getByRole('button', { name: 'Make it' }).click()

    expect(await shown(page.getByText('Mosaic Manager'))).toContain('Mosaic Manager')
    expect(await shown(page.getByText('no software systems yet'))).toContain('repos call it')
    expect(await shown(page.getByText('mosaic-manager', { exact: true }))).toBe('mosaic-manager')
    expect(await shown(page.getByRole('button', { name: 'Link a repo' }))).toBe('Link a repo')
  }, 30_000)

  it('keeps the project when the app is opened again', async () => {
    await app.close()
    await open()
    expect(await shown(page.getByText('Mosaic Manager'))).toContain('Mosaic Manager')
  }, 60_000)
})
