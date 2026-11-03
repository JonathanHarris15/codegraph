// codegraph: component sketch-library
import { useState } from 'react'
import type { SketchListed } from '../../features/list-sketches.js'
import { Button } from '../design-system/kit.js'
import { Glyph } from './kind-glyph.js'

const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** A project's sketches: open one, start one blank or from the map, or throw
 *  one away. Throwing one away is behind a menu, because it used to sit one
 *  click from Open and a sketch is somebody's thinking. */
export const SketchLibrary = ({
  sketches,
  open,
  onOpen,
  onStartBlank,
  onStartFromMap,
  onDelete,
  onClose,
}: {
  sketches: SketchListed[]
  open: string
  onOpen: (id: string) => void
  onStartBlank: () => void
  onStartFromMap: () => void
  onDelete: (id: string) => void
  onClose: () => void
}) => {
  const [menu, setMenu] = useState('')
  return (
    <aside className="sketch-library" aria-label="Sketches">
      <div className="ds-row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 15, lineHeight: '20px' }}>Sketches</h2>
        <Button look="bare" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="ds-hint">
        Drawings kept with this project, not read from any repo. Hand one to your agent to make a proposal from.
      </div>
      <div className="ds-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button look="loud" onClick={onStartFromMap}>
          Sketch from the map
        </Button>
        <Button onClick={onStartBlank}>Blank sketch</Button>
      </div>
      {sketches.length === 0 ? (
        <div className="ds-hint">No sketches yet.</div>
      ) : (
        <ul className="sketch-list">
          {sketches.map((s) => (
            <li key={s.id} className={s.id === open ? 'sketch-item sketch-item--open' : 'sketch-item'}>
              <button type="button" className="sketch-item-open" onClick={() => onOpen(s.id)}>
                <span className="sketch-item-name">{s.name}</span>
                <span className="ds-hint">
                  {s.from || 'Blank'} · changed {when(s.updatedAt)}
                </span>
              </button>
              <span className="sketch-menu">
                <Button look="bare" label={`More for ${s.name}`} onClick={() => setMenu(menu === s.id ? '' : s.id)}>
                  <Glyph of="more" size={16} />
                </Button>
                {menu === s.id ? (
                  <div className="sketch-menu-list">
                    <button
                      type="button"
                      onClick={() => {
                        setMenu('')
                        onDelete(s.id)
                      }}
                    >
                      Throw away {s.name}
                    </button>
                  </div>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
