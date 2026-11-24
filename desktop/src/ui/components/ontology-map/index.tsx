// codegraph: component ontology-map
// The ontology map, two ways: a graph to look at and play with, and a
// dictionary to write in. Each opens the other where you are. Every edit is
// written to its file in the repo's working copy, on a branch off the main
// line, and shows as a diff to commit (ADRs 0035, 0038).
import { BookOpen, Network, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Waiting } from '../../design-system/kit.js'
import { changeCount, RepoChanges } from './changes.js'
import { DictionaryView } from './dictionary.js'
import { GraphView } from './graph.js'
import { adrKey, blankAdr, blankTerm, modelOf, termKey, type Edits, type Model, type ViewAdr, type ViewTerm } from './model.js'
import './ontology-map.css'

type View = 'graph' | 'dictionary'
type Entry = { kind: 'term'; was: string; value: ViewTerm } | { kind: 'adr'; value: ViewAdr }

const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** How long after the last keystroke an entry is written to its file. */
const SETTLE = 450

export const OntologyMapView = ({ projectId, onClose }: { projectId: string; onClose: () => void }) => {
  const [server, setServer] = useState<Model | null>(null)
  // What has been changed here this session, by key: shown over what was read,
  // until the view closes, so a half-written entry is never undone by a reload.
  const [local, setLocal] = useState<Map<string, Entry>>(new Map())
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [view, setView] = useState<View>('graph')
  const [open, setOpen] = useState('')
  const [focus, setFocus] = useState('')
  const [drawer, setDrawer] = useState(false)
  const [problem, setProblem] = useState('')
  const [committed, setCommitted] = useState('')
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const load = useCallback(async () => {
    const shown = await window.codegraph.showOntology(projectId)
    setServer(modelOf(shown))
  }, [projectId])

  useEffect(() => {
    void load()
    const pending = timers.current
    return () => pending.forEach((t) => clearTimeout(t))
  }, [load])

  useEffect(() => {
    const keys = (e: KeyboardEvent): void => {
      if (typing(e.target)) return
      if (e.key === 'Escape') {
        if (drawer) setDrawer(false)
        else onClose()
      }
      if (e.key === 'g') setView('graph')
      if (e.key === 'd') setView('dictionary')
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [onClose, drawer])

  /** What the views see: what was read, with this session's changes over it. */
  const model = useMemo<Model | null>(() => {
    if (!server) return null
    const terms = server.terms.filter((t) => !gone.has(termKey(t)) && !local.has(termKey(t)))
    const adrs = server.adrs.filter((a) => !gone.has(adrKey(a)) && !local.has(adrKey(a)))
    for (const entry of local.values()) {
      if (entry.kind === 'term') terms.push(entry.value)
      else adrs.push(entry.value)
    }
    return { ...server, terms, adrs }
  }, [server, local, gone])

  const systemOf = (repo: string): string => server?.repos.find((r) => r.address === repo)?.systemId ?? ''

  /** Writes an entry to its file once typing has settled, then reads again. */
  const write = (key: string, entry: Entry): void => {
    clearTimeout(timers.current.get(key))
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key)
        const repo = entry.value.repo
        const saving =
          entry.kind === 'term'
            ? window.codegraph.saveTerm(projectId, systemOf(repo), {
                name: entry.value.name,
                says: entry.value.says,
                store: entry.value.store,
                pointsAt: entry.value.pointsAt,
                avoid: entry.value.avoid,
                settledBy: entry.value.settledBy,
              }, entry.was)
            : window.codegraph.saveAdr(projectId, systemOf(repo), (({ repo: _r, file: _f, ...adr }) => adr)(entry.value))
        void saving.then(async (done) => {
          setProblem(done.ok ? '' : done.problem)
          if (done.ok && entry.kind === 'term')
            setLocal((all) => {
              const now = all.get(key)
              if (now?.kind !== 'term') return all
              const next = new Map(all)
              next.set(key, { ...now, was: now.value.name })
              return next
            })
          await load()
        })
      }, SETTLE),
    )
  }

  const putTerm = (key: string, value: ViewTerm, was: string): void => {
    const newKey = termKey(value)
    setLocal((all) => {
      const next = new Map(all)
      next.delete(key)
      const entry: Entry = { kind: 'term', was, value }
      next.set(newKey, entry)
      write(newKey, entry)
      return next
    })
    if (newKey !== key) setGone((g) => new Set(g).add(key))
  }

  const termNow = (repo: string, name: string): { term: ViewTerm; was: string } | null => {
    const key = termKey({ repo, name })
    const mine = local.get(key)
    if (mine?.kind === 'term') return { term: mine.value, was: mine.was }
    const read = model?.terms.find((t) => termKey(t) === key)
    return read ? { term: read, was: read.file ? read.name : '' } : null
  }

  const putAdr = (value: ViewAdr): void => {
    const key = adrKey(value)
    setLocal((all) => {
      const entry: Entry = { kind: 'adr', value }
      write(key, entry)
      return new Map(all).set(key, entry)
    })
  }

  const edits: Edits = {
    addTerm: (repo, name) => putTerm(termKey({ repo, name }), blankTerm(repo, name), ''),
    changeTerm: (repo, name, change) => {
      const now = termNow(repo, name)
      if (now) putTerm(termKey(now.term), { ...now.term, ...change }, now.was)
    },
    link: (repo, from, to, howMany) => {
      const now = termNow(repo, from)
      if (!now) return
      const { term } = now
      const pointsAt = term.pointsAt.some((l) => l.term === to)
        ? term.pointsAt.map((l) => (l.term === to ? { ...l, howMany } : l))
        : [...term.pointsAt, { term: to, howMany, says: '' }]
      putTerm(termKey(term), { ...term, pointsAt }, now.was)
    },
    unlink: (repo, from, to) => {
      const now = termNow(repo, from)
      if (now) putTerm(termKey(now.term), { ...now.term, pointsAt: now.term.pointsAt.filter((l) => l.term !== to) }, now.was)
    },
    addAdr: (repo, title) => {
      const number = Math.max(0, ...(model?.adrs ?? []).filter((a) => a.repo === repo).map((a) => a.number)) + 1
      putAdr(blankAdr(repo, number, title))
      return number
    },
    changeAdr: (repo, number, change) => {
      const now = model?.adrs.find((a) => a.repo === repo && a.number === number)
      if (now) putAdr({ ...now, ...change })
    },
  }

  const changes = model?.repos.flatMap((r) => r.changes) ?? []
  const withChanges = model?.repos.filter((r) => r.changes.length) ?? []

  return (
    <section className="op" aria-label="Ontology map">
      <header className="op-bar">
        <h2 className="op-title">Ontology map</h2>
        <div className="op-views" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === 'graph'} onClick={() => setView('graph')} title="Graph (G)">
            <Network size={14} aria-hidden="true" /> Graph
          </button>
          <button type="button" role="tab" aria-selected={view === 'dictionary'} onClick={() => setView('dictionary')} title="Dictionary (D)">
            <BookOpen size={14} aria-hidden="true" /> Dictionary
          </button>
        </div>
        {problem ? (
          <p className="op-problem" role="alert">
            {problem}
          </p>
        ) : null}
        <div className="op-bar-end">
          <button type="button" className={changes.length ? 'ds-button ds-button--loud' : 'ds-button'} aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>
            {changeCount(changes)}
          </button>
          <button type="button" className="ds-button ds-button--bare" aria-label="Close the ontology map" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="op-body">
        {!model ? (
          <div className="op-waiting">
            <Waiting what="Reading each repo's terms and decisions" />
          </div>
        ) : model.terms.length === 0 && model.adrs.length === 0 && view === 'graph' ? (
          <div className="op-empty">
            <h3>No terms or decisions yet</h3>
            <p>
              A repo keeps its terms in <code>codegraph/terms/</code> and its decisions in <code>codegraph/adr/</code>. Start one in the dictionary, or ask your
              agent to write the project's terms down.
            </p>
            <button type="button" className="ds-button ds-button--loud" onClick={() => setView('dictionary')}>
              <BookOpen size={14} aria-hidden="true" /> Open the dictionary
            </button>
          </div>
        ) : view === 'graph' ? (
          <GraphView
            ontology={model}
            edits={edits}
            focus={focus}
            onOpen={(key) => {
              setOpen(key)
              setView('dictionary')
            }}
          />
        ) : (
          <DictionaryView
            ontology={model}
            edits={edits}
            open={open || (model.terms[0] ? termKey(model.terms[0]) : model.adrs[0] ? adrKey(model.adrs[0]) : '')}
            onOpen={setOpen}
            onGraph={(key) => {
              setFocus(key)
              setView('graph')
            }}
          />
        )}

        {drawer && model ? (
          <aside className="op-drawer ds-sheet" aria-label="Changes to commit">
            <div className="op-drawer-head">
              <span className="ds-label">Changes to commit · {changeCount(changes)}</span>
              <button type="button" className="ds-button ds-button--bare" aria-label="Close" onClick={() => setDrawer(false)}>
                <X size={14} />
              </button>
            </div>
            {committed ? <p className="op-committed">{committed}</p> : null}
            {withChanges.length ? (
              withChanges.map((repo) => (
                <RepoChanges
                  key={repo.address}
                  repo={repo}
                  onCommit={async (message) => {
                    const done = await window.codegraph.commitOntology(projectId, repo.systemId, message)
                    if (done.ok) setCommitted(`Committed ${done.commit} in ${repo.name}, on ${repo.branch}. Push it when it is ready to share.`)
                    await load()
                    return done
                  }}
                />
              ))
            ) : (
              <p className="od-quiet">Nothing more to commit. Every edit is written as a file in its repo’s codegraph folder, and shows here until it is committed.</p>
            )}
          </aside>
        ) : null}
      </div>
    </section>
  )
}
