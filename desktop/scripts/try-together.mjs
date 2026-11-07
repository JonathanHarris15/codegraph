// codegraph: tooling
// Opens two windows of the built app, as two members on one shared project, with a
// folder standing in for Firebase. For trying working together on one computer.
// Add a repo with its "+ Link" button, and press Ctrl+C here to close them.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const folder = join(homedir(), '.codegraph-try-together')
const online = join(folder, 'online')
const members = [
  { id: 'try-ana', login: 'ana', name: 'Ana', avatar: '' },
  { id: 'try-ben', login: 'ben', name: 'Ben', avatar: '' },
]

for (const member of members) {
  const home = join(folder, member.login)
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'member.json'), JSON.stringify(member))
}

const project = join(online, 'docs', 'projects', 'try-together.json')
if (!existsSync(project)) {
  mkdirSync(join(online, 'docs', 'projects'), { recursive: true })
  writeFileSync(
    project,
    JSON.stringify({
      id: 'try-together',
      name: 'Trying it together',
      shortName: 'try-together',
      createdAt: new Date().toISOString(),
      ownerId: 'try-ana',
      members: [
        { ...members[0], role: 'owner' },
        { ...members[1], role: 'collaborator' },
      ],
      memberIds: members.map((m) => m.id),
      roles: { 'try-ana': 'owner', 'try-ben': 'collaborator' },
      systems: [],
      shallow: [],
    }),
  )
}

if (process.argv.includes('--set-up-only')) process.exit(0)

const electron = createRequire(import.meta.url)('electron')
const windows = members.map((member) =>
  spawn(electron, ['.', `--user-data-dir=${join(folder, member.login)}`], {
    cwd: resolve(import.meta.dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, CODEGRAPH_CLOUD_FOLDER: online },
  }),
)
process.on('SIGINT', () => windows.forEach((window) => window.kill()))
