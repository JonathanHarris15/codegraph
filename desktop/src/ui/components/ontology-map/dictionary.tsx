// codegraph: component ontology-map
// The ontology map as a dictionary: the place to write. An index down the
// side, a block for each software system, and one entry at a time as a sheet
// on the drafting paper, every part of it a field, written to its file as it
// changes (ADR 0038).
import { CornerDownRight, Network, Plus, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Diff } from './changes.js'
import {
  ADR_SECTIONS,
  adrFileOf,
  adrKey,
  changeOf,
  findingsOf,
  nameOf,
  termFileOf,
  termKey,
  type Edits,
  type FileChange,
  type HowMany,
  type Model as Ontology,
  type Rule,
  type ViewAdr as Adr,
  type ViewTerm as Term,
  written,
} from './model.js'

const HOW: { value: HowMany; words: string }[] = [
  { value: 'one', words: '1' },
  { value: 'none or one', words: '0–1' },
  { value: 'many', words: 'Many' },
]

type Props = {
  ontology: Ontology
  edits: Edits
  open: string
  onOpen: (key: string) => void
  onGraph: (key: string) => void
}

export const DictionaryView = ({ ontology, edits, open, onOpen, onGraph }: Props) => {
  const [query, setQuery] = useState('')
  const fits = (...words: string[]): boolean => words.some((w) => w.toLowerCase().includes(query.toLowerCase()))
  const term = ontology.terms.find((t) => termKey(t) === open)
  const adr = ontology.adrs.find((a) => adrKey(a) === open)
  const changed = (repo: string, file: string): boolean => changeOf(ontology, repo, file) !== undefined

  return (
    <div className="od">
      <nav className="od-index" aria-label="Terms and decisions">
        <div className="od-search">
          <Search size={14} aria-hidden="true" />
          <input className="ds-input" aria-label="Find a term or decision" placeholder="Find a word or decision" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {ontology.repos.map(({ address: repo, here }) => (
          <section key={repo} className="od-repo" aria-label={nameOf(ontology, repo)}>
            <h4 className="od-repo-head">
              <span className="od-repo-mark" aria-hidden="true" />
              <span className="od-label">{nameOf(ontology, repo)}</span>
              <span className="od-repo-count" title="Terms · decisions">
                {ontology.terms.filter((t) => t.repo === repo).length} · {ontology.adrs.filter((a) => a.repo === repo).length}
              </span>
            </h4>
            {here ? null : <p className="od-quiet od-away">Not on this computer. Link or clone its working copy to read and write its terms.</p>}
            <span className="od-group od-label">
              Terms
              <button type="button" disabled={!here} aria-label={`New term in ${nameOf(ontology, repo)}`} onClick={() => {
                const name = `New term ${ontology.terms.filter((t) => t.repo === repo).length + 1}`
                edits.addTerm(repo, name)
                onOpen(termKey({ repo, name }))
              }}>
                <Plus size={12} />
              </button>
            </span>
            {ontology.terms
              .filter((t) => t.repo === repo && fits(t.name, t.says))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => {
                const found = findingsOf(ontology, termKey(t))[0]
                return (
                  <button key={termKey(t)} type="button" className="od-item" aria-current={open === termKey(t)} onClick={() => onOpen(termKey(t))}>
                    <span className={`og-glyph og-glyph--${t.borrowed ? 'borrowed' : t.store ? 'terms' : 'word'}`} aria-hidden="true" />
                    <span className="od-item-name">{t.name}</span>
                    {changed(t.repo, termFileOf(t)) ? <span className="od-edited od-label">Edited</span> : null}
                    {found ? <span className={`od-dot od-dot--${found.tone}`} title={found.says} /> : null}
                  </button>
                )
              })}
            <span className="od-group od-label">
              Decisions
              <button type="button" disabled={!here} aria-label={`New decision in ${nameOf(ontology, repo)}`} onClick={() => {
                const number = Math.max(0, ...ontology.adrs.filter((a) => a.repo === repo).map((a) => a.number)) + 1
                onOpen(adrKey({ repo, number: edits.addAdr(repo, 'A new decision') || number }))
              }}>
                <Plus size={12} />
              </button>
            </span>
            {ontology.adrs
              .filter((a) => a.repo === repo && fits(a.title, a.context, a.decision))
              .map((a) => {
                const found = findingsOf(ontology, adrKey(a))[0]
                return (
                  <button key={adrKey(a)} type="button" className="od-item" aria-current={open === adrKey(a)} onClick={() => onOpen(adrKey(a))}>
                    <span className={`og-glyph og-glyph--decisions og-glyph--${a.status}`} aria-hidden="true" />
                    <span className={a.status === 'replaced' ? 'od-item-name od-struck' : 'od-item-name'}>
                      <span className="od-num">{a.number}</span> {a.title}
                    </span>
                    {changed(a.repo, adrFileOf(a)) ? <span className="od-edited od-label">Edited</span> : null}
                    {written(a) < ADR_SECTIONS.length ? <span className="od-sections" title={`${written(a)} of ${ADR_SECTIONS.length} sections written`}>{written(a)}/{ADR_SECTIONS.length}</span> : null}
                    {found ? <span className={`od-dot od-dot--${found.tone}`} title={found.says} /> : null}
                  </button>
                )
              })}
          </section>
        ))}
      </nav>

      <main className="od-paper">
        {term ? (
          <TermEntry key={open} term={term} ontology={ontology} edits={edits} change={changeOf(ontology, term.repo, termFileOf(term))} onOpen={onOpen} onGraph={onGraph} />
        ) : adr ? (
          <AdrEntry key={open} adr={adr} ontology={ontology} edits={edits} change={changeOf(ontology, adr.repo, adrFileOf(adr))} onOpen={onOpen} onGraph={onGraph} />
        ) : (
          <p className="od-empty">Pick a term or a decision to read and write it.</p>
        )}
      </main>
    </div>
  )
}

