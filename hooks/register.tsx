// codegraph: start page pane
// The codegraph mod: the full map of this repo, live in a browser tab inside
// Claude Code, where each Fix, Ask or + Feature fills the chat box; a smaller
// map in a pane beside the chat where no browser tab can open; and a check
// the model runs after every change.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Issue, Nav, Summary, View, ViewNode } from '../types'
import { drawView, frame, place } from './draw'

const PANE = 'codegraph'
const START: Nav = { trail: ['map'], selected: null, zoom: 1, cx: null, cy: null, issuesOpen: true, closed: [], more: [] }
const map = atom({ plugin: 'codegraph', key: 'map' } as const, null as Summary | null)
const status = atom({ plugin: 'codegraph', key: 'status' } as const, '')
const nav = atom({ plugin: 'codegraph', key: 'nav' } as const, START)

const PYTHONS = ['python', 'python3', 'py']
const MAP_PAGE = '.codegraph/map.html'
const SHOWN = 5 // mismatches listed per group before "more"
const ZOOMS = [1, 1.5, 2.25, 3.4, 5]
const KIND_NAMES: Record<string, string> = {
  feature: 'Features', module: 'Modules', page: 'Pages', component: 'Components', design: 'Design system',
  store: 'Stores', trigger: 'Triggers', outside: 'Outside', file: 'Files', external: 'Third party',
}

// The built-in browser's MCP server, by both spellings the engine accepts.
const BROWSERS = ['Claude_Browser', 'Claude Browser']

let python = ''
let mapUrl = '' // where the live map is served, while its server runs
let served = '' // the folder it serves
let server: any = null // its stream; ending it stops the server

// The folder to read, asked each time: the desktop app starts a session in a
// spare folder, then moves it to the project and deletes the spare.
function folder($: any): Promise<string> {
  return $.session.root()
}

async function findPython($: any): Promise<boolean> {
  for (const p of python ? [] : PYTHONS) {
    try {
      const v = await $.process.run([p, '--version'], { timeoutMs: 10000 })
      if (v.exitCode === 0) {
        python = p
        break
      }
    } catch {
      // not on this machine; try the next name
    }
  }
  return !!python
}

async function run($: any, args: string[], timeoutMs = 120000) {
  if (!(await findPython($))) {
    return { exitCode: 127, stdout: '', stderr: 'codegraph needs Python 3.10 or newer on the PATH' }
  }
  return $.process.run([python, `${$.plugin.root}/codegraph.py`, await folder($), ...args], { timeoutMs })
}

// ---- the live map: a page codegraph serves, which talks back through it

// Start the map's server once, and hear it for the session's life: its first
// line says where the page is, and each line after is something the person
// asked from the page, which goes in the chat box. A session that moved since
// gets a new server for its new folder. Resolves with the address, or '' when
// the server could not start.
async function startMap($: any): Promise<string> {
  const root = await folder($)
  if (mapUrl && served === root) return mapUrl
  if (server) void server.return?.()
  mapUrl = ''
  if (!(await findPython($))) return ''
  served = root
  return new Promise<string>(resolve => {
    void (async () => {
      let rest = ''
      let child: any = null
      try {
        child = server = $.process.spawn({ argv: [python, `${$.plugin.root}/codegraph.py`, root, '--serve'] })
        for await (const piece of child) {
          if (piece.stream !== 'stdout' || typeof piece.text !== 'string') continue
          rest += piece.text
          for (let nl = rest.indexOf('\n'); nl >= 0; nl = rest.indexOf('\n')) {
            const line = rest.slice(0, nl).trim()
            rest = rest.slice(nl + 1)
            await heard($, line, resolve)
          }
        }
      } catch {
        // it could not start, or it stopped: the next /codegraph starts it again
      }
      if (!child || server === child) {
        server = null
        mapUrl = ''
      }
      resolve('')
    })()
  })
}

async function heard($: any, line: string, ready: (url: string) => void) {
  let said: any
  try {
    said = JSON.parse(line)
  } catch {
    return
  }
  if (typeof said?.ready === 'string') {
    mapUrl = said.ready
    ready(mapUrl)
  } else if (typeof said?.ask === 'string' && said.ask.trim()) {
    await ask($, said.ask)
  }
}

// Open the page in a browser tab inside Claude Code; where there is no such
// browser, in the person's own. True when it opened inside Claude Code.
async function openTab($: any, url: string): Promise<boolean> {
  for (const server of BROWSERS) {
    try {
      const opened = await $.mcp.call(server, 'preview_start', { url })
      if (!opened?.isError) return true
    } catch {
      // not this name, or no built-in browser here
    }
  }
  await $.process.run([python, '-c', 'import sys, webbrowser; webbrowser.open(sys.argv[1])', url])
  return false
}

