// codegraph: test feature list-github-software-systems
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectGithub } from '../src/features/connect-github.js'
import { createProject } from '../src/features/create-project.js'
import { listGithubSoftwareSystems } from '../src/features/list-github-software-systems.js'
import { linkSoftwareSystem } from '../src/features/link-software-system.js'
import { useFolder as useGithubFolder } from '../src/modules/github/index.js'
import { useChooser } from '../src/modules/machine/index.js'
import { useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import {
  aSoftwareSystem,
  aGithubRepo,
  closeYard,
  codegraphConfig,
  githubAnswers,
  openYard,
  type Yard,
} from './yard.js'

let yard: Yard

const whoAmI = { status: 200, body: { login: 'jono' } }

beforeEach(() => {
  yard = openYard('cloud')
  useProjectsFolder(yard.home)
  useGithubFolder(yard.home)
  useChooser(async () => '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  closeYard(yard)
})

describe('the codegraph repos on GitHub', () => {
  it('stays quiet until someone signs in', async () => {
    const view = await listGithubSoftwareSystems()
    expect(view.signedIn).toBe(false)
    expect(view.systems).toEqual([])
  })

  it('lists only the repos set up for codegraph', async () => {
    githubAnswers({
      '/user/repos': { status: 200, body: [aGithubRepo('me/web'), aGithubRepo('me/scratch')] },
      '/repos/me/web/contents/codegraph.config.json': codegraphConfig,
      '/user': whoAmI,
    })
    await connectGithub('ghp_good')

    const view = await listGithubSoftwareSystems()
    expect(view.account).toBe('jono')
    expect(view.systems.map((c) => c.fullName)).toEqual(['me/web'])
    expect(view.systems[0]?.projects).toEqual(['mosaic'])
  })

  it('says a codegraph repo is not on this computer', async () => {
    githubAnswers({
      '/user/repos': { status: 200, body: [aGithubRepo('me/elsewhere')] },
      '/repos/me/elsewhere/contents/codegraph.config.json': codegraphConfig,
      '/user': whoAmI,
    })
    await connectGithub('ghp_good')
    expect((await listGithubSoftwareSystems()).systems[0]?.here).toBe(false)
  })

  it('marks one as here once it is linked into a project', async () => {
    githubAnswers({
      '/user/repos': { status: 200, body: [aGithubRepo('me/here')] },
      '/repos/me/here/contents/codegraph.config.json': codegraphConfig,
      '/user': whoAmI,
    })
    await connectGithub('ghp_good')
    const { id } = await createProject('Mosaic')
    await linkSoftwareSystem(id, aSoftwareSystem(yard, 'here', { setUp: true, remote: 'me/here' }))

    expect((await listGithubSoftwareSystems()).systems[0]?.here).toBe(true)
  })

  it('says it could not reach GitHub rather than showing an empty shelf', async () => {
    githubAnswers({ '/user': whoAmI })
    await connectGithub('ghp_good')
    githubAnswers({ '/user': whoAmI, '/user/repos': { status: 500, body: {} } })

    const view = await listGithubSoftwareSystems()
    expect(view.signedIn).toBe(true)
    expect(view.problem).toBeTruthy()
    expect(view.systems).toEqual([])
  })
})
