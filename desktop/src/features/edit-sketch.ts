// codegraph: feature edit-sketch in agent
// codegraph: uses reader, projects, sketches, card-types, sketch-steps, members, sync, agents
// codegraph: command edit
import { lookingNow, sayInSketch } from '../modules/agents/index.js'
import { readCardTypes } from '../modules/card-types/index.js'
import { iMay, whoIsIn } from '../modules/members/index.js'
import { listProjects, type Project } from '../modules/projects/index.js'
import { live, readMap } from '../modules/reader/index.js'
import { applyStep, type Cursor, type Step } from '../modules/sketch-steps/index.js'
import { blankCard, listSketches, LOOSE, newSketch, readSketch, SHARED_WITH_ME, writeSketch, type Sketch } from '../modules/sketches/index.js'
import { oweSketch } from '../modules/sync/index.js'

export type { Step } from '../modules/sketch-steps/index.js'

/** How long the cursor takes to get somewhere, and how long it stays once a
 *  step is done, while a person is watching. Many steps go quicker, so a big
 *  drawing does not keep them waiting. */
const GLIDE_MS = 450
const STAY_MS = 300
const STEADY_STEPS = 16

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** What an agent may be asked to draw in, and whether it can. */
type Found = { library: string; sketch: Sketch | null; project: Project | null; problem: string }

const findSketch = async (repo: string, name: string, shortName: string): Promise<Found> => {
  const looking = lookingNow()
  // No name: the sketch the person has open.
  if (!name.trim()) {
    if (!looking) return { library: '', sketch: null, project: null, problem: 'No sketch is open in the app, so name the sketch to draw in.' }
    const sketch = readSketch(looking.library, looking.sketchId)
    const project = listProjects().find((p) => p.id === looking.library) ?? null
    return sketch
      ? { library: looking.library, sketch, project, problem: '' }
      : { library: '', sketch: null, project: null, problem: 'The sketch open in the app is not on this computer.' }
  }
  const all = listProjects()
  const served = shortName ? [shortName.toLowerCase()] : repo ? (await readMap(repo, live)).projects : []
  const projects = all.filter((p) => served.includes(p.shortName))
  // The sketch the person has open goes by its name too, wherever it is kept.
  if (looking && looking.sketchName.toLowerCase() === name.trim().toLowerCase() && (!shortName || projects.some((p) => p.id === looking.library))) {
    const sketch = readSketch(looking.library, looking.sketchId)
    if (sketch) return { library: looking.library, sketch, project: all.find((p) => p.id === looking.library) ?? null, problem: '' }
  }
  if (!projects.length)
    return {
      library: '',
      sketch: null,
      project: null,
      problem: shortName ? `There is no project with the short name "${shortName}" on this computer.` : 'This repo names no project this computer has. Name one with `project`.',
    }
  for (const project of projects) {
    const listed = listSketches(project.id).find((s) => s.id === name.trim() || s.name.toLowerCase() === name.trim().toLowerCase())
    const sketch = listed ? readSketch(project.id, listed.id) : null
    if (sketch) return { library: project.id, sketch, project, problem: '' }
  }
  if (projects.length > 1)
    return { library: '', sketch: null, project: null, problem: `This repo serves ${projects.map((p) => p.shortName).join(', ')}. Name the one to draw in with \`project\`.` }
  return { library: projects[0]!.id, sketch: null, project: projects[0]!, problem: '' }
}

const mayDraw = (library: string, sketch: Sketch | null, project: Project | null): boolean => {
  if (library === LOOSE) return true
  if (library === SHARED_WITH_ME) {
    const role = sketch?.members?.find((m) => m.id === whoIsIn()?.id)?.role
    return role === 'owner' || role === 'collaborator'
  }
  return Boolean(project && iMay(project, 'draw'))
}

/** An agent draws on a sketch one step at a time, as a person would: cards,
 *  wires, the fields of stores, notes, lines, frames and shapes. With no name
 *  it draws on the sketch the person has open; a name no sketch has makes a new
 *  one. While the person has that sketch open, each step is paced and the
 *  agent's cursor goes to it, so they watch it drawn. Every step is tried
 *  first, and if one is wrong nothing is drawn. */
export const editSketch = async (
  repo: string,
  name: string,
  steps: Step[],
  shortName = '',
  who = 'Agent',
  wait: (ms: number) => Promise<void> = sleep,
): Promise<string> => {
  if (!steps.length) return 'There are no steps, so nothing was drawn.'
  const found = await findSketch(repo, name, shortName)
  if (found.problem) return found.problem
  if (!mayDraw(found.library, found.sketch, found.project))
    return `Whoever is signed in here can only look at ${found.project?.name ?? 'this sketch'}, not draw in it. Nothing was drawn.`

  const project = found.project
  const started = found.sketch ?? newSketch(found.library, name.trim(), blankCard(project?.id ?? found.library, project?.name ?? 'Sketch', 'project', 'project'), `Drawn by ${who}`)
  const types = readCardTypes().map((t) => t.name.trim()).filter(Boolean)

  // Every step tried first, on a copy, so a wrong one draws nothing.
  let trial = started
  for (const [i, step] of steps.entries()) {
    const done = applyStep(trial, step, types)
    if (!done.ok) return [`Nothing was drawn. Step ${i + 1} (${step.do}): ${done.problem}`, i ? `Steps 1 to ${i} were fine.` : ''].filter(Boolean).join(' ')
    trial = done.sketch
  }

  const watched = (): boolean => lookingNow()?.sketchId === started.id
  const pace = Math.max(0.25, Math.min(1, STEADY_STEPS / steps.length))
  const say = (cursor: Cursor): void =>
    sayInSketch(started.id, {
      library: found.library,
      sketchName: started.name,
      who,
      inside: cursor.inside,
      target: cursor.target,
      ...(cursor.x !== undefined ? { x: Math.round(cursor.x) } : {}),
      ...(cursor.y !== undefined ? { y: Math.round(cursor.y) } : {}),
      words: cursor.words,
    })

  const did: string[] = []
  if (!found.sketch) {
    writeSketch(started)
    did.push(`Made the sketch "${started.name}"${project ? ` in ${project.name} (${project.shortName})` : ''}.`)
  }
  for (const step of steps) {
    // Read again each step, so what the person drew meanwhile stays.
    const now = readSketch(found.library, started.id) ?? started
    const done = applyStep(now, step, types)
    if (!done.ok) {
      did.push(`Stopped: ${done.problem} The sketch changed while drawing.`)
      break
    }
    const looking = watched()
    if (looking && done.before) {
      say(done.before)
      await wait(GLIDE_MS * pace)
    }
    writeSketch({ ...done.sketch, updatedAt: new Date().toISOString() })
    say(done.after)
    if (looking) await wait((done.before ? STAY_MS : GLIDE_MS + STAY_MS) * pace)
    did.push(done.did)
  }
  const kept = readSketch(found.library, started.id)
  if (kept && found.library !== LOOSE && found.library !== SHARED_WITH_ME) oweSketch(kept)

  return [
    ...did,
    watched() ? 'The person watched it drawn.' : 'The person does not have this sketch open; it is there when they open it.',
    project?.online ? 'It goes online the next time the app is open.' : '',
    'Name things by the ids in brackets. Call `sketch` to read it back, or `looking` to see what the person sees.',
  ]
    .filter(Boolean)
    .join('\n')
}
