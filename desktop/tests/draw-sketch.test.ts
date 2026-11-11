// codegraph: test feature draw-sketch
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { describeSketch } from '../src/features/describe-sketch.js'
import { drawSketch } from '../src/features/draw-sketch.js'
import { openFolderCloud, useCloud, type Member } from '../src/modules/cloud/index.js'
import { writeCardTypes } from '../src/modules/card-types/index.js'
import { findProject } from '../src/modules/projects/index.js'
import { listSketches, readSketch, writeSketch } from '../src/modules/sketches/index.js'
import { catchUp, pendingCount, useHeard } from '../src/modules/sync/index.js'
import { aComputer, anAgentIn, closeYard, openYard, type Yard } from './yard.js'

/** A wardrobe app, as an agent would write it: a shopper, the software system
 *  with its containers inside, the server's parts inside that, a service
 *  someone else runs, and wires that reach into a card from outside it. */
const WARDROBE = `flowchart LR
  %% note: Outfits follow the weather
  shopper(["Shopper"]):::person
  weather["Weather service"]:::shallow-software-system
  wardrobe["Wardrobe"]:::software-system
  %% says wardrobe: Suggests what to wear
  shopper -->|uses: to get outfit ideas| app
  subgraph wardrobe
    app["Phone app"]:::mobile-app
    api["Wardrobe API"]:::server
    db[("Clothes")]:::database
    app -->|calls: to fetch suggestions| api
    api -->|keeps: keeps the clothes each person owns| db
    %% note: Offline first?
    subgraph api
      suggest["suggest-outfit"]:::feature
      clothes["clothes"]:::module
      suggest -->|uses: to look up what fits| clothes
    end
  end
  api -->|calls: to read the forecast| weather
`

const ana: Member = { id: '1', login: 'ana', name: 'Ana', avatar: '' }

let yard: Yard
let computer: ReturnType<typeof aComputer>
let shortName = ''
let projectId = ''

beforeEach(async () => {
  yard = openYard('draw-sketch')
  computer = aComputer(yard, 'ana')
  computer.be()
  projectId = (await createProject('Wardrobe', 'wardrobe')).id
  shortName = findProject(projectId)!.shortName
})

afterEach(() => {
  useCloud(null)
  useHeard(() => undefined)
  closeYard(yard)
})

