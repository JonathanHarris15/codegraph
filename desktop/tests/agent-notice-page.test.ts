// codegraph: test ui projects
// codegraph: fakes the claude command because the real one changes the person's own Claude Code and fetches from GitHub
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openTheApp } from './yard.js'

/** The real app on a computer whose Claude Code still has an older codegraph:
 *  an MCP added by hand and the legacy plugin on, and no skills (ADR 0039). */
const PATIENCE = 15_000
let home = ''
let log = ''
let app: ElectronApplication
let page: Page

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'codegraph-agent-notice-'))
  const config = join(home, 'claude-code')
  mkdirSync(config, { recursive: true })
  writeFileSync(
    join(config, '.claude.json'),
    JSON.stringify({
      mcpServers: {
        codegraph: {
          type: 'stdio',
          command: 'node',
          args: ['/Applications/Codegraph.app/Contents/Resources/app/out/main/mcp.js'],
        },
      },
    }),
  )
  writeFileSync(join(config, 'settings.json'), JSON.stringify({ enabledPlugins: { 'codegraph@codegraph': true } }))
  log = join(home, 'asked.log')
  const claude = join(home, 'claude-command')
  writeFileSync(
    claude,
    `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(' ') + '\\n')\n`,
  )
  chmodSync(claude, 0o755)
  app = await openTheApp(join(home, 'app'), {
    CLAUDE_CONFIG_DIR: config,
    CODEGRAPH_CLAUDE: claude,
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
}, 60_000)

afterAll(async () => {
  await app?.close()
  rmSync(home, { recursive: true, force: true })
})

describe('an older codegraph left in Claude Code', () => {
  it('is named in a notice on the projects page', async () => {
    const notice = page.getByRole('status', {
      name: 'Your agent has an older codegraph',
    })
    await notice.waitFor({ state: 'visible', timeout: PATIENCE })
    expect(await notice.textContent()).toContain('the legacy codegraph plugin is on')
    expect(await notice.textContent()).toContain('an MCP for codegraph was added by hand')
  })

  it('is listed in the Your agent window, with the commands to do it by hand', async () => {
    await page.getByRole('button', { name: 'Your agent' }).click()
    const window = page.getByRole('dialog', { name: 'Your agent' })
    await window.waitFor({ state: 'visible', timeout: PATIENCE })
    expect(await window.textContent()).toContain('claude mcp remove --scope user codegraph')
    await window.getByRole('button', { name: 'Close' }).click()
    await window.waitFor({ state: 'detached', timeout: PATIENCE })
  })

  it("is cleaned up with one click, through Claude Code's own command", async () => {
    await page.getByRole('status', { name: 'Your agent has an older codegraph' }).getByRole('button', { name: 'Clean up' }).click()
    const done = page.getByRole('status', { name: 'Your agent is up to date' })
    await done.waitFor({ state: 'visible', timeout: PATIENCE })
    expect(await done.textContent()).toContain('Start a new Claude Code session')
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual([
      'plugin marketplace add JonathanHarris15/codegraph',
      'plugin install codegraph-app@codegraph --scope user',
      'plugin disable codegraph@codegraph --scope user',
      'mcp remove --scope user codegraph',
    ])
  })
})
