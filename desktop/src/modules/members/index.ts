// codegraph: module members
// codegraph: front door useFolder, whoIsIn, rememberMember, forgetMember, may, roleOf, Role, Action
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Member } from '../cloud/index.js'

/** What a member may do on a project. */
export type Role = 'owner' | 'co-owner' | 'collaborator' | 'viewer'

export type Action = 'draw' | 'add-repo' | 'rename' | 'invite' | 'hand-over' | 'delete'

const ALLOWED: Record<Action, Role[]> = {
  draw: ['owner', 'co-owner', 'collaborator'],
  'add-repo': ['owner', 'co-owner', 'collaborator'],
  rename: ['owner', 'co-owner', 'collaborator'],
  invite: ['owner', 'co-owner'],
  'hand-over': ['owner'],
  delete: ['owner'],
}

export const may = (role: Role | null, action: Action): boolean => role !== null && ALLOWED[action].includes(role)

/** A member's role on a project. A project only on this computer is its person's
 *  own, whoever they are. */
export const roleOf = (project: { online?: boolean; members?: { id: string; role: Role }[] }, memberId: string): Role | null =>
  project.online ? (project.members?.find((m) => m.id === memberId)?.role ?? null) : 'owner'

let folder = ''

/** The shell says where this computer keeps codegraph's files. */
export const useFolder = (where: string): void => {
  folder = where
}

const file = (): string => {
  if (!folder) throw new Error('members: no folder chosen yet')
  return join(folder, 'member.json')
}

/** Who is signed in on this computer, if anyone. It is kept so the app knows
 *  them with no connection. */
export const whoIsIn = (): Member | null => {
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as Member
  } catch {
    return null
  }
}

export const rememberMember = (member: Member): void => {
  if (!folder) return
  mkdirSync(folder, { recursive: true })
  writeFileSync(file(), JSON.stringify(member, null, 2), 'utf8')
}

export const forgetMember = (): void => {
  if (!folder) return
  rmSync(file(), { force: true })
}
