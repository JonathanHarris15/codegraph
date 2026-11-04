// codegraph: shell
import { join } from 'node:path'
import { BrowserWindow, Menu, app, shell } from 'electron'
import { useFolder as useAgentsFolder } from '../modules/agents/index.js'
import { useFolder as useAnnotationsFolder } from '../modules/annotations/index.js'
import { useFolder as useArrangementsFolder } from '../modules/arrangements/index.js'
import { useFolder as useGithubFolder, useKeystore } from '../modules/github/index.js'
import { appFolder, devRendererUrl, keystore } from '../modules/machine/index.js'
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
  useGithubFolder(home)

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

void app.whenReady().then(async () => {
  quietMenu()
  await wireModules()
  openBridge()
  openWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
