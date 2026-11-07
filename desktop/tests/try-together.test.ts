// codegraph: test ui gallery
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeYard, openYard, type Yard } from './yard.js'

/** `npm run together`, as far as the first window: the project it sets up has to
 *  reach a computer that has never seen it. */
const appFolder = resolve(import.meta.dirname, '..')
let yard: Yard

beforeAll(() => {
  yard = openYard('try-together')
})
afterAll(() => closeYard(yard))

describe('trying it with no Firebase', () => {
  it('opens on a shared project, as a member, on a computer that has never seen it', async () => {
    execFileSync('node', ['scripts/try-together.mjs', '--set-up-only'], { cwd: appFolder, env: { ...process.env, HOME: yard.path } })
    const folder = join(yard.path, '.codegraph-try-together')
    const app = await electron.launch({
      args: ['.', `--user-data-dir=${join(folder, 'ben')}`],
      cwd: appFolder,
      env: { ...process.env, CODEGRAPH_CLOUD_FOLDER: join(folder, 'online') },
    })
    const page = await app.firstWindow()
    try {
      await page.getByText('Ben', { exact: true }).waitFor({ timeout: 15_000 })
      await page.getByRole('button', { name: 'Open Trying it together', exact: true }).waitFor({ timeout: 15_000 })
      expect(await page.getByRole('button', { name: 'Members of Trying it together' }).textContent()).toContain('you are a collaborator')
    } finally {
      await app.close()
    }
  })
})
