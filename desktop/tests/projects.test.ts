// codegraph: test module projects
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addSoftwareSystem,
  addProject,
  knownRemotes,
  listProjects,
  removeSoftwareSystem,
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

  it('reads a file an older app wrote, when software systems were codebases', () => {
    const old = { version: 1, projects: [{ id: 'p', name: 'Mosaic', createdAt: '', codebases: [{ id: 's', name: 'web', path: '/w', remote: '' }] }] }
    writeFileSync(join(folder, 'projects.json'), JSON.stringify(old))
    expect(listProjects()[0]?.systems.map((s) => s.name)).toEqual(['web'])
    expect(listProjects()[0]?.shortName).toBe('mosaic')
    addSoftwareSystem('p', { name: 'api', path: '/a', remote: '' })
    expect(listProjects()[0]?.systems.map((s) => s.name)).toEqual(['web', 'api'])
  })

  it('gives a project a short name from its name, for repos to name it by', () => {
    expect(addProject('Harris Appraisals').shortName).toBe('harris-appraisals')
  })

  it('takes a short name it is given', () => {
    expect(addProject('Mosaic Manager', 'mosaic').shortName).toBe('mosaic')
  })

  it('keeps short names apart when two projects would share one', () => {
    addProject('Mosaic')
    expect(addProject('Mosaic').shortName).toBe('mosaic-2')
  })

  it('keeps the short name when the project is renamed, so its repos still name it', () => {
    const project = addProject('Old')
    renameProject(project.id, 'New')
    expect(listProjects()[0]?.shortName).toBe('old')
  })

  it('names an unnamed project rather than keeping a blank', () => {
    expect(addProject('   ').name).toBe('Untitled project')
  })

  it('holds more than one software system under one project', () => {
    const project = addProject('Mosaic')
    addSoftwareSystem(project.id, { name: 'web', path: '/tmp/web', remote: 'me/web' })
    addSoftwareSystem(project.id, { name: 'api', path: '/tmp/api', remote: 'me/api' })
    const [kept] = listProjects()
    expect(kept?.systems.map((c) => c.name)).toEqual(['web', 'api'])
  })

  it('does not link the same folder twice', () => {
    const project = addProject('Mosaic')
    const first = addSoftwareSystem(project.id, { name: 'web', path: '/tmp/web', remote: '' })
    const again = addSoftwareSystem(project.id, { name: 'web', path: '/tmp/web', remote: '' })
    expect(again.id).toBe(first.id)
    expect(listProjects()[0]?.systems).toHaveLength(1)
  })

  it('forgets a software system it is told to drop', () => {
    const project = addProject('Mosaic')
    const system = addSoftwareSystem(project.id, { name: 'web', path: '/tmp/web', remote: '' })
    removeSoftwareSystem(project.id, system.id)
    expect(listProjects()[0]?.systems).toEqual([])
  })

  it('renames a project', () => {
    const project = addProject('Old')
    renameProject(project.id, 'New')
    expect(listProjects()[0]?.name).toBe('New')
  })

  it('lists every GitHub repo it already holds', () => {
    const one = addProject('One')
    const two = addProject('Two')
    addSoftwareSystem(one.id, { name: 'web', path: '/tmp/web', remote: 'me/web' })
    addSoftwareSystem(two.id, { name: 'api', path: '/tmp/api', remote: 'me/api' })
    addSoftwareSystem(two.id, { name: 'local', path: '/tmp/local', remote: '' })
    expect(knownRemotes().sort()).toEqual(['me/api', 'me/web'])
  })

  it('refuses a software system for a project that is not there', () => {
    expect(() => addSoftwareSystem('nobody', { name: 'web', path: '/tmp/web', remote: '' })).toThrow()
  })
})
