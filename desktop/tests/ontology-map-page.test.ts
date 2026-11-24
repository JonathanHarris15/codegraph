// codegraph: test ui canvas
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aMappedRepo, closeYard, git, openTheApp, openYard, type Yard } from './yard.js'

/** The built app showing a project's ontology map from its repos' files, as a
 *  graph and as a dictionary, writing edits back as files on a branch and
 *  committing them (ADRs 0035, 0038). */
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
/** Waits until a file in the repo says what is wanted, as the view writes it
 *  once typing settles. */
const fileSays = async (file: string, words: string): Promise<string> => {
  const until = Date.now() + PATIENCE
  for (;;) {
    let text = ''
    try {
      text = readFileSync(join(repo, file), 'utf8')
    } catch {
      text = ''
    }
    if (text.includes(words) || Date.now() > until) return text
    await new Promise((r) => setTimeout(r, 100))
  }
}

beforeAll(async () => {
  yard = openYard('ontology-map-page')
  repo = aMappedRepo(yard)
  mkdirSync(join(repo, 'codegraph', 'terms'), { recursive: true })
  mkdirSync(join(repo, 'codegraph', 'adr'), { recursive: true })
  writeFileSync(join(repo, 'codegraph', 'terms', 'note.md'), '---\nterm: Note\nstore: notes\navoid: [memo]\n---\nSomething a person writes down to keep.\n')
  writeFileSync(
    join(repo, 'codegraph', 'adr', '0001-notes-are-kept-by-one-module.md'),
    '---\nadr: 1\nstatus: proposed\nterms: [Note]\n---\n# 1. Notes are kept by one module\n\n## Context\n\nNotes were saved from two places.\n',
  )
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'Terms and decisions')
  writeFileSync(
    join(yard.home, 'projects.json'),
    JSON.stringify({ version: 2, projects: [{ id: 'notes-app', name: 'Notes', createdAt: '', systems: [{ id: 'notes', name: 'notes', path: repo, remote: '' }] }] }),
  )
  app = await openTheApp(yard.home)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.getByRole('button', { name: 'Open Notes', exact: true }).dblclick({ timeout: PATIENCE })
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

describe("a project's ontology map", () => {
  it('opens from the map bar as a graph of the terms and decisions in its repos', async () => {
    await page.getByRole('button', { name: 'Ontology map' }).click({ timeout: PATIENCE })
    const view = page.getByRole('region', { name: 'Ontology map' })
    await view.getByLabel('Ontology graph').waitFor({ timeout: PATIENCE })
    expect(await view.getByRole('tab', { name: /Graph/ }).getAttribute('aria-selected')).toBe('true')
    await page.waitForTimeout(1500)
    await picture('ontology-1-graph')
  })

  it('shows each term in the dictionary as its file says, with what the check finds', async () => {
    await page.getByRole('tab', { name: /Dictionary/ }).click()
    const index = page.getByRole('navigation', { name: 'Terms and decisions' })
    expect(await shown(index.getByRole('region', { name: 'notes' }))).toContain('Note')
    await index.getByRole('button', { name: /Note/ }).first().click()
    const entry = page.getByRole('article', { name: 'Term Note' })
    expect(await entry.getByLabel('What it means').inputValue()).toBe('Something a person writes down to keep.')
    await picture('ontology-2-term')
  })

  it('writes a change to the term’s file on a branch off the main line, as a diff to commit', async () => {
    const entry = page.getByRole('article', { name: 'Term Note' })
    await entry.getByLabel('What it means').fill('Something a person writes down to keep, and finds again.')
    const text = await fileSays('codegraph/terms/note.md', 'finds again')
    expect(text).toContain('Something a person writes down to keep, and finds again.')
    expect(text).toContain('store: notes')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('ontology')
    expect(await shown(page.getByRole('button', { name: '1 file changed' }))).toBe('1 file changed')
  })

  it('records a decision on the template, and a rule only once both its blanks are filled', async () => {
    await page.getByRole('navigation', { name: 'Terms and decisions' }).getByRole('button', { name: /Notes are kept by one module/ }).click()
    const entry = page.getByRole('article', { name: 'ADR 1' })
    await entry.getByLabel('Add a rule').selectOption('only writer')
    await entry.getByLabel('New rule by').fill('module notes')
    await entry.getByLabel('New rule store').fill('notes')
    const text = await fileSays('codegraph/adr/0001-notes-are-kept-by-one-module.md', 'only writer')
    expect(text).toContain('store: notes')
    expect(text).toContain('by: module notes')
    expect(text).toContain('## Revisit when')
    await picture('ontology-3-adr')
  })

  it('commits what changed in codegraph/ on its branch', async () => {
    await page.getByRole('button', { name: /files? changed/ }).click()
    const drawer = page.getByRole('complementary', { name: 'Changes to commit' })
    expect(await shown(drawer)).toContain('codegraph/terms/note.md')
    await picture('ontology-4-changes')
    await drawer.getByLabel('Commit message').fill('Note can be found again')
    await drawer.getByRole('button', { name: 'Commit to ontology' }).click()
    expect(await shown(drawer.getByText(/^Committed /))).toContain('in notes, on ontology')
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('Note can be found again')
    expect(git(repo, 'status', '--porcelain', '--', 'codegraph')).toBe('')
  })
})
