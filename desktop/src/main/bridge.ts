// codegraph: shell
import { ipcMain } from 'electron'
import { agreeShallowSystem } from '../features/agree-shallow-system.js'
import { connectAgent } from '../features/connect-agent.js'
import { connectGithub } from '../features/connect-github.js'
import { createProject } from '../features/create-project.js'
import { listPoints } from '../features/list-points.js'
import { listGithubSoftwareSystems } from '../features/list-github-software-systems.js'
import { listProjects } from '../features/list-projects.js'
import { linkSoftwareSystem } from '../features/link-software-system.js'
import { showMap } from '../features/show-map.js'
import { signOutGithub } from '../features/sign-out-github.js'
import type { Point } from '../modules/reader/index.js'

/** The only crossing between the window and the features. Each channel is
 *  one feature; nothing is done here but handing the call over. */
export const openBridge = (): void => {
  ipcMain.handle('projects:list', (_event, fetchFirst: boolean) => listProjects(fetchFirst))
  ipcMain.handle('projects:create', (_event, name: string, shortName?: string) =>
    createProject(name, shortName),
  )
  ipcMain.handle('system:link', (_event, projectId: string, path?: string) =>
    linkSoftwareSystem(projectId, path),
  )
  ipcMain.handle('agent:connect', () => connectAgent())
  ipcMain.handle('shallow:agree', (_event, projectId: string, name: string, sameAs: string) =>
    agreeShallowSystem(projectId, name, sameAs),
  )
  ipcMain.handle('github:connect', (_event, token: string) => connectGithub(token))
  ipcMain.handle('github:signOut', () => signOutGithub())
  ipcMain.handle('github:list', () => listGithubSoftwareSystems())
  ipcMain.handle('map:show', (_event, projectId: string, points: Record<string, Point>) =>
    showMap(projectId, points),
  )
  ipcMain.handle('map:points', (_event, projectId: string, systemId: string) =>
    listPoints(projectId, systemId),
  )
}
