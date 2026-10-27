// codegraph: test ui pane
import { expect, test } from 'claude-code/testing'

const SUMMARY = {
  root: 'church',
  source: 'tags',
  systems: [{ name: 'calendar', features: [{
    id: 'feature:plan-service', name: 'plan-service', uses: ['services'],
    triggers: ['schedule every Thursday'], files: ['server/features/plan_service.py'],
  }] }],
  modules: [{ id: 'module:services', name: 'services', files: ['server/services/__init__.py'],
              door: ['plan'], stores: ['services'], reads: [] }],
  pages: [{ id: 'page:home', name: 'home', files: ['web/app/page.tsx'], route: '/', start: true }],
  components: [],
  stores: [{ id: 'store:services', name: 'services', owner: 'module:services', fields: ['date: str'] }],
  mismatches: ['server/features/join.py  feature join has no trigger'],
  unknown: [],
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
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

test('the pane shows the map, and a feature press asks about it', async ($, on) => {
  // Nothing sits beneath the plugin: each hook here stands for the engine.
  const ran: string[][] = []
  let filled = ''
  on('command.register', () => ({ value: { command: 'codegraph' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    const out = e.argv.includes('--summary') ? JSON.stringify(SUMMARY) : 'Python 3.12.0'
    return { value: { exitCode: 0, stdout: out, stderr: '' } }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    filled = e.text
    return { isFilled: true }
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /1 mismatches/ }))?.text).toBeTruthy()
  expect(ran.some(argv => argv.includes('--summary') && argv.includes('/repo'))).toBe(true)

  await ui.press({ key: 'feature:plan-service' })
  expect(filled).toContain('plan-service feature')
  expect(filled).toContain('uses services')

  await ui.press({ key: 'fix' })
  expect(filled).toBe('/codegraph:fix')
  await ui.unmount()
})

test('the terminal draws the lists without the picture', async ($, on) => {
  on('command.register', () => ({ value: { command: 'codegraph' } }))
  on('tool.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => ({
    value: { exitCode: 0, stdout: e.argv.includes('--summary') ? JSON.stringify(SUMMARY) : 'Python 3', stderr: '' },
  }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /System calendar/ }))?.text).toBe('System calendar')
  await ui.unmount()
})