// Serve the live map and open it; where it cannot start, the pane shows the
// map instead. Says which happened.
async function openLive($: any): Promise<string> {
  const url = await startMap($)
  if (!url) {
    await $.ui.open({ id: PANE, title: 'Codegraph' })
    void refresh($)
    return 'The live map could not start (' + ((await read($, status)) || 'is Python 3.10+ on the PATH?') + '), so the pane shows it instead.'
  }
  return (await openTab($, url))
    ? 'The map is open in a browser tab. Fix, Ask and + Feature there fill this chat box; it redraws after every turn.'
    : `The map is open in your browser at ${url}. Fix, Ask and + Feature there fill this chat box.`
}

async function refresh($: any) {
  const ran = await run($, ['--summary'])
  if (ran.exitCode !== 0) {
    await update($, status, () => (ran.stderr || ran.stdout).trim().split('\n').pop() ?? '')
    return null
  }
  const summary: Summary = JSON.parse(ran.stdout)
  await update($, map, () => summary)
  await update($, status, () => '')
  // a view that went away with the last change takes the person back out
  await update($, nav, n => {
    const trail = (n ?? START).trail.filter(v => summary.views[v])
    return { ...(n ?? START), trail: trail.length ? trail : ['map'] }
  })
  return summary
}

// Put a prompt in the box. A slash command has to start the box, so it takes
// the box's place; anything else goes after what is already typed there.
async function ask($: any, text: string) {
  const { text: draft } = await $.prompt.read()
  const after = draft.trim() && !text.startsWith('/')
  await $.prompt.fill({ text: after ? `\n${text}` : text, mode: after ? 'append' : 'replace' })
}

async function openMap($: any) {
  const page = `${await folder($)}/${MAP_PAGE}`
  const ran = await run($, ['-o', page])
  if (ran.exitCode !== 0) {
    $.ui.toast('Could not draw the map: ' + (ran.stderr.trim().split('\n').pop() ?? ''))
    return
  }
  await $.process.run([python, '-c', 'import sys, pathlib, webbrowser; webbrowser.open(pathlib.Path(sys.argv[1]).resolve().as_uri())', page])
}

// ---- moving about the map

function current(n: Nav): string {
  return n.trail[n.trail.length - 1] ?? 'map'
}

async function move($: any, change: (n: Nav, view: View | undefined) => Partial<Nav>) {
  const m = await read($, map)
  await update($, nav, n => {
    const now = n ?? START
    return { ...now, ...change(now, m?.views[current(now)]) }
  })
}

function goInto($: any, id: string) {
  return move($, n => ({ trail: [...n.trail, id], selected: null, zoom: 1, cx: null, cy: null }))
}

function goTo($: any, depth: number) {
  return move($, n => ({ trail: n.trail.slice(0, depth + 1), selected: null, zoom: 1, cx: null, cy: null }))
}

function tab($: any, root: string) {
  return move($, () => ({ trail: [root], selected: null, zoom: 1, cx: null, cy: null }))
}

function pick($: any, id: string) {
  return move($, n => ({ selected: n.selected === id ? null : id }))
}

function pan($: any, dx: number, dy: number) {
  return move($, (n, view) => {
    if (!view) return {}
    const f = frame(place(view), n.zoom, n.cx, n.cy)
    return { cx: f.cx + dx * f.w * 0.3, cy: f.cy + dy * f.h * 0.3 }
  })
}

function zoom($: any, step: number) {
  return move($, n => {
    const i = ZOOMS.findIndex(z => z >= n.zoom)
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? ZOOMS.length - 1 : i) + step))]
    return next === 1 ? { zoom: 1, cx: null, cy: null } : { zoom: next }
  })
}

function focusOn($: any, id: string) {
  return move($, (n, view) => {
    const at = view && place(view).at.get(id)
    return at ? { selected: id, zoom: Math.max(n.zoom, 2.25), cx: at.x + at.w / 2, cy: at.y + at.h / 2 } : { selected: id }
  })
}

// Show a mismatch where it lives: its card on the map, picked and centred.
async function showIssue($: any, issue: Issue) {
  await move($, () => ({ trail: ['map'], selected: null, zoom: 1, cx: null, cy: null }))
  await focusOn($, issue.card)
}

function fold($: any, key: 'closed' | 'more', id: string) {
  return move($, n => ({ [key]: n[key].includes(id) ? n[key].filter(x => x !== id) : [...n[key], id] }))
}

function toggleIssues($: any) {
  return move($, n => ({ issuesOpen: !n.issuesOpen }))
}

