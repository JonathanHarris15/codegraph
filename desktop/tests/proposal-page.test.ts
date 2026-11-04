// codegraph: test ui canvas
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sayWhere, useFolder as useAgents } from '../src/modules/agents/index.js'
import { aMappedRepo, aProposal, buildSearch, closeYard, git, openYard, searchProposal, type Yard } from './yard.js'

/** The built app watching a proposal get built: a notes repo on a branch
 *  with a proposal for a search page, an agent saying where it works, and
 *  the code catching up while the canvas is open. Then a person draws a
 *  proposal of their own on a second repo, still on its main line. */
const appFolder = resolve(import.meta.dirname, '..')
const PATIENCE = 15_000
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page
let repo = ''
let other = ''

const shown = async (locator: Locator): Promise<string> => {
  const one = locator.first()
  await one.waitFor({ state: 'visible', timeout: PATIENCE })
  return (await one.textContent()) ?? ''
}
const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}
const settle = (): Promise<void> => page.waitForTimeout(900)
const card = (name: string): Locator => page.locator('.map-world').getByRole('button', { name, exact: true })
const spot = async (across: number, down: number): Promise<{ x: number; y: number }> => {
  const box = (await page.locator('.map-frame-area').boundingBox())!
  return { x: box.x + box.width * across, y: box.y + box.height * down }
}
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
  other = aMappedRepo(yard, 'jots')
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [
        { id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] },
        { id: 'jots-app', name: 'Jots', createdAt: '', systems: [{ id: 'jots', name: 'jots', path: other, remote: '' }] },
      ],
    }),
  )
  app = await electron.launch({ args: ['.', `--user-data-dir=${yard.home}`], cwd: appFolder })
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
    await page.getByRole('button', { name: 'Open notes' }).click()
    expect(await shown(meter())).toContain('0 of 5')
    await page.getByRole('button', { name: 'Open web' }).click()
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

describe('drawing a proposal of your own', () => {
  it('asks for a branch when the repo is on its main line, and makes it', async () => {
    await page.getByRole('button', { name: '← Projects' }).click()
    await page.getByRole('button', { name: 'Open Jots', exact: true }).dblclick()
    await page.getByRole('button', { name: 'Open jots' }).click()
    await page.getByRole('button', { name: 'Open web' }).click()
    await settle()
    await page.getByRole('button', { name: 'Propose a change' }).click()
    const ask = page.getByRole('form', { name: 'Make a branch for the proposal' })
    expect(await shown(ask)).toContain('on its main line')
    await page.getByLabel('Branch name').fill('add-tags')
    await page.getByRole('button', { name: 'Make the branch' }).click()
    expect(await shown(page.getByText('Proposal on add-tags'))).toBe('Proposal on add-tags')
    expect(git(other, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('add-tags')
  })

  it('draws a new card as one to build, and crosses out one from the code', async () => {
    await page.getByLabel('What this change is for').fill('Tag notes')
    await settle()
    await page.getByRole('button', { name: 'Card: module' }).click()
    const at = await spot(0.5, 0.85)
    await page.mouse.click(at.x, at.y)
    await page.getByLabel('Card name').waitFor({ timeout: PATIENCE })
    await page.keyboard.type('tags')
    await page.keyboard.press('Enter')
    expect(await shown(card('tags').locator('.map-state'))).toBe('To build')

    await card('nightly-tidy').click()
    await page.keyboard.press('Delete')
    expect(await shown(card('nightly-tidy').locator('.map-state'))).toBe('To remove')
    await picture('p4-4-drawing')
  })

  it('keeps it in the repo, and shows it over the map when done', async () => {
    await page.getByRole('button', { name: '← Done' }).click()
    expect(await shown(meter())).toContain('0 of 2')
    await settle()
    expect(await shown(onMap('web:module:tags').locator('.map-state'))).toBe('To build')
    await picture('p4-5-drawn')
  })
})
