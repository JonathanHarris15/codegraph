// codegraph: shell
import { ipcMain } from 'electron'
import { addMockup } from '../features/add-mockup.js'
import { agreeShallowSystem } from '../features/agree-shallow-system.js'
import { changeRole } from '../features/change-role.js'
import { changeToken } from '../features/change-token.js'
import { checkForUpdate } from '../features/check-for-update.js'
import { reachDevServer } from '../features/reach-dev-server.js'
import { chooseBranch } from '../features/choose-branch.js'
import { connectAgent } from '../features/connect-agent.js'
import { connectGithub } from '../features/connect-github.js'
import { copySketch } from '../features/copy-sketch.js'
import { createProject } from '../features/create-project.js'
import { deleteFolder } from '../features/delete-folder.js'
import { deleteProject } from '../features/delete-project.js'
import { deleteSketch } from '../features/delete-sketch.js'
import { editInstructions } from '../features/edit-instructions.js'
import { fileSketch } from '../features/file-sketch.js'
import { finishSignIn } from '../features/finish-sign-in.js'
import { handOverProject } from '../features/hand-over-project.js'
import { holdThings, letGoOfThings } from '../features/hold-thing.js'
import { inviteMember } from '../features/invite-member.js'
import { joinRoom } from '../features/join-room.js'
import { linkSoftwareSystem } from '../features/link-software-system.js'
import { listFolders } from '../features/list-folders.js'
import { listGithubSoftwareSystems } from '../features/list-github-software-systems.js'
import { listMySketches } from '../features/list-my-sketches.js'
import { listPoints } from '../features/list-points.js'
import { listProjects } from '../features/list-projects.js'
import { listRevisions } from '../features/list-revisions.js'
import { listSketches } from '../features/list-sketches.js'
import { makeFolder } from '../features/make-folder.js'
import { moveFolder } from '../features/move-folder.js'
import { moveSketch } from '../features/move-sketch.js'
import { openSketch } from '../features/open-sketch.js'
import { putProjectOnline } from '../features/put-project-online.js'
import { refreshGithub } from '../features/refresh-github.js'
import { removeMember } from '../features/remove-member.js'
import { renameFolder } from '../features/rename-folder.js'
import { renameProject } from '../features/rename-project.js'
import { resetInstructions } from '../features/reset-instructions.js'
import { restoreRevision } from '../features/restore-revision.js'
import { saveAnnotations } from '../features/save-annotations.js'
import { saveArrangement } from '../features/save-arrangement.js'
import { saveCardTypes } from '../features/save-card-types.js'
import { saveSketch } from '../features/save-sketch.js'
import { sayWhere } from '../features/say-where.js'
import { shareSketch } from '../features/share-sketch.js'
import { showAnnotations } from '../features/show-annotations.js'
import { showArrangement } from '../features/show-arrangement.js'
import { showCardTypes } from '../features/show-card-types.js'
import { showInstructions } from '../features/show-instructions.js'
import { showMap } from '../features/show-map.js'
import { showSession } from '../features/show-session.js'
import { signOutGithub } from '../features/sign-out-github.js'
import { startSignIn } from '../features/start-sign-in.js'
import { startSketch } from '../features/start-sketch.js'
import { switchBranch } from '../features/switch-branch.js'
import { watchProject } from '../features/watch-project.js'
import { watchSketches } from '../features/watch-sketches.js'
import { sayLooking } from '../features/say-looking.js'
import { showAgents } from '../features/show-agents.js'

/** Every feature the window may ask for, by the name it asks with. Each is
 *  its own channel, and nothing is done on the way but handing the call over;
 *  the preload builds the window's side from this, so the two cannot differ. */
export const FEATURES = {
  listProjects,
  createProject,
  linkSoftwareSystem,
  connectGithub,
  connectAgent,
  agreeShallowSystem,
  signOutGithub,
  listGithubSoftwareSystems,
  showMap,
  listPoints,
  switchBranch,
  chooseBranch,
  changeToken,
  reachDevServer,
  showAnnotations,
  saveAnnotations,
  showInstructions,
  editInstructions,
  resetInstructions,
  showCardTypes,
  saveCardTypes,
  showArrangement,
  saveArrangement,
  listSketches,
  listFolders,
  makeFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  fileSketch,
  startSketch,
  openSketch,
  saveSketch,
  deleteSketch,
  addMockup,
  showSession,
  checkForUpdate,
  startSignIn,
  finishSignIn,
  putProjectOnline,
  inviteMember,
  changeRole,
  removeMember,
  handOverProject,
  deleteProject,
  renameProject,
  refreshGithub,
  listRevisions,
  restoreRevision,
  listMySketches,
  moveSketch,
  copySketch,
  shareSketch,
  sayWhere,
  holdThings,
  letGoOfThings,
  sayLooking,
  showAgents,
}

export type Features = typeof FEATURES

/** The only crossing between the window and the features. */
export const openBridge = (): void => {
  for (const [name, feature] of Object.entries(FEATURES))
    ipcMain.handle(name, (_event, ...args: unknown[]) => (feature as (...args: unknown[]) => unknown)(...args))
  // One watch a window at a time: the project it has open.
  const watching = new Map<number, () => void>()
  ipcMain.handle('watchProject', (event, projectId: string) => {
    const sender = event.sender
    watching.get(sender.id)?.()
    watching.set(sender.id, projectId ? watchProject(projectId, () => !sender.isDestroyed() && sender.send('project:changed')) : () => undefined)
    sender.once('destroyed', () => watching.get(sender.id)?.())
  })
  // One library of sketches a window at a time: what an agent draws there, and
  // where its cursor is.
  const watchingSketches = new Map<number, () => void>()
  ipcMain.handle('watchSketches', (event, library: string) => {
    const sender = event.sender
    watchingSketches.get(sender.id)?.()
    watchingSketches.set(sender.id, library ? watchSketches(library, () => !sender.isDestroyed() && sender.send('sketches:changed')) : () => undefined)
    sender.once('destroyed', () => watchingSketches.get(sender.id)?.())
  })
  // One room a window at a time: what it hears goes back to that window.
  ipcMain.handle('joinRoom', (event, id: string) => {
    const sender = event.sender
    sender.once('destroyed', () => void joinRoom('', () => undefined))
    return joinRoom(id, (now) => {
      if (!sender.isDestroyed()) sender.send('room:now', now)
    })
  })
}
