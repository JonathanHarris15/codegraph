// codegraph: module card-types
import { isStore, type Level } from '../sketches/schema.js'

/** The level drawn inside a card of each level. */
export const levelInside: Record<Level, Level> = {
  project: 'system',
  system: 'container',
  container: 'component',
  component: 'code',
  code: 'code',
}

/** The kinds a card can be at each level, the usual first. A person is drawn
 *  beside the software systems and never read from code, so it is only ever
 *  on a sketch. Inside a software system these are the blank card, and the
 *  kinds that do more than look a certain way, a database and a page. The rest
 *  are templates (ADR 0013). */
export const kindsAt: Record<Level, string[]> = {
  project: ['project'],
  system: ['software system', 'shallow software system', 'person'],
  container: ['card', 'database'],
  component: ['card', 'page'],
  code: ['file'],
}

/** The kinds code already has words for, each a template. */
export const kindsInCode: Partial<Record<Level, string[]>> = {
  container: ['web app', 'browser app', 'server', 'desktop app', 'mobile app', 'database', 'files on disk', 'function', 'command-line tool'],
  component: ['page', 'feature', 'module', 'trigger'],
}

/** What is drawn inside a database, or files on disk: its stores. */
export const keepsThings = (kind: string): boolean => kind === 'database' || kind === 'files on disk'

/** What can be drawn inside a card: the level its insides are on, and the kinds
 *  that go there, the usual first. A database holds stores, a store holds inner
 *  stores, and a person or a file holds nothing. At the container and component
 *  levels a person's own card types, by name, go too. */
export const kindsInside = (card: { level: Level; kind: string }, saved: string[] = []): { level: Level; kinds: string[] } => {
  if (card.kind === 'person' || card.level === 'code') return { level: card.level, kinds: [] }
  if (isStore(card.kind)) return { level: card.level, kinds: ['inner store'] }
  if (keepsThings(card.kind) && card.level === 'container') return { level: card.level, kinds: ['store'] }
  const level = levelInside[card.level]
  const kinds =
    level === 'container' || level === 'component' ? [...new Set([...kindsAt[level], ...(kindsInCode[level] ?? []), ...saved])] : kindsAt[level]
  return { level, kinds }
}
