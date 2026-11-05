// codegraph: component tool-rail
import { X } from 'lucide-react'
import { KEY_GROUPS } from './hotkeys.js'

/** Every key on the canvas, on one card, opened with `?`. */
export const KeyList = ({ onClose }: { onClose: () => void }) => (
  <div className="map-layers map-keys" role="dialog" aria-label="Keys" onPointerDown={(event) => event.stopPropagation()}>
    <div className="map-layers-head">
      <span>Keys</span>
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
              <kbd>{row.keys}</kbd>
              <span>{row.says}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  </div>
)
