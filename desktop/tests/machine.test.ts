// codegraph: test module machine
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { bringOldFiles, dataFolder, realFolder, sameFolder } from '../src/modules/machine/index.js'
import { aLinkTo, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let folder = ''

beforeAll(() => {
  yard = openYard('machine')
  folder = join(yard.path, 'folder')
  mkdirSync(folder)
})

afterAll(() => closeYard(yard))

describe('one folder under several names', () => {
  it('is the same folder through a link', () => {
    expect(sameFolder(aLinkTo(yard, folder), folder)).toBe(true)
  })

  it('is the same folder with a trailing slash or a roundabout path', () => {
    expect(sameFolder(`${folder}/`, folder)).toBe(true)
    expect(sameFolder(join(folder, 'inner', '..'), folder)).toBe(true)
  })

  it('tells two folders apart', () => {
    const other = join(yard.path, 'other')
    mkdirSync(other)
    expect(sameFolder(other, folder)).toBe(false)
  })

  it('still compares folders that are not there', () => {
    expect(sameFolder(join(yard.path, 'gone'), join(yard.path, 'gone', ''))).toBe(true)
    expect(sameFolder(join(yard.path, 'gone'), join(yard.path, 'lost'))).toBe(false)
  })

  it('gives one name however it is asked', () => {
    expect(realFolder(aLinkTo(yard, folder, 'another'))).toBe(realFolder(folder))
  })
})

describe('where codegraph keeps its files', () => {
  const told = process.env['CODEGRAPH_HOME']
  afterEach(() => {
    if (told === undefined) delete process.env['CODEGRAPH_HOME']
    else process.env['CODEGRAPH_HOME'] = told
  })

  // Not under AppData: Windows gives a packaged app, as the Claude app is,
  // a private copy of AppData, so an agent it runs would read and
  // write files the codegraph app never sees.
  it('is a folder in the home folder', () => {
    delete process.env['CODEGRAPH_HOME']
    expect(dataFolder()).toBe(join(homedir(), '.codegraph'))
  })

  it('is the one CODEGRAPH_HOME names, when it names one', () => {
    process.env['CODEGRAPH_HOME'] = join(yard.path, 'told')
    expect(dataFolder()).toBe(join(yard.path, 'told'))
  })
})

describe('bringing the files from where an older codegraph kept them', () => {
  const put = (path: string, text = '{}'): void => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text, 'utf8')
  }
  const oldPlace = (name: string): string => {
    const from = join(yard.path, name)
    put(join(from, 'projects.json'), '{"projects":[]}')
    put(join(from, 'member.json'))
    put(join(from, 'github.token'), 'locked')
    put(join(from, 'sketches', 'p1', 's1', 'sketch.json'))
    put(join(from, 'sync', 'pending.json'), '[]')
    put(join(from, 'presence', 'looking.json'))
    put(join(from, 'Cache', 'data_0'), 'chromium')
    put(join(from, 'Preferences'), 'chromium')
    return from
  }

  it("copies codegraph's own files and leaves the window's behind", () => {
    const from = oldPlace('old-a')
    const to = join(yard.path, 'new-a')
    const brought = bringOldFiles(from, to)
    expect(brought).toEqual(expect.arrayContaining(['projects.json', 'member.json', 'github.token', 'sketches', 'sync']))
    expect(readFileSync(join(to, 'projects.json'), 'utf8')).toBe('{"projects":[]}')
    expect(existsSync(join(to, 'sketches', 'p1', 's1', 'sketch.json'))).toBe(true)
    expect(existsSync(join(to, 'Cache'))).toBe(false)
    expect(existsSync(join(to, 'Preferences'))).toBe(false)
    // What a window is looking at is only true while it is open.
    expect(existsSync(join(to, 'presence'))).toBe(false)
    // The old files stay, for an older codegraph still about.
    expect(existsSync(join(from, 'projects.json'))).toBe(true)
  })

  it('brings nothing once the new place has files of its own', () => {
    const from = oldPlace('old-b')
    const to = join(yard.path, 'new-b')
    put(join(to, 'projects.json'), '{"projects":["mine"]}')
    expect(bringOldFiles(from, to)).toEqual([])
    expect(readFileSync(join(to, 'projects.json'), 'utf8')).toBe('{"projects":["mine"]}')
    expect(existsSync(join(to, 'sketches'))).toBe(false)
  })

  it('brings nothing from a place that is not there, or from itself', () => {
    expect(bringOldFiles(join(yard.path, 'never'), join(yard.path, 'new-c'))).toEqual([])
    const from = oldPlace('old-d')
    expect(bringOldFiles(from, from)).toEqual([])
  })
})
