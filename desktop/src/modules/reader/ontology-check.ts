// codegraph: module reader
import { CONFIG, pointing, type Facts, type Mismatch } from './build.js'
import { unwritten, type Adr, type Rule, type Term } from './ontology.js'
import type { Component, Holds, Shape, Store, SystemMap } from './schema.js'

const KINDS = new Set(['module', 'feature', 'page', 'trigger'])

const named = (c: Component): string => `${c.kind} ${c.name}`
const Named = (c: Component): string => named(c).replace(/^./, (first) => first.toUpperCase())

const plural = (word: string): string =>
  /[^aeiou]y$/i.test(word) ? `${word.slice(0, -1)}ies` : /(s|x|ch|sh)$/i.test(word) ? `${word}es` : `${word}s`

/** A rule names a component as its tag does, `module wardrobe`, or every
 *  component of a kind or card type, `any page`, `any queue`. Anything else
 *  it names is a container or a system outside the repo. */
const namesComponent = (ref: string): boolean => {
  const first = ref.trim().split(/\s+/)[0]!
  return first === 'any' || KINDS.has(first)
}

const fits = (ref: string, c: Component): boolean => {
  const [first = '', ...rest] = ref.trim().split(/\s+/)
  const name = rest.join(' ')
  return first === 'any' ? c.kind === name || (c.type !== '' && c.type === name) : c.kind === first && c.name === name
}

/** A call names a container or a system by itself, or after the system it
 *  is part of: `mailer`, `billing/api`. */
const callNames = (to: string, name: string): boolean => {
  const a = to.trim().toLowerCase()
  const b = name.trim().toLowerCase()
  return a === b || a.startsWith(`${b}/`) || a.endsWith(`/${b}`)
}

const storeNamed = (stores: Store[], name: string): Store | undefined =>
  stores.find((s) => s.path === name) ?? stores.find((s) => s.name === name)

/** The ADRs whose rules hold: accepted, and not replaced by one that is. */
const holding = (adrs: Adr[]): Adr[] => {
  const accepted = adrs.filter((a) => a.status === 'accepted')
  const replaced = new Set(accepted.flatMap((a) => a.replaces))
  return accepted.filter((a) => !replaced.has(a.number))
}

const checkRule = (adr: Adr, rule: Rule, facts: Facts, add: (m: Mismatch) => void): void => {
  const { map, links, calls, tagsOf } = facts
  const name = `ADR ${adr.number}`
  const there = (ref: string): void => {
    if (!namesComponent(ref) || map.components.some((c) => fits(ref, c))) return
    const [first = '', ...rest] = ref.trim().split(/\s+/)
    // A rule about every queue still holds when there is none yet.
    if (first === 'any' && !KINDS.has(rest.join(' ')) && rest.length) return
    add({ file: adr.file, line: 1, says: `${name} names ${ref}, which is not here.` })
  }

  if (rule.kind === 'never reaches') {
    there(rule.from)
    there(rule.to)
    const said = `${name} says ${rule.from} never reaches ${rule.to}.`
    if (namesComponent(rule.to)) {
      for (const link of links)
        if (fits(rule.from, link.from) && fits(rule.to, link.to))
          add({ file: link.path, line: link.line, says: `${Named(link.from)} reaches ${named(link.to)}; ${said}` })
    } else
      for (const call of calls)
        if (fits(rule.from, call.from) && callNames(call.to, rule.to))
          add({ file: call.path, line: call.line, says: `${Named(call.from)} calls ${call.to}; ${said}` })
    return
  }

  if (rule.kind === 'only through') {
    there(rule.by)
    there(rule.to)
    const said = `${name} says only ${rule.by} reaches ${rule.to}.`
    if (namesComponent(rule.to)) {
      for (const link of links)
        if (fits(rule.to, link.to) && !fits(rule.by, link.from))
          add({ file: link.path, line: link.line, says: `${Named(link.from)} reaches ${named(link.to)}; ${said}` })
    } else
      for (const call of calls)
        if (callNames(call.to, rule.to) && !fits(rule.by, call.from))
          add({ file: call.path, line: call.line, says: `${Named(call.from)} calls ${call.to}; ${said}` })
    return
  }

  there(rule.by)
  const store = storeNamed(map.stores, rule.store)
  if (!store) {
    add({ file: adr.file, line: 1, says: `${name} names the store ${rule.store}, which is not here.` })
    return
  }
  const keeper = map.components.find((c) => c.id === store.keeper)
  if (!keeper || fits(rule.by, keeper)) return
  const tagged = keeper.files
    .map((f) => ({ file: f.path, said: tagsOf.get(f.path)?.stores.find((s) => s.name === store.name && s.in === store.container) }))
    .find((t) => t.said)
  add({
    file: tagged?.file ?? keeper.files[0]!.path,
    line: tagged?.said?.line ?? 1,
    says: `${Named(keeper)} keeps ${store.path}; ${name} says only ${rule.by} writes it.`,
  })
}

