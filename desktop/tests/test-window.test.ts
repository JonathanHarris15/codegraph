// codegraph: test ui
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { BrowserWindow } from 'electron'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeYard, openTheApp, openYard, type Yard } from './yard.js'

/** A page test drives a real window on a computer someone may be using. A
 *  stray double-click in one moves the page somewhere the test does not
 *  expect, and every test left in that file then waits for a button that has
 *  gone, so the window has to be out of reach. */
let yard: Yard
let app: Awaited<ReturnType<typeof openTheApp>>

beforeAll(async () => {
  yard = openYard('test-window')
  app = await openTheApp(yard.home)
  await app.firstWindow()
}, 60_000)

afterAll(async () => {
  await app?.close()
  closeYard(yard)
})

const theWindow = <T>(ask: (window: BrowserWindow) => T): Promise<T> =>
  app.evaluate(({ BrowserWindow }, asked) => new Function('window', `return (${asked})(window)`)(BrowserWindow.getAllWindows()[0]) as T, ask.toString())

describe('the window a page test opens', () => {
  it('shows, without taking the front from what a person is doing', async () => {
    await expect.poll(() => theWindow((window) => window.isVisible()), { timeout: 15_000 }).toBe(true)
    expect(await theWindow((window) => window.isFocused())).toBe(false)
  })

  it('cannot be given the keyboard', async () => {
    expect(await theWindow((window) => window.isFocusable())).toBe(false)
  })

  it('is how every page test opens the app', () => {
    const tests = resolve(import.meta.dirname)
    const openOnTheirOwn = readdirSync(tests)
      .filter((name) => name.endsWith('.test.ts') && name !== 'test-window.test.ts')
      .filter((name) => readFileSync(join(tests, name), 'utf8').includes('electron.launch'))
    expect(openOnTheirOwn).toEqual([])
  })
})
