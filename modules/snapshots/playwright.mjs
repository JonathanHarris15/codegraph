// codegraph: module snapshots
// For a repo's Playwright tests: a picture of the page the test is on, saved
// with its address and when it was taken, for codegraph to show on the map.
//
//   import { snapshot } from './codegraph/playwright.mjs'
//   await snapshot(page)                  // the map finds the page by its address
//   await snapshot(page, 'notes-new')     // or by its name, where it has no route
//
// Run the tests from the repo's root: the pictures go in .codegraph/shots/.
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const SHOTS = join('.codegraph', 'shots')

export async function snapshot(page, name = '') {
  const url = page.url()
  const stem = shotName(url, name)
  await mkdir(SHOTS, { recursive: true })
  const picture = resolve(SHOTS, stem + '.png')
  await page.screenshot({ path: picture })
  const said = { url, page: name, taken: new Date().toISOString(), picture }
  await writeFile(join(SHOTS, stem + '.json'), JSON.stringify(said, null, 1))
  return picture
}

// One file per page: a later picture of the same page takes the place of the last.
function shotName(url, name) {
  const path = name || new URL(url, 'http://x').pathname
  return path.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'start'
}
