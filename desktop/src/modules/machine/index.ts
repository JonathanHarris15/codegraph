// codegraph: module machine
// codegraph: front door appFolder, devRendererUrl, keystore, askForFolder, useChooser, askForPicture, usePicturePicker, mcpServerFile, appFolderAnywhere, watchFolders, realFolder, sameFolder, githubClientId, cloudFolder, Keystore

/** This computer and the window around the app: where files are kept, the
 *  operating system's keystore, the folder picker, and what the build says.
 *  Everything here comes from outside the program, so it is asked for
 *  lazily: away from the app — in a test, say — each answer is a plain one. */
import { existsSync, realpathSync, watch, type FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

type Electron = typeof import('electron')

let desk: Electron | null = null
let looked = false

const electron = async (): Promise<Electron | null> => {
  if (looked) return desk
  looked = true
  try {
    desk = await import('electron')
  } catch {
    desk = null
  }
  return desk
}

/** How a token is locked away. */
export type Keystore = {
  lock: (plain: string) => string
  unlock: (locked: string) => string
  safe: boolean
}

/** Where this computer keeps codegraph's own files. */
export const appFolder = async (): Promise<string> => {
  const desk = await electron()
  return desk ? desk.app.getPath('userData') : ''
}

/** Where the built codegraph MCP sits on this computer: beside the app's
 *  own main process, in out/main. Away from the app, the folder it runs in. */
export const mcpServerFile = async (): Promise<string> => {
  const desk = await electron()
  const root = desk?.app?.getAppPath?.() ?? process.cwd()
  return join(root, 'out', 'main', 'mcp.js')
}

/** The page server while the app is being worked on; '' in a built app. */
export const devRendererUrl = (): string => process.env['ELECTRON_RENDERER_URL'] ?? ''

/** The GitHub app that sign-in goes through; '' until there is one, and the app
 *  then takes a pasted token instead. */
export const githubClientId = (): string => process.env['CODEGRAPH_GITHUB_CLIENT_ID'] ?? ''

/** A folder standing in for the online side, for trying the app with no Firebase
 *  project. Two copies of the app pointed at one folder see each other. */
export const cloudFolder = (): string => process.env['CODEGRAPH_CLOUD_FOLDER'] ?? ''

/** The operating system's keystore, if it has one that works. */
export const keystore = async (): Promise<Keystore | null> => {
  const desk = await electron()
  if (!desk || !desk.safeStorage.isEncryptionAvailable()) return null
  return {
    lock: (plain) => desk.safeStorage.encryptString(plain).toString('base64'),
    unlock: (locked) => desk.safeStorage.decryptString(Buffer.from(locked, 'base64')),
    safe: true,
  }
}

type Chooser = () => Promise<string>

const theWindowsPicker: Chooser = async () => {
  const desk = await electron()
  if (!desk) return ''
  const window = desk.BrowserWindow.getFocusedWindow()
  const picked = window
    ? await desk.dialog.showOpenDialog(window, {
        title: 'Pick a software system',
        properties: ['openDirectory'],
        buttonLabel: 'Link this repo',
      })
    : await desk.dialog.showOpenDialog({
        title: 'Pick a software system',
        properties: ['openDirectory'],
        buttonLabel: 'Link this repo',
      })
  return picked.canceled ? '' : (picked.filePaths[0] ?? '')
}

let chooser: Chooser = theWindowsPicker

/** Tests hand in their own answer instead of opening a dialog. */
export const useChooser = (which: Chooser): void => {
  chooser = which
}

/** The folder the person picked, or '' if they backed out. */
export const askForFolder = (): Promise<string> => chooser()

const thePicturePicker: Chooser = async () => {
  const desk = await electron()
  if (!desk) return ''
  const options = {
    title: 'Pick a mockup',
    properties: ['openFile' as const],
    filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
  }
  const window = desk.BrowserWindow.getFocusedWindow()
  const picked = window ? await desk.dialog.showOpenDialog(window, options) : await desk.dialog.showOpenDialog(options)
  return picked.canceled ? '' : (picked.filePaths[0] ?? '')
}

let picturePicker: Chooser = thePicturePicker

/** Tests hand in their own picture instead of opening a dialog. */
export const usePicturePicker = (which: Chooser): void => {
  picturePicker = which
}

/** The picture the person picked, or '' if they backed out. */
export const askForPicture = (): Promise<string> => picturePicker()

/** Where the app keeps codegraph's files, worked out without the app, for
 *  the MCP, which runs on its own. CODEGRAPH_HOME stands in for it, as in
 *  tests. It matches Electron's own place for an app named codegraph-desktop. */
export const appFolderAnywhere = (): string => {
  const told = process.env['CODEGRAPH_HOME']
  if (told) return told
  const home = homedir()
  if (process.platform === 'win32') return join(process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'), 'codegraph-desktop')
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support', 'codegraph-desktop')
  return join(process.env['XDG_CONFIG_HOME'] ?? join(home, '.config'), 'codegraph-desktop')
}

/** The one name this computer has for a folder, whichever name it was reached
 *  by: a link, or the way macOS keeps /var at /private/var. An agent's working
 *  folder comes back under this name, whatever name a person linked. A folder
 *  that is not there keeps the name it was asked by. */
export const realFolder = (path: string): string => {
  try {
    return realpathSync.native(path)
  } catch {
    return resolve(path)
  }
}

/** Whether two names lead to one folder. */
export const sameFolder = (a: string, b: string): boolean => {
  const [first, second] = [realFolder(a), realFolder(b)]
  return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second
}

/** Changes that say nothing about the code: installed packages, and the
 *  inside of git's object store. A checkout or a commit still moves HEAD. */
const QUIET = /(^|[\\/])(node_modules|\.git[\\/]objects|\.git[\\/]logs)([\\/]|$)/

/** Calls back once things in some folders have changed and gone quiet
 *  again, for as long as it is not stopped. A folder that is not there, or
 *  cannot be watched, is passed over. */
export const watchFolders = (folders: string[], onChange: () => void, quietMs = 300): (() => void) => {
  let waiting: ReturnType<typeof setTimeout> | null = null
  const changed = (file: string): void => {
    if (QUIET.test(file)) return
    if (waiting) clearTimeout(waiting)
    waiting = setTimeout(() => {
      waiting = null
      onChange()
    }, quietMs)
  }
  const watchers: FSWatcher[] = []
  for (const folder of new Set(folders.filter((f) => f && existsSync(f))))
    try {
      const watcher = watch(folder, { recursive: true }, (_event, file) => changed(String(file ?? '')))
      watcher.on('error', () => watcher.close())
      watchers.push(watcher)
    } catch {
      // Not every folder can be watched; the map still reads when asked.
    }
  return () => {
    if (waiting) clearTimeout(waiting)
    for (const watcher of watchers) watcher.close()
  }
}
