// codegraph: component ontology-map
// What the ontology map has written and not committed, as a pull request
// shows it, and committing it, one repo at a time.
import { GitCommitHorizontal } from 'lucide-react'
import { useState } from 'react'
import type { FileChange, ViewRepo } from './model.js'

export const changeCount = (changes: FileChange[]): string =>
  changes.length === 0 ? 'No changes' : changes.length === 1 ? '1 file changed' : `${changes.length} files changed`

/** Changed files with their lines, a few lines of what stayed around each
 *  change. Bare, it leaves out each file's name. */
export const Diff = ({ changes, compact = false, bare = false }: { changes: FileChange[]; compact?: boolean; bare?: boolean }) => (
  <div className={compact ? 'op-diff op-diff--compact' : 'op-diff'}>
    {changes.map((c) => (
      <div key={c.file} className="op-diff-file">
        {bare ? null : (
          <div className="op-diff-name">
            <span className={`ds-badge ds-badge--${c.state === 'added' ? 'good' : c.state === 'removed' ? 'problem' : 'waiting'}`}>{c.state}</span>
            <code>{c.file}</code>
          </div>
        )}
        <pre>
          {c.lines
            .filter((l, i, all) => l.kind !== 'same' || all.slice(Math.max(0, i - 2), i + 3).some((n) => n.kind !== 'same'))
            .map((l, i) => (
              <span key={i} className={`op-line op-line--${l.kind}`}>
                {l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '− ' : '  '}
                {l.text}
                {'\n'}
              </span>
            ))}
        </pre>
      </div>
    ))}
  </div>
)

/** One repo's uncommitted changes to its codegraph/ folder, and the box that
 *  commits them on the branch they were written on. Pushing is the person's. */
export const RepoChanges = ({
  repo,
  onCommit,
}: {
  repo: ViewRepo
  onCommit: (message: string) => Promise<{ ok: boolean; commit: string; problem: string }>
}) => {
  const [message, setMessage] = useState('')
  const [said, setSaid] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <section className="op-repo-changes" aria-label={`Changes in ${repo.name}`}>
      <div className="op-repo-changes-head">
        <span className="ds-label">{repo.name}</span>
        <span className="od-quiet">
          {changeCount(repo.changes)} · on {repo.branch || 'no branch'}
        </span>
      </div>
      <Diff changes={repo.changes} />
      <label className="ds-field">
        <span className="ds-label">Commit message</span>
        <input className="ds-input" value={message} placeholder="Say what changed, like: An outfit can be worn many times" onChange={(e) => setMessage(e.target.value)} />
      </label>
      <button
        type="button"
        className="ds-button ds-button--loud"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void onCommit(message).then((done) => {
            setBusy(false)
            setSaid(done.ok ? '' : done.problem)
            if (done.ok) setMessage('')
          })
        }}
      >
        <GitCommitHorizontal size={14} aria-hidden="true" /> Commit to {repo.branch || 'this branch'}
      </button>
      {said ? <p className="od-quiet">{said}</p> : null}
    </section>
  )
}
