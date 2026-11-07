// codegraph: feature agree-shallow-system in workspace
// codegraph: uses projects, sync
import { addShallowSystem, listProjects } from '../modules/projects/index.js'
import { sendProject } from '../modules/sync/index.js'

/** A person agrees that a name the code calls out to is a software system the
 *  project has no repo for, or says it is another name for one already on the
 *  map. Nothing shallow is drawn until this is done. */
export const agreeShallowSystem = async (
  projectId: string,
  name: string,
  sameAs = '',
): Promise<{ id: string }> => {
  const added = addShallowSystem(projectId, name, sameAs)
  if (listProjects().find((p) => p.id === projectId)?.online) await sendProject(projectId)
  return { id: added.id }
}
