// codegraph: component tool-rail
import { X } from 'lucide-react'
import { capsOf, KEY_GROUPS, keysFor } from './hotkeys.js'

/** Every key on the canvas, and every way to draw, on one card in the middle
 *  of the board, opened with `?` or the Keys button. Keys and mouse moves are
 *  drawn alike, as caps, in one column, with what they do lined up beside
 *  them. Said in this keyboard's words: ⌘ and ⌥ on a Mac. */
export const KeyList = ({ onClose }: { onClose: () => void }) => (
  <div className="map-keys-scrim" onPointerDown={onClose}>
    <div className="map-keys" role="dialog" aria-label="Keys" onPointerDown={(event) => event.stopPropagation()}>
      <div className="map-keys-head">
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
              <div key={`${row.keys} ${row.on ?? ''}`} className="map-keys-row">
                <span className="map-keys-caps">
                  {capsOf(keysFor(row.keys)).map((part, i) =>
                    part.joins ? (
                      <span key={i} className="map-keys-plus">
                        +
                      </span>
                    ) : (
                      <kbd key={i}>{part.cap}</kbd>
                    ),
                  )}
                </span>
                <span className="map-keys-says">
                  {row.on ? <span className="map-keys-on">{row.on}: </span> : null}
                  {keysFor(row.says)}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  </div>
)
