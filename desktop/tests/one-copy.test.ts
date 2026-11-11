// codegraph: test ui projects
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import type { ElectronApplication } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** Where the electron package says its program is. */
const electron = createRequire(import.meta.url)('electron') as unknown as string

let yard: Yard
let first: ElectronApplication

beforeAll(async () => {
  yard = openYard('one-copy')
  first = await openTheApp(yard.home)
  await first.firstWindow()
}, 60_000)

afterAll(async () => {
  await first?.close()
  closeYard(yard)
})

/** Starts the app again, as a person double-clicking it would, and hands back
 *  how it ended, or 'still running' if it was still up after a while. */
const startAgain = (home: string): Promise<number | string> =>
  new Promise((done) => {
    const tests = import.meta.dirname
    const again = spawn(electron, ['-r', join(tests, 'hands-off-window.cjs'), '.', `--user-data-dir=${home}`], {
      cwd: resolve(tests, '..'),
      env: { ...process.env, CODEGRAPH_RELEASES: '' },
      stdio: 'ignore',
    })
    let running = false
    // Still up after a while: it opened. It is put out for certain, and only
    // once it has gone does the test go on, so no copy is left behind.
    const late = setTimeout(() => {
      running = true
      again.kill('SIGKILL')
    }, 15_000)
    again.on('exit', (code) => {
      clearTimeout(late)
      done(running ? 'still running' : (code ?? 'killed'))
    })
  })

describe('one copy of the app to a folder of files', () => {
  it('hands over to the copy already open, rather than two writing the same sketches', async () => {
    expect(await startAgain(yard.home)).toBe(0)
    // The first copy is still there to use.
    expect(await first.windows()[0]!.title()).toBeTruthy()
  }, 30_000)

  it('still opens a second copy on its own folder, as two people trying it together do', async () => {
    const other = openYard('one-copy-other')
    try {
      expect(await startAgain(other.home)).toBe('still running')
    } finally {
      closeYard(other)
    }
  }, 30_000)
})
