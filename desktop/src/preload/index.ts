// codegraph: shell
import { contextBridge, ipcRenderer } from 'electron'
import type { Features } from '../main/bridge.js'
import type { RoomNow } from '../features/join-room.js'

/** Each feature, as the window asks for it: the same call, answered later. */
type Asked = { [Name in keyof Features]: (...args: Parameters<Features[Name]>) => Promise<Awaited<ReturnType<Features[Name]>>> }

/** What the window may ask for: one call per feature, nothing else. */
export type Api = Asked & {
  /** Calls back whenever the project's map may have changed; hands back how
   *  to stop. One project is watched at a time. */
  watchProject: (projectId: string, onChange: () => void) => () => void
  /** Calls back whenever a library's sketches change on this computer, or an
   *  agent drawing there moves; hands back how to stop. One library at a time. */
  watchSketches: (library: string, onChange: () => void) => () => void
  /** Goes where others can be seen, hearing them until left; '' leaves. */
  joinRoom: (id: string, heard: (now: RoomNow) => void) => Promise<boolean>
  /** Calls back when something changed online; hands back how to stop. */
  heardChange: (onChange: (what: { projectId: string; path: string }) => void) => () => void
}

/** The features by name. The window cannot reach the bridge's own list, so it
 *  is written again here, and the type says if the two ever differ. */
const NAMES: Record<keyof Features, true> = {
  listProjects: true,
  createProject: true,
  linkSoftwareSystem: true,
  connectGithub: true,
  connectAgent: true,
  agreeShallowSystem: true,
  signOutGithub: true,
  listGithubSoftwareSystems: true,
  showMap: true,
  listPoints: true,
  switchBranch: true,
  chooseBranch: true,
  changeToken: true,
  reachDevServer: true,
  showAnnotations: true,
  saveAnnotations: true,
  showInstructions: true,
  editInstructions: true,
  resetInstructions: true,
  showCardTypes: true,
  saveCardTypes: true,
  showArrangement: true,
  saveArrangement: true,
  listSketches: true,
  listFolders: true,
  makeFolder: true,
  renameFolder: true,
  moveFolder: true,
  deleteFolder: true,
  fileSketch: true,
  startSketch: true,
  openSketch: true,
  saveSketch: true,
  deleteSketch: true,
  addMockup: true,
  showSession: true,
  checkForUpdate: true,
  startSignIn: true,
  finishSignIn: true,
  putProjectOnline: true,
  inviteMember: true,
  changeRole: true,
  removeMember: true,
  handOverProject: true,
  deleteProject: true,
  renameProject: true,
  refreshGithub: true,
  listRevisions: true,
  restoreRevision: true,
  listMySketches: true,
  moveSketch: true,
  copySketch: true,
  shareSketch: true,
  sayWhere: true,
  holdThings: true,
  letGoOfThings: true,
  sayLooking: true,
  showAgents: true,
}

const asked = Object.fromEntries(
  Object.keys(NAMES).map((name) => [name, (...args: unknown[]) => ipcRenderer.invoke(name, ...args)]),
) as Asked

const api: Api = {
  ...asked,
  watchProject: (projectId, onChange) => {
    const heard = (): void => onChange()
    ipcRenderer.on('project:changed', heard)
    void ipcRenderer.invoke('watchProject', projectId)
    return () => {
      ipcRenderer.off('project:changed', heard)
      void ipcRenderer.invoke('watchProject', '')
    }
  },
  watchSketches: (library, onChange) => {
    const heard = (): void => onChange()
    ipcRenderer.on('sketches:changed', heard)
    void ipcRenderer.invoke('watchSketches', library)
    return () => {
      ipcRenderer.off('sketches:changed', heard)
      void ipcRenderer.invoke('watchSketches', '')
    }
  },
  joinRoom: (id, heard) => {
    ipcRenderer.removeAllListeners('room:now')
    ipcRenderer.on('room:now', (_event, now: RoomNow) => heard(now))
    return ipcRenderer.invoke('joinRoom', id)
  },
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
