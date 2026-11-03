// codegraph: test feature agree-shallow-system
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agreeShallowSystem } from '../src/features/agree-shallow-system.js'
import { createProject } from '../src/features/create-project.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { showMap } from '../src/features/show-map.js'
import { useChooser } from '../src/modules/machine/index.js'
import { useFolder } from '../src/modules/projects/index.js'
import { aMappedRepo, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let projectId = ''
let repo = ''

beforeEach(async () => {
  yard = openYard('shallow')
  useFolder(yard.home)
  useChooser(async () => '')
  projectId = (await createProject('Notes')).id
  repo = aMappedRepo(yard)
  await linkSoftwareSystem(projectId, repo)
})

afterEach(() => closeYard(yard))

describe('agreeing to a shallow software system', () => {
  it('draws one once a person agrees to the suggestion, wired to what calls it', async () => {
    expect((await showMap(projectId)).suggestions).toEqual(['mailer'])

    await agreeShallowSystem(projectId, 'mailer')
    const shown = await showMap(projectId)
    expect(shown.suggestions).toEqual([])
    const mailer = shown.card.children.find((c) => c.name === 'mailer')
    expect(mailer).toMatchObject({ kind: 'shallow software system', level: 'system', children: [] })
    expect(shown.card.wires).toEqual([
      { from: shown.systems[0]!.id, to: mailer!.id, kind: 'calls', words: 'tells the owner' },
    ])
  })

  it('takes a second name for the same service, rather than drawing it twice', async () => {
    await agreeShallowSystem(projectId, 'mailer')
    const mailer = (await showMap(projectId)).card.children.find((c) => c.name === 'mailer')!

    writeFileSync(
      join(repo, 'app', 'modules', 'post.ts'),
      "// codegraph: module post\nexport const post = () => fetch('https://mail.example/v2') // codegraph: wire to mail-api: sends a receipt\n",
    )
    expect((await showMap(projectId)).suggestions).toEqual(['mail-api'])

    await agreeShallowSystem(projectId, 'mail-api', mailer.id)
    const shown = await showMap(projectId)
    expect(shown.suggestions).toEqual([])
    expect(shown.card.children.filter((c) => c.kind === 'shallow software system')).toHaveLength(1)
    expect(shown.card.wires[0]?.words.split('; ').sort()).toEqual(['sends a receipt', 'tells the owner'])
  })
})
