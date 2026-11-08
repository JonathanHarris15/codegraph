// codegraph: test ui projects
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type ElectronApplication,
  type Locator,
  type Page,
} from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openTheApp } from './yard.js'

/** The built app, opened on a blank computer: its own folder for files, so
 *  the real projects on this machine are left alone. */
const PATIENCE = 15_000

let home = ''
let app: ElectronApplication
let page: Page

const open = async (): Promise<void> => {
  app = await openTheApp(home)
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
    await page.getByRole('button', { name: 'GitHub', exact: true }).click()
    const window = page.getByRole('dialog', { name: 'GitHub' })
    expect(await shown(window.getByRole('button', { name: 'Sign in' }))).toBe('Sign in')
    await page.keyboard.press('Escape')
    await window.waitFor({ state: 'detached', timeout: PATIENCE })
  })

  it('shows how to connect your agent in a window of its own', async () => {
    await page.getByRole('button', { name: 'Your agent' }).click()
    const window = page.getByRole('dialog', { name: 'Your agent' })
    expect(await shown(window)).toContain('claude mcp add --scope user codegraph')
    await window.getByRole('button', { name: 'Close' }).click()
    await window.waitFor({ state: 'detached', timeout: PATIENCE })
  })

  it('makes a project and shows it as a card', async () => {
    await page.getByRole('button', { name: 'New project' }).first().click()
    await page.getByLabel('What is it called?').fill('Mosaic Manager')
    await page.getByRole('button', { name: 'Make it' }).click()

    expect(await shown(page.getByText('Mosaic Manager'))).toContain('Mosaic Manager')
    expect(await shown(page.getByText('no software systems yet'))).toContain('repos call it')
    expect(await shown(page.getByText('mosaic-manager', { exact: true }))).toBe('mosaic-manager')
    expect(await shown(page.getByRole('button', { name: '+ Link a repo git already tracks' }))).toContain('Link a repo')
  }, 30_000)

  it('keeps the project when the app is opened again', async () => {
    await app.close()
    await open()
    expect(await shown(page.getByText('Mosaic Manager'))).toContain('Mosaic Manager')
  }, 60_000)

  it('renames a project from its ..., and keeps the name repos call it', async () => {
    await page.getByRole('button', { name: 'More for Mosaic Manager' }).click()
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    const sheet = page.getByRole('dialog', { name: 'Rename Mosaic Manager' })
    await sheet.getByLabel('Name').fill('Mosaic')
    await sheet.getByRole('button', { name: 'Rename' }).click()
    await sheet.waitFor({ state: 'detached', timeout: PATIENCE })
    expect(await shown(page.locator('.ds-card-name'))).toBe('Mosaic')
    expect(await shown(page.getByText('mosaic-manager', { exact: true }))).toBe('mosaic-manager')
  }, 30_000)

  it('deletes a project only once its name is typed', async () => {
    await page.getByRole('button', { name: 'More for Mosaic' }).click()
    await page.getByRole('menuitem', { name: 'Delete…' }).click()
    const sheet = page.getByRole('dialog', { name: 'Delete Mosaic?' })
    const go = sheet.getByRole('button', { name: 'Delete the project' })
    expect(await go.isDisabled()).toBe(true)
    await sheet.getByLabel('Type Mosaic to confirm').fill('Mosai')
    expect(await go.isDisabled()).toBe(true)
    await sheet.getByLabel('Type Mosaic to confirm').fill('Mosaic')
    await go.click()
    expect(await shown(page.getByText('No projects yet'))).toContain('No projects yet')
  }, 30_000)

  it('keeps sketches in folders, dragged in, and steps back out by the path at the top', async () => {
    await page.getByRole('button', { name: 'Sketches tab' }).click()
    await page.getByRole('button', { name: 'New sketch' }).first().click()
    await page.getByRole('button', { name: '← Sketches' }).click()
    await page.getByRole('button', { name: 'New folder' }).click()
    await page.getByLabel('Folder name').fill('Ideas')
    await page.getByRole('button', { name: 'Make it' }).click()
    const folder = page.getByRole('button', { name: 'Open folder Ideas' })
    await folder.waitFor({ timeout: PATIENCE })
    await page.locator('.sketch-row').first().dragTo(folder)
    await page.getByText('1 thing').waitFor({ timeout: PATIENCE })
    expect(await page.locator('.sketch-row').count()).toBe(0)
    await folder.click()
    expect(await shown(page.locator('.sketch-row .ds-card-name'))).toBe('New sketch')
    await page.getByRole('button', { name: 'All sketches' }).click()
    expect(await page.locator('.sketch-row').count()).toBe(0)
  }, 30_000)
})

describe('the settings screen in the real app', () => {
  const editor = () => page.getByLabel('What your agents are told')

  it('opens from the header, with every topic codegraph tells an agent about', async () => {
    await page.getByRole('button', { name: 'Settings' }).click()
    expect(await shown(page.getByRole('heading', { name: 'Settings' }))).toBe('Settings')
    const topics = page.getByRole('group', { name: 'Topics' })
    expect(await shown(topics)).toContain('setup')
    expect(await shown(topics)).toContain('working-here')
    expect(await shown(page.getByText('No edits yet'))).toContain('No edits yet')
  })

  it('takes a person own words, and says the topic is theirs now', async () => {
    await page.getByRole('button', { name: 'Instructions for tags' }).click()
    expect(await editor().inputValue()).toContain('# Codegraph')
    await editor().fill('Tag every file. Say what each wire is for.')
    await page.getByRole('button', { name: 'Save' }).click()
    expect(await shown(page.getByText('Yours'))).toBe('Yours')
    expect(await shown(page.getByText('In force now'))).toBe('In force now')
  })

  it('puts the default back, and still has what was written', async () => {
    await page.getByRole('button', { name: 'Put the default back' }).click()
    await page.getByText('Default put back').first().waitFor({ timeout: PATIENCE })
    expect(await editor().inputValue()).toContain('# Codegraph')
    expect(await page.getByRole('button', { name: 'Put this back' }).count()).toBe(1)
  })

  it('puts an old edit back in force', async () => {
    await page.getByRole('button', { name: 'Put this back' }).first().click()
    await page.waitForTimeout(300)
    expect(await editor().inputValue()).toBe('Tag every file. Say what each wire is for.')
  })

  it('reads an edit without putting it back', async () => {
    await page.getByRole('button', { name: 'Read' }).first().click()
    expect(await page.getByLabel(/^What it said on/).count()).toBe(1)
    await page.getByRole('button', { name: 'Hide' }).first().click()
    expect(await page.getByLabel(/^What it said on/).count()).toBe(0)
  })

  it('goes back to the projects', async () => {
    await page.getByRole('button', { name: 'Back to projects' }).click()
    expect(await shown(page.getByRole('heading', { name: 'Projects' }))).toBe('Projects')
  })
})
