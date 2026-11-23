// codegraph: feature link-this-folder in agent
// codegraph: uses projects, repo, machine
// codegraph: command link
import { existsSync } from 'node:fs'
import { sameFolder } from '../modules/machine/index.js'
import { listProjects, placeWorkingCopy } from '../modules/projects/index.js'
import { folderName, isRepo, remoteOf, sameRemote } from '../modules/repo/index.js'

/** An agent's way to link the folder it works in as the working copy of a
 *  repo a project on this computer already has, matched by GitHub address.
 *  It never adds a repo to a project, and never moves a link whose folder is
 *  still there, so a second clone or a worktree cannot take over. */
export const linkThisFolder = async (folder: string): Promise<string> => {
  if (!isRepo(folder)) return `${folder} is not tracked by git, so it is no repo's working copy.`
  const remote = await remoteOf(folder)
  if (!remote)
    return `${folderName(folder)} has no GitHub copy, so codegraph cannot tell which repo on a project it is. A person links it in the app with + Link a repo.`
  const said: string[] = []
  for (const project of listProjects())
    for (const system of project.systems.filter((s) => sameRemote(s.remote, remote))) {
      if (system.path && sameFolder(system.path, folder)) said.push(`Already linked as the working copy of ${system.name} in ${project.name}.`)
      else if (system.path && existsSync(system.path))
        said.push(
          `${system.name} in ${project.name} is already linked to ${system.path}, which is still there, so it is left as it is. A person can change it in the app.`,
        )
      else {
        placeWorkingCopy(project.id, system.id, folder)
        said.push(`Linked ${folder} as the working copy of ${system.name} in ${project.name}.`)
      }
    }
  return said.length ? said.join('\n') : `No project on this computer has ${remote}. A person adds it to a project in the app with + Link a repo.`
}
