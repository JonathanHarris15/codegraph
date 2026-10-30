// codegraph: test ui pane
import { expect, test } from 'claude-code/testing'

const ISSUES = [
  { text: 'feature join has no trigger: no page acts on it', rel: 'server/features/join.py', line: 0,
    line_text: 'server/features/join.py  feature join has no trigger: no page acts on it',
    group: 'pages', file: 'server.features.join', card: 'feature:join' },
  { text: 'uses _fill from module services, which is not on its front door', rel: 'server/features/plan.py', line: 3,
    line_text: 'server/features/plan.py:3  uses _fill from module services, which is not on its front door',
    group: 'doors', file: 'server.features.plan', card: 'feature:plan-service' },
]

const SUMMARY = {
  root: 'church',
  source: 'tags',
  systems: [{ name: 'calendar', features: [{
    id: 'feature:plan-service', name: 'plan-service', uses: ['services'],
    triggers: ['schedule every Thursday'], files: ['server/features/plan.py'],
  }] }],
  modules: [{ id: 'module:services', name: 'services', files: ['server/services/__init__.py'],
              door: ['plan'], stores: ['services'], reads: [] }],
  pages: [{ id: 'page:home', name: 'home', files: ['web/app/page.tsx'], route: '/', start: true }],
  components: [],
  stores: [{ id: 'store:services', name: 'services', owner: 'module:services', fields: ['date: str'] }],
  mismatches: ISSUES.map(i => i.line_text),
  unknown: [],
  issues: ISSUES,
  groups: [{ id: 'layers', label: 'Layers broken' }, { id: 'doors', label: 'Front doors crossed' },
           { id: 'pages', label: 'Triggers and pages' }],
  views: {
    map: {
      title: 'map', columns: ['', '', ''],
      blocks: [{ id: 'reach', label: 'outside + stores' }, { id: 'modules', label: 'modules' },
               { id: 'features', label: 'features' }, { id: 'system:calendar', label: 'calendar', within: 'features' },
               { id: 'pages', label: 'pages' }],
      nodes: [
        { id: 'store:services', label: 'services', kind: 'store', col: 0, row: 0, tier: 0, block: 'reach', fields: ['date: str'], owner: 'module:services' },
        { id: 'module:services', label: 'services', kind: 'module', col: 0, row: 0, tier: 1, block: 'modules', size: 1.6, door: ['plan'] },
        { id: 'feature:plan-service', label: 'plan-service', kind: 'feature', col: 1, row: 0, tier: 1, block: 'features', system: 'calendar', uses: ['services'] },
        { id: 'feature:join', label: 'join', kind: 'feature', col: 1, row: 1, tier: 1, block: 'features', system: 'calendar' },
        { id: 'page:home', label: 'home', kind: 'page', col: 2, row: 0, tier: 1, block: 'pages', route: '/', start: true },
      ],
      edges: [
        { from: 'module:services', to: 'store:services', kind: 'writes' },
        { from: 'feature:plan-service', to: 'module:services', kind: 'uses', bad: ['uses _fill, not on its front door'] },
        { from: 'page:home', to: 'feature:plan-service', kind: 'acts' },
      ],
    },
    pages: { title: 'pages', columns: [''], nodes: [{ id: 'page:home', label: 'home', kind: 'page', col: 0, row: 0 }], edges: [] },
    'module:services': {
      title: 'services', columns: ['', ''],
      nodes: [
        { id: 'server.services', label: '__init__.py', kind: 'file', col: 0, row: 0, own: true, dir: 'server/services' },
        { id: 'feature:plan-service', label: 'plan-service', kind: 'feature', col: 1, row: 0 },
      ],
      edges: [{ from: 'feature:plan-service', to: 'server.services', kind: 'uses' }],
    },
  },
}

