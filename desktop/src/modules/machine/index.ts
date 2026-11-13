// codegraph: module machine
// codegraph: front door keepWhole, appFolder, devRendererUrl, keystore, askForFolder, useChooser, askForPicture, usePicturePicker, mcpServerFile, dataFolder, windowFolder, bringOldFiles, watchFolders, realFolder, sameFolder, githubClientId, githubHost, cloudFolder, firebaseSettings, appVersion, releasesUrl, thisComputer, Keystore

/** This computer and the window around the app: where files are kept, the
 *  operating system's keystore, the folder picker, and what the build says.
 *  Everything here comes from outside the program, so it is asked for
 *  lazily: away from the app — in a test, say — each answer is a plain one. */
import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { FirebaseSettings } from '../cloud/index.js'

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

/** Where this computer keeps codegraph's own files, for the app and the MCP
 *  alike: CODEGRAPH_HOME when it names a folder, as in tests, and otherwise
 *  .codegraph in the home folder. Not under AppData: Windows gives a packaged
 *  app, as the Claude app is, its own private copy of AppData, so an agent it
 *  runs would read and write files the app never sees (ADR 0026). */
export const dataFolder = (): string => process.env['CODEGRAPH_HOME'] || join(homedir(), '.codegraph')

/** Where the app keeps codegraph's own files. A folder named on the command
 *  line, as in tests, keeps them there with the window's. */
export const appFolder = async (): Promise<string> => {
  const desk = await electron()
  return desk?.app.commandLine.hasSwitch('user-data-dir') ? desk.app.getPath('userData') : dataFolder()
}

/** Where the window keeps its own files, and where codegraph before 0.4.1 kept
 *  everything. */
export const windowFolder = async (): Promise<string> => {
  const desk = await electron()
  return desk ? desk.app.getPath('userData') : ''
}

/** What is codegraph's own in its folder; the rest is the window's. What a
 *  window is looking at is left out, as it is only true while it is open. */
const OWN = [
  'projects.json',
  'member.json',
  'github.token',
  'card-types.json',
  'instructions.json',
  'sketches',
  'sketch-folders',
  'annotations',
  'arrangements',
  'agents',
  'sync',
  'mirrors',
]

/** Copies codegraph's own files from where an older codegraph kept them, the
 *  first time the new place is used. The old ones stay where they were. It
 *  says what it brought. */
export const bringOldFiles = (from: string, to: string): string[] => {
  if (!from || !existsSync(from) || sameFolder(from, to)) return []
  if (OWN.some((name) => existsSync(join(to, name)))) return []
  const brought = OWN.filter((name) => existsSync(join(from, name)))
  for (const name of brought) cpSync(join(from, name), join(to, name), { recursive: true })
  return brought
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

/** The GitHub app that sign-in goes through. An empty one makes the app take a
 *  pasted token instead. Not a secret: the secret stays in Firebase. */
export const githubClientId = (): string => process.env['CODEGRAPH_GITHUB_CLIENT_ID'] ?? 'Ov23lirLHKBZBwXJ44vf'

/** The version of codegraph running: the built app's own, or away from the
 *  app, the one in the package.json it runs from. '' if neither says. */
export const appVersion = async (): Promise<string> => {
  const desk = await electron()
  const built = desk?.app?.getVersion?.()
  if (built) return built
  try {
    return (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string }).version ?? ''
  } catch {
    return ''
  }
}

/** Where codegraph's newest release is asked for. An empty one, as in page
 *  tests, turns the check off. */
export const releasesUrl = (): string =>
  process.env['CODEGRAPH_RELEASES'] ?? 'https://api.github.com/repos/JonathanHarris15/codegraph/releases/latest'

/** What kind of computer this is, for picking its installer. */
export const thisComputer = (): { platform: string; arch: string } => ({ platform: process.platform, arch: process.arch })

/** A folder standing in for the online side, for trying the app with no Firebase
 *  project. Two copies of the app pointed at one folder see each other. */
export const cloudFolder = (): string => process.env['CODEGRAPH_CLOUD_FOLDER'] ?? ''

/** Where GitHub copies are fetched from instead of github.com, as in tests;
 *  '' for GitHub itself. */
export const githubHost = (): string => process.env['CODEGRAPH_GITHUB_HOST'] ?? ''

/** The Firebase project the app works with online, or null when it is turned
 *  off (`CODEGRAPH_CLOUD=off`, as in tests). None of this is secret: what each
 *  person may do is up to the access rules in docs/firebase. */
export const firebaseSettings = (): FirebaseSettings | null =>
  process.env['CODEGRAPH_CLOUD'] === 'off'
    ? null
    : {
        apiKey: 'AIzaSyDk4HMm6qJpwih5LiPgyV8rDSimhw92WdU',
        authDomain: 'codegraph-57234.firebaseapp.com',
        projectId: 'codegraph-57234',
        storageBucket: 'codegraph-57234.firebasestorage.app',
        messagingSenderId: '174592939508',
        appId: '1:174592939508:web:b136d1d9e4eadce44015a1',
        databaseURL: process.env['CODEGRAPH_DATABASE_URL'] ?? 'https://codegraph-57234-default-rtdb.firebaseio.com',
      }

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

/** What Windows says, for a moment, when a file is open in another program. */
const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY'])
const KEEP_TRIES = 100
/** Something to wait on, for a short pause that blocks. */
const pause = new Int32Array(new SharedArrayBuffer(4))

/** Writes a file whole: to a neighbour first, then moved over, so a crash
 *  cannot shred it and a reader never sees half. On Windows a file another
 *  program has open cannot be written over for that moment, so it waits a
 *  little and tries again. */
export const keepWhole = (file: string, text: string): void => {
  mkdirSync(dirname(file), { recursive: true })
  const beside = `${file}.${randomUUID().slice(0, 8)}.tmp`
  writeFileSync(beside, text, 'utf8')
  for (let tries = 0; ; tries++) {
    try {
      renameSync(beside, file)
      return
    } catch (error) {
      if (!BUSY.has((error as NodeJS.ErrnoException).code ?? '') || tries >= KEEP_TRIES) {
        rmSync(beside, { force: true })
        throw error
      }
      Atomics.wait(pause, 0, 0, 2)
    }
  }
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
