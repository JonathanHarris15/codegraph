// codegraph: component tool-rail
import { X } from 'lucide-react'
import { KEY_GROUPS, keysFor } from './hotkeys.js'

/** Every key on the canvas, and every way to draw, on one card, opened with
 *  `?` or the Keys button. Said in this keyboard's words: ⌘ on a Mac. */
export const KeyList = ({ onClose }: { onClose: () => void }) => (
  <div className="map-layers map-keys" role="dialog" aria-label="Keys" onPointerDown={(event) => event.stopPropagation()}>
    <div className="map-layers-head">
      <span>Keys, and ways to draw</span>
      <button type="button" className="map-palette-close" aria-label="Close the keys" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
    <div className="map-keys-groups">
      {KEY_GROUPS.map((group) => (
        <section key={group.name} className="map-keys-group">
          <h3>{group.name}</h3>
          {group.rows.map((row) => (
            <div key={row.keys} className="map-keys-row">
              {/* A thing to do with the mouse is said, not drawn as a key. */}
              {row.gesture ? <span className="map-keys-how">{row.keys}</span> : <kbd>{keysFor(row.keys)}</kbd>}
              <span>{keysFor(row.says)}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  </div>
)