const PANE = {
  plugin: 'codegraph',
  component: 'Pane',
  requestId: 'codegraph',
  props: {
    title: 'Codegraph',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

function engine(on: any, surface: string, said: { filled: string; draft: string; all?: string[]; ran?: string[][]; root?: () => string }) {
  // Nothing sits beneath the plugin: each hook here stands for the engine.
  on('command.register', () => ({ value: { command: 'codegraph' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: said.root?.() ?? '/repo' }))
  on('process.run', (_: any, e: any) => {
    said.ran?.push([...e.argv])
    return { value: { exitCode: 0, stdout: e.argv.includes('--summary') ? JSON.stringify(SUMMARY) : 'Python 3.12.0', stderr: '' } }
  })
  on('prompt.read', () => ({ value: { text: said.draft, cursor: 0 } }))
  on('prompt.fill', (_: any, e: any) => {
    said.filled = e.text
    said.all?.push(e.text)
    return { isFilled: true }
  })
  return surface
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the mismatches are a press from a fix, and fold away`, async ($, on) => {
    const said = { filled: '', draft: '' }
    engine(on, surface, said)
    await $.session.start({ cwd: '/repo', surface, isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /2 mismatches/ }))?.text).toBeTruthy()

    await ui.press({ key: 'fix-1' })
    expect(said.filled).toBe('/codegraph:fix server/features/plan.py:3  uses _fill from module services, which is not on its front door')

    await ui.press({ key: 'fix-all' })
    expect(said.filled).toBe('/codegraph:fix all 2 mismatches, worst first, one commit each')

    await ui.press({ key: 'fold-doors' })
    expect(await ui.find({ key: 'fix-1' })).toBeUndefined()
    expect(await ui.find({ key: 'fix-0' })).toBeTruthy()

    await ui.press({ key: 'issues-toggle' })
    expect(await ui.find({ key: 'fix-0' })).toBeUndefined()
    expect(await ui.find({ key: 'fix-all' })).toBeTruthy()
    await ui.unmount()
  })

  test(`${surface}: pick a card, ask about it, and go inside it`, async ($, on) => {
    const said = { filled: '', draft: 'already typed' }
    engine(on, surface, said)
    await $.session.start({ cwd: '/repo', surface, isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface })

    await ui.press({ key: 'feature:plan-service' })
    await ui.press({ key: 'ask-card' })
    expect(said.filled).toContain('plan-service feature')
    expect(said.filled).toContain('uses services')
    expect(said.filled.startsWith('\n')).toBe(true) // after what was typed

    await ui.press({ key: 'fix-card' })
    expect(said.filled).toContain('/codegraph:fix server/features/plan.py:3')

    await ui.press({ key: 'module:services' })
    await ui.press({ key: 'go-in' })
    expect((await ui.find({ type: 'Text', text: /^services$/ }))?.text).toBe('services')
    expect(await ui.find({ key: 'server.services' })).toBeTruthy()

    await ui.press({ key: 'crumb-0' })
    expect(await ui.find({ key: 'server.services' })).toBeUndefined()
    expect(await ui.find({ key: 'page:home' })).toBeTruthy()
    await ui.unmount()
  })
}

test('/codegraph serves the live map, opens it in a browser tab, and its presses fill the chat', async ($, on) => {
  const fills: string[] = []
  const said = { filled: '', draft: '', all: fills }
  engine(on, 'desktop', said)
  const opened: any[] = []
  const spawned: string[][] = []
  on('process.spawn', async function* (_: any, e: any) {
    spawned.push([...e.argv])
    yield { stream: 'stdout', text: '{"ready": "http://127.0.0.1:7333/s3cret/"}\n{"ask": "Build a new' }
    yield { stream: 'stdout', text: ' feature: "}\n' }
    yield { stream: 'stdout', text: '{"ask": "/codegraph:fix all 2 mismatches, worst first, one commit each"}\n' }
  } as any)
  on('mcp.call', (_: any, e: any) => {
    opened.push(e)
    return { value: { content: [], isError: false } }
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const ran: any = await $.command.run({ command: 'codegraph', args: '' } as any)

  expect(spawned[0]).toContain('--serve')
  expect(spawned[0]).toContain('/repo')
  expect(opened[0]).toMatchObject({ tool: 'preview_start', args: { url: 'http://127.0.0.1:7333/s3cret/' } })
  expect(String(ran?.text ?? ran?.value?.text)).toContain('browser tab')
  // the server is heard in the background, past the command's own answer
  for (let i = 0; i < 50 && fills.length < 2; i++) await new Promise(r => (globalThis as any).setTimeout(r, 10))
  expect(fills).toContain('Build a new feature: ')
  expect(fills).toContain('/codegraph:fix all 2 mismatches, worst first, one commit each')
})

test('the open tool serves the live map and opens it, for the desktop menu that lists no mod commands', async ($, on) => {
  engine(on, 'desktop', { filled: '', draft: '' })
  const opened: any[] = []
  const spawned: string[][] = []
  on('process.spawn', async function* (_: any, e: any) {
    spawned.push([...e.argv])
    yield { stream: 'stdout', text: '{"ready": "http://127.0.0.1:7333/s3cret/"}\n' }
    await new Promise(() => undefined) // serves until stopped
  } as any)
  on('mcp.call', (_: any, e: any) => {
    opened.push(e)
    return { value: { content: [], isError: false } }
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const ran: any = await $.tool.call({ tool: 'mcp__codegraph__open' } as any)

  expect(spawned[0]).toContain('--serve')
  expect(opened[0]).toMatchObject({ tool: 'preview_start', args: { url: 'http://127.0.0.1:7333/s3cret/' } })
  expect(JSON.stringify(ran)).toContain('browser tab')
})

test('a button above the chat box opens the live map, with no message to send', async ($, on) => {
  engine(on, 'desktop', { filled: '', draft: '' })
  const opened: any[] = []
  on('process.spawn', async function* () {
    yield { stream: 'stdout', text: '{"ready": "http://127.0.0.1:7333/s3cret/"}\n' }
    await new Promise(() => undefined) // serves until stopped
  } as any)
  on('mcp.call', (_: any, e: any) => {
    opened.push(e)
    return { value: { content: [], isError: false } }
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({
    plugin: 'codegraph', component: 'AbovePrompt', surface: 'desktop',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 } },
  } as any)

  expect((await band.find({ type: 'Text', text: /2 mismatches/ }))?.text).toBeTruthy()
  await band.press({ key: 'open-map' })
  expect(opened[0]).toMatchObject({ tool: 'preview_start', args: { url: 'http://127.0.0.1:7333/s3cret/' } })
  await band.unmount()
})

test('a session that starts in a spare folder reads the project it moves to', async ($, on) => {
  // The desktop app starts a session in a spare folder it then deletes, and
  // moves the session to the project.
  const ran: string[][] = []
  let root = '/spares/spare-1'
  engine(on, 'desktop', { filled: '', draft: '', ran, root: () => root })
  const spawned: string[][] = []
  on('process.spawn', async function* (_: any, e: any) {
    spawned.push([...e.argv])
    yield { stream: 'stdout', text: `{"ready": "http://127.0.0.1:7333/${spawned.length}/"}\n` }
    await new Promise(() => undefined) // serves until stopped
  } as any)
  on('mcp.call', () => ({ value: { content: [], isError: false } }))

  await $.session.start({ cwd: '/spares/spare-1', surface: 'desktop', isInteractive: true })
  root = '/repo'
  await $.tool.call({ tool: 'mcp__codegraph__check' } as any)
  expect(ran.find(a => a.includes('--check'))).toContain('/repo')

  await $.command.run({ command: 'codegraph', args: '' } as any)
  expect(spawned[0]).toContain('/repo')

  // moved again (a worktree, say): the live map serves the new folder
  root = '/repo-wt'
  await $.command.run({ command: 'codegraph', args: '' } as any)
  expect(spawned[1]).toContain('/repo-wt')
})

test('desktop: the map is a square picture in boxes, stores above the modules, cards by size', async ($, on) => {
  engine(on, 'desktop', { filled: '', draft: '' })
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  const found: any = await ui.find({ type: 'Svg' })
  const svg = String(found?.props?.source ?? found?.source ?? '')
  const [, , w, h] = (svg.match(/viewBox="([^"]+)"/)?.[1] ?? '').split(' ').map(Number)
  expect(w).toBe(h)
  for (const label of ['OUTSIDE + STORES', 'MODULES', 'FEATURES', 'CALENDAR', 'PAGES']) expect(svg).toContain(label)
  const rect = (what: string) =>
    svg.match(new RegExp(`<title>${what}[^<]*</title><rect x="[\\d.]+" y="([\\d.]+)" width="([\\d.]+)"`))
  expect(Number(rect('store services')?.[1])).toBeLessThan(Number(rect('module services')?.[1]))
  // a card as big as the code it holds
  expect(Number(rect('module services')?.[2])).toBeGreaterThan(Number(rect('feature join')?.[2]))
  await ui.unmount()
})

test('desktop: the picture pans and zooms, and Show finds a mismatch on it', async ($, on) => {
  const said = { filled: '', draft: '' }
  engine(on, 'desktop', said)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  const box = async () => {
    const found: any = await ui.find({ type: 'Svg' })
    return String(found?.props?.source ?? found?.source ?? '').match(/viewBox="([^"]+)"/)?.[1]
  }
  const whole = await box()
  expect(whole).toBeTruthy()
  await ui.press({ key: 'zoom-in' })
  const closer = await box()
  expect(closer).not.toBe(whole)
  await ui.press({ key: 'pan-right' })
  expect(await box()).not.toBe(closer)
  await ui.press({ key: 'fit' })
  expect(await box()).toBe(whole)

  await ui.press({ key: 'show-0' })
  expect(await ui.find({ key: 'go-in' })).toBeUndefined() // a feature has no inside view here
  expect((await ui.find({ type: 'Text', text: /feature join/ }))?.text).toBeTruthy()
  await ui.unmount()
})
