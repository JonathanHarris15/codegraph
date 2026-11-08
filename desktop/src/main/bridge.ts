// codegraph: shell
import { ipcMain } from 'electron'
import { addMockup } from '../features/add-mockup.js'
import { saveAnnotations } from '../features/save-annotations.js'
import { showAnnotations } from '../features/show-annotations.js'
import { saveArrangement } from '../features/save-arrangement.js'
import { saveCardTypes } from '../features/save-card-types.js'
import { showCardTypes } from '../features/show-card-types.js'
import { showArrangement } from '../features/show-arrangement.js'
import { agreeShallowSystem } from '../features/agree-shallow-system.js'
import { chooseBranch } from '../features/choose-branch.js'
import { connectAgent } from '../features/connect-agent.js'
import { connectGithub } from '../features/connect-github.js'
import { createProject } from '../features/create-project.js'
import { deleteSketch } from '../features/delete-sketch.js'
import { editInstructions } from '../features/edit-instructions.js'
import { listPoints } from '../features/list-points.js'
import { listSketches } from '../features/list-sketches.js'
import { listFolders } from '../features/list-folders.js'
import { makeFolder } from '../features/make-folder.js'
import { renameFolder } from '../features/rename-folder.js'
import { moveFolder } from '../features/move-folder.js'
import { deleteFolder } from '../features/delete-folder.js'
import { fileSketch } from '../features/file-sketch.js'
import { openSketch } from '../features/open-sketch.js'
import { resetInstructions } from '../features/reset-instructions.js'
import { saveSketch } from '../features/save-sketch.js'
import { listGithubSoftwareSystems } from '../features/list-github-software-systems.js'
import { listProjects } from '../features/list-projects.js'
import { linkSoftwareSystem } from '../features/link-software-system.js'
import { showInstructions } from '../features/show-instructions.js'
import { showMap, type Card } from '../features/show-map.js'
import { startSketch } from '../features/start-sketch.js'
import { signOutGithub } from '../features/sign-out-github.js'
import { switchBranch } from '../features/switch-branch.js'
import { changeRole } from '../features/change-role.js'
import { copySketch } from '../features/copy-sketch.js'
import { deleteProject } from '../features/delete-project.js'
import { renameProject } from '../features/rename-project.js'
import { finishSignIn } from '../features/finish-sign-in.js'
import { handOverProject } from '../features/hand-over-project.js'
import { holdThings, letGoOfThings } from '../features/hold-thing.js'
import { inviteMember } from '../features/invite-member.js'
import { joinRoom } from '../features/join-room.js'
import { listMySketches } from '../features/list-my-sketches.js'
import { listRevisions } from '../features/list-revisions.js'
import { moveSketch } from '../features/move-sketch.js'
import { putProjectOnline } from '../features/put-project-online.js'
import { refreshGithub } from '../features/refresh-github.js'
import { removeMember } from '../features/remove-member.js'
import { restoreRevision } from '../features/restore-revision.js'
import { sayWhere, type Whereabouts } from '../features/say-where.js'
import { shareSketch } from '../features/share-sketch.js'
import { showSession } from '../features/show-session.js'
import { startSignIn } from '../features/start-sign-in.js'
import type { DeviceSignIn } from '../modules/github/index.js'
import type { Role } from '../modules/members/index.js'
import { watchProject } from '../features/watch-project.js'
import type { Point } from '../modules/reader/index.js'
import type { Layer } from '../modules/annotations/index.js'
import type { Arrangement } from '../modules/arrangements/index.js'
import type { CardType } from '../modules/card-types/index.js'
import type { Sketch } from '../modules/sketches/index.js'

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
  ipcMain.handle('sketch:list', (_event, projectId: string) => listSketches(projectId))
  ipcMain.handle('folder:list', (_event, library: string) => listFolders(library))
  ipcMain.handle('folder:make', (_event, library: string, name: string, parentId: string) => makeFolder(library, name, parentId))
  ipcMain.handle('folder:rename', (_event, library: string, id: string, name: string) => renameFolder(library, id, name))
  ipcMain.handle('folder:move', (_event, library: string, id: string, parentId: string) => moveFolder(library, id, parentId))
  ipcMain.handle('folder:delete', (_event, library: string, id: string) => deleteFolder(library, id))
  ipcMain.handle('sketch:file', (_event, library: string, sketchId: string, folderId: string) => fileSketch(library, sketchId, folderId))
  ipcMain.handle('sketch:start', (_event, projectId: string, name: string, snapshot?: Card) =>
    startSketch(projectId, name, snapshot),
  )
  ipcMain.handle('sketch:open', (_event, projectId: string, sketchId: string) => openSketch(projectId, sketchId))
  ipcMain.handle('sketch:save', (_event, sketch: Sketch, seen?: Sketch) => saveSketch(sketch, seen))
  ipcMain.handle('sketch:delete', (_event, projectId: string, sketchId: string) => deleteSketch(projectId, sketchId))
  ipcMain.handle('sketch:mockup', (_event, projectId: string, sketchId: string, cardId: string) =>
    addMockup(projectId, sketchId, cardId),
  )
  // One watch a window at a time: the project it has open.
  const watching = new Map<number, () => void>()
  ipcMain.handle('project:watch', (event, projectId: string) => {
    const sender = event.sender
    watching.get(sender.id)?.()
    watching.set(sender.id, projectId ? watchProject(projectId, () => !sender.isDestroyed() && sender.send('project:changed')) : () => undefined)
    sender.once('destroyed', () => watching.get(sender.id)?.())
  })
  ipcMain.handle('annotations:show', (_event, projectId: string, points: Record<string, Point>) => showAnnotations(projectId, points))
  ipcMain.handle('annotations:save', (_event, projectId: string, layers: Layer[], points: Record<string, Point>, seen?: Layer[]) =>
    saveAnnotations(projectId, layers, points, seen),
  )
  ipcMain.handle('instructions:show', () => showInstructions())
  ipcMain.handle('instructions:edit', (_event, topic: string, text: string) => editInstructions(topic, text))
  ipcMain.handle('instructions:reset', (_event, topic: string) => resetInstructions(topic))
  ipcMain.handle('card-types:show', () => showCardTypes())
  ipcMain.handle('card-types:save', (_event, types: CardType[]) => saveCardTypes(types))
  ipcMain.handle('arrangement:show', (_event, projectId: string, points: Record<string, Point>) => showArrangement(projectId, points))
  ipcMain.handle('arrangement:save', (_event, projectId: string, arrangement: Arrangement, points: Record<string, Point>, seen?: Arrangement) =>
    saveArrangement(projectId, arrangement, points, seen),
  )
  ipcMain.handle('branch:choose', (_event, projectId: string, systemId: string, branch: string) =>
    chooseBranch(projectId, systemId, branch),
  )
  ipcMain.handle('branch:switch', (_event, projectId: string, systemId: string, branch: string) =>
    switchBranch(projectId, systemId, branch),
  )
  ipcMain.handle('map:points', (_event, projectId: string, systemId: string) =>
    listPoints(projectId, systemId),
  )
  ipcMain.handle('session:show', () => showSession())
  ipcMain.handle('session:start', () => startSignIn())
  ipcMain.handle('session:finish', (_event, started: DeviceSignIn) => finishSignIn(started))
  ipcMain.handle('project:online', (_event, projectId: string) => putProjectOnline(projectId))
  ipcMain.handle('project:invite', (_event, projectId: string, login: string, role: Exclude<Role, 'owner'>) => inviteMember(projectId, login, role))
  ipcMain.handle('project:role', (_event, projectId: string, memberId: string, role: Exclude<Role, 'owner'>) => changeRole(projectId, memberId, role))
  ipcMain.handle('project:remove', (_event, projectId: string, memberId: string) => removeMember(projectId, memberId))
  ipcMain.handle('project:handOver', (_event, projectId: string, memberId: string) => handOverProject(projectId, memberId))
  ipcMain.handle('project:delete', (_event, projectId: string) => deleteProject(projectId))
  ipcMain.handle('project:rename', (_event, projectId: string, name: string) => renameProject(projectId, name))
  ipcMain.handle('github:refresh', (_event, projectId: string) => refreshGithub(projectId))
  ipcMain.handle('revisions:list', (_event, projectId: string) => listRevisions(projectId))
  ipcMain.handle('revisions:restore', (_event, projectId: string, revisionId: string) => restoreRevision(projectId, revisionId))
  ipcMain.handle('sketches:mine', () => listMySketches())
  ipcMain.handle('sketch:move', (_event, sketchId: string, projectId: string) => moveSketch(sketchId, projectId))
  ipcMain.handle('sketch:copy', (_event, projectId: string, sketchId: string) => copySketch(projectId, sketchId))
  ipcMain.handle('sketch:share', (_event, sketchId: string, login: string, role: 'collaborator' | 'viewer') => shareSketch(sketchId, login, role))
  // One room a window at a time: what it hears goes back to that window.
  ipcMain.handle('room:join', (event, id: string) => {
    const sender = event.sender
    sender.once('destroyed', () => void joinRoom('', () => undefined))
    return joinRoom(id, (now) => {
      if (!sender.isDestroyed()) sender.send('room:now', now)
    })
  })
  ipcMain.handle('room:say', (_event, where: Whereabouts) => sayWhere(where))
  ipcMain.handle('room:hold', (_event, items: string[]) => holdThings(items))
  ipcMain.handle('room:letGo', (_event, items?: string[]) => letGoOfThings(items))
}
