// codegraph: shell
import { contextBridge, ipcRenderer } from 'electron'
import type { AgentConnection } from '../features/connect-agent.js'
import type { Connected } from '../features/connect-github.js'
import type { CloudView } from '../features/list-github-software-systems.js'
import type { ProjectView } from '../features/list-projects.js'
import type { Linked } from '../features/link-software-system.js'
import type { MapShown } from '../features/show-map.js'
import type { Point } from '../modules/reader/index.js'

/** What the window may ask for: one call per feature, nothing else. */
export type Api = {
  listProjects: (fetchFirst?: boolean) => Promise<ProjectView[]>
  createProject: (name: string, shortName?: string) => Promise<{ id: string }>
  linkSoftwareSystem: (projectId: string, path?: string) => Promise<Linked>
  connectGithub: (token: string) => Promise<Connected>
  connectAgent: () => Promise<AgentConnection>
  agreeShallowSystem: (projectId: string, name: string, sameAs?: string) => Promise<{ id: string }>
  signOutGithub: () => Promise<void>
  listGithubSoftwareSystems: () => Promise<CloudView>
  showMap: (projectId: string, points?: Record<string, Point>) => Promise<MapShown>
  listPoints: (projectId: string, systemId: string) => Promise<Point[]>
}

const api: Api = {
  listProjects: (fetchFirst = false) => ipcRenderer.invoke('projects:list', fetchFirst),
  createProject: (name, shortName) => ipcRenderer.invoke('projects:create', name, shortName),
  linkSoftwareSystem: (projectId, path) => ipcRenderer.invoke('system:link', projectId, path),
  connectGithub: (token) => ipcRenderer.invoke('github:connect', token),
  connectAgent: () => ipcRenderer.invoke('agent:connect'),
  agreeShallowSystem: (projectId, name, sameAs = '') => ipcRenderer.invoke('shallow:agree', projectId, name, sameAs),
  signOutGithub: () => ipcRenderer.invoke('github:signOut'),
  listGithubSoftwareSystems: () => ipcRenderer.invoke('github:list'),
  showMap: (projectId, points = {}) => ipcRenderer.invoke('map:show', projectId, points),
  listPoints: (projectId, systemId) => ipcRenderer.invoke('map:points', projectId, systemId),
}

contextBridge.exposeInMainWorld('codegraph', api)

declare global {
  interface Window {
    codegraph: Api
  }
}
