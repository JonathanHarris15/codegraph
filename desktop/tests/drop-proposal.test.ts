// codegraph: test feature drop-proposal
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { dropProposal } from '../src/features/drop-proposal.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { useChooser } from '../src/modules/machine/index.js'
import { listProjects, useFolder } from '../src/modules/projects/index.js'
import { live, readMap } from '../src/modules/reader/index.js'
import { aMappedRepo, aProposal, closeYard, git, openYard, searchProposal, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let projectId = ''
let systemId = ''

beforeEach(async () => {
  yard = openYard('drop-proposal')
  useFolder(yard.home)
  useChooser(async () => '')
  repo = aMappedRepo(yard)
  projectId = (await createProject('Notes')).id
  await linkSoftwareSystem(projectId, repo)
  systemId = listProjects()[0]!.systems[0]!.id
})

afterEach(() => closeYard(yard))

describe('throwing a proposal away', () => {
  it('takes the proposal out of the folder, and leaves the branch and its code', async () => {
    git(repo, 'checkout', '-q', '-b', 'search')
    aProposal(repo, searchProposal(git(repo, 'rev-parse', 'HEAD')), ['search.png'])
    expect((await readMap(repo, live)).proposal).toBeTruthy()

    expect(await dropProposal(projectId, systemId)).toEqual({ ok: true, problem: '' })
    expect((await readMap(repo, live)).proposal).toBeFalsy()
    expect(existsSync(join(repo, 'codegraph-proposal'))).toBe(false)
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('search')
    expect(existsSync(join(repo, 'app', 'pages', 'notes.tsx'))).toBe(true)
  })

  it('says so when there is none to throw away', async () => {
    const done = await dropProposal(projectId, systemId)
    expect(done.ok).toBe(false)
    expect(done.problem).toContain('no proposal')
  })

  it('says so when the repo is not on this computer', async () => {
    const done = await dropProposal(projectId, 'no-such-system')
    expect(done).toEqual({ ok: false, problem: 'That software system is not on this computer.' })
  })
})
