// codegraph: feature report-work in agent
// codegraph: uses reader, agents
// codegraph: command working-on
import { sayWhere } from '../modules/agents/index.js'
import { componentName, live, readMap } from '../modules/reader/index.js'

/** What an agent names a UI block by: `ui block settings/SettingsRow`, or
 *  `ui block SettingsRow` where the name is the only one. */
const UI_BLOCK = /^ui block\s+(.+)$/i

/** An agent says which card it is working on, so the person's canvas can
 *  follow it there; no card when it stops. A UI block is named too, so the
 *  live view can follow it to that block (ADR 0024). */
export const reportWork = async (repo: string, card: string, words = ''): Promise<string> => {
  const name = card.trim()
  if (!name) {
    sayWhere(repo, '', '')
    return 'The canvas no longer follows you.'
  }
  const map = await readMap(repo, live)
  const asked = name.match(UI_BLOCK)?.[1]?.trim().replace(/^\/+|\/+$/g, '')
  if (asked) {
    const pathOf = (b: (typeof map.uiBlocks)[number]): string => (b.folder ? `${b.folder}/${b.name}` : b.name)
    const found = map.uiBlocks.filter((b) => pathOf(b) === asked || (!asked.includes('/') && b.name === asked))
    if (found.length !== 1)
      return found.length
        ? `More than one UI block is called "${asked}": ${found.map(pathOf).join(', ')}. Name it with its folder.`
        : `There is no UI block called "${asked}". The repo has: ${map.uiBlocks.map(pathOf).join(', ') || 'none yet'}.`
    const whole = pathOf(found[0]!)
    sayWhere(repo, `ui block ${whole}`, words.trim())
    return `The canvas and the live view follow you to the UI block ${whole}.`
  }
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
