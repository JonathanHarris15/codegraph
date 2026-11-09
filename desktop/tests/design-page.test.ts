// codegraph: test ui canvas
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sayWhere, useFolder as useAgents } from '../src/modules/agents/index.js'
import { aMappedRepo, aPicture, closeYard, git, openTheApp, openYard, type Yard } from './yard.js'

/** The built app showing a software system's DESIGN.md as what each token
 *  is, never as text: a swatch, a space, a corner, a line of type, and what
 *  a UI block's tokens make together (ADR 0024). */
const PATIENCE = 15_000
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

const DESIGN = `---
name: Daylight
description: Calm neutrals and one accent.
colors:
  blue-500: "#2563eb"
  paper: "#ffffff"
  action: "{colors.blue-500}"
typography:
  body-md:
    fontFamily: Georgia
    fontSize: 18px
    fontWeight: 600
rounded:
  md: 8px
spacing:
  md: 16px
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: 12px
---

## Overview

Quiet, so the work stands out.
`

let yard: Yard
let app: ElectronApplication
let page: Page
let repo = ''
let devServer: Server
let devPort = 0

const view = (): Locator => page.getByRole('region', { name: 'Design system Daylight' })
const token = (id: string): Locator => view().locator(`[data-token="${id}"]`)
const sample = (id: string): Locator => token(id).locator('.design-sample')
const style = (locator: Locator, property: string): Promise<string> =>
  locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property)
const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}

beforeAll(async () => {
  yard = openYard('design-page')
  repo = aMappedRepo(yard)
  writeFileSync(join(repo, 'DESIGN.md'), DESIGN)
  mkdirSync(join(repo, 'app', 'ui'), { recursive: true })
  writeFileSync(
    join(repo, 'app', 'ui', 'settings-row.tsx'),
    [
      '// codegraph: module ui',
      '// codegraph: ui block settings/SettingsRow',
      '/** One setting: its label on the left, its control on the right. */',
      'export const SettingsRow = (props: {',
      '  /** What the setting is called. */',
      '  label: string',
      '  /**',
      '   * How loud the row is.',
      '   * danger: only inside the danger zone',
      '   */',
      "  tone?: 'plain' | 'danger'",
      '}) => null',
      '',
    ].join('\n'),
  )
  writeFileSync(
    join(repo, 'app', 'ui', 'settings-row.states.tsx'),
    '// codegraph: states SettingsRow\nexport const loading = () => null\nexport const noPermission = () => null\n',
  )
  mkdirSync(join(repo, 'codegraph-screenshots', 'ui-blocks'), { recursive: true })
  writeFileSync(join(repo, 'codegraph-screenshots', 'ui-blocks', 'SettingsRow.loading.png'), aPicture())
  writeFileSync(join(repo, 'codegraph-screenshots', 'notes.png'), aPicture())
  mkdirSync(join(repo, 'recipes'), { recursive: true })
  writeFileSync(
    join(repo, 'recipes', 'list-page.md'),
    [
      '---',
      'recipe: list-page',
      'use-when: A page of many records.',
      'not-for: One record on its own.',
      'reference: app/pages/notes.tsx',
      '---',
      '',
      '## Skeleton',
      '```',
      '<SettingsRow label />',
      '```',
      '',
      '## Rules',
      'Newest first.',
      '',
    ].join('\n'),
  )
  const notes = join(repo, 'app', 'pages', 'notes.tsx')
  writeFileSync(notes, readFileSync(notes, 'utf8').replace('start page notes at /', 'start page notes at / follows list-page'))

  // codegraph: fakes the repo's dev server because the test repo has no app to run; it echoes what it is asked for
  devServer = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://here')
    const said = url.pathname === '/__codegraph/ui-block'
      ? [url.searchParams.get('name'), url.searchParams.get('state') ?? '', url.searchParams.get('options') ?? ''].join('|')
      : `page ${url.pathname}`
    res.setHeader('content-type', 'text/html')
    res.end(`<p id="echo">${said.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
  })
  await new Promise<void>((done) => devServer.listen(0, '127.0.0.1', done))
  devPort = (devServer.address() as AddressInfo).port
  const dev = `http://127.0.0.1:${devPort}`
  const config = JSON.parse(readFileSync(join(repo, 'codegraph.config.json'), 'utf8')) as { containers: Record<string, Record<string, unknown>> }
  config.containers.web!.dev = dev
  writeFileSync(join(repo, 'codegraph.config.json'), JSON.stringify(config))
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [
        {
          id: 'notes-app',
          name: 'Notes',
          createdAt: '',
          systems: [
            { id: 'notes', name: 'notes', path: repo, remote: '' },
            // A second repo with no design system at all, to show the page says how to start one.
            { id: 'plain', name: 'plain', path: aMappedRepo(yard, 'plain'), remote: '' },
          ],
        },
      ],
    }),
  )
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).dblclick({ timeout: PATIENCE })
}, 60_000)

