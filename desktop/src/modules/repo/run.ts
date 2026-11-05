// codegraph: module repo
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const started = promisify(execFile)

/** One git command in one working copy. Git says plenty by failing — a
 *  branch with no upstream, a file not on this ref — so a failure answers
 *  with nothing rather than throwing. */
export const git = async (cwd: string, args: string[], seconds = 20): Promise<string> => {
  try {
    const { stdout } = await started('git', args, {
      cwd,
      windowsHide: true,
      timeout: seconds * 1000,
      maxBuffer: 8 * 1024 * 1024,
    })
    return stdout.trim()
  } catch {
    return ''
  }
}
