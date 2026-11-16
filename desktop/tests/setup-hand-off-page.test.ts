// codegraph: test ui projects
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aSoftwareSystem, closeYard, git, openTheApp, openYard, type Yard } from './yard.js'

/** The projects page handing setup to a person's agent: a project whose one
 *  repo is not set up, and a project with no repo at all. */
const PATIENCE = 15_000
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page
let old = ''

const shown = async (locator: Locator): Promise<string> => {
  const one = locator.first()
  await one.waitFor({ state: 'visible', timeout: PATIENCE })
  return (await one.textContent()) ?? ''
}
const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}
const row = (): Locator => page.locator('.project-repo').filter({ hasText: 'old-site' })

beforeAll(async () => {
  yard = openYard('setup-hand-off')
  old = aSoftwareSystem(yard, 'old-site')
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [
        { id: 'billing', name: 'Billing', shortName: 'billing', createdAt: '', systems: [{ id: 'old-site', name: 'old-site', path: old, remote: '' }] },
        { id: 'garden', name: 'Garden planner', shortName: 'garden-planner', createdAt: '', systems: [] },
      ],
    }),
  )
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1300, height: 760 })
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ timeout: PATIENCE })
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('a project with no repo yet', () => {
  it('asks to link the first one, plainly', async () => {
    const card = page.locator('.project-card').filter({ hasText: 'Garden planner' })
    expect(await shown(card.locator('.project-repos-empty'))).toContain('Link the git repos this project is made of')
    expect(await card.getByRole('button', { name: 'Link a repo', exact: true }).count()).toBe(1)
  })
})

describe('a repo that needs setup', () => {
  it('gives the words to hand setup to an agent', async () => {
    expect(await shown(row().getByText('needs setup'))).toBe('needs setup')
    await row().getByRole('button', { name: 'Copy setup prompt' }).click()
    // Once copied it waits for the agent, and says so.
    await row().getByRole('button', { name: 'Waiting for your agent…' }).waitFor({ timeout: PATIENCE })
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText())
    expect(copied).toContain('Use codegraph: set up the repo old-site')
    expect(copied).toContain('for project billing')
    expect(copied).toContain('instructions with topic setup')
    await page.waitForTimeout(400)
    await picture('setup-1-waiting')
  })

  it('stops waiting once the repo is set up', async () => {
    writeFileSync(
      join(old, 'codegraph.config.json'),
      JSON.stringify({ projects: ['billing'], containers: { app: { kind: 'command-line tool', folders: [''] } } }),
    )
    writeFileSync(join(old, 'thing.ts'), '// codegraph: module thing\nexport const a = 1\n')
    git(old, 'add', '-A')
    git(old, 'commit', '-q', '-m', 'set up codegraph')
    await page.getByRole('button', { name: 'Check GitHub again' }).click()
    await row().getByText(/^set up/).waitFor({ timeout: PATIENCE })
    expect(await row().getByRole('button', { name: 'Waiting for your agent…' }).count()).toBe(0)
    expect(await row().getByRole('button', { name: 'Copy setup prompt' }).count()).toBe(0)
    await picture('setup-2-done')
  })
})
