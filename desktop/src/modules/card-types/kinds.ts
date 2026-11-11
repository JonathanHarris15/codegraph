// codegraph: module card-types
import type { Level } from '../sketches/schema.js'

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
