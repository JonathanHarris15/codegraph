// codegraph: test ui projects, canvas
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeYard, git, openTheApp, openYard, writeInto, type Yard } from './yard.js'

/** The built app with one project, Billing, whose software system is kept in
 *  two repos: a server and a phone app. The ? in the corner says what the
 *  four levels are, wherever a person is. */
const PATIENCE = 15_000
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page

const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}

const aRepoOf = (name: string, containers: Record<string, unknown>, files: Record<string, string>): string => {
  const path = join(yard.path, name)
  mkdirSync(path, { recursive: true })
  git(path, 'init', '--initial-branch=main')
  git(path, 'config', 'user.email', 'test@example.com')
  git(path, 'config', 'user.name', 'Test')
  writeInto(path, { 'codegraph.config.json': JSON.stringify({ projects: ['billing'], system: 'Billing', containers }), ...files })
  git(path, 'add', '-A')
  git(path, 'commit', '-m', 'first')
  return path
}

const help = () => page.getByRole('button', { name: 'What the four levels are' })
const levels = () => page.getByRole('dialog', { name: 'The four levels' })
const here = () => levels().locator('[aria-current="step"]')

beforeAll(async () => {
  yard = openYard('levels-help')
  const api = aRepoOf('billing-api', { api: { kind: 'server', says: 'Takes the payments', folders: ['src'] } }, {
    'src/charge.ts': '// codegraph: feature charge\nexport const charge = () => 1\n',
  })
  const phone = aRepoOf('billing-phone', { phone: { kind: 'mobile app', says: 'Where people pay', folders: ['app'] } }, {
    'app/pay.ts': "// codegraph: page pay at /pay\nexport const pay = () => fetch('/charge') // codegraph: wire to billing-api: asks for the charge\n",
  })
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [
        {
          id: 'billing',
          name: 'Billing',
          createdAt: '',
          systems: [
            { id: 'billing-api', name: 'billing-api', path: api, remote: '' },
            { id: 'billing-phone', name: 'billing-phone', path: phone, remote: '' },
          ],
        },
      ],
    }),
  )
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ timeout: PATIENCE })
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('the four levels, from the corner', () => {
  it('says what each level shows from the projects page, marking none', async () => {
    await help().click()
    const said = await levels().textContent({ timeout: PATIENCE })
    for (const name of ['Context', 'Containers', 'Components', 'Code']) expect(said).toContain(name)
    expect(said).toContain('Open a software system')
    expect(await here().count()).toBe(0)
    await picture('levels-projects')
    await page.keyboard.press('Escape')
    await levels().waitFor({ state: 'hidden', timeout: PATIENCE })
  })

  it('marks the level on the board, going in a level at a time', async () => {
    await page.getByRole('button', { name: 'Open Billing', exact: true }).dblclick()
    const system = page.getByRole('button', { name: 'Open Billing', exact: true })
    await system.waitFor({ timeout: PATIENCE })
    await help().click()
    expect(await here().textContent()).toContain('Context')
    await help().click()

    await system.dblclick()
    await page.getByRole('button', { name: 'Open phone' }).waitFor({ timeout: PATIENCE })
    await help().click()
    expect(await here().textContent()).toContain('Containers')
    await picture('levels-system')
    await help().click()
  })

  it('draws the two repos as one software system, each container with its own repo and branch', async () => {
    expect(await page.getByRole('button', { name: 'Open api' }).count()).toBe(1)
    expect(await page.getByText('Each container shows its repo and branch').count()).toBe(1)
    for (const [container, repo] of [['api', 'billing-api'], ['phone', 'billing-phone']]) {
      expect(await page.getByRole('button', { name: `Open ${container}` }).textContent()).toContain(repo)
      expect(await page.getByRole('button', { name: `Branch of ${repo}` }).textContent()).toContain('main')
    }
    await picture('levels-joined')
    expect(await page.getByText('for the charge').count()).toBeGreaterThan(0)
  })
})
