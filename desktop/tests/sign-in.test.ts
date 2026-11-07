// codegraph: test feature finish-sign-in
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectGithub } from '../src/features/connect-github.js'
import { finishSignIn } from '../src/features/finish-sign-in.js'
import { showSession } from '../src/features/show-session.js'
import { signOutGithub } from '../src/features/sign-out-github.js'
import { startSignIn } from '../src/features/start-sign-in.js'
import { openFolderCloud, useCloud } from '../src/modules/cloud/index.js'
import { savedToken } from '../src/modules/github/index.js'
import { aComputer, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard

/** GitHub, answering each address in turn with what it is given. */
const github = (replies: Record<string, unknown[]>): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const match = Object.keys(replies).find((path) => url.includes(path))
      const answers = match ? replies[match] : undefined
      const body = answers && answers.length > 1 ? answers.shift() : answers?.[0]
      return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 })
    }),
  )
}
const account = { id: 7, login: 'ana', name: 'Ana Silva', avatar_url: 'http://pic' }
const started = { code: 'ABCD-1234', url: 'https://github.com/login/device', deviceCode: 'dev', everyMs: 1, expiresInMs: 2000 }

beforeEach(() => {
  yard = openYard('sign-in')
  aComputer(yard, 'here').be()
  useCloud(openFolderCloud(`${yard.path}/online`))
  vi.stubEnv('CODEGRAPH_GITHUB_CLIENT_ID', 'client')
})

afterEach(async () => {
  await signOutGithub()
  useCloud(null)
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  closeYard(yard)
})

describe('signing in with GitHub', () => {
  it('says what code to type, and where', async () => {
    github({ 'device/code': [{ device_code: 'dev', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 }] })
    expect(await startSignIn()).toEqual({ ok: true, started: { code: 'ABCD-1234', url: 'https://github.com/login/device', deviceCode: 'dev', everyMs: 5000, expiresInMs: 900000 } })
  })

  it('says when it is not set up yet', async () => {
    vi.stubEnv('CODEGRAPH_GITHUB_CLIENT_ID', '')
    expect(await startSignIn()).toEqual({ ok: false, problem: 'Sign-in is not set up yet.' })
  })

  it('waits for the code to be typed, then signs them in, known by GitHub', async () => {
    github({
      'oauth/access_token': [{ error: 'authorization_pending' }, { access_token: 'the-token' }],
      '/user': [account],
    })
    expect(await finishSignIn(started)).toEqual({ ok: true, account: 'ana' })
    expect(savedToken()).toBe('the-token')
    expect((await showSession()).member).toEqual({ id: '7', login: 'ana', name: 'Ana Silva', avatar: 'http://pic' })
  })

  it('says so if they turn it down', async () => {
    github({ 'oauth/access_token': [{ error: 'access_denied' }] })
    expect(await finishSignIn(started)).toEqual({ ok: false, problem: 'The sign-in was turned down on GitHub.' })
  })

  it('says so when the code runs out', async () => {
    github({ 'oauth/access_token': [{ error: 'authorization_pending' }] })
    expect(await finishSignIn({ ...started, expiresInMs: 20 })).toEqual({ ok: false, problem: 'That code ran out. Start again.' })
  })

  it('still takes a pasted token until a GitHub app is set up', async () => {
    github({ '/user': [account] })
    expect((await connectGithub('pasted')).ok).toBe(true)
    expect((await showSession()).member?.id).toBe('7')
  })

  it('falls back to a username where GitHub has no display name', async () => {
    github({ '/user': [{ id: 7, login: 'ana', name: null, avatar_url: '' }] })
    await connectGithub('pasted')
    expect((await showSession()).member?.name).toBe('ana')
  })

  it('signing out forgets who it was and the token', async () => {
    github({ '/user': [account] })
    await connectGithub('pasted')
    await signOutGithub()
    expect((await showSession()).member).toBeNull()
    expect(savedToken()).toBe('')
  })
})
