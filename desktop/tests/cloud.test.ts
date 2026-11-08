// codegraph: tooling
import { spawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CloudOffline, openFolderCloud, type Cloud, type Member, type RoomNow } from '../src/modules/cloud/index.js'
import { closeYard, openYard, type Yard } from './yard.js'

const ana: Member = { id: '1', login: 'ana', name: 'Ana', avatar: '' }
const ben: Member = { id: '2', login: 'ben', name: 'Ben', avatar: '' }

const until = async (test: () => boolean, ms = 4000): Promise<void> => {
  const start = Date.now()
  while (!test()) {
    if (Date.now() - start > ms) throw new Error('it never happened')
    await new Promise((go) => setTimeout(go, 15))
  }
}

describe('the online side', () => {
  let yard: Yard
  let cloud: Cloud
  beforeEach(() => {
    yard = openYard('cloud')
    cloud = openFolderCloud(yard.path)
  })
  afterEach(() => closeYard(yard))

  it('keeps documents, and lands every change on the latest', async () => {
    await cloud.change('projects/a', () => ({ id: 'a', count: 0 }))
    await Promise.all(
      Array.from({ length: 20 }, () => cloud.change('projects/a', (doc) => ({ ...doc, count: Number(doc?.['count']) + 1 }))),
    )
    expect((await cloud.read('projects/a'))?.['count']).toBe(20)
  })

  it('removes a document when a change says null', async () => {
    await cloud.change('projects/a', () => ({ id: 'a' }))
    await cloud.change('projects/a', () => null)
    expect(await cloud.read('projects/a')).toBeNull()
  })

  it('finds the documents that name a member, with nothing under the member', async () => {
    await cloud.change('projects/a', () => ({ id: 'a', memberIds: ['1', '2'] }))
    await cloud.change('projects/b', () => ({ id: 'b', memberIds: ['2'] }))
    expect((await cloud.naming('projects', '1')).map((d) => d['id'])).toEqual(['a'])
    expect((await cloud.naming('projects', '2')).map((d) => d['id']).sort()).toEqual(['a', 'b'])
  })

  it('tells a watcher what is there, and each change', async () => {
    let heard: unknown[] = []
    const stop = cloud.watch('projects/a/sketches', (docs) => (heard = docs.map((d) => d['id'])))
    await until(() => heard.length === 0)
    await cloud.change('projects/a/sketches/s', () => ({ id: 's' }))
    await until(() => heard.length === 1)
    stop()
  })

  it('says it is offline rather than pretending', async () => {
    let up = true
    const flaky = openFolderCloud(yard.path, () => up)
    up = false
    await expect(flaky.change('projects/a', () => ({}))).rejects.toBeInstanceOf(CloudOffline)
    await expect(flaky.read('projects/a')).rejects.toBeInstanceOf(CloudOffline)
  })

  it('keeps files', async () => {
    await cloud.putFile('projects/a/sketches/s/m.png', Buffer.from('picture'))
    expect((await cloud.getFile('projects/a/sketches/s/m.png'))?.toString()).toBe('picture')
    await cloud.removeFile('projects/a/sketches/s/m.png')
    expect(await cloud.getFile('projects/a/sketches/s/m.png')).toBeNull()
  })

  describe('a room', () => {
    it('shows members to each other', async () => {
      const mine = cloud.room('r', ana)
      const theirs = cloud.room('r', ben)
      let now: RoomNow = { people: [], held: {} }
      const stop = mine.watch((n) => (now = n))
      theirs.say({ x: 5 })
      await until(() => now.people.find((p) => p.member.id === '2')?.state['x'] === 5)
      await theirs.leave()
      await until(() => !now.people.some((p) => p.member.id === '2'))
      stop()
      await mine.leave()
    })

    it('lets one member hold a thing at a time', async () => {
      const mine = cloud.room('r', ana)
      const theirs = cloud.room('r', ben)
      expect(await mine.hold('card')).toBe(true)
      expect(await theirs.hold('card')).toBe(false)
      expect(await mine.hold('card')).toBe(true)
      await mine.letGo('card')
      expect(await theirs.hold('card')).toBe(true)
      await mine.leave()
      await theirs.leave()
    })

    it('frees what a member held when they leave', async () => {
      const mine = cloud.room('r', ana)
      const theirs = cloud.room('r', ben)
      await mine.hold('card')
      await mine.leave()
      expect(await theirs.hold('card')).toBe(true)
      await theirs.leave()
    })

    it('frees what a member held when they drop off with no goodbye', async () => {
      let up = true
      const mine = openFolderCloud(yard.path, () => up).room('r', ana)
      const theirs = cloud.room('r', ben)
      await mine.hold('card')
      up = false
      await new Promise((go) => setTimeout(go, 2300))
      expect(await theirs.hold('card')).toBe(true)
      await theirs.leave()
      up = true
      await mine.leave()
    })

    it('keeps saving while another program reads the folder', async () => {
      // The other window, polling: on Windows a file open for reading cannot be
      // written over, so a save has to wait its turn rather than throw.
      const reader = spawn(process.execPath, ['-e', READ_EVERYTHING, yard.path], { stdio: 'ignore' })
      try {
        const mine = cloud.room('r', ana)
        await new Promise((go) => setTimeout(go, 300))
        const stopAt = Date.now() + 3000
        let changes = 0
        for (let i = 0; Date.now() < stopAt; i++) {
          mine.say({ i })
          await cloud.change('projects/a', (doc) => ({ id: 'a', count: Number(doc?.['count'] ?? 0) + 1 }))
          changes += 1
        }
        expect((await cloud.read('projects/a'))?.['count']).toBe(changes)
        await mine.leave()
      } finally {
        reader.kill()
      }
    }, 15_000)
  })
})

/** Reads every file under a folder, over and over, as fast as it can. */
const READ_EVERYTHING = `
const { readdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const walk = (dir) => {
  let names = []
  try { names = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const one of names) {
    const path = join(dir, one.name)
    if (one.isDirectory()) walk(path)
    else try { readFileSync(path) } catch {}
  }
}
for (;;) walk(process.argv[1])
`
