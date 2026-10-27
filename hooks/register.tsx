// codegraph: start page pane
// The codegraph mod: the map of this repo in a pane beside the chat, a
// check the model runs after every change, and a way to point the chat at
// one feature, module or page with a click.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Summary } from '../types'

const PANE = 'codegraph'
const map = atom({ plugin: 'codegraph', key: 'map' } as const, null as Summary | null)
const status = atom({ plugin: 'codegraph', key: 'status' } as const, '')

const PYTHONS = ['python', 'python3', 'py']
const MAP_PAGE = '.codegraph/map.html'

let cwd = ''
let python = ''

async function run($: any, args: string[], timeoutMs = 120000) {
  if (!python) {
    for (const p of PYTHONS) {
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
  }
  if (!python) {
    return { exitCode: 127, stdout: '', stderr: 'codegraph needs Python 3.10 or newer on the PATH' }
  }
  return $.process.run([python, `${$.plugin.root}/codegraph.py`, cwd, ...args], { timeoutMs })
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
  return summary
}

// Put a prompt in the box, after anything already typed there.
async function ask($: any, text: string) {
  const { text: draft } = await $.prompt.read()
  await $.prompt.fill({ text: draft.trim() ? `\n${text}` : text, mode: draft.trim() ? 'append' : 'replace' })
}

async function openMap($: any) {
  const ran = await run($, ['-o', `${cwd}/${MAP_PAGE}`])
  if (ran.exitCode !== 0) {
    $.ui.toast('Could not draw the map: ' + (ran.stderr.trim().split('\n').pop() ?? ''))
    return
  }
  await $.process.run([python, '-c', 'import sys, pathlib, webbrowser; webbrowser.open(pathlib.Path(sys.argv[1]).resolve().as_uri())', `${cwd}/${MAP_PAGE}`])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    await $.command.register({ name: 'codegraph', description: 'Show this repo\'s codegraph map beside the chat' })
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
    const started = await next(e)
    void refresh($).then(summary => {
      if (summary?.source === 'tags') void $.ui.open({ id: PANE, title: 'Codegraph' })
    })
    return started
  })

  on('command.run', { command: 'codegraph' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Codegraph' })
    void refresh($)
    return { text: 'Codegraph pane opened.' }
  })

  on('tool.call', { tool: 'mcp__codegraph__check' }, async $ => {
    const ran = await run($, ['--check'])
    void refresh($)
    return { result: (ran.stdout + ran.stderr).trim() || 'no output' }
  })

  on('tool.call', { tool: 'mcp__codegraph__map' }, async $ => {
    const summary = await refresh($)
    if (!summary) return { result: await read($, status) }
    const { svg, ...rest } = summary
    return { result: JSON.stringify(rest, null, 1) }
  })

  // After a turn the code may have changed: read the map again.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && cwd) void refresh($)
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table: any = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const m = await read($, map)
    const problem = await read($, status)

    if (!m) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{problem || 'Reading the map...'}</Text>
        </Box>
      )
    }

    const shown = m.mismatches.slice(0, 8)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>{m.root}</Text>
          {m.source === 'draft' ? (
            <Text dimColor>Not set up yet: this is a guess from folders. Run /codegraph:setup to tag the repo.</Text>
          ) : (
            <Text color={m.mismatches.length ? 'red' : 'green'}>
              {m.mismatches.length ? `${m.mismatches.length} mismatches` : 'Clean: the code matches its tags'}
              {m.unknown.length ? ` · ${m.unknown.length} cannot tell` : ''}
            </Text>
          )}
        </Box>

        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="new-feature" label="New feature" onPress={() => ask($, 'Build a new feature: ')} />
          <Button key="new-module" label="New module" onPress={() => ask($, 'Add a new module: ')} />
          <Button key="new-page" label="New page" onPress={() => ask($, 'Add a new page: ')} />
          {m.mismatches.length > 0 && (
            <Button key="fix" label="Fix the next mismatch" variant="primary" onPress={() => ask($, '/codegraph:fix')} />
          )}
          <Button key="open" label="Open full map" onPress={() => openMap($)} />
          <Button key="refresh" label="Refresh" dimColor onPress={() => refresh($)} />
        </Box>

        {table.Svg && m.svg && <table.Svg source={m.svg} alt={`The codegraph map of ${m.root}`} />}

        {m.systems.map(s => (
          <Box key={`system-${s.name}`} flexDirection="column">
            <Text bold>System {s.name}</Text>
            {s.features.map(f => (
              <Button
                key={f.id}
                plain
                label={`${f.name}  ·  uses ${f.uses.join(', ') || 'nothing'}${f.triggers.length ? '  ·  ' + f.triggers.join(', ') : ''}`}
                onPress={() =>
                  ask($, `About the ${f.name} feature (system ${s.name}; uses ${f.uses.join(', ') || 'no modules'}; ` +
                    `files ${f.files.join(', ')}): `)
                }
              />
            ))}
          </Box>
        ))}

        {m.modules.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Modules</Text>
            {m.modules.map(u => (
              <Button
                key={u.id}
                plain
                label={`${u.name}  ·  front door ${u.door?.join(', ') || 'empty'}${u.stores?.length ? '  ·  owns ' + u.stores.join(', ') : ''}`}
                onPress={() =>
                  ask($, `About the ${u.name} module (front door ${u.door?.join(', ') || 'empty'}; files ${u.files.join(', ')}): `)
                }
              />
            ))}
          </Box>
        )}

        {m.pages.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Pages</Text>
            {m.pages.map(u => (
              <Button
                key={u.id}
                plain
                label={`${u.name}  ·  ${u.route || 'no route'}${u.start ? '  ·  start' : ''}`}
                onPress={() => ask($, `About the ${u.name} page (at ${u.route || 'no route'}; files ${u.files.join(', ')}): `)}
              />
            ))}
          </Box>
        )}

        {m.stores.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Stores</Text>
            {m.stores.map(s => (
              <Text key={s.id} dimColor>
                {s.name} ({s.owner.replace('module:', '')}): {s.fields.join(', ') || 'no schema read'}
              </Text>
            ))}
          </Box>
        )}

        {shown.length > 0 && (
          <Box flexDirection="column">
            <Text bold color="red">Mismatches</Text>
            {shown.map((line, i) => (
              <Button key={`mismatch-${i}`} plain dimColor label={line} onPress={() => ask($, `Fix this codegraph mismatch: ${line}`)} />
            ))}
            {m.mismatches.length > shown.length && (
              <Text dimColor>and {m.mismatches.length - shown.length} more; the full map lists them all</Text>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