afterAll(async () => {
  devServer?.close()
  await app?.close()
  closeYard(yard)
})

describe('looking at a design system', () => {
  it('opens from the map of a software system that has a DESIGN.md', async () => {
    await page.getByRole('button', { name: 'Design system' }).click({ timeout: PATIENCE })
    await view().waitFor({ timeout: PATIENCE })
    expect(await view().textContent()).toContain('Calm neutrals and one accent.')
    expect(await view().textContent()).toContain('Quiet, so the work stands out.')
  })

  it('lets the branch list open over it, not behind it', async () => {
    await page.getByRole('button', { name: 'Branch of notes' }).click()
    const menu = page.getByRole('menu', { name: 'Branches of notes' })
    await menu.waitFor({ timeout: PATIENCE })
    const onTop = await menu.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const there = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return there !== null && el.contains(there)
    })
    expect(onTop).toBe(true)
    await page.getByRole('button', { name: 'Branch of notes' }).click()
    await menu.waitFor({ state: 'hidden', timeout: PATIENCE })
    expect(await view().count()).toBe(1)
  })

  it('draws each colour as a swatch of itself', async () => {
    expect(await style(sample('colors.blue-500'), 'background-color')).toBe('rgb(37, 99, 235)')
    expect(await style(sample('colors.action'), 'background-color')).toBe('rgb(37, 99, 235)')
    expect(await token('colors.action').textContent()).toContain('#2563eb')
  })

  it('draws each space at its size and each corner at its radius', async () => {
    expect(await style(sample('spacing.md'), 'width')).toBe('16px')
    expect(await style(sample('rounded.md'), 'border-top-left-radius')).toBe('8px')
  })

  it('sets a line in each type style', async () => {
    const line = sample('typography.body-md')
    expect(await style(line, 'font-size')).toBe('18px')
    expect(await style(line, 'font-weight')).toBe('600')
    expect(await style(line, 'font-family')).toContain('Georgia')
  })

  it('draws a UI block token as its tokens make it, and says how well it reads', async () => {
    const button = sample('components.button-primary')
    expect(await style(button, 'background-color')).toBe('rgb(37, 99, 235)')
    expect(await style(button, 'color')).toBe('rgb(255, 255, 255)')
    expect(await style(button, 'border-top-left-radius')).toBe('8px')
    expect(await style(button, 'padding-top')).toBe('12px')
    expect(await token('components.button-primary').textContent()).toContain('5.2:1')
    await picture('d9-2-tokens')
  })

  it('shows what a picked token names and everything it feeds', async () => {
    await token('colors.blue-500').click()
    const picked = page.getByRole('complementary', { name: 'Token colors.blue-500' })
    expect(await picked.textContent()).toContain('Raw')
    expect(await picked.textContent()).toContain('colors.action')
    expect(await picked.textContent()).toContain('components.button-primary')

    await token('colors.action').click()
    const action = page.getByRole('complementary', { name: 'Token colors.action' })
    expect(await action.textContent()).toContain('Purpose')
    expect(await action.textContent()).toContain('{colors.blue-500}')

    await token('components.button-primary').click()
    const button = page.getByRole('complementary', { name: 'Token components.button-primary' })
    expect(await button.textContent()).toContain('Reads at any size')
    await picture('d9-2-picked')
  })

  it('jumps to a token named in the panel', async () => {
    await page.getByRole('complementary', { name: 'Token components.button-primary' }).getByRole('button', { name: 'colors.action' }).click()
    await page.getByRole('complementary', { name: 'Token colors.action' }).waitFor({ timeout: PATIENCE })
  })

  it('changes a colour: previews it, then on the main line saves it on a new branch, and what names it follows', async () => {
    await token('colors.blue-500').click()
    const panel = page.getByRole('complementary', { name: 'Token colors.blue-500' })
    await panel.getByLabel('Value of colors.blue-500').fill('#dc2626')
    expect(await style(panel.locator('.design-sample'), 'background-color')).toBe('rgb(220, 38, 38)')
    expect(await style(sample('colors.action'), 'background-color')).toBe('rgb(37, 99, 235)')

    await panel.getByRole('button', { name: 'Save to DESIGN.md' }).click()
    await expect.poll(() => style(sample('colors.action'), 'background-color'), { timeout: PATIENCE }).toBe('rgb(220, 38, 38)')
    expect(await style(sample('components.button-primary'), 'background-color')).toBe('rgb(220, 38, 38)')
    expect(await panel.getByRole('status').textContent()).toContain('design/colors-blue-500')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('design/colors-blue-500')
    expect(readFileSync(join(repo, 'DESIGN.md'), 'utf8')).toContain('blue-500: "#dc2626"')
    await picture('d9-3-colour')
  })

  it('drags a space wider, on the branch it is already on', async () => {
    await token('spacing.md').click()
    const panel = page.getByRole('complementary', { name: 'Token spacing.md' })
    await panel.getByLabel('Drag spacing.md').fill('40')
    expect(await panel.getByLabel('Value of spacing.md').inputValue()).toBe('40px')
    await panel.getByRole('button', { name: 'Save to DESIGN.md' }).click()
    await expect.poll(() => style(sample('spacing.md'), 'width'), { timeout: PATIENCE }).toBe('40px')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('design/colors-blue-500')
  })

  it('says why a value will not do, and writes nothing', async () => {
    await token('rounded.md').click()
    const panel = page.getByRole('complementary', { name: 'Token rounded.md' })
    const before = readFileSync(join(repo, 'DESIGN.md'), 'utf8')
    await panel.getByLabel('Value of rounded.md').fill('8')
    await panel.getByRole('button', { name: 'Save to DESIGN.md' }).click()
    expect(await panel.getByRole('alert').textContent({ timeout: PATIENCE })).toContain('needs a unit')
    expect(readFileSync(join(repo, 'DESIGN.md'), 'utf8')).toBe(before)
    await panel.getByRole('button', { name: 'Put back' }).click()
    expect(await panel.getByLabel('Value of rounded.md').inputValue()).toBe('8px')
  })

  it('shows the UI blocks in their folders, each with its picture', async () => {
    await view().getByRole('tab', { name: /UI blocks/ }).click()
    await view().getByLabel('Folder settings').waitFor({ timeout: PATIENCE })
    const tile = view().locator('[data-ui-block="settings/SettingsRow"]')
    expect(await tile.textContent()).toContain('One setting: its label on the left')
    expect(await tile.textContent()).toContain('2 options · 2 states')
    expect(await tile.getByRole('img').getAttribute('src')).toMatch(/^data:image\/png;base64,/)
  })

  it('shows a picked UI block\'s options, what its choices mean, and its states', async () => {
    await view().locator('[data-ui-block="settings/SettingsRow"]').click()
    const panel = page.getByRole('complementary', { name: 'UI block settings/SettingsRow' })
    const tone = panel.locator('[data-option="tone"]')
    expect(await tone.textContent()).toContain("'plain' | 'danger'")
    expect(await tone.textContent()).toContain('only inside the danger zone')
    expect(await panel.locator('[data-state="loading"]').getByRole('img').count()).toBe(1)
    expect(await panel.locator('[data-state="noPermission"]').textContent()).toContain('No picture yet')
    await picture('d9-5-ui-blocks')
  })

  it('runs a picked UI block live from the repo\'s own dev server, with its options set by hand or in a state', async () => {
    const panel = page.getByRole('complementary', { name: 'UI block settings/SettingsRow' })
    const echo = (): Promise<string | null> => page.frameLocator('iframe.live-page').locator('#echo').textContent({ timeout: PATIENCE })
    await panel.getByRole('button', { name: 'See it live' }).click()
    await expect.poll(echo, { timeout: PATIENCE }).toBe('settings/SettingsRow||')

    await panel.getByLabel('Option tone').selectOption('danger')
    await expect.poll(echo, { timeout: PATIENCE }).toBe('settings/SettingsRow||{"tone":"danger"}')
    await panel.getByLabel('Option label').fill('Plan')
    await expect.poll(echo, { timeout: PATIENCE }).toBe('settings/SettingsRow||{"tone":"danger","label":"Plan"}')

    await view().getByRole('group', { name: 'Show it' }).getByRole('button', { name: 'loading' }).click()
    await expect.poll(echo, { timeout: PATIENCE }).toBe('settings/SettingsRow|loading|')
    expect(await panel.locator('[data-option="tone"]').textContent()).toContain('The state shown sets its own options.')
    await picture('d9-7-live')
    await panel.getByRole('button', { name: 'Back to the pictures' }).click()
  })

  it('opens a recipe to its words, beside its reference page as it looks', async () => {
    await view().getByRole('tab', { name: /Recipes/ }).click()
    const recipe = view().getByRole('region', { name: 'Recipe list-page' })
    await recipe.waitFor({ timeout: PATIENCE })
    expect(await recipe.textContent()).toContain('A page of many records.')
    expect(await recipe.textContent()).toContain('Newest first.')
    expect(await recipe.locator('.recipe-skeleton').textContent()).toContain('<SettingsRow label />')
    const reference = recipe.getByRole('complementary', { name: 'Reference page for list-page' })
    expect(await reference.textContent()).toContain('Reference page: notes')
    expect(await reference.getByRole('img').getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    expect(await reference.textContent()).toContain('Followed by')
    await picture('d9-6-recipe')
  })

  it('runs a recipe\'s reference page live, and says to start the dev server once it stops', async () => {
    const reference = view().getByRole('complementary', { name: 'Reference page for list-page' })
    await reference.getByRole('button', { name: 'See it live' }).click()
    await expect
      .poll(() => page.frameLocator('iframe.live-page').locator('#echo').textContent({ timeout: PATIENCE }), { timeout: PATIENCE })
      .toBe('page /')

    const closed = new Promise<void>((done) => devServer.close(() => done()))
    devServer.closeAllConnections()
    await closed
    await reference.getByRole('button', { name: 'Reload' }).click()
    expect(await reference.getByRole('status').textContent({ timeout: PATIENCE })).toMatch(/Nothing is answering at http:\/\/127\.0\.0\.1:\d+/)
    await reference.getByRole('button', { name: 'Back to the screenshot' }).click()
    await view().getByRole('tab', { name: /Tokens/ }).click()
  })

  it('closes back to the map', async () => {
    await view().getByRole('button', { name: 'Close' }).click()
    expect(await view().count()).toBe(0)
  })

  it('marks each page on the map with the recipe it follows', async () => {
    await page.getByRole('button', { name: 'Open web' }).dblclick()
    const chip = page.locator('.map-world [data-card$="/web:page:notes"] .map-recipe')
    await chip.waitFor({ timeout: PATIENCE })
    expect(await chip.textContent()).toBe('list-page')
    expect(await page.locator('.map-world [data-card$="/web:page:new-note"] .map-recipe').count()).toBe(0)
    await chip.scrollIntoViewIfNeeded()
    await picture('d9-6-page-map')
  })

  it('opens to the UI block an agent says it is working on, live, and keeps up as it changes the file', async () => {
    await new Promise<void>((done) => devServer.listen(devPort, '127.0.0.1', done))
    useAgents(yard.home)
    sayWhere(repo, 'ui block settings/SettingsRow', 'adding a hint')

    const told = view().getByRole('status', { name: 'The agent is working on this UI block' })
    expect(await told.textContent({ timeout: PATIENCE })).toContain('adding a hint')
    await expect
      .poll(() => page.frameLocator('iframe.live-page').locator('#echo').textContent({ timeout: PATIENCE }), { timeout: PATIENCE })
      .toBe('settings/SettingsRow||')

    const file = join(repo, 'app', 'ui', 'settings-row.tsx')
    writeFileSync(file, readFileSync(file, 'utf8').replace('  label: string', '  label: string\n  /** A line under the label. */\n  hint?: string'))
    const panel = page.getByRole('complementary', { name: 'UI block settings/SettingsRow' })
    await panel.locator('[data-option="hint"]').waitFor({ timeout: PATIENCE })
    expect(await panel.getByLabel('Option hint').count()).toBe(1)
    await picture('d9-8-agent')
    sayWhere(repo, '', '')
  })

  it('has a design page in every software system, and one with nothing yet says how to start', async () => {
    await view().getByRole('button', { name: 'Close' }).click()
    await page.getByRole('navigation', { name: 'Where you are' }).getByRole('button').first().click()
    await page.getByRole('button', { name: 'Open plain' }).dblclick({ timeout: PATIENCE })
    await page.getByRole('button', { name: 'Design system' }).click({ timeout: PATIENCE })
    const empty = page.getByRole('region', { name: 'Design system', exact: true })
    const start = empty.getByRole('region', { name: 'How to start the design system' })
    expect(await start.textContent({ timeout: PATIENCE })).toContain('This software system has no design system yet.')
    expect(await start.textContent()).toContain('Set up the design system for codegraph.')
    expect(await start.getByRole('button', { name: 'Copy' }).count()).toBe(1)
    expect(await empty.getByRole('tablist').count()).toBe(0)
    await picture('d9-empty')
    await empty.getByRole('button', { name: 'Close' }).click()
  })
})
