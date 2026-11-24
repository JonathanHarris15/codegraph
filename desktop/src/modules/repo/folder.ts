// codegraph: module repo
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mainLineRef } from './git.js'
import { makeBranch } from './proposal.js'
import { git, gitRaw } from './run.js'

/** One line of a diff, as a pull request shows it. */
export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

/** One file in a working copy that differs from the last commit. */
export type FileChange = { file: string; state: 'added' | 'changed' | 'removed'; lines: DiffLine[] }

/** A file as the last commit has it, every byte as written; '' when the
 *  commit has no such file. */
export const fileAtHead = (path: string, name: string): Promise<string> => gitRaw(path, ['show', `HEAD:${name}`])

const linesOf = (text: string): string[] => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** A unified diff's lines, without its headers. */
const diffLines = (diff: string): DiffLine[] =>
  linesOf(diff)
    .filter((line) => !/^(diff |index |--- |\+\+\+ |@@|\\ No newline)/.test(line))
    .map((line) => ({ kind: line[0] === '+' ? 'added' : line[0] === '-' ? 'removed' : 'same', text: line.slice(1) }) as DiffLine)

/** Every file under a folder of a working copy that differs from the last
 *  commit, new and removed ones too, each with its lines as a diff. */
export const changesIn = async (path: string, folder: string): Promise<FileChange[]> => {
  const status = await gitRaw(path, ['status', '--porcelain=v1', '-uall', '-z', '--', folder])
  const changes: FileChange[] = []
  for (const entry of status.split('\0').filter(Boolean)) {
    const code = entry.slice(0, 2)
    const file = entry.slice(3)
    if (code === '??') {
      changes.push({ file, state: 'added', lines: linesOf(readFileSync(join(path, file), 'utf8')).map((text) => ({ kind: 'added', text })) })
      continue
    }
    const state = code.includes('D') ? 'removed' : code.includes('A') ? 'added' : 'changed'
    changes.push({ file, state, lines: diffLines(await gitRaw(path, ['diff', '--no-color', '--unified=3', 'HEAD', '--', file])) })
  }
  return changes.sort((a, b) => a.file.localeCompare(b.file))
}

/** Commits what changed under a folder, and nothing outside it, on the
 *  branch checked out. The new commit's short id, or '' when there was
 *  nothing to commit or git refused. */
export const commitFolder = async (path: string, folder: string, message: string): Promise<string> => {
  await git(path, ['add', '-A', '--', folder])
  if (!(await git(path, ['diff', '--cached', '--name-only', '--', folder]))) return ''
  await git(path, ['commit', '-q', '-m', message, '--', folder])
  return git(path, ['rev-parse', '--short', 'HEAD'])
}

/** Moves a working copy off its main line before a change is written, so it
 *  can be looked at before it is merged: a branch of the given name, or the
 *  next free one, taking uncommitted work along. A branch that is not the
 *  main line is kept. The branch it is on after, or '' when git refused. */
export const leaveMainLine = async (path: string, name: string): Promise<string> => {
  const now = await git(path, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const main = (await mainLineRef(path)).replace(/^origin\//, '')
  if (now && now !== 'HEAD' && now !== main && !['main', 'master'].includes(now)) return now
  for (let n = 1; ; n++) {
    const branch = n === 1 ? name : `${name}-${n}`
    if (await git(path, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])) continue
    return (await makeBranch(path, branch)) ? branch : ''
  }
}
