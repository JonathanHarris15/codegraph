// codegraph: feature create-project in workspace
// codegraph: uses projects, cloud, members, sync
import { isConnected } from '../modules/cloud/index.js'
import { whoIsIn } from '../modules/members/index.js'
import { addProject, keepProject } from '../modules/projects/index.js'
import { sendProject } from '../modules/sync/index.js'

/** Starts an empty project and hands back its id, so the page can open it
 *  and ask for the first software system. Its short name, what its repos call
 *  it, comes from its name unless one is given. Where there is an online side a
 *  project goes online from the start, with whoever made it as its owner. */
export const createProject = async (name: string, shortName = ''): Promise<{ id: string }> => {
  const project = addProject(name, shortName)
  const me = whoIsIn()
  if (isConnected() && me) {
    keepProject({ ...project, online: true, ownerId: me.id, members: [{ ...me, role: 'owner' }] })
    await sendProject(project.id)
  }
  return { id: project.id }
}
