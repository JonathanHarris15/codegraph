// codegraph: shell
import { contextBridge, ipcRenderer } from 'electron'
import type { AgentConnection } from '../features/connect-agent.js'
import type { Connected } from '../features/connect-github.js'
import type { CloudView } from '../features/list-github-software-systems.js'
import type { ProjectView } from '../features/list-projects.js'
import type { Linked } from '../features/link-software-system.js'
import type { MockupAdded } from '../features/add-mockup.js'
import type { SketchListed } from '../features/list-sketches.js'
import type { SketchFolder } from '../features/list-folders.js'
import type { FolderDone } from '../features/make-folder.js'
import type { Switched } from '../features/switch-branch.js'
import type { SketchOpened } from '../features/open-sketch.js'
import type { Card, MapShown } from '../features/show-map.js'
import type { Point } from '../modules/reader/index.js'
import type { Changed } from '../features/invite-member.js'
import type { LooseListed } from '../features/list-my-sketches.js'
import type { Revision } from '../features/list-revisions.js'
import type { RoomNow } from '../features/join-room.js'
import type { Whereabouts } from '../features/say-where.js'
import type { Session } from '../features/show-session.js'
import type { SignInStarted } from '../features/start-sign-in.js'
import type { DeviceSignIn } from '../modules/github/index.js'
import type { Role } from '../modules/members/index.js'
import type { Layer } from '../modules/annotations/index.js'
import type { Arrangement } from '../modules/arrangements/index.js'
import type { CardType } from '../modules/card-types/index.js'
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
  showAnnotations: (projectId: string, points?: Record<string, Point>) => Promise<Layer[]>
  saveAnnotations: (projectId: string, layers: Layer[], points?: Record<string, Point>, seen?: Layer[]) => Promise<Layer[]>
  showCardTypes: () => Promise<CardType[]>
  saveCardTypes: (types: CardType[]) => Promise<void>
  showArrangement: (projectId: string, points?: Record<string, Point>) => Promise<Arrangement>
  saveArrangement: (projectId: string, arrangement: Arrangement, points?: Record<string, Point>, seen?: Arrangement) => Promise<Arrangement>
  listSketches: (projectId: string) => Promise<SketchListed[]>
  listFolders: (library: string) => Promise<SketchFolder[]>
  makeFolder: (library: string, name: string, parentId: string) => Promise<FolderDone>
  renameFolder: (library: string, id: string, name: string) => Promise<FolderDone>
  moveFolder: (library: string, id: string, parentId: string) => Promise<FolderDone>
  deleteFolder: (library: string, id: string) => Promise<FolderDone>
  fileSketch: (library: string, sketchId: string, folderId: string) => Promise<FolderDone>
  startSketch: (projectId: string, name: string, snapshot?: Card) => Promise<Sketch>
  openSketch: (projectId: string, sketchId: string) => Promise<SketchOpened | null>
  saveSketch: (sketch: Sketch, seen?: Sketch) => Promise<Sketch>
  deleteSketch: (projectId: string, sketchId: string) => Promise<void>
  addMockup: (projectId: string, sketchId: string, cardId: string) => Promise<MockupAdded>
  /** Calls back whenever the project's map may have changed; hands back how
   *  to stop. One project is watched at a time. */
  watchProject: (projectId: string, onChange: () => void) => () => void
  showSession: () => Promise<Session>
  startSignIn: () => Promise<SignInStarted>
  finishSignIn: (started: DeviceSignIn) => Promise<Connected>
  putProjectOnline: (projectId: string) => Promise<Changed>
  inviteMember: (projectId: string, login: string, role: Exclude<Role, 'owner'>) => Promise<Changed>
  changeRole: (projectId: string, memberId: string, role: Exclude<Role, 'owner'>) => Promise<Changed>
  removeMember: (projectId: string, memberId: string) => Promise<Changed>
  handOverProject: (projectId: string, memberId: string) => Promise<Changed>
  deleteProject: (projectId: string) => Promise<Changed>
  renameProject: (projectId: string, name: string) => Promise<Changed>
  refreshGithub: (projectId: string) => Promise<void>
  listRevisions: (projectId: string) => Promise<Revision[]>
  restoreRevision: (projectId: string, revisionId: string) => Promise<Changed>
  listMySketches: () => Promise<LooseListed[]>
  moveSketch: (sketchId: string, projectId: string) => Promise<Changed>
  copySketch: (projectId: string, sketchId: string) => Promise<Sketch | null>
  shareSketch: (sketchId: string, login: string, role: 'collaborator' | 'viewer') => Promise<Changed>
  /** Goes where others can be seen, hearing them until left; '' leaves. */
  joinRoom: (id: string, heard: (now: RoomNow) => void) => Promise<boolean>
  sayWhere: (where: Whereabouts) => Promise<void>
  holdThings: (items: string[]) => Promise<{ ok: boolean; taken: string[] }>
  letGoOfThings: (items?: string[]) => Promise<void>
  /** Calls back when something changed online; hands back how to stop. */
  heardChange: (onChange: (what: { projectId: string; path: string }) => void) => () => void
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
  showAnnotations: (projectId, points = {}) => ipcRenderer.invoke('annotations:show', projectId, points),
  saveAnnotations: (projectId, layers, points = {}, seen) => ipcRenderer.invoke('annotations:save', projectId, layers, points, seen),
  showCardTypes: () => ipcRenderer.invoke('card-types:show'),
  saveCardTypes: (types) => ipcRenderer.invoke('card-types:save', types),
  showArrangement: (projectId, points = {}) => ipcRenderer.invoke('arrangement:show', projectId, points),
  saveArrangement: (projectId, arrangement, points = {}, seen) => ipcRenderer.invoke('arrangement:save', projectId, arrangement, points, seen),
  listSketches: (projectId) => ipcRenderer.invoke('sketch:list', projectId),
  listFolders: (library) => ipcRenderer.invoke('folder:list', library),
  makeFolder: (library, name, parentId) => ipcRenderer.invoke('folder:make', library, name, parentId),
  renameFolder: (library, id, name) => ipcRenderer.invoke('folder:rename', library, id, name),
  moveFolder: (library, id, parentId) => ipcRenderer.invoke('folder:move', library, id, parentId),
  deleteFolder: (library, id) => ipcRenderer.invoke('folder:delete', library, id),
  fileSketch: (library, sketchId, folderId) => ipcRenderer.invoke('sketch:file', library, sketchId, folderId),
  startSketch: (projectId, name, snapshot) => ipcRenderer.invoke('sketch:start', projectId, name, snapshot),
  openSketch: (projectId, sketchId) => ipcRenderer.invoke('sketch:open', projectId, sketchId),
  saveSketch: (sketch, seen) => ipcRenderer.invoke('sketch:save', sketch, seen),
  deleteSketch: (projectId, sketchId) => ipcRenderer.invoke('sketch:delete', projectId, sketchId),
  addMockup: (projectId, sketchId, cardId) => ipcRenderer.invoke('sketch:mockup', projectId, sketchId, cardId),
  watchProject: (projectId, onChange) => {
    const heard = (): void => onChange()
    ipcRenderer.on('project:changed', heard)
    void ipcRenderer.invoke('project:watch', projectId)
    return () => {
      ipcRenderer.off('project:changed', heard)
      void ipcRenderer.invoke('project:watch', '')
    }
  },
  showSession: () => ipcRenderer.invoke('session:show'),
  startSignIn: () => ipcRenderer.invoke('session:start'),
  finishSignIn: (started) => ipcRenderer.invoke('session:finish', started),
  putProjectOnline: (projectId) => ipcRenderer.invoke('project:online', projectId),
  inviteMember: (projectId, login, role) => ipcRenderer.invoke('project:invite', projectId, login, role),
  changeRole: (projectId, memberId, role) => ipcRenderer.invoke('project:role', projectId, memberId, role),
  removeMember: (projectId, memberId) => ipcRenderer.invoke('project:remove', projectId, memberId),
  handOverProject: (projectId, memberId) => ipcRenderer.invoke('project:handOver', projectId, memberId),
  deleteProject: (projectId) => ipcRenderer.invoke('project:delete', projectId),
  renameProject: (projectId, name) => ipcRenderer.invoke('project:rename', projectId, name),
  refreshGithub: (projectId) => ipcRenderer.invoke('github:refresh', projectId),
  listRevisions: (projectId) => ipcRenderer.invoke('revisions:list', projectId),
  restoreRevision: (projectId, revisionId) => ipcRenderer.invoke('revisions:restore', projectId, revisionId),
  listMySketches: () => ipcRenderer.invoke('sketches:mine'),
  moveSketch: (sketchId, projectId) => ipcRenderer.invoke('sketch:move', sketchId, projectId),
  copySketch: (projectId, sketchId) => ipcRenderer.invoke('sketch:copy', projectId, sketchId),
  shareSketch: (sketchId, login, role) => ipcRenderer.invoke('sketch:share', sketchId, login, role),
  joinRoom: (id, heard) => {
    ipcRenderer.removeAllListeners('room:now')
    ipcRenderer.on('room:now', (_event, now: RoomNow) => heard(now))
    return ipcRenderer.invoke('room:join', id)
  },
  sayWhere: (where) => ipcRenderer.invoke('room:say', where),
  holdThings: (items) => ipcRenderer.invoke('room:hold', items),
  letGoOfThings: (items) => ipcRenderer.invoke('room:letGo', items),
  heardChange: (onChange) => {
    const heard = (_event: unknown, what: { projectId: string; path: string }): void => onChange(what)
    ipcRenderer.on('cloud:changed', heard)
    return () => ipcRenderer.off('cloud:changed', heard)
  },
}

contextBridge.exposeInMainWorld('codegraph', api)

declare global {
  interface Window {
    codegraph: Api
  }
}
