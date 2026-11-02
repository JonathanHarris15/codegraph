// codegraph: test feature list-github-codebases
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectGithub } from '../src/features/connect-github.js'
import { createProject } from '../src/features/create-project.js'
import { listGithubCodebases } from '../src/features/list-github-codebases.js'
import { linkCodebase } from '../src/features/link-codebase.js'
import { useFolder as useGithubFolder } from '../src/modules/github/index.js'
import { useChooser } from '../src/modules/machine/index.js'
import { useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import {
  aCodebase,
  aGithubRepo,
  closeYard,
  codegraphSettings,
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
    const view = await listGithubCodebases()
    expect(view.signedIn).toBe(false)
    expect(view.codebases).toEqual([])
  })

  it('lists only the repos set up for codegraph', async () => {
    githubAnswers({
      '/user/repos': { status: 200, body: [aGithubRepo('me/web'), aGithubRepo('me/scratch')] },
      '/repos/me/web/contents/.claude/settings.json': codegraphSettings,
      '/user': whoAmI,
    })
    await connectGithub('ghp_good')

    const view = await listGithubCodebases()
    expect(view.account).toBe('jono')
    expect(view.codebases.map((c) => c.fullName)).toEqual(['me/web'])
  })

  it('says a codegraph repo is not on this computer', async () => {
    githubAnswers({
      '/user/repos': { status: 200, body: [aGithubRepo('me/elsewhere')] },
      '/repos/me/elsewhere/contents/.claude/settings.json': codegraphSettings,
      '/user': whoAmI,
    })
    await connectGithub('ghp_good')
    expect((await listGithubCodebases()).codebases[0]?.here).toBe(false)
  })

  it('marks one as here once it is linked into a project', async () => {
    githubAnswers({
      '/user/repos': { status: 200, body: [aGithubRepo('me/here')] },
      '/repos/me/here/contents/.claude/settings.json': codegraphSettings,
      '/user': whoAmI,
    })
    await connectGithub('ghp_good')
    const { id } = await createProject('Mosaic')
    await linkCodebase(id, aCodebase(yard, 'here', { setUp: true, remote: 'me/here' }))

    expect((await listGithubCodebases()).codebases[0]?.here).toBe(true)
  })

  it('says it could not reach GitHub rather than showing an empty shelf', async () => {
    githubAnswers({ '/user': whoAmI })
    await connectGithub('ghp_good')
    githubAnswers({ '/user': whoAmI, '/user/repos': { status: 500, body: {} } })

    const view = await listGithubCodebases()
    expect(view.signedIn).toBe(true)
    expect(view.problem).toBeTruthy()
    expect(view.codebases).toEqual([])
  })
})
