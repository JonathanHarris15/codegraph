// codegraph: feature watch-project in workspace
// codegraph: uses projects, machine, agents
import { mkdirSync } from 'node:fs'
import { agentsFolder } from '../modules/agents/index.js'
import { watchFolders } from '../modules/machine/index.js'
import { listProjects } from '../modules/projects/index.js'

/** Tells the canvas when a project's map may have changed: a file in one
 *  of its repos, a checkout or a commit, or an agent saying where it is.
 *  Hands back how to stop. */
export const watchProject = (projectId: string, onChange: () => void): (() => void) => {
  const project = listProjects().find((p) => p.id === projectId)
  if (!project) return () => undefined
  const agents = agentsFolder()
  mkdirSync(agents, { recursive: true })
  return watchFolders([...project.systems.map((s) => s.path), agents], onChange)
}
