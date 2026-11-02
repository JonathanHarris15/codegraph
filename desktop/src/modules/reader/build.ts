// codegraph: module reader
import { readAliases, readCode, resolveImport, type FileCode } from './code.js'
import {
  outsideId,
  type Component,
  type ComponentKind,
  type Container,
  type Point,
  type SystemMap,
  type Wire,
  type WireKind,
} from './schema.js'
import { readTags, type FileTags } from './tags.js'

export const CONFIG = 'codegraph.config.json'

type Config = {
  projects: string[]
  containers: { name: string; kind: string; says: string; folders: string[] }[]
}

const readConfig = (text: string | undefined, problems: string[]): Config | null => {
  if (text === undefined) return null
  try {
    const raw = JSON.parse(text) as {
      projects?: unknown
      containers?: Record<string, { kind?: unknown; says?: unknown; folders?: unknown }>
    }
    const words = (value: unknown): string => (typeof value === 'string' ? value : '')
    return {
      projects: Array.isArray(raw.projects) ? raw.projects.filter((p): p is string => typeof p === 'string') : [],
      containers: Object.entries(raw.containers ?? {}).map(([name, c]) => ({
        name,
        kind: words(c.kind),
        says: words(c.says),
        folders: Array.isArray(c.folders)
          ? c.folders.filter((f): f is string => typeof f === 'string').map((f) => f.replace(/^\.\/|\/+$/g, ''))
          : [],
      })),
    }
  } catch {
    problems.push(`${CONFIG} is not JSON the reader can read`)
    return null
  }
}

const inFolder = (path: string, folder: string): boolean => folder === '' || path === folder || path.startsWith(folder + '/')

/** The kind of a wire between two components, from which kinds they are. */
const kindBetween = (from: ComponentKind, to: ComponentKind): WireKind =>
  from === 'page' && to === 'feature'
    ? 'acts on'
    : from === 'page' && to === 'module'
      ? 'shows'
      : from === 'trigger'
        ? 'starts'
        : 'uses'

const routeMatches = (route: string, address: string): boolean => {
  const pattern = route
    .split('/')
    .map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')
  return new RegExp(`^${pattern}/?$`).test(address)
}

/** Lays the files of one repo out as its map (ADR 0008). */
export const buildMap = (point: Point, files: Map<string, string>): SystemMap => {
  const problems: string[] = []
  const config = readConfig(files.get(CONFIG), problems)
  const map: SystemMap = {
    point,
    setUp: config !== null,
    projects: config?.projects ?? [],
    containers: [],
    components: [],
    wires: [],
    outside: [],
    problems,
  }
  if (!config) return map

  map.containers = config.containers.map(
    (c): Container => ({ id: `container:${c.name}`, name: c.name, kind: c.kind, says: c.says, stores: [] }),
  )
  const containerNamed = new Map(map.containers.map((c) => [c.name, c]))
  const aliases = readAliases(files.get('tsconfig.json') ?? files.get('jsconfig.json'))

  const tagsOf = new Map<string, FileTags>()
  const codeOf = new Map<string, FileCode>()
  const componentOf = new Map<string, Component>()
  const byId = new Map<string, Component>()

  for (const [path, text] of files) {
    if (path === CONFIG || path === 'tsconfig.json' || path === 'jsconfig.json') continue
    const tags = readTags(path, text)
    tagsOf.set(path, tags)
    problems.push(...tags.problems)
    const role = tags.role
    if (!role || role.kind === 'test' || role.kind === 'tooling') continue

    const homes = config.containers.filter((c) => c.folders.some((folder) => inFolder(path, folder)))
    if (homes.length !== 1) {
      problems.push(
        homes.length === 0
          ? `${path} is not in any container's folders`
          : `${path} is in the folders of ${homes.map((h) => h.name).join(' and ')}`,
      )
      continue
    }
    const container = homes[0]!.name
    const id = `${container}:${role.kind}:${role.name}`
    let component = byId.get(id)
    if (!component) {
      component = {
        id,
        name: role.name,
        kind: role.kind,
        container,
        files: [],
        at: '',
        start: false,
        trigger: '',
        frontDoor: [],
      }
      byId.set(id, component)
      map.components.push(component)
    }
    component.at ||= role.at
    component.start ||= role.start
    component.trigger ||= role.trigger
    component.frontDoor.push(...tags.frontDoor)
    const code = readCode(path, text)
    codeOf.set(path, code)
    component.files.push({ path, names: code.names })
    componentOf.set(path, component)

    for (const store of tags.stores) {
      const keeper = containerNamed.get(store.in)
      if (!keeper) {
        problems.push(`${path} keeps ${store.name} in ${store.in}, which is not a container`)
        continue
      }
      keeper.stores.push(store.name)
      map.wires.push({ from: id, to: keeper.id, kind: 'keeps', words: `keeps ${store.name}` })
    }
  }

  // Wires from imports, and calls out of the repo.
  const paths = new Set(files.keys())
  const found = new Map<string, Wire & { said: Set<string> }>()
  for (const [path, component] of componentOf) {
    const tags = tagsOf.get(path)!
    const code = codeOf.get(path)!
    for (const { from: specifier, line } of code.imports) {
      const target = resolveImport(path, specifier, paths, aliases)
      const reached = target ? componentOf.get(target) : undefined
      if (!reached || reached === component) continue
      const key = `${component.id}>${reached.id}`
      const wire = found.get(key) ?? {
        from: component.id,
        to: reached.id,
        kind: kindBetween(component.kind, reached.kind),
        words: '',
        said: new Set<string>(),
      }
      found.set(key, wire)
      const words = tags.wires.get(line)?.words
      if (words) wire.said.add(words)
    }
    for (const [, aimed] of tags.wires) {
      if (!aimed.to) continue
      map.outside.push({ from: component.id, to: outsideId(aimed.to), kind: 'calls', words: aimed.words })
    }
  }
  for (const wire of found.values()) {
    const [first, ...others] = [...wire.said]
    if (others.length) problems.push(`the wire from ${wire.from} to ${wire.to} is given different words`)
    map.wires.push({ from: wire.from, to: wire.to, kind: wire.kind, words: first ?? '' })
  }

  // Pages lead to pages whose address they mention.
  const pages = map.components.filter((c) => c.kind === 'page' && c.at)
  for (const page of pages) {
    const mentioned = new Set(page.files.flatMap((f) => codeOf.get(f.path)?.addresses ?? []))
    for (const other of pages) {
      if (other === page || ![...mentioned].some((address) => routeMatches(other.at, address))) continue
      map.wires.push({ from: page.id, to: other.id, kind: 'leads to', words: '' })
    }
  }

  return map
}
