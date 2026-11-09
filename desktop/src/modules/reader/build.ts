// codegraph: module reader
import { readAliases, readCode, resolveImport, type FileCode } from './code.js'
import {
  outsideId,
  type Component,
  type ComponentKind,
  type Container,
  storeId,
  type Field,
  type Holds,
  type Point,
  type Shape,
  type Store,
  type SystemMap,
  type Wire,
  type WireKind,
} from './schema.js'
import { PROPOSAL, readProposal } from './proposal.js'
import { readShape } from './shape.js'
import { readTags, type FileTags } from './tags.js'

export const CONFIG = 'codegraph.config.json'

type Config = {
  projects: string[]
  containers: { name: string; kind: string; says: string; folders: string[] }[]
}

/** Something in a repo that does not fit its tags, where it is, in plain words. */
export type Mismatch = { file: string; line: number; says: string }

/** One import that reaches from one component into another. */
export type Link = { path: string; line: number; from: Component; to: Component; names: string[] }

/** What the reader saw on the way to the map, which the check holds the
 *  code to. */
export type Facts = {
  map: SystemMap
  tagsOf: Map<string, FileTags>
  componentOf: Map<string, Component>
  links: Link[]
  /** Calls out of the repo, by where they are written. */
  calls: { path: string; line: number; from: Component; to: string }[]
  /** What the reader could not place. */
  problems: Mismatch[]
}

const readConfig = (text: string | undefined, problems: Mismatch[]): Config | null => {
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
    problems.push({ file: CONFIG, line: 1, says: `${CONFIG} is not JSON the reader can read` })
    return null
  }
}

const inFolder = (path: string, folder: string): boolean => folder === '' || path === folder || path.startsWith(folder + '/')

/** The kind of a wire between two components, from which kinds they are. */
const kindBetween = (from: ComponentKind, to: ComponentKind): WireKind =>
  from === 'page' && to === 'feature'
    ? 'asks'
    : from === 'page' && to === 'module'
      ? 'reads'
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
export const buildMap = (point: Point, files: Map<string, string>): SystemMap => readFacts(point, files).map

export const readFacts = (point: Point, files: Map<string, string>): Facts => {
  const problems: Mismatch[] = []
  const config = readConfig(files.get(CONFIG), problems)
  const map: SystemMap = {
    point,
    setUp: config !== null,
    projects: config?.projects ?? [],
    containers: [],
    components: [],
    stores: [],
    wires: [],
    outside: [],
    problems: [],
    proposal: null,
    mockups: {},
  }
  const facts: Facts = { map, tagsOf: new Map(), componentOf: new Map(), links: [], calls: [], problems }
  const unread: string[] = []
  map.proposal = readProposal(files.get(PROPOSAL), unread)
  problems.push(...unread.map((says) => ({ file: PROPOSAL, line: 1, says })))
  const done = (): Facts => {
    map.problems = problems.map((p) => p.says)
    return facts
  }
  if (!config) return done()

  map.containers = config.containers.map(
    (c): Container => ({ id: `container:${c.name}`, name: c.name, kind: c.kind, says: c.says, stores: [] }),
  )
  const containerNamed = new Map(map.containers.map((c) => [c.name, c]))
  const aliases = readAliases(files.get('tsconfig.json') ?? files.get('jsconfig.json'))

  const tagsOf = facts.tagsOf
  const codeOf = new Map<string, FileCode>()
  const componentOf = facts.componentOf
  const byId = new Map<string, Component>()
  const kept: { path: string; component: Component; said: FileTags['stores'][number] }[] = []

  for (const [path, text] of files) {
    if (path === CONFIG || path === PROPOSAL || path === 'tsconfig.json' || path === 'jsconfig.json') continue
    const tags = readTags(path, text)
    tagsOf.set(path, tags)
    problems.push(...tags.problems.map((says) => ({ file: path, line: 1, says })))
    const role = tags.role
    if (!role || role.kind === 'test' || role.kind === 'tooling') continue

    const homes = config.containers.filter((c) => c.folders.some((folder) => inFolder(path, folder)))
    if (homes.length !== 1) {
      problems.push({
        file: path,
        line: 1,
        says:
          homes.length === 0
            ? `${path} is not in any container's folders`
            : `${path} is in the folders of ${homes.map((h) => h.name).join(' and ')}`,
      })
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
        type: '',
        container,
        files: [],
        at: '',
        start: false,
        trigger: '',
        frontDoor: [],
        shot: '',
      }
      byId.set(id, component)
      map.components.push(component)
    }
    if (role.type && component.type && role.type !== component.type)
      problems.push({ file: path, line: 1, says: `${role.name} is called both ${component.type} and ${role.type}` })
    component.type ||= role.type
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
        problems.push({ file: path, line: 1, says: `${path} keeps ${store.name} in ${store.in}, which is not a container` })
        continue
      }
      keeper.stores.push(store.name)
      map.wires.push({ from: id, to: keeper.id, kind: 'keeps', words: `keeps ${store.name}` })
      kept.push({ path, component, said: store })
    }
  }

  readStores(kept, files, facts)

  // Wires from imports, and calls out of the repo.
  const paths = new Set(files.keys())
  const found = new Map<string, Wire & { said: Set<string> }>()
  for (const [path, component] of componentOf) {
    const tags = tagsOf.get(path)!
    const code = codeOf.get(path)!
    for (const { from: specifier, line, names } of code.imports) {
      const target = resolveImport(path, specifier, paths, aliases)
      const reached = target ? componentOf.get(target) : undefined
      if (!reached || reached === component) continue
      facts.links.push({ path, line, from: component, to: reached, names })
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
    for (const [line, aimed] of tags.wires) {
      if (!aimed.to) continue
      facts.calls.push({ path, line, from: component, to: aimed.to })
      map.outside.push({ from: component.id, to: outsideId(aimed.to), kind: 'calls', words: aimed.words })
    }
  }
  for (const wire of found.values()) {
    const [first, ...others] = [...wire.said]
    if (others.length) {
      const where = facts.links.find((l) => l.from.id === wire.from && l.to.id === wire.to)!
      problems.push({
        file: where.path,
        line: where.line,
        says: `The wire from ${wire.from} to ${wire.to} is given different words in different places.`,
      })
    }
    map.wires.push({ from: wire.from, to: wire.to, kind: wire.kind, words: first ?? '' })
  }

  // Pages lead to pages whose address they mention. An address a page has
  // outright goes to that page alone, not to any whose pattern also fits it.
  const pages = map.components.filter((c) => c.kind === 'page')
  const addressed = pages.filter((c) => c.at)
  const reachedBy = (address: string): Component[] => {
    const exact = addressed.filter((p) => p.at === address || p.at === address.replace(/\/$/, ''))
    return exact.length ? exact : addressed.filter((p) => routeMatches(p.at, address))
  }
  for (const page of pages) {
    const mentioned = new Set(page.files.flatMap((f) => codeOf.get(f.path)?.addresses ?? []))
    const reached = new Set([...mentioned].flatMap(reachedBy))
    for (const other of reached)
      if (other !== page) map.wires.push({ from: page.id, to: other.id, kind: 'leads to', words: '' })
  }

  return done()
}

