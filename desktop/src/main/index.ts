// codegraph: shell
import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import { useFolder as useGithubFolder, useKeystore } from '../modules/github/index.js'
import { appFolder, devRendererUrl, keystore } from '../modules/machine/index.js'
import { useFolder as useProjectsFolder } from '../modules/projects/index.js'
import { openBridge } from './bridge.js'

/** Hands each module the one outside thing it needs: where this computer
 *  keeps its files, and the keystore to lock the GitHub token away in. */
const wireModules = async (): Promise<void> => {
  const home = await appFolder()
  useProjectsFolder(home)
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

void app.whenReady().then(async () => {
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
