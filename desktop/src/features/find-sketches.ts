// codegraph: feature find-sketches in agent
// codegraph: uses reader, projects, sketches
// codegraph: command sketches
import { listProjects, type Project } from '../modules/projects/index.js'
import { live, readMap } from '../modules/reader/index.js'
import { listSketches } from '../modules/sketches/index.js'

/** The projects an agent means: the one it names by short name, or those the
 *  repo it works in serves. */
const projectsFor = async (repo: string, shortName: string): Promise<Project[]> => {
  const all = listProjects()
  if (shortName) return all.filter((p) => p.shortName === shortName.toLowerCase())
  const served = repo ? (await readMap(repo, live)).projects : []
  return all.filter((p) => served.includes(p.shortName))
}

/** The sketches an agent can be handed, project by project. */
export const findSketches = async (repo: string, shortName = ''): Promise<string> => {
  const projects = await projectsFor(repo, shortName)
  if (projects.length === 0)
    return shortName
      ? `There is no project with the short name "${shortName}" on this computer.`
      : 'This repo names no project this computer has. Name one with `project`, or set the repo up for codegraph first.'
  return projects
    .map((project) => {
      const sketches = listSketches(project.id)
      return [
        `Project ${project.name} (${project.shortName}):`,
        ...(sketches.length
          ? sketches.map((s) => `- ${s.name}: ${s.from ? s.from.charAt(0).toLowerCase() + s.from.slice(1) : 'blank'}, changed ${s.updatedAt.slice(0, 10)}`)
          : ['- no sketches yet']),
      ].join('\n')
    })
    .join('\n\n')
}