const isList = (holds: Holds): boolean => holds.kind === 'list'

/** A term's store points at the store of each term it says it points at, as
 *  many as it says (ADR 0035). */
const checkPointing = (term: Term, store: Store, shape: Shape, terms: Term[], stores: Store[], add: (m: Mismatch) => void): void => {
  const at = { file: term.file, line: 1 }
  for (const link of term.pointsAt) {
    const other = terms.find((t) => t.name === link.term)
    if (!other || other.borrowed || !other.store) continue
    const target = storeNamed(stores, other.store)
    if (!target) continue
    const found = pointing(shape).filter(
      ({ field }) => target.container === store.container && (field.pointsAt === target.path || field.pointsAt === target.name),
    )
    if (found.length === 0) {
      add({ ...at, says: `${term.name} points at ${link.term}, but no field of ${store.path} points at ${target.path}.` })
      continue
    }
    const fitting = found.find(({ field }) =>
      link.howMany === 'many' ? isList(field.holds) : !isList(field.holds) && (link.howMany !== 'one' || field.needed),
    )
    if (fitting) continue
    const { place, field } = found[0]!
    const where = `${store.path}.${place}`
    add({
      ...at,
      says:
        link.howMany === 'many'
          ? `${term.name} points at many ${plural(link.term)}, but ${where} holds only one.`
          : isList(field.holds)
            ? `${term.name} points at ${link.howMany} ${link.term}, but ${where} holds a list.`
            : `${term.name} points at one ${link.term}, but ${where} can be left out.`,
    })
  }
}

const wordsOf = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

const sameWord = (word: string, avoid: string): boolean =>
  word === avoid || word === `${avoid}s` || word === `${avoid}es` || (avoid.endsWith('y') && word === `${avoid.slice(0, -1)}ies`)

/** The first of a term's avoid words a name is made of, if any. */
const avoidedIn = (name: string, avoid: string[]): string | undefined => {
  const words = wordsOf(name)
  return avoid.find((phrase) => {
    const parts = wordsOf(phrase)
    if (parts.length === 0) return false
    return words.some((_, i) => parts.every((part, j) => (j === parts.length - 1 ? sameWord(words[i + j] ?? '', part) : words[i + j] === part)))
  })
}

/** Every name in the code a term's avoid words are held against: its
 *  components, their front doors, its containers, stores and fields. */
const namesInCode = (map: SystemMap): { name: string; what: string; file: string }[] => {
  const all: { name: string; what: string; file: string }[] = []
  for (const c of map.components) {
    const file = c.files[0]?.path ?? CONFIG
    all.push({ name: c.name, what: Named(c), file })
    for (const door of c.frontDoor) all.push({ name: door, what: `${Named(c)}'s front door name ${door}`, file })
  }
  for (const c of map.containers) all.push({ name: c.name, what: `The container ${c.name}`, file: CONFIG })
  for (const store of map.stores) {
    const keeper = map.components.find((c) => c.id === store.keeper)
    const file = store.schema || keeper?.files[0]?.path || CONFIG
    all.push({ name: store.name, what: `The store ${store.path}`, file })
    const fields = (shape: Shape, before: string): void => {
      for (const field of shape.fields) {
        all.push({ name: field.name, what: `The field ${before}${field.name} of ${store.path}`, file })
        const inner = (holds: Holds): void => {
          if (holds.kind === 'record') fields(holds.shape, `${before}${field.name}.`)
          else if (holds.kind === 'list') inner(holds.of)
        }
        inner(field.holds)
      }
    }
    if (store.shape) fields(store.shape, '')
  }
  return all
}

/** Every place a repo's code, terms and ADRs do not fit its part of the
 *  ontology map (ADRs 0035, 0036). */
