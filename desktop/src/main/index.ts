// codegraph: shell
import { join } from 'node:path'
import { BrowserWindow, Menu, app, shell } from 'electron'
import { useFolder as useAgentsFolder } from '../modules/agents/index.js'
import { useFolder as useAnnotationsFolder } from '../modules/annotations/index.js'
import { useFolder as useArrangementsFolder } from '../modules/arrangements/index.js'
import { useFolder as useCardTypesFolder } from '../modules/card-types/index.js'
import { savedToken, useFolder as useGithubFolder, useKeystore } from '../modules/github/index.js'
import { useFolder as useInstructionsFolder } from '../modules/instructions/index.js'
import { openFirebaseCloud, openFolderCloud, theCloud, useCloud } from '../modules/cloud/index.js'
import { appFolder, cloudFolder, devRendererUrl, firebaseSettings, keystore } from '../modules/machine/index.js'
import { useFolder as useMembersFolder, whoIsIn } from '../modules/members/index.js'
import { useMirrors } from '../modules/repo/index.js'
import { startFollowing, useFolder as useSyncFolder, useHeard } from '../modules/sync/index.js'
import { useFolder as useProjectsFolder } from '../modules/projects/index.js'
import { useFolder as useSketchesFolder } from '../modules/sketches/index.js'
import { openBridge } from './bridge.js'

/** Hands each module the one outside thing it needs: where this computer
 *  keeps its files, and the keystore to lock the GitHub token away in. */
const wireModules = async (): Promise<void> => {
  const home = await appFolder()
  useProjectsFolder(home)
  useSketchesFolder(home)
  useAgentsFolder(home)
  useAnnotationsFolder(home)
  useArrangementsFolder(home)
  useCardTypesFolder(home)
  useInstructionsFolder(home)
  useGithubFolder(home)
  useMembersFolder(home)
  useSyncFolder(home)
  useMirrors(home, process.env['CODEGRAPH_GITHUB_HOST'] || undefined)

  // The online side: a folder standing in for it when one is named, Firebase
  // otherwise, and with neither the app runs on this computer alone.
  const standIn = cloudFolder()
  const firebase = firebaseSettings()
  if (standIn) useCloud(openFolderCloud(standIn))
  else if (firebase) useCloud(openFirebaseCloud(firebase))

  const locked = await keystore()
  if (locked) useKeystore(locked)
}

const openWindow = (): void => {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: '#11131a',
    title: 'codegraph',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const server = devRendererUrl()
  if (server) void window.loadURL(server)
  else void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

/** No stock File / Edit / View bar: the app has its own tools, and the
 *  stock bar's keys zoom the whole window and catch Alt. A Mac keeps the
 *  app and Edit menus, without which copy and paste in a text box stop. */
const quietMenu = (): void => {
  Menu.setApplicationMenu(
    process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]) : null,
  )
}

// The installed app is called Codegraph, but its files stay where they have
// always been, under codegraph-desktop, which the MCP looks in too. A folder
// named on the command line, as in tests, wins.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', join(app.getPath('appData'), 'codegraph-desktop'))

void app.whenReady().then(async () => {
  quietMenu()
  await wireModules()
  openBridge()
  useHeard((what) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('cloud:changed', what)
  })
  const me = whoIsIn()
  // Firebase forgets a sign-in when the app closes; the token GitHub gave is
  // kept, so it signs in again. Offline, it tries again when next needed.
  if (me) void (theCloud()?.signIn(savedToken(), me) ?? Promise.resolve()).catch(() => undefined).then(() => startFollowing(me))
  openWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
