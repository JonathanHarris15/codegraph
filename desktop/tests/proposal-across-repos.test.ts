// codegraph: test feature make-proposal
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeProposal } from '../src/features/make-proposal.js'
import { showMap } from '../src/features/show-map.js'
import { startSketch } from '../src/features/start-sketch.js'
import { addProject, addSoftwareSystem, useFolder as useProjects } from '../src/modules/projects/index.js'
import { live, readMap } from '../src/modules/reader/index.js'
import { blankCard, useFolder as useSketches, writeSketch } from '../src/modules/sketches/index.js'
import { closeYard, git, openYard, writeInto, type Yard } from './yard.js'

/** One software system, Billing, kept in two repos: a server and a phone
 *  app. A snapshot of it gets a page on the phone and a new container. */
let yard: Yard
let api = ''
let phone = ''

const aRepoOf = (name: string, containers: Record<string, unknown>, files: Record<string, string>): string => {
  const path = join(yard.path, name)
  mkdirSync(path, { recursive: true })
  git(path, 'init', '--initial-branch=main')
  git(path, 'config', 'user.email', 'test@example.com')
  git(path, 'config', 'user.name', 'Test')
  writeInto(path, { 'codegraph.config.json': JSON.stringify({ projects: ['billing'], system: 'Billing', containers }), ...files })
  git(path, 'add', '-A')
  git(path, 'commit', '-m', 'first')
  return path
}

beforeAll(async () => {
  yard = openYard('proposal-across-repos')
  useProjects(yard.home)
  useSketches(yard.home)
  api = aRepoOf('billing-api', { api: { kind: 'server', folders: ['src'] } }, { 'src/charge.ts': '// codegraph: feature charge\nexport const charge = () => 1\n' })
  phone = aRepoOf('billing-phone', { phone: { kind: 'mobile app', folders: ['app'] } }, { 'app/pay.ts': '// codegraph: page pay at /pay\nexport const pay = () => 1\n' })
  const project = addProject('Billing', 'billing')
  addSoftwareSystem(project.id, { name: 'billing-api', path: api, remote: '' })
  addSoftwareSystem(project.id, { name: 'billing-phone', path: phone, remote: '' })

  const sketch = await startSketch(project.id, 'Receipts', (await showMap(project.id)).card)
  const system = sketch.root.children[0]!
  const onPhone = system.children.find((c) => c.name === 'phone')!
  onPhone.children.push({ ...blankCard('new-receipts', 'receipts', 'component', 'page'), at: '/receipts' })
  system.children.push(blankCard('new-admin', 'admin', 'container', 'browser app'))
  writeSketch(sketch)
})

afterAll(() => closeYard(yard))

describe('a proposal for a software system kept in more than one repo', () => {
  it('proposes in each repo only what is its own, and says what the others need', async () => {
    git(api, 'checkout', '-q', '-b', 'receipts')
    const said = await makeProposal(api, 'Receipts')
    expect(said).toContain('Wrote the proposal to codegraph-proposal/proposal.json on receipts: 1 to build.')
    expect(said).toContain('- build container admin (browser app)')
    expect(said).not.toContain('phone/page receipts')
    expect(said).toContain(`- billing-phone, at ${phone}: 1 to build. Propose there on a branch of its own.`)
    expect(said).toContain('- admin is new to Billing, so it is in this repo')

    const map = await readMap(api, live)
    expect(map.proposal?.containers.map((c) => c.name)).toEqual(['admin'])
    expect(map.proposal?.components).toEqual([])
  })

  it('gives the other repo its own part, and leaves where the new container goes to whoever proposes', async () => {
    git(phone, 'checkout', '-q', '-b', 'receipts')
    const said = await makeProposal(phone, 'Receipts')
    expect(said).toContain('- build phone/page receipts at /receipts')
    expect(said).not.toContain('take away')
    expect(said).toContain('- admin is new to Billing, so it is in this repo')
  })
})
