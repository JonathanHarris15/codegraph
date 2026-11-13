// codegraph: test feature edit-sketch
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/features/create-project.js'
import { describeSketch } from '../src/features/describe-sketch.js'
import { drawSketch } from '../src/features/draw-sketch.js'
import { editSketch, type Step } from '../src/features/edit-sketch.js'
import { sayLooking } from '../src/features/say-looking.js'
import { showAgents } from '../src/features/show-agents.js'
import { showLooking } from '../src/features/show-looking.js'
import { annotationKinds } from '../src/modules/annotations/index.js'
import { findProject } from '../src/modules/projects/index.js'
import { listSketches, LOOSE, newSketch, blankCard, readSketch, writeSketch, type Sketch } from '../src/modules/sketches/index.js'
import { SHAPES } from '../src/ui/components/annotation-shapes.js'
import { aComputer, anAgentIn, closeYard, openYard, type Yard } from './yard.js'

let yard: Yard
let computer: ReturnType<typeof aComputer>
let shortName = ''
let projectId = ''

/** The person's window, with nothing moving yet. */
const noWait = async (): Promise<void> => undefined

const sketchCalled = (name: string): Sketch => readSketch(projectId, listSketches(projectId).find((s) => s.name === name)!.id)!
const items = (sketch: Sketch) => (sketch.layers ?? []).flatMap((l) => l.items)

beforeEach(async () => {
  yard = openYard('edit-sketch')
  computer = aComputer(yard, 'ana')
  computer.be()
  projectId = (await createProject('Wardrobe', 'wardrobe')).id
  shortName = findProject(projectId)!.shortName
})

afterEach(() => closeYard(yard))

/** A wardrobe drawn step by step: the parts, the database with a store and an
 *  inner store and their fields, and the notes, lines and frames round them. */
const WARDROBE: Step[] = [
  { do: 'card', name: 'Shopper', kind: 'person' },
  { do: 'card', name: 'Wardrobe', kind: 'software system', says: 'Suggests what to wear' },
  { do: 'card', name: 'Phone app', kind: 'mobile app', in: 'Wardrobe' },
  { do: 'card', name: 'Wardrobe API', kind: 'server', in: 'wardrobe', id: 'api' },
  { do: 'card', name: 'Clothes', kind: 'database', in: 'wardrobe', id: 'db' },
  { do: 'card', name: 'people', kind: 'store', in: 'db' },
  { do: 'card', name: 'outfits', kind: 'inner store', in: 'people' },
  { do: 'fields', store: 'people', fields: ['name: text, needed', 'email: text'], open: 'text' },
  { do: 'fields', store: 'outfits', fields: ['worn on: date', 'owner: text, points at people'] },
  { do: 'wire', from: 'phone-app', to: 'api', kind: 'calls', words: 'to fetch suggestions' },
  { do: 'wire', from: 'shopper', to: 'phone-app', words: 'to get outfit ideas' },
  { do: 'note', text: 'Offline first?', near: 'api' },
  { do: 'note', kind: 'code', text: 'GET /suggest', in: 'wardrobe' },
  { do: 'note', kind: 'list', text: '- tops\n- shoes', in: 'wardrobe', color: 'blue' },
  { do: 'note', kind: 'diamond', text: 'Raining?', in: 'wardrobe', x: 400, y: 0 },
  { do: 'line', from: 'Offline first?', to: 'db', text: 'cache here' },
  { do: 'frame', text: 'Phone side', around: ['phone-app', 'api'] },
  { do: 'frame', kind: 'lane', text: 'Data', in: 'wardrobe', x: -200, y: 300, w: 600, h: 180 },
]

