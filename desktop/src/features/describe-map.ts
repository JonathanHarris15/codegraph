// codegraph: feature describe-map in agent
// codegraph: uses reader, wording, projects, annotations, machine
// codegraph: command map
import { annotationWords, readAnnotations } from '../modules/annotations/index.js'
import { sameFolder } from '../modules/machine/index.js'
import { listProjects } from '../modules/projects/index.js'
import { DESIGN, holdsWords, live, readMap, type DesignSystem, type Point, type Store, type SystemMap } from '../modules/reader/index.js'
import { sentenceOf } from '../modules/wording/index.js'

const pointWords = (point: Point): string =>
  point.kind === 'live' ? 'the live folder' : point.kind === 'branch' ? `branch ${point.name}` : `commit ${point.sha.slice(0, 7)}`

/** A value as written, and what it comes to when that is a name. */
const valueWords = (written: string, value: string): string =>
  written.startsWith('{') ? `${written}, which is ${value || 'not known'}` : written

/** A DESIGN.md's tokens in words: each with its tier, as written, and what
 *  it comes to (ADR 0024). */
const designWords = (design: DesignSystem | null): string[] => {
  if (!design) return []
  const out = [`Design system ${design.name || '(unnamed)'}, from ${DESIGN}${design.description ? `: ${design.description}` : ''}`]
  for (const t of design.tokens) {
    if (!t.parts.length) {
      out.push(`  ${t.id} (${t.tier}) ${valueWords(t.written, t.value)}`)
      continue
    }
    out.push(`  ${t.id} (${t.tier}):`)
    for (const p of t.parts) out.push(`    ${p.name} ${valueWords(p.written, p.value)}`)
  }
  if (design.problems.length) out.push('  Does not hold together:', ...design.problems.map((p) => `    ${p}`))
  return [...out, '']
}

/** The UI blocks in words, by folder: the name a person points at, where it
 *  lives, each option and what its choices mean, and its states (ADR 0024). */
const uiBlockWords = (map: SystemMap, nameOf: Map<string, string>): string[] => {
  if (!map.uiBlocks.length) return []
  const out = ['UI blocks, by folder:']
  for (const b of map.uiBlocks) {
    const where = nameOf.get(b.component) ?? b.component
    out.push(`  ${b.folder ? `${b.folder}/` : ''}${b.name}, in ${where}, ${b.file}${b.says ? `: ${b.says}` : ''}`)
    for (const o of b.options) {
      out.push(`    ${o.name}${o.optional ? ' (optional)' : ''}: ${o.type}${o.says ? `. ${o.says}` : ''}`)
      for (const [value, says] of Object.entries(o.valueSays)) out.push(`      ${value}: ${says}`)
    }
    const files = [...new Set(b.states.map((s) => s.file))]
    if (b.states.length) out.push(`    States, in ${files.join(', ')}: ${b.states.map((s) => s.name).join(', ')}`)
  }
  return [...out, '']
}

/** A repo's map in words an agent reads: containers, components and their
 *  files, every wire with what it is for, its design system and UI blocks. */
