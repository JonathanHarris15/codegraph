// codegraph: component my-sketches
import { useCallback, useEffect, useState } from 'react'
import type { LooseListed } from '../../features/list-my-sketches.js'
import type { ProjectView } from '../../features/list-projects.js'
import { LOOSE } from '../../modules/sketches/schema.js'
import { Button, Card, Field, Select, Sheet } from '../design-system/kit.js'
import { dragSketch, FolderBrowser, FolderPickSheet, shownIn, useFolders } from './folders.js'

/** A member's own sketch library, outside any project, and what others have shared
 *  with them. Their own always open; someone else's need a connection, unless a
 *  copy was made. */
export const MySketches = ({
  projects,
  signedIn,
  onOpen,
}: {
  projects: ProjectView[]
  signedIn: boolean
  onOpen: (library: string, sketchId: string) => void
}) => {
  const [sketches, setSketches] = useState<LooseListed[] | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [sharing, setSharing] = useState<LooseListed | null>(null)
  const [moving, setMoving] = useState<LooseListed | null>(null)
  const [login, setLogin] = useState('')
  const [role, setRole] = useState<'collaborator' | 'viewer'>('collaborator')
  const [problem, setProblem] = useState('')
  const [filing, setFiling] = useState<LooseListed | null>(null)
  // The folder being looked in, kept across visits to the page.
  const [at, setAt] = useState(() => {
    try {
      return window.sessionStorage.getItem('codegraph-loose-folder') ?? ''
    } catch {
      return ''
    }
  })
  const go = (folderId: string): void => {
    setAt(folderId)
    try {
      window.sessionStorage.setItem('codegraph-loose-folder', folderId)
    } catch {
      // Only a convenience.
    }
  }
  const { folders, reload } = useFolders(LOOSE)

  const load = useCallback(async (): Promise<void> => {
    setSketches(await window.codegraph.listMySketches())
  }, [])
  useEffect(() => {
    void load()
    const heard = window.codegraph.heardChange(() => void load())
    const say = (): void => setOnline(navigator.onLine)
    window.addEventListener('online', say)
    window.addEventListener('offline', say)
    return () => {
      heard()
      window.removeEventListener('online', say)
      window.removeEventListener('offline', say)
    }
  }, [load])

  const start = async (): Promise<void> => {
    const made = await window.codegraph.startSketch(LOOSE, 'New sketch')
    // Started inside a folder, it is kept there.
    if (here) await window.codegraph.fileSketch(LOOSE, made.id, here)
    onOpen(LOOSE, made.id)
  }

  const closeSheet = (): void => {
    setSharing(null)
    setMoving(null)
    setLogin('')
    setProblem('')
  }

  // A folder that has gone, as when deleted on another computer, is the top.
  const here = at && folders.some((f) => f.id === at) ? at : ''
  const allMine = sketches?.filter((s) => !s.theirs) ?? []
  const mine = allMine.filter((s) => shownIn(s.folderId, folders) === here)
  const theirs = sketches?.filter((s) => s.theirs) ?? []
  const hereProjects = projects.filter((p) => p.role !== 'viewer')

  const row = (sketch: LooseListed) => {
    const shut = sketch.theirs && !online
    return (
      <Card key={sketch.id}>
        <div className="sketch-row" {...(sketch.theirs ? {} : dragSketch(sketch.id))}>
          <div>
            <div className="ds-card-name">{sketch.name}</div>
            <div className="ds-hint">
              {sketch.theirs ? `Shared by ${sketch.owner || 'someone'}${sketch.role === 'viewer' ? ', to look at' : ''}` : sketch.sharedWith ? `Shared with ${sketch.sharedWith}` : 'Only you'}
              {shut ? ' · reconnect to open, or copy it while online' : ''}
            </div>
          </div>
          <div className="ds-row">
            <Button onClick={() => onOpen(sketch.projectId, sketch.id)} disabled={shut} label={`Open ${sketch.name}`}>
              Open
            </Button>
            {sketch.theirs ? (
              <Button look="bare" onClick={() => void window.codegraph.copySketch(sketch.projectId, sketch.id).then(load)}>
                Copy to mine
              </Button>
            ) : (
              <>
                {signedIn ? (
                  <Button look="bare" onClick={() => setSharing(sketch)}>
                    Share
                  </Button>
                ) : null}
                <Button look="bare" onClick={() => setFiling(sketch)}>
                  Move to folder…
                </Button>
                {hereProjects.length ? (
                  <Button look="bare" onClick={() => setMoving(sketch)}>
                    Move to a project
                  </Button>
                ) : null}
                <Button look="bare" onClick={() => void window.codegraph.deleteSketch(LOOSE, sketch.id).then(load)}>
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div>
      <div className="ds-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="ds-sub">Any diagram at all. These are yours alone until you share them, and they open with no connection.</div>
        <Button look="loud" onClick={() => void start()}>
          New sketch
        </Button>
      </div>
      {sketches === null ? <div className="ds-empty">Reading your sketches…</div> : null}
      {sketches?.length === 0 && !folders.length ? <div className="ds-empty">No sketches yet.</div> : null}
      <FolderBrowser
        library={LOOSE}
        folders={folders}
        reload={reload}
        at={here}
        onGo={go}
        canEdit
        sketchFolders={Object.fromEntries(allMine.map((s) => [s.id, shownIn(s.folderId, folders)]))}
        onFiled={() => void load()}
      >
        <div style={{ display: 'grid', gap: 8 }}>{mine.map(row)}</div>
      </FolderBrowser>
      {theirs.length && !here ? (
        <>
          <h2 className="ds-label" style={{ marginTop: 20 }}>
            Shared with you
          </h2>
          <div style={{ display: 'grid', gap: 8 }}>{theirs.map(row)}</div>
        </>
      ) : null}

      {sharing ? (
        <Sheet title={`Share ${sharing.name}`} onClose={closeSheet}>
          <Field label="GitHub username" value={login} placeholder="their-username" onChange={setLogin} />
          <Select label="What they can do" value={role} options={['collaborator', 'viewer']} onChange={(next) => setRole(next as 'collaborator' | 'viewer')} />
          {problem ? (
            <div className="ds-hint" role="alert">
              {problem}
            </div>
          ) : null}
          <div className="ds-sheet-actions">
            <Button look="bare" onClick={closeSheet}>
              Cancel
            </Button>
            <Button
              look="loud"
              disabled={!login.trim()}
              onClick={() =>
                void window.codegraph.shareSketch(sharing.id, login, role).then((done) => {
                  setProblem(done.problem ?? '')
                  if (done.ok) {
                    closeSheet()
                    void load()
                  }
                })
              }
            >
              Share
            </Button>
          </div>
        </Sheet>
      ) : null}

      {filing ? (
        <FolderPickSheet
          title={`Move ${filing.name} to…`}
          folders={folders}
          current={shownIn(filing.folderId, folders)}
          onPick={(folderId) =>
            void window.codegraph.fileSketch(LOOSE, filing.id, folderId).then(() => {
              setFiling(null)
              void load()
            })
          }
          onClose={() => setFiling(null)}
        />
      ) : null}

      {moving ? (
        <Sheet title={`Move ${moving.name} to a project`} onClose={closeSheet}>
          <div className="ds-hint">
            Everyone on the project will have it.{moving.sharedWith ? ` Anyone it is shared with who is not on the project will lose it.` : ''} It stays in the project, but you can copy it back out.
          </div>
          {hereProjects.map((project) => (
            <Button
              key={project.id}
              onClick={() =>
                void window.codegraph.moveSketch(moving.id, project.id).then((done) => {
                  setProblem(done.problem ?? '')
                  if (done.ok) {
                    closeSheet()
                    void load()
                  }
                })
              }
            >
              {project.name}
            </Button>
          ))}
          {problem ? (
            <div className="ds-hint" role="alert">
              {problem}
            </div>
          ) : null}
        </Sheet>
      ) : null}
    </div>
  )
}
