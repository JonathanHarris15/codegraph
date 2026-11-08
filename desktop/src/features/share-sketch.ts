// codegraph: feature share-sketch in workspace
// codegraph: uses sketches, github, members, sync, cloud
import { isConnected } from '../modules/cloud/index.js'
import { findAccount, GithubRefused, savedToken } from '../modules/github/index.js'
import { whoIsIn, type Changed } from '../modules/members/index.js'
import { LOOSE, readSketch, writeSketch } from '../modules/sketches/index.js'
import { sendRemoval, sendUp, sketchPath } from '../modules/sync/index.js'

/** Shares a loose sketch with someone by GitHub username. Whoever shares it stays
 *  its owner. It moves out from under them online, to stand on its own. */
export const shareSketch = async (sketchId: string, login: string, role: 'collaborator' | 'viewer'): Promise<Changed> => {
  const me = whoIsIn()
  const sketch = readSketch(LOOSE, sketchId)
  if (!isConnected() || !me) return { ok: false, problem: 'Sign in first.' }
  if (!sketch) return { ok: false, problem: 'That sketch is not in your own library.' }
  if (sketch.ownerId && sketch.ownerId !== me.id) return { ok: false, problem: 'Only its owner can share it.' }
  try {
    const account = await findAccount(savedToken(), login)
    if (!account) return { ok: false, problem: `GitHub has no one called ${login.trim()}.` }
    const members = sketch.members ?? [{ ...me, role: 'owner' as const }]
    if (members.some((m) => m.id === account.id)) return { ok: false, problem: `${account.name} already has it.` }
    const wasPrivate = sketch.memberIds?.length ? '' : sketchPath(sketch)
    const next = [...members, { ...account, role }]
    const shared = { ...sketch, ownerId: me.id, members: next, memberIds: next.map((m) => m.id), roles: Object.fromEntries(next.map((m) => [m.id, m.role])) }
    writeSketch(shared)
    await sendUp(sketchPath(shared))
    if (wasPrivate) await sendRemoval(wasPrivate)
    return { ok: true }
  } catch (refusal) {
    return { ok: false, problem: refusal instanceof GithubRefused ? refusal.message : 'Could not reach GitHub.' }
  }
}
