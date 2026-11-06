// codegraph: shell
import { ipcMain } from 'electron'
import { addMockup } from '../features/add-mockup.js'
import { saveAnnotations } from '../features/save-annotations.js'
import { showAnnotations } from '../features/show-annotations.js'
import { saveArrangement } from '../features/save-arrangement.js'
import { saveCardTypes } from '../features/save-card-types.js'
import { showCardTypes } from '../features/show-card-types.js'
import { showArrangement } from '../features/show-arrangement.js'
import { addProposalMockup } from '../features/add-proposal-mockup.js'
import { agreeShallowSystem } from '../features/agree-shallow-system.js'
import { chooseBranch } from '../features/choose-branch.js'
import { connectAgent } from '../features/connect-agent.js'
import { connectGithub } from '../features/connect-github.js'
import { createProject } from '../features/create-project.js'
import { deleteSketch } from '../features/delete-sketch.js'
import { listPoints } from '../features/list-points.js'
import { listSketches } from '../features/list-sketches.js'
import { openProposal } from '../features/open-proposal.js'
import { openSketch } from '../features/open-sketch.js'
import { saveProposal } from '../features/save-proposal.js'
import { saveSketch } from '../features/save-sketch.js'
import { listGithubSoftwareSystems } from '../features/list-github-software-systems.js'
import { listProjects } from '../features/list-projects.js'
import { linkSoftwareSystem } from '../features/link-software-system.js'
import { showMap, type Card } from '../features/show-map.js'
import { startSketch } from '../features/start-sketch.js'
import { signOutGithub } from '../features/sign-out-github.js'
import { switchBranch } from '../features/switch-branch.js'
import { watchProject } from '../features/watch-project.js'
import type { DrawnCard, Point } from '../modules/reader/index.js'
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
  ipcMain.handle('sketch:start', (_event, projectId: string, name: string, snapshot?: Card) =>
    startSketch(projectId, name, snapshot),
  )
  ipcMain.handle('sketch:open', (_event, projectId: string, sketchId: string) => openSketch(projectId, sketchId))
  ipcMain.handle('sketch:save', (_event, sketch: Sketch) => saveSketch(sketch))
  ipcMain.handle('sketch:delete', (_event, projectId: string, sketchId: string) => deleteSketch(projectId, sketchId))
  ipcMain.handle('sketch:mockup', (_event, projectId: string, sketchId: string, cardId: string) =>
    addMockup(projectId, sketchId, cardId),
  )
  ipcMain.handle('proposal:open', (_event, projectId: string, systemId: string, branch?: string) =>
    openProposal(projectId, systemId, branch),
  )
  ipcMain.handle('proposal:save', (_event, projectId: string, systemId: string, draft: DrawnCard, says: string) =>
    saveProposal(projectId, systemId, draft, says),
  )
  ipcMain.handle('proposal:mockup', (_event, projectId: string, systemId: string, page: string) =>
    addProposalMockup(projectId, systemId, page),
  )
  // One watch a window at a time: the project it has open.
  const watching = new Map<number, () => void>()
  ipcMain.handle('project:watch', (event, projectId: string) => {
    const sender = event.sender
    watching.get(sender.id)?.()
    watching.set(sender.id, projectId ? watchProject(projectId, () => !sender.isDestroyed() && sender.send('project:changed')) : () => undefined)
    sender.once('destroyed', () => watching.get(sender.id)?.())
  })
  ipcMain.handle('annotations:show', (_event, projectId: string) => showAnnotations(projectId))
  ipcMain.handle('annotations:save', (_event, projectId: string, layers: Layer[]) => saveAnnotations(projectId, layers))
  ipcMain.handle('card-types:show', () => showCardTypes())
  ipcMain.handle('card-types:save', (_event, types: CardType[]) => saveCardTypes(types))
  ipcMain.handle('arrangement:show', (_event, projectId: string) => showArrangement(projectId))
  ipcMain.handle('arrangement:save', (_event, projectId: string, arrangement: Arrangement) =>
    saveArrangement(projectId, arrangement),
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
}
