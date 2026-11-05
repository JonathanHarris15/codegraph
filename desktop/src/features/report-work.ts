// codegraph: feature report-work in agent
// codegraph: uses reader, agents
// codegraph: command working-on
import { sayWhere } from '../modules/agents/index.js'
import { componentName, live, readMap } from '../modules/reader/index.js'

/** An agent says which card it is working on, so the person's canvas can
 *  follow it there; no card when it stops. */
export const reportWork = async (repo: string, card: string, words = ''): Promise<string> => {
  const name = card.trim()
  if (!name) {
    sayWhere(repo, '', '')
    return 'The canvas no longer follows you.'
  }
  const map = await readMap(repo, live)
  const known = new Set([
    ...map.containers.map((c) => c.name),
    ...map.components.map(componentName),
    ...(map.proposal?.containers.map((c) => c.name) ?? []),
    ...(map.proposal?.components.map(componentName) ?? []),
  ])
  if (!known.has(name))
    return `There is no card called "${name}" on the map or the proposal. Name a container, \`web\`, or a component in one, \`web/page search\`.`
  sayWhere(repo, name, words.trim())
  return `The canvas follows you to ${name}.`
}
