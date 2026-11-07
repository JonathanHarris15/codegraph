// codegraph: component revisions-panel
import { useEffect, useState } from 'react'
import type { Revision } from '../../features/list-revisions.js'
import { Button } from '../design-system/kit.js'

const when = (at: string): string => new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** A project's history, newest first: who changed what, and a way back. Going back
 *  is an entry of its own, so nothing is lost by it. */
export const RevisionsPanel = ({
  projectId,
  canRestore,
  onRestored,
  onClose,
}: {
  projectId: string
  canRestore: boolean
  onRestored: () => void
  onClose: () => void
}) => {
  const [revisions, setRevisions] = useState<Revision[] | null>(null)
  const [problem, setProblem] = useState('')
  const load = (): void => {
    void window.codegraph.listRevisions(projectId).then(setRevisions).catch(() => setRevisions([]))
  }
  useEffect(load, [projectId])
  const restore = async (id: string): Promise<void> => {
    const done = await window.codegraph.restoreRevision(projectId, id)
    setProblem(done.problem ?? '')
    if (done.ok) {
      onRestored()
      load()
    }
  }
  return (
    <aside className="revisions" aria-label="History">
      <div className="ds-row" style={{ justifyContent: 'space-between' }}>
        <span className="ds-label">History</span>
        <Button look="bare" onClick={onClose}>
          Close
        </Button>
      </div>
      {problem ? <div className="ds-hint">{problem}</div> : null}
      {revisions === null ? <div className="ds-hint">Reading the history…</div> : null}
      {revisions?.length === 0 ? <div className="ds-hint">Nothing here yet. Work done on this project shows up here.</div> : null}
      {revisions?.map((r) => (
        <div key={r.id} className="revision">
          <span className="revision-who">{r.memberName}</span>
          <span className="revision-says">
            {r.says}, on {r.targetName}
          </span>
          <span className="revision-when">{when(r.at)}</span>
          {r.restorable && canRestore ? (
            <Button look="bare" onClick={() => void restore(r.id)}>
              Go back to this
            </Button>
          ) : null}
        </div>
      ))}
    </aside>
  )
}