// ---- what a press puts in the chat

function aboutCard(m: Summary, n: ViewNode, inside: string): string {
  const unit = [...m.modules, ...m.pages, ...m.components, ...m.systems.flatMap(s => s.features)].find(u => u.id === n.id)
  const files = unit?.files.length ? `; files ${unit.files.join(', ')}` : ''
  switch (n.kind) {
    case 'feature':
      return `About the ${n.label} feature (system ${n.system ?? 'none'}; uses ${n.uses?.join(', ') || 'no modules'}${files}): `
    case 'module':
      return `About the ${n.label} module (front door ${n.door?.join(', ') || 'empty'}${files}): `
    case 'page':
      return `About the ${n.label} page (at ${n.route || 'no route'}${files}): `
    case 'store':
      return `About the ${n.label} store (owned by ${(n.owner ?? '?').replace('module:', '')}; ${n.fields?.join(', ') || 'no schema read'}): `
    case 'file':
      return `About ${n.dir ? n.dir + '/' : ''}${n.label}${inside ? ` (in ${inside})` : ''}: `
    default:
      return `About ${n.label} (${n.kind}${files}): `
  }
}

function fixOne(issue: Issue): string {
  return `/codegraph:fix ${issue.line_text}`
}

function fixMany(issues: Issue[], what: string): string {
  return issues.length === 1 && issues[0]
    ? fixOne(issues[0])
    : `/codegraph:fix all ${issues.length} ${what}, worst first, one commit each`
}

