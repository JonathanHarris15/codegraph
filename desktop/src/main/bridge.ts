// codegraph: shell
import { ipcMain } from 'electron'
import { connectGithub } from '../features/connect-github.js'
import { createProject } from '../features/create-project.js'
import { listGithubCodebases } from '../features/list-github-codebases.js'
import { listProjects } from '../features/list-projects.js'
import { linkCodebase } from '../features/link-codebase.js'
import { signOutGithub } from '../features/sign-out-github.js'

/** The only crossing between the window and the features. Each channel is
 *  one feature; nothing is done here but handing the call over. */
export const openBridge = (): void => {
  ipcMain.handle('projects:list', (_event, fetchFirst: boolean) => listProjects(fetchFirst))
  ipcMain.handle('projects:create', (_event, name: string) => createProject(name))
  ipcMain.handle('codebase:link', (_event, projectId: string, path?: string) =>
    linkCodebase(projectId, path),
  )
  ipcMain.handle('github:connect', (_event, token: string) => connectGithub(token))
  ipcMain.handle('github:signOut', () => signOutGithub())
  ipcMain.handle('github:list', () => listGithubCodebases())
}
