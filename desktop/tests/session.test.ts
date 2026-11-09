// codegraph: test module session
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openFirebaseCloud, openFolderCloud, useCloud } from '../src/modules/cloud/index.js'
import { forgetToken } from '../src/modules/github/index.js'
import { whoIsIn } from '../src/modules/members/index.js'
import { signIn, signInAgain, signOut } from '../src/modules/session/index.js'
import { aComputer, closeYard, githubAnswers, openYard, type Yard } from './yard.js'

let yard: Yard

// Signing in to Firebase with no token fails before it reaches the network, so
// these need not be a real project's.
const nowhere = {
  apiKey: 'test',
  authDomain: 'test.invalid',
  projectId: 'test',
  storageBucket: 'test.invalid',
  messagingSenderId: '0',
  appId: 'test',
  databaseURL: 'https://test.invalid',
}

beforeEach(async () => {
  yard = openYard('session')
  aComputer(yard, 'here').be()
  useCloud(openFolderCloud(`${yard.path}/online`))
  githubAnswers({ '/user': { status: 200, body: { id: 7, login: 'ana', name: 'Ana Silva', avatar_url: 'http://pic' } } })
  expect((await signIn('ghp_good')).ok).toBe(true)
})

afterEach(async () => {
  await signOut()
  useCloud(null)
  vi.unstubAllGlobals()
  closeYard(yard)
})

describe('signing back in when the app opens', () => {
  it('keeps the person signed in when their token is there', async () => {
    await signInAgain()
    expect(whoIsIn()?.login).toBe('ana')
  })

  it('keeps them in with no token when the online side does not need one', async () => {
    // As when trying it together, with a folder standing in for Firebase.
    forgetToken()
    await signInAgain()
    expect(whoIsIn()?.login).toBe('ana')
  })

  it('asks them to sign in again when Firebase needs a token this computer cannot read', async () => {
    // A token locked by another computer's keystore reads back as nothing,
    // just as a missing one does.
    useCloud(openFirebaseCloud(nowhere))
    forgetToken()
    await expect(signInAgain()).resolves.toBeUndefined()
    expect(whoIsIn()).toBeNull()
  })
})
