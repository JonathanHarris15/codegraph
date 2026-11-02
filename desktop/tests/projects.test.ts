// codegraph: test module projects
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addCodebase,
  addProject,
  knownRemotes,
  listProjects,
  removeCodebase,
  renameProject,
  useFolder,
} from '../src/modules/projects/index.js'

let folder = ''

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'codegraph-projects-'))
  useFolder(folder)
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

describe('the projects a computer remembers', () => {
  it('starts with none', () => {
    expect(listProjects()).toEqual([])
  })

  it('keeps a project across reads', () => {
    addProject('Mosaic Manager')
    expect(listProjects().map((p) => p.name)).toEqual(['Mosaic Manager'])
  })

  it('names an unnamed project rather than keeping a blank', () => {
    expect(addProject('   ').name).toBe('Untitled project')
  })

  it('holds more than one codebase under one project', () => {
    const project = addProject('Mosaic')
    addCodebase(project.id, { name: 'web', path: '/tmp/web', remote: 'me/web' })
    addCodebase(project.id, { name: 'api', path: '/tmp/api', remote: 'me/api' })
    const [kept] = listProjects()
    expect(kept?.codebases.map((c) => c.name)).toEqual(['web', 'api'])
  })

  it('does not link the same folder twice', () => {
    const project = addProject('Mosaic')
    const first = addCodebase(project.id, { name: 'web', path: '/tmp/web', remote: '' })
    const again = addCodebase(project.id, { name: 'web', path: '/tmp/web', remote: '' })
    expect(again.id).toBe(first.id)
    expect(listProjects()[0]?.codebases).toHaveLength(1)
  })

  it('forgets a codebase it is told to drop', () => {
    const project = addProject('Mosaic')
    const codebase = addCodebase(project.id, { name: 'web', path: '/tmp/web', remote: '' })
    removeCodebase(project.id, codebase.id)
    expect(listProjects()[0]?.codebases).toEqual([])
  })

  it('renames a project', () => {
    const project = addProject('Old')
    renameProject(project.id, 'New')
    expect(listProjects()[0]?.name).toBe('New')
  })

  it('lists every GitHub repo it already holds', () => {
    const one = addProject('One')
    const two = addProject('Two')
    addCodebase(one.id, { name: 'web', path: '/tmp/web', remote: 'me/web' })
    addCodebase(two.id, { name: 'api', path: '/tmp/api', remote: 'me/api' })
    addCodebase(two.id, { name: 'local', path: '/tmp/local', remote: '' })
    expect(knownRemotes().sort()).toEqual(['me/api', 'me/web'])
  })

  it('refuses a codebase for a project that is not there', () => {
    expect(() => addCodebase('nobody', { name: 'web', path: '/tmp/web', remote: '' })).toThrow()
  })
})
