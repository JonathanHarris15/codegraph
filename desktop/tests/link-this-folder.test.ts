// codegraph: test feature link-this-folder
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { describeMap } from '../src/features/describe-map.js'
import { linkThisFolder } from '../src/features/link-this-folder.js'
import { useFolder as useGithubFolder } from '../src/modules/github/index.js'
import { addSoftwareSystem, findProject, useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import { aMappedRepo, aSoftwareSystem, closeYard, git, openYard, type Yard } from './yard.js'

let yard: Yard
let project = ''
let repo = ''

beforeEach(async () => {
  yard = openYard('link-this-folder')
  useProjectsFolder(yard.home)
  useGithubFolder(yard.home)
  repo = aMappedRepo(yard)
  git(repo, 'remote', 'add', 'origin', 'https://github.com/me/notes.git')
  project = (await createProject('Notes', 'notes-app')).id
  // Linked on another computer: here it is only known from GitHub.
  addSoftwareSystem(project, { name: 'notes', path: '', remote: 'me/notes' })
})

afterEach(() => closeYard(yard))

describe('an agent linking the folder it works in', () => {
  it('links the working copy of a repo the project has, and says so', async () => {
    const said = await linkThisFolder(repo)
    expect(said).toMatch(/Linked .* as the working copy of notes in Notes/)
    expect(findProject(project)?.systems[0]?.path).toBe(repo)
  })

  it('leaves a repo already linked to a folder that is still there, so a second copy never takes over', async () => {
    await linkThisFolder(repo)
    const other = aSoftwareSystem(yard, 'second', { remote: 'me/notes' })
    const said = await linkThisFolder(other)
    expect(said).toMatch(/already linked/)
    expect(findProject(project)?.systems[0]?.path).toBe(repo)
  })

  it('says so when no project on this computer has the repo, and adds nothing', async () => {
    const said = await linkThisFolder(aSoftwareSystem(yard, 'web', { remote: 'me/web' }))
    expect(said).toMatch(/No project on this computer has me\/web/)
    expect(findProject(project)?.systems).toHaveLength(1)
  })

  it('says so for a folder git does not track', async () => {
    expect(await linkThisFolder(yard.home)).toMatch(/not tracked by git/)
  })
})

describe('the map in words says whether the folder is linked', () => {
  it('says the folder is not linked here, and how to link it', async () => {
    expect(await describeMap(repo)).toMatch(/Not linked on this computer: Notes has me\/notes, with no working copy here\. .*call `link`/)
  })

  it('says which project the folder is the working copy of', async () => {
    await linkThisFolder(repo)
    expect(await describeMap(repo)).toMatch(/Linked on this computer as notes in Notes\./)
  })

  it('says when no project on this computer is one the repo serves', async () => {
    useProjectsFolder(join(yard.path, 'elsewhere'))
    expect(await describeMap(repo)).toMatch(/No project on this computer is called notes-app\./)
  })
})
