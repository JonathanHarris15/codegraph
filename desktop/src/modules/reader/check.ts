// codegraph: module reader
import { CONFIG, readFacts, type Mismatch } from './build.js'
import type { Component, Point } from './schema.js'

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|py|rb|go|rs|java|kt|swift|cs|php|vue|svelte)$/i
const DECLARATIONS = /\.d\.[mc]?ts$/i
/** Wires read from imports, which need words saying what they are for. */
const SAID = new Set(['uses', 'asks', 'reads', 'starts'])

const named = (c: Component): string => `${c.kind} ${c.name}`
const Named = (c: Component): string => named(c).replace(/^./, (first) => first.toUpperCase())

/** Every place a repo's code does not fit its tags and config (ADR 0008),
 *  file by file, the way a person would fix them. */
export const checkFiles = (files: Map<string, string>, point: Point): Mismatch[] => {
  if (!files.has(CONFIG))
    return [{ file: CONFIG, line: 0, says: `There is no ${CONFIG}, so this repo is not set up for codegraph.` }]
  const facts = readFacts(point, files)
  const { map, tagsOf, componentOf, links, calls } = facts

  const found: Mismatch[] = []
  const seen = new Set<string>()
  const add = (m: Mismatch): void => {
    const key = `${m.file}:${m.says}`
    if (seen.has(key)) return
    seen.add(key)
    found.push(m)
  }
  facts.problems.forEach(add)

  for (const path of files.keys())
    if (CODE.test(path) && !DECLARATIONS.test(path) && !tagsOf.get(path)?.role)
      add({ file: path, line: 1, says: 'It has no tag saying what it belongs to.' })

  for (const wire of map.wires) {
    if (!SAID.has(wire.kind) || wire.words) continue
    const link = links.find((l) => l.from.id === wire.from && l.to.id === wire.to)
    if (link)
      add({
        file: link.path,
        line: link.line,
        says: `The wire from ${named(link.from)} to ${named(link.to)} has no words saying what it is for.`,
      })
  }

  for (const link of links) {
    const { from, to } = link
    const at = { file: link.path, line: link.line }
    if (from.kind === 'module' && to.kind !== 'module')
      add({ ...at, says: `${Named(from)} reaches ${named(to)}; a module never reaches a feature, a page or a trigger.` })
    else if (from.kind === 'feature' && (to.kind === 'page' || to.kind === 'trigger'))
      add({ ...at, says: `${Named(from)} reaches ${named(to)}; a feature never reaches a page or a trigger.` })
    else if (to.kind === 'page')
      add({ ...at, says: `${Named(from)} reaches ${named(to)}; nothing reaches into a page. A part pages share is a module.` })
    else if (to.kind === 'trigger')
      add({ ...at, says: `${Named(from)} reaches ${named(to)}; nothing reaches into a trigger.` })

    if (to.kind !== 'module') continue
    if (to.frontDoor.length === 0)
      add({ file: to.files[0]!.path, line: 1, says: `${Named(to)} is reached from outside, but has no front door.` })
    else
      for (const name of link.names)
        if (name !== '*' && !to.frontDoor.includes(name))
          add({ ...at, says: `It takes ${name} from ${named(to)}, which is not on its front door.` })
  }

  // A feature names the modules it gets its power from, and no others.
  for (const feature of new Set([...componentOf.values()].filter((c) => c.kind === 'feature'))) {
    const declared = new Set(
      feature.files.flatMap((f) => {
        const role = tagsOf.get(f.path)?.role
        return role && 'uses' in role ? role.uses : []
      }),
    )
    const reached = links.filter((l) => l.from === feature && l.to.kind === 'module')
    for (const link of reached)
      if (!declared.has(link.to.name))
        add({ file: link.path, line: link.line, says: `${Named(feature)} uses ${named(link.to)} but its tag does not say so.` })
    const used = new Set(reached.map((l) => l.to.name))
    for (const name of declared)
      if (!used.has(name))
        add({ file: feature.files[0]!.path, line: 1, says: `${Named(feature)} says it uses ${name}, but never does.` })
  }

  for (const call of calls)
    if (call.from.kind !== 'module')
      add({
        file: call.path,
        line: call.line,
        says: `Only a module reaches outside its container, but ${named(call.from)} calls ${call.to}.`,
      })

  for (const [path, tags] of tagsOf) {
    const component = componentOf.get(path)
    if (component && component.kind !== 'module')
      for (const store of tags.stores)
        add({ file: path, line: 1, says: `A store is kept by a module, but ${named(component)} keeps ${store.name}.` })
  }

  // Every store has a schema the module that keeps it runs (ADR 0023). One
  // whose schema could not be read is told already, where it was named.
  for (const store of map.stores) {
    if (store.schema) continue
    const keeper = map.components.find((c) => c.id === store.keeper)
    const tagged = keeper?.files
      .map((f) => ({ file: f.path, said: tagsOf.get(f.path)?.stores.find((s) => s.name === store.name && s.in === store.container && s.inside === store.inside) }))
      .find((t) => t.said)
    // A store kept by anything but a module is told already: that comes first.
    if (!keeper || keeper.kind !== 'module' || !tagged?.said) continue
    const inside = store.inside ? ` inside ${store.inside}` : ''
    add({
      file: tagged.file,
      line: tagged.said.line,
      says: `The store ${store.path} has no schema. Write one in JSON Schema beside this file, have ${named(keeper)} check every write against it, and name it in the tag: \`store ${store.name} in ${store.container}${inside} from ${store.name}.schema.json\`. Where the database already runs one, such as a Prisma model, name that instead.`,
    })
  }

  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}