export const checkOntology = (facts: Facts): Mismatch[] => {
  const { map } = facts
  const { terms, adrs } = map.ontology
  const found: Mismatch[] = []
  const add = (m: Mismatch): void => {
    if (!found.some((f) => f.file === m.file && f.line === m.line && f.says === m.says)) found.push(m)
  }

  const firstAdr = new Map<number, Adr>()
  for (const adr of adrs) {
    const first = firstAdr.get(adr.number)
    if (first) add({ file: adr.file, line: 1, says: `ADR ${adr.number} is numbered the same as ${first.file}.` })
    else firstAdr.set(adr.number, adr)
  }
  const termNamed = new Map<string, Term>()
  for (const term of terms) {
    const first = termNamed.get(term.name)
    if (first) add({ file: term.file, line: 1, says: `${term.name} is defined in ${first.file} too.` })
    else termNamed.set(term.name, term)
  }

  for (const adr of adrs) {
    for (const t of adr.terms)
      if (!termNamed.has(t)) add({ file: adr.file, line: 1, says: `ADR ${adr.number} names the term ${t}, which is not here.` })
    for (const n of adr.replaces)
      if (!firstAdr.has(n)) add({ file: adr.file, line: 1, says: `ADR ${adr.number} replaces ADR ${n}, which is not here.` })
    // A decision is written out in full before it is accepted.
    const missing = adr.status === 'accepted' ? unwritten(adr) : []
    if (missing.length)
      add({
        file: adr.file,
        line: 1,
        says: `ADR ${adr.number} is accepted but has no ${missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} or ${missing[missing.length - 1]}`}. An accepted ADR fills in every section of the template.`,
      })
  }
  for (const adr of holding(adrs)) for (const rule of adr.rules) checkRule(adr, rule, facts, add)

  for (const term of terms) {
    const at = { file: term.file, line: 1 }
    if (term.borrowed) {
      // The rest of a borrowed term is its defining repo's to hold.
      if (term.sum !== term.borrowed.sum)
        add({
          ...at,
          says: `${term.name} was borrowed from ${term.borrowed.from} and has been edited since. Borrow it again rather than changing the copy.`,
        })
      continue
    }
    for (const n of term.settledBy)
      if (!firstAdr.has(n)) add({ ...at, says: `${term.name} says it is settled by ADR ${n}, which is not here.` })
    for (const link of term.pointsAt)
      if (!termNamed.has(link.term)) add({ ...at, says: `${term.name} points at the term ${link.term}, which is not here.` })
    if (!term.store) continue
    const store = storeNamed(map.stores, term.store)
    if (!store) add({ ...at, says: `${term.name} is kept in the store ${term.store}, which is not here.` })
    else if (store.shape) checkPointing(term, store, store.shape, terms, map.stores, add)
  }

  // A word that is a term of its own here is not avoided for another.
  const ownWords = new Set(terms.map((t) => t.name.toLowerCase()))
  const names = namesInCode(map)
  for (const term of terms) {
    const avoid = term.avoid.filter((a) => !ownWords.has(a.toLowerCase()))
    for (const { name, what, file } of names) {
      const word = avoidedIn(name, avoid)
      if (word) add({ file, line: 1, says: `${what} says "${word}"; the term is ${term.name}.` })
    }
  }
  return found
}

/** One repo of a project, by its GitHub address, and its map. */
export type RepoMap = { address: string; map: SystemMap }

const repoName = (address: string): string => address.split('/').pop()!.toLowerCase()

/** The repo calls the other, by the other's name or its software system's. */
const reaches = (from: RepoMap, to: RepoMap): boolean =>
  from.map.outside.some((wire) => {
    const called = wire.to.replace(/^outside:/, '')
    return callNames(called, repoName(to.address)) || (to.map.system !== '' && callNames(called, to.map.system))
  })

/** Where the terms of a project's repos do not fit each other (ADR 0036):
 *  a borrowed copy its defining repo has moved on from, or no longer has, and
 *  a term two repos that work together both define. A copy borrowed from a
 *  repo not handed in is left alone, since it cannot be read. */
export const checkAcross = (repos: RepoMap[]): { address: string; mismatch: Mismatch }[] => {
  const found: { address: string; mismatch: Mismatch }[] = []
  const byAddress = new Map(repos.map((r) => [r.address.toLowerCase(), r]))
  const defined = (repo: RepoMap, name: string): Term | undefined =>
    repo.map.ontology.terms.find((t) => !t.borrowed && t.name.toLowerCase() === name.toLowerCase())

  for (const repo of repos)
    for (const term of repo.map.ontology.terms) {
      if (!term.borrowed) continue
      const from = byAddress.get(term.borrowed.from.toLowerCase())
      if (!from) continue
      const there = defined(from, term.name)
      const at = { file: term.file, line: 1 }
      if (!there)
        found.push({ address: repo.address, mismatch: { ...at, says: `${term.name} was borrowed from ${term.borrowed.from}, which no longer defines it.` } })
      else if (there.sum !== term.borrowed.sum)
        found.push({
          address: repo.address,
          mismatch: { ...at, says: `${term.name} has changed in ${term.borrowed.from} since ${term.borrowed.commit}. Borrow it again.` },
        })
    }

  repos.forEach((repo, i) => {
    repos.forEach((other, j) => {
      if (i === j) return
      const sameSystem = repo.map.system !== '' && repo.map.system.toLowerCase() === other.map.system.toLowerCase()
      const reached = reaches(repo, other)
      // Within one system, it is told once, to the later of the two.
      if (!reached && !(sameSystem && j < i)) return
      for (const term of repo.map.ontology.terms) {
        if (term.borrowed || !defined(other, term.name)) continue
        found.push({
          address: repo.address,
          mismatch: {
            file: term.file,
            line: 1,
            says: reached
              ? `${term.name} is defined in ${other.address} too, which this repo reaches. Borrow it from one of them.`
              : `${term.name} is defined in ${other.address} too, in the same software system. Borrow it from one of them.`,
          },
        })
      }
    })
  })
  return found.sort((a, b) => a.address.localeCompare(b.address) || a.mismatch.file.localeCompare(b.mismatch.file))
}
