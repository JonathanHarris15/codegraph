// codegraph: module together
// codegraph: front door mergeDoc, mergeItems, tally, wordsFor, sameDoc, undoStep, Tally

/** Working out what several members' changes come to. There is no storage
 *  here, only sums, so the page can use them as well as the features. */

type Json = unknown
type Thing = Record<string, Json>

const said = (a: Json): string => JSON.stringify(a ?? null)

export const sameDoc = (a: Json, b: Json): boolean => said(a) === said(b)

const isItems = (a: Json): a is ({ id: string } & Thing)[] =>
  Array.isArray(a) && a.every((x) => x !== null && typeof x === 'object' && typeof (x as Thing)['id'] === 'string')

/** One list of things with ids, changed on two sides since `base`. A thing only
 *  one side changed takes that side's change, a thing one side took away goes,
 *  and where both changed one thing, field by field, this side wins. */
export const mergeItems = <T extends { id: string }>(base: T[], mine: T[], theirs: T[]): T[] => {
  const at = (list: T[]): Map<string, T> => new Map(list.map((x) => [x.id, x]))
  const [was, here, there] = [at(base), at(mine), at(theirs)]
  const out: T[] = []
  const one = (id: string): void => {
    const [b, m, t] = [was.get(id), here.get(id), there.get(id)]
    if (m === undefined && t === undefined) return
    if (m === undefined) {
      // Taken away here. If they changed it since, their change keeps it.
      if (b === undefined || !sameDoc(b, t)) out.push(t as T)
      return
    }
    if (t === undefined) {
      if (b === undefined || !sameDoc(b, m)) out.push(m)
      return
    }
    out.push(mergeDoc(b ?? null, m, t) as T)
  }
  const ids = [...new Set([...theirs.map((x) => x.id), ...mine.map((x) => x.id)])]
  ids.forEach(one)
  return out
}

/** One document changed on two sides since `base`, down through every list of
 *  things with ids. A value one side changed takes that change; where both
 *  changed it, this side wins. */
export const mergeDoc = <T>(base: T | null, mine: T, theirs: T): T => {
  if (sameDoc(mine, theirs)) return mine
  if (sameDoc(base, theirs)) return mine
  if (sameDoc(base, mine)) return theirs
  const [b, m, t] = [(base ?? {}) as Thing, mine as Thing, theirs as Thing]
  if (typeof m !== 'object' || m === null || typeof t !== 'object' || t === null || Array.isArray(m) || Array.isArray(t)) return mine
  const out: Thing = {}
  for (const key of new Set([...Object.keys(t), ...Object.keys(m)])) {
    const [bv, mv, tv] = [b[key], m[key], t[key]]
    if (isItems(mv) && isItems(tv) && (bv === undefined || isItems(bv))) out[key] = mergeItems(bv ?? [], mv, tv)
    else if (sameDoc(bv, tv)) out[key] = mv
    else if (sameDoc(bv, mv)) out[key] = tv
    else if (mv !== null && tv !== null && typeof mv === 'object' && typeof tv === 'object' && !Array.isArray(mv) && !Array.isArray(tv) && 'id' in mv)
      out[key] = mergeDoc(bv ?? null, mv, tv)
    else out[key] = mv
    if (out[key] === undefined) delete out[key]
  }
  return out as T
}

/** Takes back one of this member's own steps, leaving what anyone else has done
 *  since: what the step changed goes back, and nothing else moves. */
export const undoStep = <T>(before: T, after: T, now: T): T => mergeDoc(after, before, now)

export type Tally = {
  moved: Record<string, number>
  added: Record<string, number>
  changed: Record<string, number>
  removed: Record<string, number>
}

const NOUNS: Record<string, string> = { children: 'card', wires: 'wire', items: 'note', notes: 'note', systems: 'software system', members: 'member', shallow: 'shallow software system' }
const WHERE = new Set(['x', 'y', 'w', 'h', 'room', 'near', 'from', 'to'])

const bump = (into: Record<string, number>, noun: string): void => {
  into[noun] = (into[noun] ?? 0) + 1
}

/** What changed between two versions of a sketch, a map or a project, counted
 *  in the words people use. */
export const tally = (before: Json, after: Json): Tally => {
  const count: Tally = { moved: {}, added: {}, changed: {}, removed: {} }
  const walk = (b: Thing, a: Thing): void => {
    for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const [bv, av] = [b[key], a[key]]
      if (key === 'spots') {
        const was = new Map(((bv ?? []) as { id: string }[]).map((s) => [s.id, s]))
        for (const spot of (av ?? []) as { id: string }[]) if (!sameDoc(was.get(spot.id), spot) && was.has(spot.id)) bump(count.moved, 'card')
        if (!Object.keys(count.moved).length && !sameDoc(bv ?? [], av ?? [])) bump(count.moved, 'card')
        continue
      }
      const noun = NOUNS[key]
      if (!noun || !isItems(bv ?? []) || !isItems(av ?? [])) continue
      const was = new Map(((bv ?? []) as ({ id: string } & Thing)[]).map((x) => [x.id, x]))
      const now = new Map(((av ?? []) as ({ id: string } & Thing)[]).map((x) => [x.id, x]))
      for (const [id, item] of now) {
        const old = was.get(id)
        if (!old) {
          bump(count.added, noun)
          walk({}, item)
          continue
        }
        if (sameDoc(old, item)) continue
        const fields = new Set([...Object.keys(old), ...Object.keys(item)])
        const differ = [...fields].filter((f) => !sameDoc(old[f], item[f]) && !NOUNS[f])
        if (differ.length && differ.every((f) => WHERE.has(f))) bump(count.moved, noun)
        else if (differ.length) bump(count.changed, noun)
        walk(old, item)
      }
      for (const id of was.keys()) if (!now.has(id)) bump(count.removed, noun)
    }
    if (b !== null && a !== null) {
      const [bl, al] = [b['layers'], a['layers']]
      if (Array.isArray(bl) || Array.isArray(al)) {
        const was = new Map(((bl ?? []) as ({ id: string } & Thing)[]).map((l) => [l.id, l]))
        for (const layer of (al ?? []) as ({ id: string } & Thing)[]) walk(was.get(layer.id) ?? {}, layer)
        for (const layer of (bl ?? []) as ({ id: string } & Thing)[]) if (!((al ?? []) as { id: string }[]).some((l) => l.id === layer.id)) walk(layer, {})
      }
    }
  }
  walk((before ?? {}) as Thing, (after ?? {}) as Thing)
  return count
}

const many = (n: number, noun: string): string => `${n === 1 ? (/^[aeiou]/.test(noun) ? 'an' : 'a') : n} ${noun}${n === 1 ? '' : 's'}`

/** A tally as a line for the history: "moved 12 cards, added 2 notes". */
export const wordsFor = (count: Tally): string => {
  const part = (verb: string, what: Record<string, number>): string[] =>
    Object.entries(what).map(([noun, n]) => `${verb} ${many(n, noun)}`)
  const all = [...part('moved', count.moved), ...part('added', count.added), ...part('changed', count.changed), ...part('took away', count.removed)]
  return all.join(', ') || 'made a change'
}
