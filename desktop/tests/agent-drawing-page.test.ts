// codegraph: test ui canvas
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editSketch } from '../src/features/edit-sketch.js'
import { showLooking } from '../src/features/show-looking.js'
import { useFolder as useAgentsFolder } from '../src/modules/agents/index.js'
import { useFolder as useCardTypesFolder } from '../src/modules/card-types/index.js'
import { useFolder as useMembersFolder } from '../src/modules/members/index.js'
import { useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import type { SketchCard } from '../src/modules/sketches/index.js'
import { useFolder as useSketchesFolder } from '../src/modules/sketches/index.js'
import { useFolder as useSyncFolder } from '../src/modules/sync/index.js'
import { aMappedRepo, closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** An agent drawing on the sketch a person has open in the built app: they see
 *  its cursor go to each step, and it can ask what they are pointing at. */
const PATIENCE = 15_000
const pictures = process.env.CODEGRAPH_PICTURES ?? ''

let yard: Yard
let app: ElectronApplication
let page: Page

const picture = async (name: string): Promise<void> => {
  if (pictures) await page.screenshot({ path: join(pictures, `${name}.png`) })
}
const card = (name: string): Locator => page.locator(`.map-world [data-card][aria-label="${name}"]`)
const kept = (): { root: SketchCard } => {
  const folder = join(yard.home, 'sketches', 'notes-app')
  return JSON.parse(readFileSync(join(folder, readdirSync(folder)[0]!, 'sketch.json'), 'utf8'))
}
const until = async (check: () => boolean, what: string): Promise<void> => {
  const end = Date.now() + PATIENCE
  while (!check()) {
    if (Date.now() > end) throw new Error(`waited too long for ${what}`)
    await page.waitForTimeout(100)
  }
}

beforeAll(async () => {
  yard = openYard('agent-drawing')
  const repo = aMappedRepo(yard)
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({
      version: 2,
      projects: [{ id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] }],
    }),
  )
  // This test stands where the MCP would: on the same computer, in the app's folder.
  for (const use of [useAgentsFolder, useCardTypesFolder, useMembersFolder, useProjectsFolder, useSketchesFolder, useSyncFolder]) use(yard.home)
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 })
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick()
  await page.getByRole('button', { name: 'Open notes' }).waitFor({ timeout: PATIENCE })
  await page.getByRole('button', { name: /^Sketches/ }).click()
  await page.getByRole('button', { name: 'New sketch' }).click()
  await page.getByRole('button', { name: /^Blank/ }).click()
  await page.getByLabel('Sketch name').waitFor({ timeout: PATIENCE })
  await page.getByRole('button', { name: 'Hide this panel' }).click().catch(() => undefined)
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe('an agent drawing on the sketch a person has open', () => {
  it('knows which sketch is open', async () => {
    const area = (await page.locator('.map-frame-area').boundingBox())!
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2)
    await until(() => /has the sketch "New sketch" open/.test(showLooking()), 'the window to say what is open')
  })

  it("draws step by step while its cursor goes to each step, and the canvas shows each", async () => {
    let cursorSeen = false
    let wordsSeen = ''
    const drawing = editSketch(
      '',
      '',
      [
        { do: 'card', name: 'Reader', kind: 'person' },
        { do: 'card', name: 'Notes app', kind: 'software system', id: 'notes-app-card' },
        { do: 'wire', from: 'Reader', to: 'notes-app-card', words: 'to keep notes' },
        { do: 'card', name: 'Web', kind: 'web app', in: 'notes-app-card' },
        { do: 'card', name: 'Notes DB', kind: 'database', in: 'notes-app-card', id: 'db' },
        { do: 'card', name: 'notes', kind: 'store', in: 'db' },
        { do: 'fields', store: 'notes', fields: ['title: text, needed', 'owner: text, points at people'] },
        { do: 'note', text: 'Who reads first?', near: 'Reader' },
        { do: 'frame', text: 'Everything', around: ['Reader', 'notes-app-card'] },
        { do: 'point', at: 'notes-app-card', words: 'Open this to see inside' },
      ],
      '',
      'Claude',
    )
    const watch = (async () => {
      const cursor = page.locator('.together-cursor--agent')
      await cursor.first().waitFor({ state: 'visible', timeout: PATIENCE })
      cursorSeen = true
      wordsSeen = (await cursor.first().textContent()) ?? ''
      await picture('agent-1-drawing')
    })()
    const said = await drawing
    await watch
    expect(said).toContain('The person watched it drawn.')
    expect(cursorSeen).toBe(true)
    expect(wordsSeen).toContain('Claude')

    await card('Reader').first().waitFor({ state: 'visible', timeout: PATIENCE })
    await card('Notes app').first().waitFor({ state: 'visible', timeout: PATIENCE })
    await page.getByText('Who reads first?').first().waitFor({ state: 'visible', timeout: PATIENCE })
    await page.locator('.together-cursor--agent', { hasText: 'Open this to see inside' }).waitFor({ timeout: PATIENCE })
    await page.waitForTimeout(800)
    await picture('agent-2-drawn')
    // The canvas placed the new cards, and fitted the frame to them.
    const top = kept().root
    expect(top.children.every((c) => c.x !== undefined)).toBe(true)
  })

  it('tells the agent what the person points at', async () => {
    const reader = (await card('Reader').first().boundingBox())!
    await page.mouse.move(reader.x + reader.width / 2, reader.y + reader.height / 2)
    await until(() => /pointer is on person "Reader"/.test(showLooking()), 'the pointer to be told')
    expect(showLooking()).toContain('software system "Notes app" [notes-app-card]')
  })
})
