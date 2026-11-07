// codegraph: test ui canvas
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sayWhere, useFolder as useAgents } from '../src/modules/agents/index.js'
import { aMappedRepo, aProposal, buildSearch, closeYard, git, openTheApp, openYard, searchProposal, type Yard } from './yard.js'

/** The built app watching a proposal get built: a notes repo on a branch
 *  with a proposal for a search page, an agent saying where it works, and
 *  the code catching up while the canvas is open. Then a person draws a
 *  proposal of their own on a second repo, still on its main line. */
const PATIENCE = 15_000
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page
let repo = ''

const shown = async (locator: Locator): Promise<string> => {
  const one = locator.first()
  await one.waitFor({ state: 'visible', timeout: PATIENCE })
  return (await one.textContent()) ?? ''
}
const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}
const settle = (): Promise<void> => page.waitForTimeout(900)
const meter = (): Locator => page.locator('.map-proposal')
/** A card on the map, by the end of its id: one still to build has nothing
 *  inside to open, so it is no button. */
const onMap = (id: string): Locator => page.locator(`.map-world [data-card$="/${id}"]`)

beforeAll(async () => {
  yard = openYard('proposal-page')
  useAgents(yard.home)
  repo = aMappedRepo(yard)
  const base = git(repo, 'rev-parse', 'HEAD')
  git(repo, 'checkout', '-q', '-b', 'search')
  aProposal(repo, searchProposal(base), ['search.png'])
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [
        { id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] },
      ],
    }),
  )
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).waitFor({ timeout: PATIENCE })
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('watching a proposal get built', () => {
  it('draws the proposal over the map: what is to build dashed, what is crossed out marked', async () => {
    await page.getByRole('button', { name: 'Open notes' }).dblclick()
    expect(await shown(meter())).toContain('0 of 5')
    await page.getByRole('button', { name: 'Open web' }).dblclick()
    await settle()
    expect(await shown(onMap('web:page:search').locator('.map-state'))).toBe('To build')
    expect(await shown(onMap('web:trigger:nightly-tidy').locator('.map-state'))).toBe('To remove')
    expect(await shown(page.getByRole('img', { name: 'search as proposed' }))).toBe('')
    expect(await page.getByLabel('Wire: search asks find-notes to find notes').count()).toBe(1)
    await picture('p4-1-proposed')
  })

  it('lists what is left', async () => {
    await meter().click()
    const list = page.getByRole('complementary', { name: 'The proposal on this branch' })
    expect(await shown(list)).toContain('Let people search their notes')
    expect(await shown(list)).toContain('web/page search')
    await meter().click()
  })

  it('follows the agent to the card it says it is on', async () => {
    await page.getByRole('navigation', { name: 'Where you are' }).getByRole('button').first().click()
    await settle()
    sayWhere(repo, 'web/page search', 'writing the page')
    expect(await shown(page.getByRole('status', { name: 'The agent is working here: writing the page' }))).toContain(
      'writing the page',
    )
    expect(await page.getByLabel('Follow the agent').isChecked()).toBe(true)
    await settle()
    expect(await onMap('web:page:search').count()).toBe(1)
    await picture('p4-2-agent')
  })

  it('changes as the code is built, until the proposal is built', async () => {
    buildSearch(repo, { all: false })
    await page.waitForFunction(() => document.querySelector('.map-proposal')?.textContent?.includes('4 of 5'), null, {
      timeout: PATIENCE,
    })
    expect(await shown(onMap('web:page:search').locator('.map-state'))).toBe('Built')
    buildSearch(repo)
    await page.waitForFunction(() => document.querySelector('.map-proposal')?.textContent?.includes('Proposal built'), null, {
      timeout: PATIENCE,
    })
    sayWhere(repo, '', '')
    await settle()
    await picture('p4-3-built')
  })
})

describe('how a proposal comes about', () => {
  it('has no way to draw one straight onto a map: it comes from a sketch', async () => {
    expect(await page.getByRole('button', { name: 'Propose a change' }).count()).toBe(0)
    expect(await page.getByRole('button', { name: 'Change the proposal' }).count()).toBe(0)
  })
})