// ---- the hooks

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'codegraph', description: 'Open this repo\'s codegraph map in a browser tab' })
    await $.command.register({ name: 'codegraph-pane', description: 'Show a smaller codegraph map in a pane beside the chat' })
    await $.tool.register({
      name: 'check',
      description:
        'Check this repo against its codegraph tags: every file tagged, every name that crosses into a ' +
        'module on its front door, modules, features and UI reaching only the ways they may, stores ' +
        'reached only by their modules, every page reachable and walked by a UI test. Run it after ' +
        'every change, before saying the work is done. Lists each mismatch as path:line and what is wrong.',
      inputSchema: { type: 'object', properties: {} },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'map',
      description:
        'This repo\'s codegraph map as JSON: its systems and their features (with the modules each ' +
        'uses and what triggers it), its modules (with their front doors and stores), pages, ' +
        'components, stores and their shapes, and the mismatches. Read it before deciding whether a ' +
        'request is a feature, a module, or UI, and where the work goes.',
      inputSchema: { type: 'object', properties: {} },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'open',
      description:
        'Open this repo\'s live codegraph map in a browser tab inside Claude Code. Call it when the ' +
        'person asks to see or open the map.',
      inputSchema: { type: 'object', properties: {} },
      isDeferred: false,
    })
    const started = await next(e)
    void refresh($)
    return started
  })

  on('command.run', { command: 'codegraph' }, async $ => ({ text: await openLive($) }))

  // The desktop app's slash menu lists skills, not the commands a mod
  // registers, so /codegraph:open reaches the map through this tool.
  on('tool.call', { tool: 'mcp__codegraph__open' as any }, async $ => ({ result: await openLive($) }))

  on('command.run', { command: 'codegraph-pane' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Codegraph' })
    void refresh($)
    return { text: 'Codegraph pane opened.' }
  })

  on('tool.call', { tool: 'mcp__codegraph__check' as any }, async $ => {
    const ran = await run($, ['--check'])
    void refresh($)
    return { result: (ran.stdout + ran.stderr).trim() || 'no output' }
  })

  on('tool.call', { tool: 'mcp__codegraph__map' as any }, async $ => {
    const summary = await refresh($)
    if (!summary) return { result: await read($, status) }
    const { views, issues, groups, ...rest } = summary
    return { result: JSON.stringify(rest, null, 1) }
  })

  // After a turn the code may have changed: read the map again.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      void refresh($)
      // the live page reloads itself once its server has read the code again
      if (mapUrl) void $.http.fetch(mapUrl + 'refresh', { method: 'POST' }).catch(() => undefined)
    }
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table: any = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const m = await read($, map)
    const problem = await read($, status)
    const n: Nav = (await read($, nav)) ?? START

    if (!m) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{problem || 'Reading the map...'}</Text>
        </Box>
      )
    }

    const here = current(n)
    const view = m.views[here] ?? m.views.map
    const flagged = new Set<string>()
    for (const i of m.issues) {
      if (i.card) flagged.add(i.card)
      if (i.file) flagged.add(i.file)
    }
    const picked = view?.nodes.find(c => c.id === n.selected)
    const titleOf = (id: string) => (id === 'map' ? 'Map' : id === 'pages' ? 'Pages' : m.views[id]?.title ?? id)
    const svg = table.Svg && view ? drawView(view, { selected: n.selected, zoom: n.zoom, cx: n.cx, cy: n.cy, flagged }) : ''

    // ---- the header: where the repo stands, and the ways out of the pane
    const head = (
      <Box key="head" flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Box flexDirection="column">
          <Text bold>{m.root}</Text>
          {m.source === 'draft' ? (
            <Text dimColor>Not set up yet: this map is a guess from folders. Run /codegraph:setup to tag the repo.</Text>
          ) : (
            <Text color={m.issues.length ? 'error' : 'success'}>
              {m.issues.length ? `${m.issues.length} mismatches` : 'Clean: the code matches its tags'}
              {m.unknown.length ? ` · ${m.unknown.length} cannot tell` : ''}
            </Text>
          )}
        </Box>
        <Box flexDirection="row" gap={1}>
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
          <Button key="open" label="Open in browser" onPress={() => openMap($)} />
        </Box>
      </Box>
    )

    // ---- where on the map: the two maps, and the trail into the cards
    const trail = (
      <Box key="trail" flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
        <Button key="tab-map" label="Map" variant={n.trail[0] === 'map' ? 'primary' : 'secondary'} onPress={() => tab($, 'map')} />
        {m.views.pages && (
          <Button key="tab-pages" label="Pages" variant={n.trail[0] === 'pages' ? 'primary' : 'secondary'} onPress={() => tab($, 'pages')} />
        )}
        {n.trail.length > 1 && <Button key="back" label="‹ Back" plain onPress={() => goTo($, n.trail.length - 2)} />}
        {n.trail.length > 1 &&
          n.trail.map((id, d) =>
            d === n.trail.length - 1 ? (
              <Text key={`at-${d}`} bold>{titleOf(id)}</Text>
            ) : (
              <Button key={`crumb-${d}`} plain dimColor label={`${titleOf(id)} ›`} onPress={() => goTo($, d)} />
            ),
          )}
      </Box>
    )

    // ---- the picture, and the controls that move it
    const picture = svg ? (
      <Box key="picture" flexDirection="column" gap={1}>
        <table.Svg source={svg} alt={`The codegraph ${titleOf(here)} of ${m.root}`} isInteractive />
        <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
          <Button key="pan-left" label="◀" onPress={() => pan($, -1, 0)} />
          <Button key="pan-up" label="▲" onPress={() => pan($, 0, -1)} />
          <Button key="pan-down" label="▼" onPress={() => pan($, 0, 1)} />
          <Button key="pan-right" label="▶" onPress={() => pan($, 1, 0)} />
          <Button key="zoom-out" label="−" onPress={() => zoom($, -1)} />
          <Button key="zoom-in" label="+" onPress={() => zoom($, 1)} />
          <Button key="fit" label="Fit" onPress={() => move($, () => ({ zoom: 1, cx: null, cy: null }))} />
          <Text dimColor>{n.zoom === 1 ? 'whole map' : `${n.zoom}×`} · hover a card for its details</Text>
        </Box>
      </Box>
    ) : table.Svg && view ? (
      <Text key="picture" dimColor>This view is too big to draw here; Open in browser shows all of it.</Text>
    ) : null

    // ---- the picked card: what it is, and what can be done with it
    const pickedIssues = picked ? m.issues.filter(i => i.card === picked.id || i.file === picked.id) : []
    const card = picked && (
      <Box key="card" flexDirection="column" gap={1} borderStyle="round" borderColor={pickedIssues.length ? 'error' : 'subtle'} paddingX={1}>
        <Box flexDirection="column">
          <Text bold>{picked.kind === 'file' ? picked.label : `${picked.kind} ${picked.label}`}{picked.start ? ' · start page' : ''}</Text>
          {picked.dir && <Text dimColor>{picked.dir}</Text>}
          {picked.door?.length ? <Text>Front door: {picked.door.join(', ')}</Text> : null}
          {picked.uses?.length ? <Text>Uses: {picked.uses.join(', ')}</Text> : null}
          {picked.route ? <Text>At {picked.route}</Text> : null}
          {picked.fields?.length ? <Text>{picked.fields.join(' · ')}</Text> : null}
          {pickedIssues.length > 0 && <Text color="error">{pickedIssues.length} mismatches here</Text>}
        </Box>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {m.views[picked.id] && <Button key="go-in" label="Open" variant="primary" onPress={() => goInto($, picked.id)} />}
          <Button key="ask-card" label="Ask about it" onPress={() => ask($, aboutCard(m, picked, here === 'map' ? '' : titleOf(here)))} />
          {pickedIssues.length > 0 && (
            <Button key="fix-card" label={pickedIssues.length === 1 ? 'Fix it' : `Fix all ${pickedIssues.length}`}
              onPress={() => ask($, fixMany(pickedIssues, `mismatches in ${picked.kind} ${picked.label}`))} />
          )}
          {table.Svg && <Button key="focus" label="Zoom to it" onPress={() => focusOn($, picked.id)} />}
          <Button key="unpick" label="Clear" plain dimColor onPress={() => pick($, picked.id)} />
        </Box>
      </Box>
    )

    // ---- every card in this view, to pick from
    const byKind = new Map<string, ViewNode[]>()
    for (const c of view?.nodes ?? []) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c])
    const cards = (
      <Box key="cards" flexDirection="column" gap={1}>
        {[...byKind].map(([kind, cs]) => (
          <Box key={`kind-${kind}`} flexDirection="column">
            <Text dimColor>{KIND_NAMES[kind] ?? kind}</Text>
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              {cs.sort((a, b) => a.label.localeCompare(b.label)).map(c => (
                <Button key={c.id} label={`${c.label}${flagged.has(c.id) ? ' ●' : ''}`}
                  variant={c.id === n.selected ? 'primary' : 'secondary'} onPress={() => pick($, c.id)} />
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    )

    const build = (
      <Box key="build" flexDirection="row" gap={1} flexWrap="wrap">
        <Button key="new-feature" label="+ Feature" onPress={() => ask($, 'Build a new feature: ')} />
        <Button key="new-module" label="+ Module" onPress={() => ask($, 'Add a new module: ')} />
        <Button key="new-page" label="+ Page" onPress={() => ask($, 'Add a new page: ')} />
      </Box>
    )

    // ---- the mismatches, by group, worst first; folded away on request
    const groups = m.groups.map(g => ({ ...g, issues: m.issues.filter(i => i.group === g.id) })).filter(g => g.issues.length)
    const issues = m.issues.length > 0 && (
      <Box key="issues" flexDirection="column" gap={1} borderStyle="round" borderColor="error" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Text bold color="error">Mismatches · {m.issues.length}</Text>
          <Box flexDirection="row" gap={1}>
            <Button key="fix-all" label={m.issues.length === 1 ? 'Fix it' : `Fix all ${m.issues.length}`} variant="primary"
              onPress={() => ask($, fixMany(m.issues, 'mismatches'))} />
            <Button key="issues-toggle" label={n.issuesOpen ? 'Hide' : 'Show'} onPress={() => toggleIssues($)} />
          </Box>
        </Box>
        {n.issuesOpen &&
          groups.map(g => {
            const open = !n.closed.includes(g.id)
            const all = n.more.includes(g.id)
            const shown = all ? g.issues : g.issues.slice(0, SHOWN)
            return (
              <Box key={`group-${g.id}`} flexDirection="column">
                <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
                  <Button key={`fold-${g.id}`} plain label={`${open ? '▾' : '▸'} ${g.label} · ${g.issues.length}`} onPress={() => fold($, 'closed', g.id)} />
                  {open && g.issues.length > 1 && (
                    <Button key={`fix-group-${g.id}`} plain dimColor label="Fix these"
                      onPress={() => ask($, fixMany(g.issues, `"${g.label}" mismatches`))} />
                  )}
                </Box>
                {open &&
                  shown.map(i => {
                    const k = m.issues.indexOf(i)
                    return (
                      <Box key={`issue-${k}`} flexDirection="row" gap={1} alignItems="center" justifyContent="space-between">
                        <Box flexDirection="column" flexShrink={1}>
                          <Text>{i.text}</Text>
                          <Text dimColor>{i.rel}{i.line ? `:${i.line}` : ''}</Text>
                        </Box>
                        <Box flexDirection="row" gap={1}>
                          {i.card && <Button key={`show-${k}`} label="Show" plain onPress={() => showIssue($, i)} />}
                          <Button key={`fix-${k}`} label="Fix" onPress={() => ask($, fixOne(i))} />
                        </Box>
                      </Box>
                    )
                  })}
                {open && g.issues.length > SHOWN && (
                  <Button key={`more-${g.id}`} plain dimColor label={all ? 'Show fewer' : `Show ${g.issues.length - SHOWN} more`}
                    onPress={() => fold($, 'more', g.id)} />
                )}
              </Box>
            )
          })}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        {head}
        {issues}
        {trail}
        {picture}
        {card}
        {cards}
        {build}
      </Box>
    )
  })
}
