// codegraph: shell
// Starts the codegraph MCP of the app installed on this computer, never one of
// its own, so an agent always talks to the app it sees, and tells it which
// version of the skills started it (ADR 0037). The app says where its MCP is,
// in codegraph's folder, each time it opens (ADR 0026).
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const home = process.env.CODEGRAPH_HOME || join(homedir(), '.codegraph')
const read = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const app = read(join(home, 'mcp.json'))
if (!app || typeof app.file !== 'string') {
  process.stderr.write('Open the codegraph app once on this computer, so it can say where its MCP is. Then start a new session.\n')
  process.exit(1)
}
if (!existsSync(app.file)) {
  process.stderr.write(`The codegraph app said its MCP is at ${app.file}, which is not there. Open the codegraph app again, then start a new session.\n`)
  process.exit(1)
}

process.env.CODEGRAPH_PLUGIN_VERSION = read(join(here, '.claude-plugin', 'plugin.json'))?.version ?? ''
await import(pathToFileURL(app.file).href)