describe('an agent drawing on a sketch step by step', () => {
  it('makes a new sketch with cards on every level, stores with fields, and every sort of annotation', async () => {
    const said = await editSketch('', 'Outfits', WARDROBE, shortName, 'Claude', noWait)
    expect(said).toMatch(/Made the sketch "Outfits"/)
    expect(said).toContain('[api]')

    const back = await describeSketch('', 'Outfits', shortName)
    expect(back).toContain('\nperson Shopper\n')
    expect(back).toContain('\n  container Phone app (mobile app)\n')
    expect(back).toContain('container Phone app (mobile app) calls container Wardrobe API (server) to fetch suggestions')
    // A wire into a card from beside it runs to the card and on inside it.
    expect(back).toContain('person Shopper uses software system Wardrobe to get outfit ideas')
    expect(back).toContain('person Shopper uses container Phone app (mobile app) to get outfit ideas')
    // A store, an inner store inside it, and their fields.
    expect(back).toContain('container people (store) (open to text)')
    expect(back).toContain('name: text, needed')
    expect(back).toContain('container outfits (inner store) (fixed)')
    expect(back).toContain('owner: text, points at people')

    const sketch = sketchCalled('Outfits')
    const drawn = items(sketch)
    expect(drawn.map((a) => a.kind).sort()).toEqual(['arrow', 'code', 'diamond', 'frame', 'lane', 'list', 'sticky'].sort())
    expect(drawn.find((a) => a.kind === 'sticky')).toMatchObject({ at: 'wardrobe', near: { card: 'api' }, color: 'yellow' })
    expect(drawn.find((a) => a.kind === 'diamond')).toMatchObject({ x: 400, y: 0 })
    expect(drawn.find((a) => a.kind === 'list')?.color).toBe('blue')
    const arrow = drawn.find((a) => a.kind === 'arrow')!
    expect(arrow.from).toMatchObject({ annotation: drawn.find((a) => a.kind === 'sticky')!.id })
    expect(arrow.to).toEqual({ card: 'db' })
    // A frame round cards the agent cannot see is fitted to them by the canvas.
    expect(drawn.find((a) => a.kind === 'frame')).toMatchObject({ at: 'wardrobe', around: ['phone-app', 'api'], text: 'Phone side' })
    expect(drawn.find((a) => a.kind === 'lane')).toMatchObject({ x: -200, y: 300, w: 600, h: 180 })
    expect(back).toContain('round container Phone app (mobile app), container Wardrobe API (server)')
  })

  it('changes, moves and takes away cards, wires and annotations', async () => {
    await editSketch('', 'Outfits', WARDROBE, shortName, 'Claude', noWait)
    const sticky = items(sketchCalled('Outfits')).find((a) => a.kind === 'sticky')!.id
    const said = await editSketch(
      '',
      'Outfits',
      [
        { do: 'change', what: 'api', name: 'Outfit API', says: 'Picks clothes', x: 300, y: 40 },
        { do: 'change', what: sticky, text: 'Offline first!', color: 'pink' },
        { do: 'remove', what: 'shopper -> phone-app' },
        { do: 'remove', what: 'phone-app' },
      ],
      shortName,
      'Claude',
      noWait,
    )
    expect(said).not.toMatch(/Nothing was drawn/)
    const sketch = sketchCalled('Outfits')
    const wardrobe = sketch.root.children.find((c) => c.id === 'wardrobe')!
    expect(wardrobe.children.find((c) => c.id === 'api')).toMatchObject({ name: 'Outfit API', says: 'Picks clothes', x: 300, y: 40 })
    expect(wardrobe.children.some((c) => c.id === 'phone-app')).toBe(false)
    // Its wires went with it, and the frame round it now goes round what is left.
    expect(wardrobe.wires.some((w) => w.from === 'phone-app' || w.to === 'phone-app')).toBe(false)
    expect(sketch.root.wires).toHaveLength(0)
    expect(items(sketch).find((a) => a.kind === 'frame')?.around).toEqual(['api'])
    expect(items(sketch).find((a) => a.id === sticky)).toMatchObject({ text: 'Offline first!', color: 'pink' })
  })

  it('draws on the sketch the person has open when no name is given, and puts new cards clear of placed ones', async () => {
    await drawSketch('', 'Shop', 'flowchart LR\n  a["A"]:::software-system\n  b["B"]:::software-system', shortName)
    const shop = sketchCalled('Shop')
    // The canvas has shown it, so its cards are placed.
    shop.root.children[0]!.x = 0
    shop.root.children[0]!.y = 0
    shop.root.children[1]!.x = 400
    shop.root.children[1]!.y = 0
    writeSketch(shop)
    await sayLooking({ library: projectId, sketchId: shop.id, sketchName: 'Shop', trail: ['Wardrobe'], inside: shop.root.id, over: 'b', picked: ['a'], seen: [] })

    await editSketch('', '', [{ do: 'card', name: 'C', kind: 'software system' }], '', 'Claude', noWait)
    const c = sketchCalled('Shop').root.children.find((card) => card.name === 'C')!
    expect(c.x).toBeGreaterThan(400)
    expect(listSketches(projectId)).toHaveLength(1)
  })

  it("works on a person's own sketch, outside any project, when they have it open", async () => {
    const mine = newSketch(LOOSE, 'Ideas', blankCard('root', 'Ideas', 'project', 'project'))
    writeSketch(mine)
    await sayLooking({ library: LOOSE, sketchId: mine.id, sketchName: 'Ideas', trail: ['Ideas'], inside: 'root', over: '', picked: [], seen: [] })
    expect(await editSketch('', '', [{ do: 'note', text: 'Hello' }], '', 'Claude', noWait)).toContain('Put a sticky note')
    expect(items(readSketch(LOOSE, mine.id)!)[0]?.text).toBe('Hello')
  })

  it('draws nothing when a step is wrong, and says which', async () => {
    const said = await editSketch(
      '',
      'Broken',
      [
        { do: 'card', name: 'Shop', kind: 'software system' },
        { do: 'card', name: 'Rocket', kind: 'spaceship', in: 'shop' },
      ],
      shortName,
      'Claude',
      noWait,
    )
    expect(said).toMatch(/Nothing was drawn\. Step 2 \(card\)/)
    expect(said).toContain('server')
    expect(listSketches(projectId)).toHaveLength(0)

    await editSketch('', 'Ok', [{ do: 'card', name: 'U', kind: 'person' }], shortName, 'Claude', noWait)
    expect(await editSketch('', 'Ok', [{ do: 'card', name: 'X', in: 'U' }], shortName, 'Claude', noWait)).toMatch(/person has nothing inside/)
    expect(await editSketch('', 'Ok', [{ do: 'fields', store: 'U', fields: ['a: text'] }], shortName, 'Claude', noWait)).toMatch(/only a store/)
    expect(await editSketch('', 'Ok', [{ do: 'note', kind: 'arrow', text: 'x' }], shortName, 'Claude', noWait)).toMatch(/draw it with `line`/)
  })
})