describe('an agent drawing a sketch as a flowchart', () => {
  it('makes a sketch whose cards, levels and wires read back', async () => {
    const said = await drawSketch('', 'Outfits', WARDROBE, shortName)
    expect(said).toMatch(/Made the sketch "Outfits"/)

    const back = await describeSketch('', 'Outfits', shortName)
    // The top level: a person, a software system and one someone else runs.
    expect(back).toContain('\nperson Shopper\n')
    expect(back).toContain('\nshallow software system Weather service\n')
    expect(back).toContain('\nsoftware system Wardrobe: Suggests what to wear\n')
    // Inside the software system, its containers; inside the server, its parts.
    expect(back).toContain('\n  container Phone app (mobile app)\n')
    expect(back).toContain('\n  container Clothes (database)\n')
    expect(back).toContain('\n    feature suggest-outfit\n')
    expect(back).toContain('\n    module clothes\n')
    // Wires on each level, with their kind and words.
    expect(back).toContain('container Phone app (mobile app) calls container Wardrobe API (server) to fetch suggestions')
    expect(back).toContain('container Wardrobe API (server) keeps the clothes each person owns in container Clothes (database)')
    expect(back).toContain('feature suggest-outfit uses module clothes to look up what fits')
    // A wire into a card from outside runs to the card, and on to the part inside.
    expect(back).toContain('person Shopper uses software system Wardrobe to get outfit ideas')
    expect(back).toContain('person Shopper uses container Phone app (mobile app) to get outfit ideas')
    expect(back).toContain('software system Wardrobe calls shallow software system Weather service to read the forecast')
    expect(back).toContain('container Wardrobe API (server) calls shallow software system Weather service to read the forecast')
    // Notes land on the level they were written on.
    expect(back).toMatch(/On the project Wardrobe:\n\s+sticky note "Outfits follow the weather"/)
    expect(back).toMatch(/On software system Wardrobe:\n\s+sticky note "Offline first\?"/)
  })

  it('leaves cards where the canvas puts them, and keeps where a person moved one when drawn again', async () => {
    await drawSketch('', 'Outfits', WARDROBE, shortName)
    const [listed] = listSketches(projectId)
    const first = readSketch(projectId, listed!.id)!
    expect(first.root.children.every((card) => card.x === undefined && card.y === undefined)).toBe(true)

    // A person moves the shopper; the agent then draws the sketch again.
    first.root.children.find((card) => card.id === 'shopper')!.x = 40
    first.root.children.find((card) => card.id === 'shopper')!.y = -80
    writeSketch(first)
    const said = await drawSketch('', 'Outfits', WARDROBE.replace('"Weather service"', '"Forecasts"'), shortName)
    expect(said).toMatch(/Replaced the sketch "Outfits"/)

    const sketches = listSketches(projectId)
    expect(sketches).toHaveLength(1)
    const again = readSketch(projectId, sketches[0]!.id)!
    expect(again.id).toBe(first.id)
    expect(again.root.children.find((card) => card.id === 'shopper')).toMatchObject({ x: 40, y: -80 })
    expect(again.root.children.find((card) => card.id === 'weather')?.name).toBe('Forecasts')
    // The notes are not doubled.
    expect(again.layers?.flatMap((layer) => layer.items)).toHaveLength(2)
  })

  it("draws a person's own saved type in its look", async () => {
    writeCardTypes([{ id: 't', name: 'job queue', icon: 'clock', shape: 'pill', color: 'orange' }])
    await drawSketch('', 'Jobs', 'flowchart LR\n  s["Shop"]:::software-system\n  subgraph s\n    q["jobs"]:::job-queue\n  end', shortName)
    const sketch = readSketch(projectId, listSketches(projectId)[0]!.id)!
    expect(sketch.root.children[0]?.children[0]).toMatchObject({ kind: 'job queue', level: 'container', look: { icon: 'clock', shape: 'pill', color: 'orange' } })
  })

  it('says which line is wrong, and draws nothing', async () => {
    const said = await drawSketch(
      '',
      'Broken',
      [
        'flowchart LR',
        '  ship["Ship"]:::spaceship',
        '  a["A"]:::software-system',
        '  a -->|flies: to the moon| b',
        '  this is not a flowchart line',
        '  subgraph a',
        '    c["C"]',
      ].join('\n'),
      shortName,
    )
    expect(said).toContain('Line 2')
    expect(said).toContain('"spaceship"')
    expect(said).toContain('software system, shallow software system, person')
    expect(said).toContain('Line 4')
    expect(said).toContain('"flies"')
    expect(said).toContain('Line 5')
    expect(said).toContain('Line 6')
    expect(said).toMatch(/never closed/)
    expect(listSketches(projectId)).toHaveLength(0)
  })

  it('says so when a person is given insides, or a wire reaches too deep', async () => {
    const person = await drawSketch('', 'P', 'flowchart LR\n  u["U"]:::person\n  subgraph u\n    x["X"]\n  end', shortName)
    expect(person).toMatch(/Line 3.*person has nothing inside/)
    const deep = await drawSketch(
      '',
      'D',
      'flowchart LR\n  u["U"]:::person\n  s["S"]:::software-system\n  subgraph s\n    w["W"]:::server\n    subgraph w\n      f["f"]:::feature\n    end\n  end\n  u --> f',
      shortName,
    )
    expect(deep).toMatch(/Line 10/)
    expect(listSketches(projectId)).toHaveLength(0)
  })

  it('names the project when there is none to draw in', async () => {
    expect(await drawSketch('', 'X', WARDROBE, 'nowhere')).toContain('"nowhere"')
  })
})

describe('a sketch an agent wrote from outside the app', () => {
  it('is owed online, and goes up and tells the window once the app catches up', async () => {
    const cloud = openFolderCloud(join(yard.path, 'online'), () => true)
    useCloud(cloud)
    computer.be(ana)
    const { id } = await createProject('Closet', 'closet')

    // The MCP runs on its own, with no online side: it only writes the files.
    useCloud(null)
    await drawSketch('', 'Outfits', WARDROBE, 'closet')
    const [listed] = listSketches(id)
    const path = `projects/${id}/sketches/${listed!.id}`
    expect(pendingCount()).toBe(1)
    expect(await cloud.read(path)).toBeNull()

    // The app opens, or its next try comes round, and catches up.
    useCloud(cloud)
    const heard = vi.fn()
    useHeard(heard)
    await catchUp()
    expect(pendingCount()).toBe(0)
    expect((await cloud.read(path))?.['name']).toBe('Outfits')
    expect(heard).toHaveBeenCalledWith({ projectId: id, path })
  })
})

describe('the draw tool', () => {
  it('draws a sketch through the codegraph MCP, which `sketch` reads back', async () => {
    const agent = await anAgentIn(yard.path, computer.home)
    try {
      expect(await agent.call('draw', { name: 'Outfits', flowchart: WARDROBE, project: shortName })).toMatch(/^Made the sketch "Outfits"/)
      expect(await agent.call('sketch', { name: 'Outfits', project: shortName })).toContain('person Shopper uses software system Wardrobe to get outfit ideas')
      expect(await agent.call('draw', { name: 'Odd', flowchart: 'flowchart LR\n  a:::nonsense', project: shortName })).toContain('Line 2')
      expect(await agent.call('instructions', { topic: 'sketches' })).toMatch(/^# Sketches/)
    } finally {
      await agent.close()
    }
  })
})
