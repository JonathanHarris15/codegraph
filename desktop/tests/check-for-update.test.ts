// codegraph: test feature check-for-update
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate } from '../src/features/check-for-update.js'
import { forgetLastLook } from '../src/modules/updates/index.js'

const RELEASES = 'https://api.github.test/repos/someone/codegraph/releases/latest'

const assets = (version: string) =>
  ['windows-setup.exe', 'mac-arm64.dmg', 'mac-x64.dmg', 'linux-x86_64.AppImage'].map((end) => ({
    name: `Codegraph-${version}-${end}`,
    browser_download_url: `https://github.test/download/Codegraph-${version}-${end}`,
  }))

const release = (tag: string) => ({
  tag_name: tag,
  html_url: `https://github.test/releases/tag/${tag}`,
  body: 'Maps load faster.',
  assets: assets(tag.replace(/^v/, '')),
})

// GitHub's releases, standing in: a test cannot publish one.
const github = (answer: unknown, status = 200): ReturnType<typeof vi.fn> => {
  const asked = vi.fn(async () => new Response(JSON.stringify(answer), { status }))
  vi.stubGlobal('fetch', asked)
  return asked
}

beforeEach(() => {
  forgetLastLook()
  vi.stubEnv('CODEGRAPH_RELEASES', RELEASES)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('telling a person a newer codegraph is out', () => {
  it('says which version is out, with the download for this computer', async () => {
    github(release('v9.2.0'))
    const seen = await checkForUpdate({ platform: 'win32', arch: 'x64' })
    expect(seen.current).toMatch(/^\d+\.\d+\.\d+/)
    expect(seen.newer).toEqual({
      version: '9.2.0',
      notes: 'Maps load faster.',
      page: 'https://github.test/releases/tag/v9.2.0',
      download: 'https://github.test/download/Codegraph-9.2.0-windows-setup.exe',
    })
  })

  it('picks the Mac download that matches the chip', async () => {
    github(release('v9.2.0'))
    expect((await checkForUpdate({ platform: 'darwin', arch: 'arm64' })).newer?.download).toMatch(/mac-arm64\.dmg$/)
    forgetLastLook()
    expect((await checkForUpdate({ platform: 'darwin', arch: 'x64' })).newer?.download).toMatch(/mac-x64\.dmg$/)
  })

  it('sends a person to the release page when there is nothing for their computer', async () => {
    github({ ...release('v9.2.0'), assets: [] })
    expect((await checkForUpdate({ platform: 'linux', arch: 'x64' })).newer?.download).toBe('https://github.test/releases/tag/v9.2.0')
  })

  it('says nothing when this is already the newest', async () => {
    const { current } = await checkForUpdate({ platform: 'win32', arch: 'x64' })
    forgetLastLook()
    github(release(`v${current}`))
    expect((await checkForUpdate({ platform: 'win32', arch: 'x64' })).newer).toBeNull()
  })

  it('says nothing when the release out is older than this one', async () => {
    github(release('v0.0.1'))
    expect((await checkForUpdate({ platform: 'win32', arch: 'x64' })).newer).toBeNull()
  })

  it('says nothing, and does not fail, when GitHub cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    expect((await checkForUpdate({ platform: 'win32', arch: 'x64' })).newer).toBeNull()
    forgetLastLook()
    github({ message: 'API rate limit exceeded' }, 403)
    expect((await checkForUpdate({ platform: 'win32', arch: 'x64' })).newer).toBeNull()
  })

  it('does not ask GitHub when checking is turned off', async () => {
    vi.stubEnv('CODEGRAPH_RELEASES', '')
    const asked = github(release('v9.2.0'))
    expect((await checkForUpdate({ platform: 'win32', arch: 'x64' })).newer).toBeNull()
    expect(asked).not.toHaveBeenCalled()
  })

  it('asks GitHub at most once an hour, however often the window asks', async () => {
    const asked = github(release('v9.2.0'))
    await checkForUpdate({ platform: 'win32', arch: 'x64' })
    await checkForUpdate({ platform: 'win32', arch: 'x64' })
    expect(asked).toHaveBeenCalledTimes(1)
  })
})

describe('which version is newer', () => {
  it('compares by number, part by part, not as words', async () => {
    const { isNewer } = await import('../src/modules/updates/index.js')
    expect(isNewer('0.10.0', '0.9.3')).toBe(true)
    expect(isNewer('v1.0.0', '0.99.0')).toBe(true)
    expect(isNewer('0.1.0', '0.1.0')).toBe(false)
    expect(isNewer('0.1.0', '0.1.1')).toBe(false)
    expect(isNewer('1.0.0-beta.1', '1.0.0')).toBe(false)
    expect(isNewer('1.0.0', '1.0.0-beta.1')).toBe(true)
    expect(isNewer('not a version', '0.1.0')).toBe(false)
  })
})
