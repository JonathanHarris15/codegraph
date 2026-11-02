// codegraph: test feature connect-github
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectGithub } from '../src/features/connect-github.js'
import { listGithubSoftwareSystems } from '../src/features/list-github-software-systems.js'
import { signOutGithub } from '../src/features/sign-out-github.js'
import { useFolder as useGithubFolder } from '../src/modules/github/index.js'
import { useFolder as useProjectsFolder } from '../src/modules/projects/index.js'
import { closeYard, githubAnswers, openYard, type Yard } from './yard.js'

let yard: Yard

beforeEach(() => {
  yard = openYard('signin')
  useProjectsFolder(yard.home)
  useGithubFolder(yard.home)
})

afterEach(() => {
  vi.unstubAllGlobals()
  closeYard(yard)
})

describe('signing in to GitHub', () => {
  it('asks for a token before anything else', async () => {
    const connected = await connectGithub('   ')
    expect(connected.ok).toBe(false)
    expect(connected.problem).toMatch(/Paste a token/)
  })

  it('keeps a token GitHub accepts, and says whose it is', async () => {
    githubAnswers({ '/user': { status: 200, body: { login: 'jono' } } })
    const connected = await connectGithub('ghp_good')
    expect(connected.ok).toBe(true)
    expect(connected.account).toBe('jono')
    expect((await listGithubSoftwareSystems()).signedIn).toBe(true)
  })

  it('throws away a token GitHub refuses, and says why', async () => {
    githubAnswers({ '/user': { status: 401, body: {} } })
    const connected = await connectGithub('ghp_bad')
    expect(connected.ok).toBe(false)
    expect(connected.problem).toMatch(/did not accept/)
    expect((await listGithubSoftwareSystems()).signedIn).toBe(false)
  })

  it('says so when the token cannot see private repos', async () => {
    githubAnswers({ '/user': { status: 403, body: {} } })
    const connected = await connectGithub('ghp_thin')
    expect(connected.ok).toBe(false)
    expect(connected.problem).toMatch(/repo scope|rate limit/)
  })

  it('goes quiet again when the person signs out', async () => {
    githubAnswers({ '/user': { status: 200, body: { login: 'jono' } } })
    await connectGithub('ghp_good')
    await signOutGithub()
    expect((await listGithubSoftwareSystems()).signedIn).toBe(false)
  })
})
