// codegraph: feature invite-member in workspace
// codegraph: uses github, members, projects, sync
import { GithubRefused, findAccount, savedToken } from '../modules/github/index.js'
import { may, roleOf, whoIsIn, type Role } from '../modules/members/index.js'
import { keepProject, listProjects } from '../modules/projects/index.js'
import { sendProject } from '../modules/sync/index.js'

export type Changed = { ok: boolean; problem?: string }

/** Puts someone on a project by their GitHub username, whether or not they have
 *  ever opened the app: the project is there when they first sign in. Owner is
 *  not a role to invite anyone to; that is handing over. */
export const inviteMember = async (projectId: string, login: string, role: Exclude<Role, 'owner'>): Promise<Changed> => {
  const me = whoIsIn()
  const project = listProjects().find((p) => p.id === projectId)
  if (!me || !project?.online) return { ok: false, problem: 'That project is not online.' }
  if (!may(roleOf(project, me.id), 'invite')) return { ok: false, problem: 'Only an owner or co-owner can invite someone.' }
  try {
    const account = await findAccount(savedToken(), login)
    if (!account) return { ok: false, problem: `GitHub has no one called ${login.trim()}.` }
    if (project.members?.some((m) => m.id === account.id)) return { ok: false, problem: `${account.name} is already on this project.` }
    keepProject({ ...project, members: [...(project.members ?? []), { ...account, role }] })
    await sendProject(projectId)
    return { ok: true }
  } catch (refusal) {
    return { ok: false, problem: refusal instanceof GithubRefused ? refusal.message : 'Could not reach GitHub.' }
  }
}
