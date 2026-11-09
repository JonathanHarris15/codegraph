// codegraph: feature agree-shallow-system in workspace
// codegraph: uses projects, sync, members
import { iMay } from '../modules/members/index.js'
import { addShallowSystem, findProject } from '../modules/projects/index.js'
import { sendProject } from '../modules/sync/index.js'

/** A person agrees that a name the code calls out to is a software system the
 *  project has no repo for, or says it is another name for one already on the
 *  map. Nothing shallow is drawn until this is done. */
export const agreeShallowSystem = async (
  projectId: string,
  name: string,
  sameAs = '',
): Promise<{ id: string }> => {
  const project = findProject(projectId)
  if (project && !iMay(project, 'add-repo')) return { id: '' }
  const added = addShallowSystem(projectId, name, sameAs)
  await sendProject(projectId)
  return { id: added.id }
}
