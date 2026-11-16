// codegraph: component levels-help
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** The four levels codegraph draws, from the outside in, as C4 names them,
 *  in the app's own words. */
const LEVELS = [
  {
    name: 'Context',
    open: 'Open a project',
    says: 'Who uses its software, its software systems, and the systems run by someone else that it calls on.',
  },
  {
    name: 'Containers',
    open: 'Open a software system',
    says: 'The parts that each run on their own: a browser app, a server, a phone app, a database. A software system is kept in one repo or several.',
  },
  {
    name: 'Components',
    open: 'Open a container',
    says: 'The parts inside it, each doing one job behind a clear front: modules, features, pages and triggers.',
  },
  {
    name: 'Code',
    open: 'Open a component',
    says: 'Its files, and the names inside them.',
  },
] as const

// Which level the board shows, said by whichever page has one open; -1 for
// none. Kept here so the corner button can mark it wherever it is drawn.
let here = -1
const told = new Set<() => void>()
const listen = (heard: () => void): (() => void) => {
  told.add(heard)
  return () => told.delete(heard)
}

/** Says which level a page is showing: 0 for context, out to 3 for code, or
 *  -1 once it shows none. */
export const showLevel = (level: number): void => {
  if (level === here) return
  here = level
  for (const heard of told) heard()
}

/** The level a card's insides are drawn at, by the card's own level. */
export const levelInside = (level: string | undefined): number =>
  level === 'project' ? 0 : level === 'system' ? 1 : level === 'container' ? 2 : level === 'component' ? 3 : -1

/** A ? in the corner of every page, always in reach, that says what each of
 *  the four levels shows and how to get to it, and marks the one on the board
 *  now. */
export const LevelsHelp = () => {
  const [open, setOpen] = useState(false)
  const now = useSyncExternalStore(listen, () => here)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [open])
  return (
    <div className="levels-help" ref={box}>
      {open ? (
        <section className="levels-help-card" role="dialog" aria-label="The four levels">
          <h2 className="levels-help-title">The four levels</h2>
          <p className="levels-help-lead">Codegraph draws your software at four depths, as C4 does. Double-click a card to go one level in.</p>
          <ol className="levels-help-list">
            {LEVELS.map((level, i) => (
              <li key={level.name} className={i === now ? 'levels-help-level levels-help-level--here' : 'levels-help-level'} aria-current={i === now ? 'step' : undefined}>
                <span className="levels-help-number" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="levels-help-words">
                  <span className="levels-help-name">
                    {level.name}
                    {i === now ? <span className="levels-help-here">You are here</span> : null}
                  </span>
                  <span className="levels-help-open">{level.open}</span>
                  <span className="levels-help-says">{level.says}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <button
        type="button"
        className={open ? 'levels-help-button levels-help-button--open' : 'levels-help-button'}
        aria-label="What the four levels are"
        aria-expanded={open}
        title="What the four levels are"
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
    </div>
  )
}