/** The foot of an entry: the file it is, and what has changed in it. */
const FileFoot = ({ file, change }: { file: string; change: FileChange | undefined }) => (
  <footer className="od-foot">
    <span className="od-label">File</span>
    <code>{file}</code>
    {change ? <Diff changes={[change]} compact bare /> : <span className="od-quiet">No changes to commit.</span>}
  </footer>
)

/** A term's name, changed when the person leaves the field, so its file is
 *  moved once and not on every key. */
const TermName = ({ term, edits, onOpen }: { term: Term; edits: Edits; onOpen: (key: string) => void }) => {
  const [name, setName] = useState(term.name)
  const done = (): void => {
    const now = name.trim()
    if (!now || now === term.name) return setName(term.name)
    edits.changeTerm(term.repo, term.name, { name: now })
    onOpen(termKey({ repo: term.repo, name: now }))
  }
  return (
    <input
      className="od-name od-name-input"
      aria-label="Term"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

const Ref = ({ words, onClick }: { words: string; onClick: () => void }) => (
  <button type="button" className="od-ref" onClick={onClick}>
    {words}
  </button>
)

const TermEntry = ({ term, ontology, edits, change, onOpen, onGraph }: { term: Term; ontology: Ontology; edits: Edits; change: FileChange | undefined; onOpen: (key: string) => void; onGraph: (key: string) => void }) => {
  const locked = term.borrowed !== null
  const set = (c: Partial<Term>): void => edits.changeTerm(term.repo, term.name, c)
  const [avoid, setAvoid] = useState('')
  const pointedBy = ontology.terms.filter((t) => t.repo === term.repo && t.pointsAt.some((l) => l.term === term.name))
  const decided = ontology.adrs.filter((a) => a.repo === term.repo && (a.terms.includes(term.name) || term.settledBy.includes(a.number)))
  const borrowers = ontology.terms.filter((t) => t.borrowed?.from === term.repo && t.name === term.name)
  const others = ontology.terms.filter((t) => t.repo === term.repo && t.name !== term.name && !term.pointsAt.some((l) => l.term === t.name))

  return (
    <article className="od-entry ds-card" aria-label={`Term ${term.name}`}>
      <header className="od-entry-head">
        <span className="od-label od-kind od-kind--term">
          {locked ? `Borrowed term · ${nameOf(ontology, term.repo)} ← ${nameOf(ontology, term.borrowed!.from)} @ ${term.borrowed!.commit}` : `Term · ${nameOf(ontology, term.repo)}`}
        </span>
        <button type="button" className="ds-button ds-button--bare" onClick={() => onGraph(termKey(term))}>
          <Network size={14} aria-hidden="true" /> Show in graph
        </button>
      </header>
      {locked ? <h1 className="od-name">{term.name}</h1> : <TermName term={term} edits={edits} onOpen={onOpen} />}
      {locked ? (
        <p className="od-lock">
          <CornerDownRight size={14} aria-hidden="true" /> A copy, kept as {nameOf(ontology, term.borrowed!.from)} wrote it. Change it there, then borrow it again.{' '}
          <Ref words="Open the original" onClick={() => onOpen(termKey({ repo: term.borrowed!.from, name: term.name }))} />
        </p>
      ) : null}
      {findingsOf(ontology, termKey(term)).map((f) => (
        <p key={f.says} className={`od-finding od-finding--${f.tone}`}>
          <span className="od-label">{f.tone === 'problem' ? 'Check fails' : 'Out of date'}</span> {f.says}
        </p>
      ))}

      <label className="ds-field od-means">
        <span className="ds-label">What it means</span>
        <textarea className="ds-input od-prose" rows={3} readOnly={locked} value={term.says} placeholder="Say what one of these is, in a sentence or two." onChange={(e) => set({ says: e.target.value })} />
      </label>

      <div className="od-tiles">
        <label className="od-tile ds-field">
          <span className="ds-label">Kept in store</span>
          <input className="ds-input od-mono" readOnly={locked} value={term.store} placeholder="none: a word, not a record" onChange={(e) => set({ store: e.target.value })} />
        </label>
        <div className="od-tile">
          <span className="ds-label">Decided in</span>
          {decided.length ? decided.map((a) => <Ref key={a.number} words={`${a.number}. ${a.title}`} onClick={() => onOpen(adrKey(a))} />) : <span className="od-quiet">No decision behind it yet.</span>}
        </div>
        <div className="od-tile">
          <span className="ds-label">Never say</span>
          <div className="od-chips">
            {term.avoid.map((w) => (
              <span key={w} className="od-chip">
                {w}
                {locked ? null : (
                  <button type="button" className="od-chip-x" aria-label={`Allow ${w}`} onClick={() => set({ avoid: term.avoid.filter((a) => a !== w) })}>
                    <X size={10} />
                  </button>
                )}
              </span>
            ))}
            {locked ? null : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (avoid.trim() && !term.avoid.includes(avoid.trim())) set({ avoid: [...term.avoid, avoid.trim()] })
                  setAvoid('')
                }}
              >
                <input className="ds-input od-chip-input" aria-label="Add a word to avoid" placeholder="+ word" value={avoid} onChange={(e) => setAvoid(e.target.value)} />
              </form>
            )}
          </div>
        </div>
        <div className="od-tile">
          <span className="ds-label">{borrowers.length ? 'Pointed at by · borrowed by' : 'Pointed at by'}</span>
          <div className="od-chips">
            {pointedBy.map((t) => <Ref key={t.name} words={t.name} onClick={() => onOpen(termKey(t))} />)}
            {borrowers.map((t) => <Ref key={t.repo} words={`↳ ${nameOf(ontology, t.repo)}`} onClick={() => onOpen(termKey(t))} />)}
            {!pointedBy.length && !borrowers.length ? <span className="od-quiet">Nothing yet.</span> : null}
          </div>
        </div>
      </div>

      <section className="od-section">
        <span className="ds-label">Each one points at</span>
        <table className="od-table">
          <thead>
            <tr>
              <th className="od-label">How many</th>
              <th className="od-label">Term</th>
              <th className="od-label">Read as</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {term.pointsAt.map((l) => (
              <tr key={l.term}>
                <td>
                  <div className="od-segments" role="radiogroup" aria-label={`How many ${l.term}`}>
                    {HOW.map((h) => (
                      <button key={h.value} type="button" role="radio" aria-checked={l.howMany === h.value} disabled={locked} onClick={() => edits.link(term.repo, term.name, l.term, h.value)}>
                        {h.words}
                      </button>
                    ))}
                  </div>
                </td>
                <td>
                  <Ref words={l.term} onClick={() => onOpen(termKey({ repo: term.repo, name: l.term }))} />
                </td>
                <td>
                  <input
                    className="ds-input od-inline"
                    aria-label={`Words for ${l.term}`}
                    readOnly={locked}
                    value={l.says}
                    placeholder={`${term.name} → ${l.term}`}
                    onChange={(e) => set({ pointsAt: term.pointsAt.map((p) => (p.term === l.term ? { ...p, says: e.target.value } : p)) })}
                  />
                </td>
                <td>
                  {locked ? null : (
                    <button type="button" className="ds-button ds-button--bare" aria-label={`Stop pointing at ${l.term}`} onClick={() => edits.unlink(term.repo, term.name, l.term)}>
                      <X size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {locked || !others.length ? null : (
              <tr className="od-add-row">
                <td colSpan={4}>
                  <select className="ds-input" aria-label="Point at another term" value="" onChange={(e) => e.target.value && edits.link(term.repo, term.name, e.target.value, 'one')}>
                    <option value="">+ Point at another term</option>
                    {others.map((t) => (
                      <option key={t.name}>{t.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <FileFoot file={termFileOf(term)} change={change} />
    </article>
  )
}

const RULE_KINDS: Rule['kind'][] = ['never reaches', 'only through', 'only writer']
const blankRule = (kind: Rule['kind']): Rule =>
  kind === 'never reaches' ? { kind, from: '', to: '' } : kind === 'only through' ? { kind, to: '', by: '' } : { kind, store: '', by: '' }
/** A rule's two blanks, in the order its sentence reads. */
const blanks = (r: Rule): [string, string, string, string, string] =>
  r.kind === 'never reaches' ? ['from', r.from, 'never reaches', 'to', r.to] : r.kind === 'only through' ? ['by', r.by, 'is the only way to', 'to', r.to] : ['by', r.by, 'is the only writer of', 'store', r.store]

/** A box for a section's words that grows with what is written in it. */
const Words = ({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) => (
  <textarea
    className="ds-input od-words"
    rows={rows}
    value={value}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
  />
)

/** A numbered section of the ADR template, which says when it is still empty. */
const Part = ({ n, name, empty, children }: { n: number; name: string; empty: boolean; children: React.ReactNode }) => (
  <section className={empty ? 'od-part od-part--empty' : 'od-part'}>
    <h3 className="od-part-head">
      <span className="od-part-n">{n}</span>
      <span className="ds-label">{name}</span>
      {empty ? <span className="od-part-todo">to write</span> : null}
    </h3>
    {children}
  </section>
)

/** Words in a list, as chips, with one more typed in after them. */
const ChipList = ({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) => {
  const [word, setWord] = useState('')
  return (
    <div className="od-chips">
      {values.map((w) => (
        <span key={w} className="od-chip od-chip--plain">
          {w}
          <button type="button" className="od-chip-x" aria-label={`Take away ${w}`} onClick={() => onChange(values.filter((x) => x !== w))}>
            <X size={10} />
          </button>
        </span>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (word.trim() && !values.includes(word.trim())) onChange([...values, word.trim()])
          setWord('')
        }}
      >
        <input className="ds-input od-chip-input" aria-label={placeholder} placeholder={`+ ${placeholder}`} value={word} onChange={(e) => setWord(e.target.value)} />
      </form>
    </div>
  )
}

const AdrEntry = ({ adr, ontology, edits, change, onOpen, onGraph }: { adr: Adr; ontology: Ontology; edits: Edits; change: FileChange | undefined; onOpen: (key: string) => void; onGraph: (key: string) => void }) => {
  const set = (c: Partial<Adr>): void => edits.changeAdr(adr.repo, adr.number, c)
  const replacedBy = ontology.adrs.find((a) => a.repo === adr.repo && a.replaces.includes(adr.number))
  const terms = ontology.terms.filter((t) => t.repo === adr.repo && !t.borrowed)
  const setRule = (i: number, r: Rule): void => set({ rules: adr.rules.map((x, j) => (j === i ? r : x)) })
  const [draft, setDraft] = useState<Rule | null>(null)
  const putDraft = (r: Rule): void => {
    const [, v1, , , v2] = blanks(r)
    if (v1.trim() && v2.trim()) {
      set({ rules: [...adr.rules, r] })
      setDraft(null)
    } else setDraft(r)
  }
  const setAlt = (i: number, c: Partial<Adr['alternatives'][number]>): void =>
    set({ alternatives: adr.alternatives.map((x, j) => (j === i ? { ...x, ...c } : x)) })
  const others = ontology.adrs.filter((a) => a.repo === adr.repo && a.number !== adr.number && !adr.replaces.includes(a.number))

  return (
    <article className="od-entry ds-card" aria-label={`ADR ${adr.number}`}>
      <header className="od-entry-head">
        <span className="od-label od-kind od-kind--adr">
          Decision · ADR {adr.number} · {nameOf(ontology, adr.repo)}
        </span>
        <span className="od-progress" title="Sections of the ADR template written">
          <span className="od-progress-bar">
            <span style={{ width: `${(written(adr) / ADR_SECTIONS.length) * 100}%` }} />
          </span>
          <span className="od-label">
            {written(adr)}/{ADR_SECTIONS.length} written
          </span>
        </span>
        <button type="button" className="ds-button ds-button--bare" onClick={() => onGraph(adrKey(adr))}>
          <Network size={14} aria-hidden="true" /> Show in graph
        </button>
      </header>
      <input className="od-name od-name-input" aria-label="Decision" value={adr.title} placeholder="The decision, as a sentence" onChange={(e) => set({ title: e.target.value })} />
      <div className="od-segments od-status" role="radiogroup" aria-label="Status">
        {(['proposed', 'accepted', 'replaced'] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={adr.status === s} onClick={() => set({ status: s })}>
            {s}
          </button>
        ))}
      </div>
      {replacedBy ? (
        <p className="od-lock">
          Replaced by <Ref words={`ADR ${replacedBy.number}`} onClick={() => onOpen(adrKey(replacedBy))} />. Its rules no longer hold.
        </p>
      ) : null}
      {findingsOf(ontology, adrKey(adr)).map((f) => (
        <p key={f.says} className={`od-finding od-finding--${f.tone}`}>
          <span className="od-label">{f.tone === 'problem' ? 'Code breaks it' : 'Would break'}</span> {f.says}
        </p>
      ))}

      {/* Who and when: the template's metadata, as tiles two to a row. */}
      <div className="od-tiles">
        <label className="od-tile ds-field">
          <span className="ds-label">Date decided</span>
          <input className="ds-input od-mono" type="date" value={adr.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="od-tile ds-field">
          <span className="ds-label">Area</span>
          <input className="ds-input" value={adr.area} placeholder="backend, frontend, data, AI, infra" onChange={(e) => set({ area: e.target.value })} />
        </label>
        <div className="od-tile">
          <span className="ds-label">Deciders</span>
          <ChipList values={adr.deciders} onChange={(deciders) => set({ deciders })} placeholder="person" />
        </div>
        <label className="od-tile ds-field">
          <span className="ds-label">Consulted</span>
          <input className="ds-input" value={adr.consulted} placeholder="Who was asked, and while doing what" onChange={(e) => set({ consulted: e.target.value })} />
        </label>
        <div className="od-tile">
          <span className="ds-label">Related docs</span>
          <ChipList values={adr.related} onChange={(related) => set({ related })} placeholder="doc or ticket" />
        </div>
        <div className="od-tile">
          <span className="ds-label">Replaces · replaced by</span>
          <div className="od-chips">
            {adr.replaces.map((n) => (
              <span key={n} className="od-chip od-chip--term">
                <Ref words={`ADR ${n}`} onClick={() => onOpen(adrKey({ repo: adr.repo, number: n }))} />
                <button type="button" className="od-chip-x" aria-label={`Stop replacing ADR ${n}`} onClick={() => set({ replaces: adr.replaces.filter((x) => x !== n) })}>
                  <X size={10} />
                </button>
              </span>
            ))}
            {others.length ? (
              <select className="ds-input od-chip-input" aria-label="Replace another ADR" value="" onChange={(e) => e.target.value && set({ replaces: [...adr.replaces, Number(e.target.value)] })}>
                <option value="">+ replaces</option>
                {others.map((a) => (
                  <option key={a.number} value={a.number}>
                    {a.number}. {a.title}
                  </option>
                ))}
              </select>
            ) : null}
            {replacedBy ? <span className="od-quiet">← replaced by ADR {replacedBy.number}</span> : null}
          </div>
        </div>
        <div className="od-tile od-tile--wide">
          <span className="ds-label">Terms it settles</span>
          <div className="od-chips">
            {adr.terms.map((t) => (
              <span key={t} className="od-chip od-chip--term">
                <Ref words={t} onClick={() => onOpen(termKey({ repo: adr.repo, name: t }))} />
                <button type="button" className="od-chip-x" aria-label={`Stop settling ${t}`} onClick={() => set({ terms: adr.terms.filter((x) => x !== t) })}>
                  <X size={10} />
                </button>
              </span>
            ))}
            <select className="ds-input od-chip-input" aria-label="Settle another term" value="" onChange={(e) => e.target.value && set({ terms: [...adr.terms, e.target.value] })}>
              <option value="">+ term</option>
              {terms
                .filter((t) => !adr.terms.includes(t.name))
                .map((t) => (
                  <option key={t.name}>{t.name}</option>
                ))}
            </select>
          </div>
        </div>
      </div>

      <Part n={1} name="Context" empty={!adr.context.trim()}>
        <Words value={adr.context} onChange={(context) => set({ context })} placeholder="What problem this solves, and why now. The constraints that matter: deadline, cost, skills, what exists already." />
      </Part>

      <Part n={2} name="Decision" empty={!adr.decision.trim()}>
        <Words value={adr.decision} onChange={(decision) => set({ decision })} placeholder="What was chosen, in one or two plain sentences, then what someone needs to act on it." />
        <span className="ds-label od-sub">Rules the code keeps to</span>
        <table className="od-table od-rules">
          <tbody>
            {adr.rules.map((r, i) => {
              const [k1, v1, verb, k2, v2] = blanks(r)
              const put = (key: string, value: string): void => setRule(i, { ...r, [key]: value } as Rule)
              return (
                <tr key={i}>
                  <td>
                    <input className="ds-input od-inline od-mono" aria-label={k1} value={v1} placeholder="module billing" onChange={(e) => put(k1, e.target.value)} />
                  </td>
                  <td>
                    <select className="ds-input od-verb" aria-label="Kind of rule" value={r.kind} onChange={(e) => setRule(i, blankRule(e.target.value as Rule['kind']))}>
                      {RULE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {blanks(blankRule(k))[2]}
                        </option>
                      ))}
                    </select>
                    <span className="od-verb-words">{verb}</span>
                  </td>
                  <td>
                    <input className="ds-input od-inline od-mono" aria-label={k2} value={v2} placeholder={k2 === 'store' ? 'garments' : 'any feature'} onChange={(e) => put(k2, e.target.value)} />
                  </td>
                  <td>
                    <button type="button" className="ds-button ds-button--bare" aria-label="Take the rule away" onClick={() => set({ rules: adr.rules.filter((_, j) => j !== i) })}>
                      <X size={12} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {draft
              ? (() => {
                  const [k1, v1, verb, k2, v2] = blanks(draft)
                  return (
                    <tr className="od-draft-row">
                      <td>
                        <input autoFocus className="ds-input od-inline od-mono" aria-label={`New rule ${k1}`} value={v1} placeholder="module billing" onChange={(e) => putDraft({ ...draft, [k1]: e.target.value } as Rule)} />
                      </td>
                      <td>
                        <span className="od-verb-words">{verb}</span>
                      </td>
                      <td>
                        <input className="ds-input od-inline od-mono" aria-label={`New rule ${k2}`} value={v2} placeholder={k2 === 'store' ? 'garments' : 'any feature'} onChange={(e) => putDraft({ ...draft, [k2]: e.target.value } as Rule)} />
                      </td>
                      <td>
                        <button type="button" className="ds-button ds-button--bare" aria-label="Drop the new rule" onClick={() => setDraft(null)}>
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  )
                })()
              : null}
            <tr className="od-add-row">
              <td colSpan={4}>
                <select className="ds-input" aria-label="Add a rule" value="" onChange={(e) => e.target.value && setDraft(blankRule(e.target.value as Rule['kind']))}>
                  <option value="">+ Add a rule the check holds the code to</option>
                  {RULE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </Part>

      <Part n={3} name="Alternatives" empty={!adr.alternatives.some((x) => x.whyNot.trim())}>
        <table className="od-table od-alts">
          <thead>
            <tr>
              <th className="od-label">Option</th>
              <th className="od-label">Why it lost</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {adr.alternatives.map((alt, i) => (
              <tr key={i}>
                <td>
                  <input className="ds-input od-inline od-alt-name" aria-label={`Option ${i + 1}`} value={alt.option} placeholder="Another way" onChange={(e) => setAlt(i, { option: e.target.value })} />
                </td>
                <td>
                  <textarea className="ds-input od-inline od-alt-why" aria-label={`Why option ${i + 1} lost`} rows={1} value={alt.whyNot} placeholder="Why it lost" onChange={(e) => setAlt(i, { whyNot: e.target.value })} />
                </td>
                <td>
                  <button type="button" className="ds-button ds-button--bare" aria-label={`Take away ${alt.option || 'this option'}`} onClick={() => set({ alternatives: adr.alternatives.filter((_, j) => j !== i) })}>
                    <X size={12} />
                  </button>
                </td>
              </tr>
            ))}
            <tr className="od-add-row">
              <td colSpan={3}>
                <button type="button" className="ds-button ds-button--bare" onClick={() => set({ alternatives: [...adr.alternatives, { option: '', whyNot: '' }] })}>
                  <Plus size={12} /> Another option
                </button>
                {adr.alternatives.some((x) => x.option.toLowerCase() === 'do nothing') ? null : (
                  <button type="button" className="ds-button ds-button--bare" onClick={() => set({ alternatives: [...adr.alternatives, { option: 'Do nothing', whyNot: '' }] })}>
                    <Plus size={12} /> Do nothing
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </Part>

      <Part n={4} name="Evidence" empty={!adr.evidence.trim()}>
        <Words value={adr.evidence} onChange={(evidence) => set({ evidence })} placeholder="What backs it: research, benchmarks, cost estimates, prototypes, test results, links." rows={2} />
      </Part>

      <Part n={5} name="Consequences" empty={!adr.good.trim() && !adr.bad.trim()}>
        <div className="od-consequences">
          <label className="od-tile ds-field od-tile--good">
            <span className="ds-label">Good</span>
            <Words value={adr.good} onChange={(good) => set({ good })} placeholder="What gets easier" rows={2} />
          </label>
          <label className="od-tile ds-field od-tile--bad">
            <span className="ds-label">Bad</span>
            <Words value={adr.bad} onChange={(bad) => set({ bad })} placeholder="What gets harder, and new risks" rows={2} />
          </label>
          <label className="od-tile ds-field">
            <span className="ds-label">Follow-up work</span>
            <Words value={adr.followUp} onChange={(followUp) => set({ followUp })} placeholder="What this leaves to do" rows={2} />
          </label>
        </div>
      </Part>

      <Part n={6} name="Revisit when" empty={!adr.revisit.trim()}>
        <Words value={adr.revisit} onChange={(revisit) => set({ revisit })} placeholder="The signal that reopens this: a cost, a count of people, a missed date, a new tool." rows={2} />
      </Part>

      <FileFoot file={adrFileOf(adr)} change={change} />
    </article>
  )
}
