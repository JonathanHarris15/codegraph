// codegraph: test module machine
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { realFolder, sameFolder } from '../src/modules/machine/index.js'
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
