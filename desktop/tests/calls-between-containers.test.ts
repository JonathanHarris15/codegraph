// codegraph: test module reader
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { showMap } from '../src/features/show-map.js'
import { useChooser } from '../src/modules/machine/index.js'
import { useFolder } from '../src/modules/projects/index.js'
import { live, readMap } from '../src/modules/reader/index.js'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

/** A repo whose browser app calls its own server over the network: two
 *  containers of one repo, joined by a call no import can show. */
let yard: Yard
let repo = ''

const BACKEND = 'Wardrobe Backend'

/** Gives the notes repo a second container, a server, and has the notes module
 *  call it with the tag given. */
const callingWith = (to: string, system = ''): void => {
  const config = JSON.parse(readFileSync(join(repo, 'codegraph.config.json'), 'utf8'))
  config.containers[BACKEND] = { kind: 'server', says: 'Answers the app', folders: ['server'] }
  if (system) config.system = system
  writeFileSync(join(repo, 'codegraph.config.json'), JSON.stringify(config))
  mkdirSync(join(repo, 'server'), { recursive: true })
  writeFileSync(join(repo, 'server', 'routes.ts'), '// codegraph: module routes\n// codegraph: front door routes\nexport const routes = []\n')
  const notes = join(repo, 'app', 'modules', 'notes.ts')
  writeFileSync(
    notes,
    readFileSync(notes, 'utf8') +
      `export const keep = () => fetch('/api/outfits') // codegraph: wire to ${to}: keeps the outfit\n`,
  )
}

beforeEach(() => {
  yard = openYard('containers')
  repo = aMappedRepo(yard, 'wardrobe')
})

afterEach(() => closeYard(yard))

describe('a call from one container to another in the same repo', () => {
  it('is a wire to that container, not a call out of the repo', async () => {
    callingWith(BACKEND)
    const map = await readMap(repo, live)
    expect(map.outside.map((w) => w.to)).toEqual(['outside:mailer'])
    expect(map.wires).toContainEqual({ from: 'web:module:notes', to: `container:${BACKEND}`, kind: 'calls', words: 'keeps the outfit' })
    expect(map.problems).toEqual([])
  })

  it('is found by the container name whatever its case', async () => {
    callingWith('wardrobe backend')
    const map = await readMap(repo, live)
    expect(map.wires.some((w) => w.to === `container:${BACKEND}`)).toBe(true)
  })

  it('may name the software system the repo says it is part of first', async () => {
    callingWith(`Wardrobe/${BACKEND}`, 'Wardrobe')
    const map = await readMap(repo, live)
    expect(map.outside.map((w) => w.to)).toEqual(['outside:mailer'])
    expect(map.wires.some((w) => w.to === `container:${BACKEND}`)).toBe(true)
  })

  it('is a mismatch when it names the container it is made from', async () => {
    callingWith('web')
    const map = await readMap(repo, live)
    expect(map.outside.map((w) => w.to)).toEqual(['outside:mailer'])
    expect(map.problems).toContainEqual(expect.stringContaining('calls web, the container it is in'))
  })

  describe('on the map', () => {
    let projectId = ''
    beforeEach(async () => {
      useFolder(yard.home)
      useChooser(async () => '')
      projectId = (await createProject('Wardrobe')).id
    })

    const containerWire = async () => {
      const shown = await showMap(projectId)
      const system = shown.card.children.find((c) => c.kind === 'software system')!
      return {
        shown,
        wire: system.wires.find((w) => w.from === `${system.id}/container:web` && w.to === `${system.id}/container:${BACKEND}`),
      }
    }

    it('joins the two containers and suggests no shallow software system for it', async () => {
      callingWith(BACKEND)
      await linkSoftwareSystem(projectId, repo)
      const { shown, wire } = await containerWire()
      expect(shown.suggestions).toEqual(['mailer'])
      expect(wire).toMatchObject({ kind: 'calls', words: 'keeps the outfit' })
    })

    it('joins them when the call names the repo itself and then the container', async () => {
      callingWith(`wardrobe/${BACKEND}`)
      await linkSoftwareSystem(projectId, repo)
      const { shown, wire } = await containerWire()
      expect(shown.suggestions).toEqual(['mailer'])
      expect(wire).toMatchObject({ kind: 'calls', words: 'keeps the outfit' })
    })
  })
})
