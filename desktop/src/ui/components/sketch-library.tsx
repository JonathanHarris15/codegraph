// codegraph: component sketch-library
import { Camera, FilePlus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SketchListed } from '../../features/list-sketches.js'
import { Button } from '../design-system/kit.js'
import { dragSketch, FolderBrowser, FolderPickSheet, shownIn, useFolders } from './folders.js'
import { Glyph } from './kind-glyph.js'

const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** A project's sketches, in a drawer that slides in from the side: open
 *  one, or start one from the quiet button under the list, blank or from a
 *  snapshot of the map. Throwing one away is behind a menu, because a
 *  sketch is somebody's thinking. */
export const SketchLibrary = ({
  library,
  shown,
  sketches,
  open,
  canDraw = true,
  onOpen,
  onCopy,
  onStartBlank,
  onStartFromMap,
  onDelete,
  onFiled,
  onClose,
}: {
  /** The project whose sketches these are. */
  library: string
  /** Whether the drawer is out; it stays put while away, so it can slide. */
  shown: boolean
  sketches: SketchListed[]
  open: string
  /** A viewer can open these, and copy them, but not start or throw one away. */
  canDraw?: boolean
  onOpen: (id: string) => void
  /** Copies one to this member's own library. */
  onCopy?: (id: string) => void
  /** Each starts the sketch in the folder being looked in. */
  onStartBlank: (folderId: string) => void
  onStartFromMap: (folderId: string) => void
  onDelete: (id: string) => void
  /** A sketch went into a folder, so the list is read again. */
  onFiled: () => void
  onClose: () => void
}) => {
  const [menu, setMenu] = useState('')
  const [choosing, setChoosing] = useState(false)
  const [at, setAt] = useState('')
  const [filing, setFiling] = useState<SketchListed | null>(null)
  const { folders, reload } = useFolders(library)
  const here = at && folders.some((f) => f.id === at) ? at : ''
  const inHere = sketches.filter((s) => shownIn(s.folderId, folders) === here)
  useEffect(() => {
    if (!shown) {
      setChoosing(false)
      setMenu('')
    }
  }, [shown])

  return (
    <aside
      className={shown ? 'sketch-library sketch-library--out' : 'sketch-library'}
      aria-label="Sketches"
      aria-hidden={!shown}
      // Away, nothing in it can be reached by Tab; React 18 knows no inert.
      {...(shown ? {} : { inert: '' })}
    >
      <div className="ds-row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 15, lineHeight: '20px' }}>Sketches</h2>
        <Button look="bare" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="ds-hint">
        Drawings kept with this project, not read from any repo. Hand one to your agent to make a proposal from.
      </div>
      <FolderBrowser
        library={library}
        folders={folders}
        reload={reload}
        at={here}
        onGo={setAt}
        canEdit={canDraw}
        sketchFolders={Object.fromEntries(sketches.map((s) => [s.id, shownIn(s.folderId, folders)]))}
        onFiled={onFiled}
      >
      {inHere.length ? (
        <ul className="sketch-list">
          {inHere.map((s) => (
            <li key={s.id} className={s.id === open ? 'sketch-item sketch-item--open' : 'sketch-item'} {...(canDraw ? dragSketch(s.id) : {})}>
              <button type="button" className="sketch-item-open" onClick={() => onOpen(s.id)}>
                <span className="sketch-item-name">{s.name}</span>
                <span className="ds-hint">
                  {s.id === open ? 'Open now · ' : ''}
                  {s.from || 'Blank'} · changed {when(s.updatedAt)}
                </span>
              </button>
              <span className="sketch-menu">
                <Button look="bare" label={`More for ${s.name}`} onClick={() => setMenu(menu === s.id ? '' : s.id)}>
                  <Glyph of="more" size={16} />
                </Button>
                {menu === s.id ? (
                  <div className="sketch-menu-list">
                    {onCopy ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenu('')
                          onCopy(s.id)
                        }}
                      >
                        Copy to my own sketches
                      </button>
                    ) : null}
                    {canDraw ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenu('')
                          setFiling(s)
                        }}
                      >
                        Move to folder…
                      </button>
                    ) : null}
                    {canDraw ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenu('')
                          onDelete(s.id)
                        }}
                      >
                        Throw away {s.name}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      </FolderBrowser>

      {filing ? (
        <FolderPickSheet
          title={`Move ${filing.name} to…`}
          folders={folders}
          current={shownIn(filing.folderId, folders)}
          onPick={(folderId) =>
            void window.codegraph.fileSketch(library, filing.id, folderId).then(() => {
              setFiling(null)
              onFiled()
            })
          }
          onClose={() => setFiling(null)}
        />
      ) : null}

      {!canDraw ? null : choosing ? (
        <div className="sketch-new-choice" role="group" aria-label="Start a sketch">
          <button type="button" className="sketch-new-way" onClick={() => onStartFromMap(here)}>
            <Camera size={16} aria-hidden="true" />
            <span>
              <span className="sketch-new-way-name">From the map</span>
              <span className="ds-hint">A snapshot of the map as it is, to draw a change over</span>
            </span>
          </button>
          <button type="button" className="sketch-new-way" onClick={() => onStartBlank(here)}>
            <FilePlus size={16} aria-hidden="true" />
            <span>
              <span className="sketch-new-way-name">Blank</span>
              <span className="ds-hint">An empty board</span>
            </span>
          </button>
          <button type="button" className="sketch-new-cancel" onClick={() => setChoosing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="sketch-new" onClick={() => setChoosing(true)}>
          <Plus size={14} aria-hidden="true" />
          New sketch
        </button>
      )}
    </aside>
  )
}
