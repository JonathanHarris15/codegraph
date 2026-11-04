// codegraph: shell
import { contextBridge, ipcRenderer } from 'electron'
import type { AgentConnection } from '../features/connect-agent.js'
import type { Connected } from '../features/connect-github.js'
import type { CloudView } from '../features/list-github-software-systems.js'
import type { ProjectView } from '../features/list-projects.js'
import type { Linked } from '../features/link-software-system.js'
import type { MockupAdded } from '../features/add-mockup.js'
import type { ProposalMockupAdded } from '../features/add-proposal-mockup.js'
import type { ProposalOpened } from '../features/open-proposal.js'
import type { ProposalSaved } from '../features/save-proposal.js'
import type { SketchListed } from '../features/list-sketches.js'
import type { Switched } from '../features/switch-branch.js'
import type { SketchOpened } from '../features/open-sketch.js'
import type { Card, MapShown } from '../features/show-map.js'
import type { DrawnCard, Point } from '../modules/reader/index.js'
import type { Layer } from '../modules/annotations/index.js'
import type { Sketch } from '../modules/sketches/index.js'

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
  switchBranch: (projectId: string, systemId: string, branch: string) => Promise<Switched>
  chooseBranch: (projectId: string, systemId: string, branch: string) => Promise<void>
  showAnnotations: (projectId: string) => Promise<Layer[]>
  saveAnnotations: (projectId: string, layers: Layer[]) => Promise<void>
  listSketches: (projectId: string) => Promise<SketchListed[]>
  startSketch: (projectId: string, name: string, snapshot?: Card) => Promise<Sketch>
  openSketch: (projectId: string, sketchId: string) => Promise<SketchOpened | null>
  saveSketch: (sketch: Sketch) => Promise<Sketch>
  deleteSketch: (projectId: string, sketchId: string) => Promise<void>
  addMockup: (projectId: string, sketchId: string, cardId: string) => Promise<MockupAdded>
  openProposal: (projectId: string, systemId: string, branch?: string) => Promise<ProposalOpened>
  saveProposal: (projectId: string, systemId: string, draft: DrawnCard, says: string) => Promise<ProposalSaved>
  addProposalMockup: (projectId: string, systemId: string, page: string) => Promise<ProposalMockupAdded>
  /** Calls back whenever the project's map may have changed; hands back how
   *  to stop. One project is watched at a time. */
  watchProject: (projectId: string, onChange: () => void) => () => void
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
  switchBranch: (projectId, systemId, branch) => ipcRenderer.invoke('branch:switch', projectId, systemId, branch),
  chooseBranch: (projectId, systemId, branch) => ipcRenderer.invoke('branch:choose', projectId, systemId, branch),
  showAnnotations: (projectId) => ipcRenderer.invoke('annotations:show', projectId),
  saveAnnotations: (projectId, layers) => ipcRenderer.invoke('annotations:save', projectId, layers),
  listSketches: (projectId) => ipcRenderer.invoke('sketch:list', projectId),
  startSketch: (projectId, name, snapshot) => ipcRenderer.invoke('sketch:start', projectId, name, snapshot),
  openSketch: (projectId, sketchId) => ipcRenderer.invoke('sketch:open', projectId, sketchId),
  saveSketch: (sketch) => ipcRenderer.invoke('sketch:save', sketch),
  deleteSketch: (projectId, sketchId) => ipcRenderer.invoke('sketch:delete', projectId, sketchId),
  addMockup: (projectId, sketchId, cardId) => ipcRenderer.invoke('sketch:mockup', projectId, sketchId, cardId),
  openProposal: (projectId, systemId, branch) => ipcRenderer.invoke('proposal:open', projectId, systemId, branch),
  saveProposal: (projectId, systemId, draft, says) => ipcRenderer.invoke('proposal:save', projectId, systemId, draft, says),
  addProposalMockup: (projectId, systemId, page) => ipcRenderer.invoke('proposal:mockup', projectId, systemId, page),
  watchProject: (projectId, onChange) => {
    const heard = (): void => onChange()
    ipcRenderer.on('project:changed', heard)
    void ipcRenderer.invoke('project:watch', projectId)
    return () => {
      ipcRenderer.off('project:changed', heard)
      void ipcRenderer.invoke('project:watch', '')
    }
  },
}

contextBridge.exposeInMainWorld('codegraph', api)

declare global {
  interface Window {
    codegraph: Api
  }
}