const parted = (path: string): string[] => path.split('/').filter((part) => part && part !== '.')

/** A path written beside a file, from the top of the repo. */
const besides = (file: string, written: string): string => {
  const parts = parted(file).slice(0, -1)
  for (const part of parted(written)) part === '..' ? parts.pop() : parts.push(part)
  return parts.join('/')
}

/** Every field in a shape that points at a store, by its place in the
 *  record: photo.ownerId. */
const pointing = (shape: Shape, before = ''): { place: string; field: Field }[] =>
  shape.fields.flatMap((field) => {
    const place = before + field.name
    const inner = (holds: Holds): { place: string; field: Field }[] =>
      holds.kind === 'record' ? pointing(holds.shape, `${place}.`) : holds.kind === 'list' ? inner(holds.of) : []
    return [...(field.pointsAt ? [{ place, field }] : []), ...inner(field.holds)]
  })

/** The stores each module keeps, their shapes, and what they point at
 *  (ADR 0023). */
const readStores = (kept: { path: string; component: Component; said: FileTags['stores'][number] }[], files: Map<string, string>, facts: Facts): void => {
  const { map, problems } = facts
  const byPath = new Map<string, Store & { file: string }>()
  const keeperOf = new Map<string, Component>()
  for (const { path, component, said } of kept) {
    const where = said.inside ? `${said.inside}/${said.name}` : said.name
    const key = `${said.in}:${where}`
    const first = keeperOf.get(key)
    if (first) {
      problems.push({ file: path, line: 1, says: `${where} is kept by both ${first.kind} ${first.name} and ${component.kind} ${component.name}` })
      continue
    }
    keeperOf.set(key, component)
    byPath.set(key, {
      id: storeId(said.in, where),
      name: said.name,
      path: where,
      inside: said.inside,
      container: said.in,
      keeper: component.id,
      says: '',
      schema: said.from ? besides(path, said.from) : '',
      shape: null,
      file: path,
    })
  }

  for (const store of byPath.values()) {
    const at = { file: store.file, line: 1 }
    if (store.inside && !byPath.has(`${store.container}:${store.inside}`))
      problems.push({ ...at, says: `${store.file} keeps ${store.name} inside ${store.inside}, which is not a store in ${store.container}` })
    if (!store.schema) continue
    const text = files.get(store.schema)
    if (text === undefined) {
      problems.push({ ...at, says: `${store.file} shapes ${store.name} by ${store.schema}, which is not there` })
      continue
    }
    const read = readShape(text)
    if (!read) {
      problems.push({ file: store.schema, line: 1, says: `${store.schema} is not JSON the reader can read` })
      continue
    }
    store.shape = read.shape
    store.says = read.says
  }

  const all = [...byPath.values()]
  for (const store of all) {
    if (!store.shape) continue
    for (const { place, field } of pointing(store.shape)) {
      const named = field.pointsAt
      const exact = byPath.get(`${store.container}:${named}`)
      const byName = all.filter((s) => s.container === store.container && s.name === named)
      const target = exact ?? (byName.length === 1 ? byName[0] : undefined)
      if (!target) {
        problems.push({
          file: store.schema,
          line: 1,
          says: `The field ${place} of ${store.path} points at ${named}, which is not a store in ${store.container}`,
        })
        continue
      }
      map.wires.push({ from: store.id, to: target.id, kind: 'points at', words: field.says || place })
    }
  }
  map.stores = all.map(({ file: _file, ...store }) => store)
}
