// codegraph: test ui canvas
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aMappedRepo, closeYard, git, openTheApp, openYard, type Yard } from './yard.js'

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
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [{ id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] }],
    }),
  )
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).dblclick({ timeout: PATIENCE })
}, 60_000)

afterAll(async () => {
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

  it('closes back to the map', async () => {
    await view().getByRole('button', { name: 'Close' }).click()
    expect(await view().count()).toBe(0)
  })
})