describe("the agent's cursor and what the person is looking at", () => {
  it('moves the cursor to each step while the person watches, and paces it', async () => {
    await editSketch('', 'Outfits', [{ do: 'card', name: 'Shop', kind: 'software system' }], shortName, 'Claude', noWait)
    const sketch = sketchCalled('Outfits')
    await sayLooking({ library: projectId, sketchId: sketch.id, sketchName: 'Outfits', trail: ['Wardrobe'], inside: sketch.root.id, over: '', picked: [], seen: [] })

    const cursors: string[] = []
    const waits: number[] = []
    await editSketch(
      '',
      'Outfits',
      [
        { do: 'card', name: 'Server', kind: 'server', in: 'shop' },
        { do: 'point', at: 'server', words: 'This one does the work' },
      ],
      shortName,
      'Claude',
      async (ms) => {
        waits.push(ms)
        const [agent] = await showAgents(projectId)
        cursors.push(`${agent?.who}:${agent?.inside}:${agent?.target}:${agent?.words}`)
      },
    )
    expect(waits.every((ms) => ms > 0)).toBe(true)
    expect(cursors).toContain('Claude:shop:server:Adding server Server')
    expect(cursors).toContain('Claude:shop:server:This one does the work')
  })

  it('does not wait when nobody is watching', async () => {
    const waits: number[] = []
    await editSketch('', 'Quiet', [{ do: 'card', name: 'A', kind: 'person' }], shortName, 'Claude', async (ms) => void waits.push(ms))
    expect(waits).toEqual([])
    // The cursor is still said, for a window that opens the sketch soon after.
    expect((await showAgents(projectId))[0]).toMatchObject({ sketchName: 'Quiet', target: 'a' })
  })

  it('tells the agent the sketch, the level, what is under the pointer, what is picked and where things sit', async () => {
    await editSketch('', 'Outfits', WARDROBE, shortName, 'Claude', noWait)
    const sketch = sketchCalled('Outfits')
    expect(showLooking()).toMatch(/no sketch open/)
    await sayLooking({
      library: projectId,
      sketchId: sketch.id,
      sketchName: 'Outfits',
      trail: ['Wardrobe', 'Wardrobe'],
      inside: 'wardrobe',
      x: 10,
      y: 20,
      over: 'api',
      picked: ['db'],
      seen: [
        { id: 'api', what: 'server', name: 'Wardrobe API', x: 0, y: 0, w: 220, h: 120 },
        { id: 'db', what: 'database', name: 'Clothes', x: 300, y: 0, w: 220, h: 160 },
      ],
    })
    const said = showLooking()
    expect(said).toContain('"Outfits" open, in the project Wardrobe, inside Wardrobe [wardrobe]')
    expect(said).toContain('pointer is on server "Wardrobe API" [api]')
    expect(said).toContain('picked database "Clothes" [db]')
    expect(said).toContain('database "Clothes" [db] at x 300, y 0, 220 wide, 160 high')
    await sayLooking(null)
    expect(showLooking()).toMatch(/no sketch open/)
  })
})

describe('the kinds of annotation an agent can ask for', () => {
  it('are the ones the library draws, at the same sizes', () => {
    const library = [...SHAPES.values()].map((s) => `${s.kind} ${s.w}x${s.h}`)
    expect(annotationKinds.map((k) => `${k.kind} ${k.w}x${k.h}`)).toEqual(library)
    for (const kind of annotationKinds) {
      const shape = SHAPES.get(kind.kind)!
      expect(kind.group === 'line', kind.kind).toBe(Boolean(shape.line))
      expect(kind.group === 'frame', kind.kind).toBe(Boolean(shape.behind))
    }
  })
})

describe('the edit and looking tools', () => {
  it('draw through the codegraph MCP, with the cursor named after the agent', async () => {
    const agent = await anAgentIn(yard.path, computer.home)
    try {
      const said = await agent.call('edit', {
        sketch: 'Outfits',
        project: shortName,
        steps: [
          { do: 'card', name: 'Shop', kind: 'software-system' },
          { do: 'frame', text: 'All of it', around: ['shop'] },
        ],
      })
      expect(said).toMatch(/^Made the sketch "Outfits"/)
      expect((await showAgents(projectId))[0]?.who).toBe('Test agent')
      expect(await agent.call('looking')).toMatch(/no sketch open/)
      expect(await agent.call('instructions', { topic: 'sketches' })).toContain('`edit`')
    } finally {
      await agent.close()
    }
  })
})
