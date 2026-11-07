// codegraph: test feature make-folder
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { deleteFolder } from '../src/features/delete-folder.js'
import { fileSketch } from '../src/features/file-sketch.js'
import { listFolders } from '../src/features/list-folders.js'
import { listMySketches } from '../src/features/list-my-sketches.js'
import { listSketches } from '../src/features/list-sketches.js'
import { makeFolder } from '../src/features/make-folder.js'
import { moveFolder } from '../src/features/move-folder.js'
import { renameFolder } from '../src/features/rename-folder.js'
import { startSketch } from '../src/features/start-sketch.js'
import { useFolder as useProjects } from '../src/modules/projects/index.js'
import { LOOSE, useFolder as useSketches } from '../src/modules/sketches/index.js'
import { closeYard, openYard, type Yard } from './yard.js'

let yard: Yard

beforeEach(() => {
  yard = openYard('sketch-folders')
  useProjects(yard.home)
  useSketches(yard.home)
})

afterEach(() => closeYard(yard))

const made = async (library: string, name: string, parentId = ''): Promise<string> => {
  const done = await makeFolder(library, name, parentId)
  expect(done.ok).toBe(true)
  return done.folder!.id
}

describe('folders in a project’s sketches', () => {
  it('makes folders inside folders, and files a sketch in one', async () => {
    const { id } = await createProject('Notes')
    const planning = await made(id, 'Planning')
    const q3 = await made(id, 'Q3', planning)
    const sketch = await startSketch(id, 'Roadmap')
    expect((await fileSketch(id, sketch.id, q3)).ok).toBe(true)
    expect((await listSketches(id))[0]?.folderId).toBe(q3)
    expect((await listFolders(id)).map((f) => [f.name, f.parentId])).toEqual([
      ['Planning', ''],
      ['Q3', planning],
    ])
  })

  it('renames a folder', async () => {
    const { id } = await createProject('Notes')
    const folder = await made(id, 'Planing')
    expect((await renameFolder(id, folder, 'Planning')).ok).toBe(true)
    expect((await listFolders(id))[0]?.name).toBe('Planning')
  })

  it('will not put a folder inside itself, or inside one of its own', async () => {
    const { id } = await createProject('Notes')
    const outer = await made(id, 'Outer')
    const inner = await made(id, 'Inner', outer)
    expect((await moveFolder(id, outer, outer)).ok).toBe(false)
    expect((await moveFolder(id, outer, inner)).ok).toBe(false)
    expect((await moveFolder(id, inner, '')).ok).toBe(true)
    expect((await listFolders(id)).every((f) => f.parentId === '')).toBe(true)
  })

  it('keeps what was in a deleted folder, one level up', async () => {
    const { id } = await createProject('Notes')
    const outer = await made(id, 'Outer')
    const middle = await made(id, 'Middle', outer)
    const inner = await made(id, 'Inner', middle)
    const sketch = await startSketch(id, 'Roadmap')
    await fileSketch(id, sketch.id, middle)
    expect((await deleteFolder(id, middle)).ok).toBe(true)
    expect((await listSketches(id))[0]?.folderId).toBe(outer)
    expect((await listFolders(id)).find((f) => f.id === inner)?.parentId).toBe(outer)
    expect((await listFolders(id)).map((f) => f.id)).not.toContain(middle)
  })
})

describe('folders in your own sketches', () => {
  it('files a loose sketch in a folder of your own', async () => {
    const mine = await made(LOOSE, 'Ideas')
    const sketch = await startSketch(LOOSE, 'Doodle')
    await fileSketch(LOOSE, sketch.id, mine)
    expect((await listMySketches())[0]?.folderId).toBe(mine)
  })

  it('files nothing into a folder that is not there', async () => {
    const sketch = await startSketch(LOOSE, 'Doodle')
    expect((await fileSketch(LOOSE, sketch.id, 'nowhere')).ok).toBe(false)
  })
})
