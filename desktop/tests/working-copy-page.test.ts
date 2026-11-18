// codegraph: test ui projects
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { addSoftwareSystem, findProject } from '../src/modules/projects/index.js'
import { aComputer, aSoftwareSystem, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** A computer where a project knows one of its repos only from GitHub, with a
 *  clone of it sitting beside the project's other repo. */
const PATIENCE = 15_000
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page
let backend = ''
let projectId = ''

const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}

beforeAll(async () => {
  yard = openYard('working-copy-page')
  const here = aComputer(yard, 'here')
  here.be()
  projectId = (await createProject('Wardrobe')).id
  await linkSoftwareSystem(projectId, aSoftwareSystem(yard, 'wardrobe/frontend', { remote: 'me/wardrobe-frontend' }))
  addSoftwareSystem(projectId, { name: 'wardrobe-backend', path: '', remote: 'me/wardrobe-backend' })
  backend = aSoftwareSystem(yard, 'wardrobe/backend', { remote: 'me/wardrobe-backend' })

  app = await openTheApp(here.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1300, height: 800 })
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

const row = () => page.locator('.project-repo').filter({ hasText: 'wardrobe-backend' })

describe('a repo with no working copy on this computer', () => {
  it('offers the copy it found beside the project\'s other repo', async () => {
    await row().getByText('Found a working copy').waitFor({ timeout: PATIENCE })
    expect(await row().getByRole('button', { name: 'Clone here…' }).isVisible()).toBe(true)
    await picture('working-copy-1-found')
  })

  it('links it in one click', async () => {
    await row().getByRole('button', { name: 'Link it' }).click()
    await row().getByText('no working copy here').waitFor({ state: 'detached', timeout: PATIENCE })
    expect(findProject(projectId)?.systems.find((s) => s.name === 'wardrobe-backend')?.path).toBe(backend)
    await picture('working-copy-2-linked')
  })

  it('unlinks the folder again, keeping the repo on the project', async () => {
    await row().getByRole('button', { name: 'More for wardrobe-backend' }).click()
    await picture('working-copy-3-menu')
    await page.getByRole('menuitem', { name: 'Unlink this folder' }).click()
    await row().getByText('no working copy here').waitFor({ timeout: PATIENCE })
    expect(findProject(projectId)?.systems).toHaveLength(2)
  })

  it('takes the repo off the project once asked to be sure', async () => {
    await row().getByRole('button', { name: 'More for wardrobe-backend' }).click()
    await page.getByRole('menuitem', { name: 'Take off the project…' }).click()
    const sheet = page.getByRole('dialog', { name: /Take wardrobe-backend off Wardrobe/ })
    await sheet.waitFor({ timeout: PATIENCE })
    await picture('working-copy-4-take-off')
    await sheet.getByRole('button', { name: 'Take it off' }).click()
    await row().waitFor({ state: 'detached', timeout: PATIENCE })
    expect(findProject(projectId)?.systems.map((s) => s.name)).toEqual(['frontend'])
  })
})
