// codegraph: test ui projects
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { type ElectronApplication, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeYard, openTheApp, openYard, type Yard } from './yard.js'

const PATIENCE = 15_000
/** Where a run leaves pictures of what it saw, when asked to. */
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page
let github: Server

// GitHub's releases, standing in: a test cannot publish one.
const release = {
  tag_name: 'v9.9.0',
  html_url: 'https://github.test/releases/tag/v9.9.0',
  body: 'Maps load faster.',
  assets: [{ name: 'Codegraph-9.9.0-windows-setup.exe', browser_download_url: 'https://github.test/Codegraph-9.9.0-windows-setup.exe' }],
}

beforeAll(async () => {
  yard = openYard('update-notice-page')
  github = createServer((_, answer) => {
    answer.writeHead(200, { 'content-type': 'application/json' })
    answer.end(JSON.stringify(release))
  })
  await new Promise<void>((ready) => github.listen(0, '127.0.0.1', ready))
  const { port } = github.address() as AddressInfo
  app = await openTheApp(yard.home, { CODEGRAPH_RELEASES: `http://127.0.0.1:${port}/releases/latest` })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1180, height: 820 })
  await page.waitForLoadState('domcontentloaded')
}, 60_000)

afterAll(async () => {
  await app?.close()
  github?.close()
  closeYard(yard)
})

describe('word of a newer codegraph', () => {
  it('says which version is out, and which one this is', async () => {
    const notice = page.getByRole('status', { name: 'A newer codegraph is out' })
    await notice.waitFor({ state: 'visible', timeout: PATIENCE })
    expect(await notice.textContent()).toContain('Codegraph 9.9.0 is out')
    expect(await notice.textContent()).toMatch(/You have \d+\.\d+\.\d+/)
    if (pictures) await page.screenshot({ path: join(pictures, 'update-notice.png') })
  })

  it('goes away when the person says not now', async () => {
    const notice = page.getByRole('status', { name: 'A newer codegraph is out' })
    await notice.getByRole('button', { name: 'Not now' }).click()
    await notice.waitFor({ state: 'hidden', timeout: PATIENCE })
  })

  it('stays away after not now, when the projects page is drawn again', async () => {
    await page.evaluate(() => (window.location.hash = '#/settings'))
    await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'hidden', timeout: PATIENCE })
    await page.evaluate(() => (window.location.hash = ''))
    await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible', timeout: PATIENCE })
    await page.waitForTimeout(1500)
    expect(await page.getByRole('status', { name: 'A newer codegraph is out' }).count()).toBe(0)
  })
})
