// codegraph: module machine
// codegraph: front door appFolder, devRendererUrl, keystore, askForFolder, useChooser, Keystore

/** This computer and the window around the app: where files are kept, the
 *  operating system's keystore, the folder picker, and what the build says.
 *  Everything here comes from outside the program, so it is asked for
 *  lazily: away from the app — in a test, say — each answer is a plain one. */

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

/** The page server while the app is being worked on; '' in a built app. */
export const devRendererUrl = (): string => process.env['ELECTRON_RENDERER_URL'] ?? ''

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
        title: 'Pick a codebase',
        properties: ['openDirectory'],
        buttonLabel: 'Link this repo',
      })
    : await desk.dialog.showOpenDialog({
        title: 'Pick a codebase',
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
