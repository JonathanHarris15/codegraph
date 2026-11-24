// codegraph: tooling
// Run by `npm version`: the plugin is released with the app, so its version is
// the app's (ADR 0037).
import { readFileSync, writeFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const file = 'plugin/.claude-plugin/plugin.json'
const plugin = JSON.parse(readFileSync(file, 'utf8'))
writeFileSync(file, JSON.stringify({ ...plugin, version }, null, 2) + '\n')
