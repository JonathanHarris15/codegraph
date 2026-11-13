// codegraph: feature show-looking in agent
// codegraph: uses agents, projects, sketches
// codegraph: command looking
import { lookingNow } from '../modules/agents/index.js'
import { listProjects } from '../modules/projects/index.js'
import { LOOSE, readSketch, SHARED_WITH_ME } from '../modules/sketches/index.js'

/** What the person has open in the app and where they are pointing, in words an
 *  agent reads: the sketch and the level of it they are on, what is under their
 *  pointer, what they have picked, and where each thing on that level sits, so
 *  the agent can draw beside it. */
export const showLooking = (): string => {
  const looking = lookingNow()
  if (!looking) return 'The person has no sketch open in the app right now. They may be on a map, or the app may be shut.'
  const where =
    looking.library === LOOSE
      ? 'in their own sketches'
      : looking.library === SHARED_WITH_ME
        ? 'shared with them'
        : `in the project ${listProjects().find((p) => p.id === looking.library)?.name ?? looking.library}`
  const sketch = readSketch(looking.library, looking.sketchId)
  const named = new Map(looking.seen.map((s) => [s.id, s]))
  const thing = (id: string): string => {
    const seen = named.get(id)
    return seen ? `${seen.what} "${seen.name}" [${id}]` : `[${id}]`
  }
  const level = looking.trail.length > 1 ? `inside ${looking.trail.slice(1).join(' › ')} [${looking.inside}]` : 'on the top level'
  return [
    `The person has the sketch "${sketch?.name ?? looking.sketchName}" open, ${where}, ${level}.`,
    looking.over ? `Their pointer is on ${thing(looking.over)}.` : looking.x !== undefined && looking.y !== undefined ? `Their pointer is on an empty spot at x ${Math.round(looking.x)}, y ${Math.round(looking.y)}.` : 'Their pointer is not on the sketch.',
    looking.picked.length ? `They have picked ${looking.picked.map(thing).join(', ')}.` : '',
    '',
    'What this level shows, by where it sits (x and y are its top left corner, in this level\'s space; y grows downward):',
    ...looking.seen.map((s) => `  ${s.what} "${s.name}" [${s.id}] at x ${Math.round(s.x)}, y ${Math.round(s.y)}, ${Math.round(s.w)} wide, ${Math.round(s.h)} high`),
    '',
    'Draw on it with `edit`, leaving the sketch name out to draw on this one.',
  ]
    .filter((line, i, all) => line !== '' || (all[i - 1] ?? '') !== '')
    .join('\n')
}
