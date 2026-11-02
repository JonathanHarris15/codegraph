// codegraph: shell
import { contextBridge, ipcRenderer } from 'electron'
import type { Connected } from '../features/connect-github.js'
import type { CloudView } from '../features/list-github-codebases.js'
import type { ProjectView } from '../features/list-projects.js'
import type { Linked } from '../features/link-codebase.js'

/** What the window may ask for: one call per feature, nothing else. */
export type Api = {
  listProjects: (fetchFirst?: boolean) => Promise<ProjectView[]>
  createProject: (name: string) => Promise<{ id: string }>
  linkCodebase: (projectId: string, path?: string) => Promise<Linked>
  connectGithub: (token: string) => Promise<Connected>
  signOutGithub: () => Promise<void>
  listGithubCodebases: () => Promise<CloudView>
}

const api: Api = {
  listProjects: (fetchFirst = false) => ipcRenderer.invoke('projects:list', fetchFirst),
  createProject: (name) => ipcRenderer.invoke('projects:create', name),
  linkCodebase: (projectId, path) => ipcRenderer.invoke('codebase:link', projectId, path),
  connectGithub: (token) => ipcRenderer.invoke('github:connect', token),
  signOutGithub: () => ipcRenderer.invoke('github:signOut'),
  listGithubCodebases: () => ipcRenderer.invoke('github:list'),
}

contextBridge.exposeInMainWorld('codegraph', api)

declare global {
  interface Window {
    codegraph: Api
  }
}