export const describeMap = async (repo: string, point: Point = live): Promise<string> => {
  const map: SystemMap = await readMap(repo, point)
  if (!map.setUp)
    return [
      `This repo has no codegraph.config.json, so it is not set up for codegraph yet. Read at ${pointWords(point)}.`,
      ...(map.design ? ['', ...designWords(map.design)] : []),
    ]
      .join('\n')
      .trimEnd()

  const nameOf = new Map<string, string>([
    ...map.components.map((c) => [c.id, `${c.kind} ${c.name}`] as const),
    ...map.containers.map((c) => [c.id, `container ${c.name}`] as const),
    ...(map.stores ?? []).map((s) => [s.id, `store ${s.path}`] as const),
  ])
  const out: string[] = [
    `Serves ${map.projects.join(', ') || 'no project yet'}. Read at ${pointWords(point)}.`,
    '',
  ]
  for (const container of map.containers) {
    out.push(`Container ${container.name} (${container.kind})${container.says ? `: ${container.says}` : ''}`)
    for (const store of (map.stores ?? []).filter((s) => s.container === container.name)) out.push(...storeWords(store))
    for (const c of map.components.filter((c) => c.container === container.name)) {
      const extra = [
        c.at ? `at ${c.at}` : '',
        c.start ? 'start page' : '',
        c.trigger ? `on a ${c.trigger}` : '',
        c.frontDoor.length ? `front door ${c.frontDoor.join(', ')}` : '',
      ].filter(Boolean)
      out.push(`  ${c.kind} ${c.name}${c.type ? ` as ${c.type}` : ''}${extra.length ? ` (${extra.join('; ')})` : ''}`)
      for (const file of c.files) out.push(`    ${file.path}`)
    }
    out.push('')
  }
  if (map.wires.length) {
    out.push('Wires:')
    for (const w of map.wires)
      out.push(
        w.kind === 'keeps' && w.to.startsWith('store:')
          ? `  ${nameOf.get(w.from) ?? w.from} keeps ${nameOf.get(w.to) ?? w.to} in ${w.to.split(':')[1]}`
          : `  ${sentenceOf(nameOf.get(w.from) ?? w.from, w.kind, nameOf.get(w.to) ?? w.to, w.words)
          .map((part) => part.text)
          .join('')}${w.words || w.kind === 'leads to' || w.kind === 'keeps' ? '' : ' (NO WORDS yet)'}`,
      )
    out.push('')
  }
  if (map.outside.length) {
    out.push('Calls out of the repo:')
    for (const w of map.outside)
      out.push(
        `  ${sentenceOf(nameOf.get(w.from) ?? w.from, 'calls', w.to.replace(/^outside:/, ''), w.words)
          .map((part) => part.text)
          .join('')}`,
      )
    out.push('')
  }
  if (map.problems.length) {
    out.push('Could not place:')
    for (const p of map.problems) out.push(`  ${p}`)
    out.push('')
  }
  out.push(...designWords(map.design))
  out.push(...uiBlockWords(map, nameOf))
  out.push(...annotationsOver(repo, map))
  return out.join('\n').trimEnd()
}

/** A store and its shape, a field to a line (ADR 0023). */
const storeWords = (store: Store): string[] => {
  const inside = store.inside ? `, inside ${store.inside}` : ''
  if (!store.shape) return [`  store ${store.path}${inside}: shape unknown, no schema says it`]
  const how = store.shape.fixed ? 'fixed' : `open to ${holdsWords(store.shape.others)}`
  return [
    `  store ${store.path}${store.says ? `: ${store.says}` : ''}${inside} (${how})`,
    ...store.shape.fields.map(
      (f) =>
        `    ${f.name}: ${holdsWords(f.holds)}${f.needed ? ', needed' : ''}${f.pointsAt ? `, points at ${f.pointsAt}` : ''}${f.says ? ` — ${f.says}` : ''}`,
    ),
  ]
}

/** What people drew over this repo's part of the map of each project it
 *  serves, for the agent to read; never the architecture. */
const annotationsOver = (repo: string, map: SystemMap): string[] => {
  const out: string[] = []
  for (const project of listProjects().filter((p) => map.projects.includes(p.shortName))) {
    const system = project.systems.find((s) => s.path && sameFolder(s.path, repo))
    if (!system) continue
    const nameOf = (id: string): string => {
      if (id === project.id) return `the project ${project.name}`
      if (id === system.id) return `software system ${system.name}`
      const rest = id.slice(system.id.length + 1)
      const container = rest.match(/^container:(.+)$/)
      if (container) return `container ${container[1]}`
      const component = rest.match(/^([^:]+):([^:]+):(.+)$/)
      return component ? `${component[2]} ${component[3]}` : rest
    }
    const levels = [
      project.id,
      system.id,
      ...map.containers.map((c) => `${system.id}/${c.id}`),
      ...map.components.map((c) => `${system.id}/${c.id}`),
    ]
    // Notes belong to their branch (ADR 0019): the project's top level, and this
    // working copy's own map, or what it was pushed as.
    const branch = map.point.kind === 'live' ? map.point.branch : ''
    const here = readAnnotations(project.id, `${system.id}@local:${branch}`)
    const there = here.length ? here : readAnnotations(project.id, `${system.id}@github:${branch}`)
    const said = annotationWords([...readAnnotations(project.id), ...there], levels, nameOf)
    if (said.length) out.push(`From project ${project.name}:`, ...said)
  }
  return out
}
